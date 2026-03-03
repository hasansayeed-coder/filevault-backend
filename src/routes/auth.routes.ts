import { Router } from 'express';
import { body } from 'express-validator';
import {
  login,
  register,
  verifyEmail,
  refreshToken,
  forgotPassword,
  resetPassword,
  getMe,
  setup2FA,
  confirm2FA,
  verify2FALogin,
  disable2FA,
  get2FAStatus,
  regenerateBackupCodes,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';

export const authRouter = Router();

// ── Core auth ─────────────────────────────────────────────────────────────────
authRouter.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  body('firstName').trim().isLength({ min: 2, max: 50 }),
  body('lastName').trim().isLength({ min: 2, max: 50 }),
], register);

authRouter.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], login);

authRouter.get('/verify-email',  verifyEmail);
authRouter.post('/refresh-token', refreshToken);
authRouter.post('/forgot-password', [body('email').isEmail().normalizeEmail()], forgotPassword);
authRouter.post('/reset-password', [
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
], resetPassword);

authRouter.get('/me', authenticate, getMe);

// ── 2FA ───────────────────────────────────────────────────────────────────────
// Uses temp token from login step 1 — authenticate middleware works for both
authRouter.post('/2fa/verify-login', authenticate, verify2FALogin);
authRouter.get('/2fa/setup', authenticate, setup2FA);
authRouter.post('/2fa/confirm', authenticate, [body('otp').notEmpty()], confirm2FA);
authRouter.post('/2fa/disable',  authenticate, disable2FA);
authRouter.get('/2fa/status',  authenticate, get2FAStatus);
authRouter.post('/2fa/regenerate-backup', authenticate, regenerateBackupCodes);