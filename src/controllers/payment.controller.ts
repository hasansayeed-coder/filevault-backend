import { Request, Response } from 'express';
// ── FIXED: use shared prisma instance — not new PrismaClient() ──
import prisma from '../utils/prisma';
import { stripe, createCheckoutSession, STRIPE_PRICES } from '../services/stripe.service';
import { AuthRequest } from '../middleware/auth';
import { sendPaymentReceiptEmail } from '../utils/email';

export const createPaymentSession = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const { packageId } = req.body;
    if (!packageId) return res.status(400).json({ success: false, message: 'packageId is required' });

    // ── FIXED: fetch user + package in parallel, select only needed fields ──
    const [user, pkg] = await Promise.all([
      prisma.user.findUnique({
        where:  { id: userId },
        select: { email: true },
      }),
      prisma.subscriptionPackage.findUnique({
        where:  { id: packageId },
        select: { name: true },
      }),
    ]);

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!pkg)  return res.status(404).json({ success: false, message: 'Package not found' });

    if (pkg.name === 'FREE') {
      return res.status(400).json({ success: false, message: 'Free plan does not require payment.' });
    }

    const amount = STRIPE_PRICES[pkg.name];
    if (!amount) return res.status(400).json({ success: false, message: 'Invalid package tier' });

    const session = await createCheckoutSession({
      userId,
      userEmail:   user.email,
      packageId,
      packageName: pkg.name,
      amount,
    });

    // ── FIXED: select only id — no need to return payment row ──
    await prisma.payment.create({
      data:   {
        userId,
        packageId,
        stripeSessionId: session.id,
        amount:          amount / 100,
        currency:        'usd',
        status:          'PENDING',
      },
      select: { id: true },
    });

    return res.json({
      success: true,
      data: { sessionId: session.id, url: session.url },
    });
  } catch (error: any) {
    console.error('Payment session error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create payment session' });
  }
};

export const handleWebhook = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ message: `Webhook Error: ${err.message}` });
  }

  // ── checkout.session.completed → SUCCEEDED ────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const { userId, packageId } = session.metadata;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.userSubscription.updateMany({
          where: { userId, isActive: true },
          data:  { isActive: false, endDate: new Date() },
        });
        await tx.userSubscription.create({
          data: { userId, packageId, isActive: true, startDate: new Date() },
        });
        await tx.payment.upsert({
          where:  { stripeSessionId: session.id },
          update: {
            status:          'SUCCEEDED',
            stripePaymentId: session.payment_intent,
            amount:          (session.amount_total || 0) / 100,
            currency:        session.currency || 'usd',
            updatedAt:       new Date(),
          },
          create: {
            userId, packageId,
            stripeSessionId: session.id,
            stripePaymentId: session.payment_intent,
            amount:          (session.amount_total || 0) / 100,
            currency:        session.currency || 'usd',
            status:          'SUCCEEDED',
          },
        });
      });

      console.log(`✅ Payment recorded — user: ${userId}, package: ${packageId}`);

      // ── Email outside transaction — fire and forget ──
      const [user, pkg] = await Promise.all([
        prisma.user.findUnique({
          where:  { id: userId },
          select: { email: true, firstName: true },
        }),
        prisma.subscriptionPackage.findUnique({
          where:  { id: packageId },
          select: { displayName: true },
        }),
      ]);

      if (user && pkg) {
        sendPaymentReceiptEmail(user.email, user.firstName, {
          planName:  pkg.displayName,
          amount:    (session.amount_total || 0) / 100,
          currency:  session.currency || 'usd',
          paymentId: session.payment_intent ?? session.id,
          date:      new Date(),
        }).catch(err => console.error('[Email] Receipt failed:', err));
      }
    } catch (err) {
      console.error('Error processing checkout.session.completed:', err);
    }
  }

  // ── checkout.session.expired or payment_intent.payment_failed → FAILED ────
  if (event.type === 'checkout.session.expired' || event.type === 'payment_intent.payment_failed') {
    const obj = event.data.object as any;
    try {
      if (event.type === 'checkout.session.expired') {
        await prisma.payment.updateMany({
          where: { stripeSessionId: obj.id },
          data:  { status: 'FAILED', failureReason: 'Checkout session expired', updatedAt: new Date() },
        });
      } else {
        const failureMsg = obj.last_payment_error?.message || 'Payment failed';
        await prisma.payment.updateMany({
          where: { stripePaymentId: obj.id },
          data:  { status: 'FAILED', failureReason: failureMsg, updatedAt: new Date() },
        });
      }
    } catch (err) {
      console.error('Error processing failed payment event:', err);
    }
  }

  // ── charge.refunded → REFUNDED ────────────────────────────────────────────
  if (event.type === 'charge.refunded') {
    const charge = event.data.object as any;
    try {
      await prisma.payment.updateMany({
        where: { stripePaymentId: charge.payment_intent },
        data:  { status: 'REFUNDED', updatedAt: new Date() },
      });
    } catch (err) {
      console.error('Error processing refund:', err);
    }
  }

  return res.json({ received: true });
};

export const verifyPayment = async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) return res.status(400).json({ success: false, message: 'No session ID' });

    const session = await stripe.checkout.sessions.retrieve(sessionId as string);
    if (session.payment_status === 'paid') {
      return res.json({ success: true, message: 'Payment verified', data: { session } });
    }
    return res.status(400).json({ success: false, message: 'Payment not completed' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Verification failed' });
  }
};

export const activateSubscription = async (req: AuthRequest, res: Response) => {
  try {
    const userId      = req.user?.userId;
    const { sessionId } = req.body;

    if (!userId || !sessionId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ success: false, message: 'Payment not completed' });
    }

    const { packageId } = session.metadata as any;

    // ── FIXED: wrap in transaction — same pattern as webhook handler ──
    await prisma.$transaction(async (tx) => {
      await tx.userSubscription.updateMany({
        where: { userId, isActive: true },
        data:  { isActive: false, endDate: new Date() },
      });
      await tx.userSubscription.create({
        data: { userId, packageId, isActive: true, startDate: new Date() },
      });
      await tx.payment.upsert({
        where:  { stripeSessionId: sessionId },
        update: {
          status:          'SUCCEEDED',
          stripePaymentId: session.payment_intent as string,
          amount:          (session.amount_total || 0) / 100,
          updatedAt:       new Date(),
        },
        create: {
          userId, packageId,
          stripeSessionId: sessionId,
          stripePaymentId: session.payment_intent as string,
          amount:          (session.amount_total || 0) / 100,
          currency:        session.currency || 'usd',
          status:          'SUCCEEDED',
        },
      });
    });

    return res.json({ success: true, message: 'Subscription activated!' });
  } catch (error: any) {
    console.error('Activate subscription error:', error);
    return res.status(500).json({ success: false, message: 'Failed to activate subscription' });
  }
};