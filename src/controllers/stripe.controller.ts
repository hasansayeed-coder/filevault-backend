import { Request, Response } from 'express';
import Stripe from 'stripe';
import prisma from '../utils/prisma';
import { stripe, STRIPE_PRICES } from '../services/stripe.service';

// ── Create Stripe Checkout Session ───────────────────────────────────────────
export const createCheckoutSession = async (req: Request, res: Response) => {
  try {
    const userId        = (req as any).user.id;
    const { packageName } = req.body;

    if (packageName === 'FREE') {
      return res.status(400).json({ success: false, message: 'FREE plan does not require payment' });
    }

    const priceId = STRIPE_PRICES[packageName];
    if (!priceId) {
      return res.status(400).json({ success: false, message: 'Invalid package' });
    }

    // ── FIXED: select only needed fields ──
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { email: true, firstName: true, lastName: true, stripeCustomerId: true },
    });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // ── Create or reuse Stripe customer ──
    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email:    user.email,
        name:     `${user.firstName} ${user.lastName}`,
        metadata: { userId },
      });
      stripeCustomerId = customer.id;
      await prisma.user.update({
        where:  { id: userId },
        data:   { stripeCustomerId },
        select: { id: true },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer:             stripeCustomerId,
      payment_method_types: ['card'],
      mode:                 'subscription',
      line_items:           [{ price: priceId as string, quantity: 1 }],
      success_url:          `${process.env.FRONTEND_URL}/subscription?success=true&package=${packageName}`,
      cancel_url:           `${process.env.FRONTEND_URL}/subscription?cancelled=true`,
      metadata:             { userId, packageName },
    });

    return res.json({ success: true, data: { url: session.url } });
  } catch (error: any) {
    console.error('Stripe checkout error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── Stripe Webhook Handler ────────────────────────────────────────────────────
export const handleWebhook = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        // ── FIXED: Stripe.Checkout.Session type now works via imported Stripe ──
        const session = event.data.object as Stripe.Checkout.Session;
        const { userId, packageName } = session.metadata!;

        // ── FIXED: only select id — nothing else needed ──
        const pkg = await prisma.subscriptionPackage.findFirst({
          where:  { name: packageName as any },
          select: { id: true },
        });
        if (!pkg) break;

        // ── FIXED: wrap in transaction — atomic subscription activation ──
        await prisma.$transaction(async (tx) => {
          await tx.userSubscription.updateMany({
            where: { userId, isActive: true },
            data:  { isActive: false, endDate: new Date() },
          });
          await tx.userSubscription.create({
            data: {
              userId,
              packageId:            pkg.id,
              isActive:             true,
              stripeSubscriptionId: session.subscription as string,
              stripeCustomerId:     session.customer     as string,
            },
          });
        });

        console.log(`✅ Subscription activated: ${packageName} for user ${userId}`);
        break;
      }

      case 'customer.subscription.deleted': {
        // ── FIXED: Stripe.Subscription type now works via imported Stripe ──
        const subscription = event.data.object as Stripe.Subscription;
        await prisma.userSubscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data:  { isActive: false, endDate: new Date() },
        });
        console.log(`❌ Subscription cancelled: ${subscription.id}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`⚠️ Payment failed for subscription: ${invoice.subscription}`);
        break;
      }
    }

    return res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
};

// ── Get Stripe billing portal link ───────────────────────────────────────────
export const createPortalSession = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    // ── FIXED: only select stripeCustomerId ──
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) {
      return res.status(400).json({ success: false, message: 'No billing account found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer:   user.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/subscription`,
    });

    return res.json({ success: true, data: { url: session.url } });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};