import { Router } from 'express';
import { body } from 'express-validator';
import {
  getAccountOverview,
  updateProfile,
  updateEmail,
  changePassword,
  uploadAvatar,
  deleteAvatar,
  getSessions,
  revokeSession,
  revokeAllSessions,
  deleteAccount,
  avatarUpload,
} from '../controllers/account.controller';
import { authenticate } from '../middleware/auth';

export const accountRouter = Router();

// All routes require authentication
accountRouter.use(authenticate);

accountRouter.get('/overview',  getAccountOverview);
accountRouter.patch('/profile', [
  body('firstName').trim().isLength({ min: 2, max: 50 }),
  body('lastName').trim().isLength({ min: 2, max: 50 }),
], updateProfile);
accountRouter.patch('/email', [
  body('newEmail').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], updateEmail);
accountRouter.patch('/password',[
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
], changePassword);

// Avatar
accountRouter.post('/avatar',avatarUpload.single('avatar'), uploadAvatar);
accountRouter.delete('/avatar', deleteAvatar);

// Sessions
accountRouter.get('/sessions', getSessions);
accountRouter.delete('/sessions/:sessionId', revokeSession);
accountRouter.delete('/sessions',revokeAllSessions);

// Danger zone
accountRouter.delete('/delete', [
  body('password').notEmpty(),
  body('confirmation').equals('DELETE MY ACCOUNT'),
], deleteAccount);