import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getUserSubscriptions,
  getActiveSubscription,
  selectPackage,
  getStorageStats,
} from '../controllers/subscription.controller';

export const userRouter = Router();

userRouter.get('/subscriptions', authenticate, getUserSubscriptions);
userRouter.get('/subscriptions/active', authenticate, getActiveSubscription);
userRouter.post('/subscriptions/select', authenticate, selectPackage);
userRouter.get('/storage-stats', authenticate, getStorageStats);