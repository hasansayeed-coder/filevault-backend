import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createCheckoutSession,
  handleWebhook,
  createPortalSession,
} from '../controllers/stripe.controller';

const stripeRouter = Router();

// Webhook must use raw body — registered before json middleware in index.ts
stripeRouter.post('/webhook', handleWebhook);

// Protected routes
stripeRouter.post('/checkout', authenticate, createCheckoutSession);
stripeRouter.post('/portal', authenticate, createPortalSession);

export default stripeRouter;