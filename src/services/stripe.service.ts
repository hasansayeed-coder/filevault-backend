import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

export const STRIPE_PRICES: Record<string, number> = {
  SILVER: 999,
  GOLD: 1999,
  DIAMOND: 4999,
};

export const createCheckoutSession = async ({
  userId,
  userEmail,
  packageId,
  packageName,
  amount,
}: {
  userId: string;
  userEmail: string;
  packageId: string;
  packageName: string;
  amount: number;
}) => {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: userEmail,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `FileVault ${packageName} Plan`,
            description: `Monthly subscription to FileVault ${packageName}`,
          },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    metadata: { userId, packageId, packageName },
    success_url: `http://localhost:3000/dashboard?success=true&package=${packageName}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `http://localhost:3000/dashboard?cancelled=true`,
  });

  return session;
};