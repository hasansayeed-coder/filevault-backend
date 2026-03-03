import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createPaymentSession,
  handleWebhook,
  verifyPayment,
  activateSubscription 
} from '../controllers/payment.controller';

const paymentRouter = Router();

paymentRouter.post('/webhook', handleWebhook);
paymentRouter.post('/create-session', authenticate, createPaymentSession);
paymentRouter.get('/verify', authenticate, verifyPayment);
paymentRouter.post('/activate', authenticate, activateSubscription);


export default paymentRouter;