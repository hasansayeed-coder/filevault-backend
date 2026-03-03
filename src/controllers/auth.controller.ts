import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { validationResult } from "express-validator";
import * as speakeasy from "speakeasy";
import * as QRCode from "qrcode";
import crypto from "crypto";
import prisma from '../utils/prisma';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, generateEmailToken } from '../utils/jwt';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email';
import { AppError, successResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { logActivity } from '../utils/activity';
import { ActivityAction } from '@prisma/client';

// ── Register ──────────────────────────────────────────────────────────────────
export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
      return;
    }

    const { email, password, firstName, lastName } = req.body;

    // ── FIXED: only fetch id to check existence — no need for full row ──
    const existing = await prisma.user.findUnique({
      where:  { email },
      select: { id: true },
    });
    if (existing) throw new AppError('Email already registered', 409);

    const hashedPassword   = await bcrypt.hash(password, 12);
    const emailVerifyToken = generateEmailToken();

    const user = await prisma.user.create({
      data: { email, password: hashedPassword, firstName, lastName, emailVerifyToken },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, isEmailVerified: true, createdAt: true,
      },
    });

    sendVerificationEmail(email, emailVerifyToken, firstName).catch(err =>
      console.error('Failed to send verification email', err)
    );

    successResponse(res, user, 'Registration successful. Please verify your email.', 201);
  } catch (error) {
    next(error);
  }
};

// ── Verify Email ──────────────────────────────────────────────────────────────
export const verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token } = req.query;

    // ── FIXED: only select id — nothing else needed for the update ──
    const user = await prisma.user.findFirst({
      where:  { emailVerifyToken: token as string },
      select: { id: true },
    });
    if (!user) throw new AppError('Invalid or expired verification token', 400);

    await prisma.user.update({
      where: { id: user.id },
      data:  { isEmailVerified: true, emailVerifyToken: null },
    });

    successResponse(res, null, 'Email verified successfully');
  } catch (error) {
    next(error);
  }
};

// ── Login (2FA-aware) ─────────────────────────────────────────────────────────
// NOTE: login intentionally fetches full user — needs password, twoFactorEnabled,
// twoFactorSecret, isSuspended, role all in one query to avoid multiple round-trips.
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, message: 'Validation Failed', errors: errors.array() });
      return;
    }

    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      if (user) {
        logActivity({ userId: user.id, action: ActivityAction.LOGIN_FAILED, entityType: 'auth', req: req as any });
      }
      throw new AppError('Invalid email or password', 401);
    }

    if (user.isSuspended) throw new AppError('Account suspended. Please contact support.', 403);

    if (user.twoFactorEnabled) {
      const tempToken = generateAccessToken(
        { userId: user.id, email: user.email, role: user.role },
        '10m'
      );
      res.json({
        success: true,
        data: {
          requires2FA: true,
          tempToken,
          user: {
            id: user.id, email: user.email,
            firstName: user.firstName, lastName: user.lastName,
          },
        },
        message: '2FA verification required',
      });
      return;
    }

    const payload      = { userId: user.id, email: user.email, role: user.role };
    const accessToken  = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    logActivity({ userId: user.id, action: ActivityAction.LOGIN, entityType: 'auth', req: req as any });

    successResponse(res, {
      accessToken,
      refreshToken,
      user: {
        id: user.id, email: user.email, firstName: user.firstName,
        lastName: user.lastName, role: user.role,
        isEmailVerified:  user.isEmailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

// ── Verify 2FA OTP (step 2 of login) ─────────────────────────────────────────
export const verify2FALogin = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { otp, backupCode } = req.body;
    const userId = req.user?.userId;

    if (!userId)           throw new AppError('Authentication required', 401);
    if (!otp && !backupCode) throw new AppError('OTP or backup code required', 400);

    // ── FIXED: only select fields needed for 2FA verification ──
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: {
        id: true, email: true, firstName: true, lastName: true, role: true,
        isEmailVerified: true, twoFactorEnabled: true, twoFactorSecret: true,
        twoFactorBackupCodes: true,
      },
    });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new AppError('2FA not enabled for this account', 400);
    }

    if (backupCode) {
      const hashedInput = crypto.createHash('sha256').update(backupCode.trim().toUpperCase()).digest('hex');
      const codeIndex   = user.twoFactorBackupCodes.indexOf(hashedInput);
      if (codeIndex === -1) throw new AppError('Invalid backup code', 401);

      const updatedCodes = [...user.twoFactorBackupCodes];
      updatedCodes.splice(codeIndex, 1);
      await prisma.user.update({
        where: { id: userId },
        data:  { twoFactorBackupCodes: updatedCodes },
      });
    } else {
      const isValid = speakeasy.totp.verify({
        secret: user.twoFactorSecret, encoding: 'base32', token: otp.toString(), window: 1,
      });
      if (!isValid) throw new AppError('Invalid or expired OTP code', 401);
    }

    const payload      = { userId: user.id, email: user.email, role: user.role };
    const accessToken  = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    logActivity({
      userId: user.id,
      action: ActivityAction.LOGIN,
      entityType: 'auth',
      metadata: { method: backupCode ? 'backup_code' : 'totp' },
      req: req as any,
    });

    successResponse(res, {
      accessToken,
      refreshToken,
      user: {
        id: user.id, email: user.email, firstName: user.firstName,
        lastName: user.lastName, role: user.role,
        isEmailVerified:  user.isEmailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

// ── Generate 2FA Setup (QR + secret) ─────────────────────────────────────────
export const setup2FA = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Authentication required', 401);

    // ── FIXED: only select fields needed for 2FA setup check ──
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });
    if (!user) throw new AppError('User not found', 404);
    if (user.twoFactorEnabled) throw new AppError('2FA is already enabled', 400);

    const secret = speakeasy.generateSecret({
      name: `FileVault (${user.email})`, issuer: 'FileVault', length: 20,
    });

    await prisma.user.update({
      where: { id: userId },
      data:  { twoFactorSecret: secret.base32, twoFactorVerified: false },
    });

    const otpauthUrl    = secret.otpauth_url!;
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    successResponse(res, {
      secret: secret.base32,
      qrCode: qrCodeDataUrl,
      otpauthUrl,
    }, '2FA setup initiated — scan QR code then verify');
  } catch (error) {
    next(error);
  }
};

// ── Confirm 2FA ───────────────────────────────────────────────────────────────
export const confirm2FA = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { otp } = req.body;
    const userId  = req.user?.userId;

    if (!userId) throw new AppError('Authentication required', 401);
    if (!otp)    throw new AppError('OTP is required', 400);

    // ── FIXED: only select fields needed to verify and activate 2FA ──
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });
    if (!user)                 throw new AppError('User not found', 404);
    if (!user.twoFactorSecret) throw new AppError('2FA setup not initiated — call /2fa/setup first', 400);
    if (user.twoFactorEnabled) throw new AppError('2FA is already enabled', 400);

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret, encoding: 'base32', token: otp.toString(), window: 1,
    });
    if (!isValid) throw new AppError('Invalid OTP code. Please try again.', 401);

    const rawCodes    = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );
    const hashedCodes = rawCodes.map(c => crypto.createHash('sha256').update(c).digest('hex'));

    await prisma.user.update({
      where: { id: userId },
      data:  {
        twoFactorEnabled:     true,
        twoFactorVerified:    true,
        twoFactorBackupCodes: hashedCodes,
      },
    });

    logActivity({ userId: userId!, action: ActivityAction.TWO_FA_ENABLED, entityType: 'account', req: req as any });

    successResponse(res, { backupCodes: rawCodes },
      '2FA enabled successfully — store backup codes safely, they will not be shown again');
  } catch (error) {
    next(error);
  }
};

// ── Disable 2FA ───────────────────────────────────────────────────────────────
export const disable2FA = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { otp, password } = req.body;
    const userId = req.user?.userId;

    if (!userId) throw new AppError('Authentication required', 401);

    // ── FIXED: only select fields needed for password + OTP verification ──
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { password: true, twoFactorEnabled: true, twoFactorSecret: true },
    });
    if (!user)                  throw new AppError('User not found', 404);
    if (!user.twoFactorEnabled) throw new AppError('2FA is not enabled', 400);

    if (!password || !(await bcrypt.compare(password, user.password))) {
      throw new AppError('Invalid password', 401);
    }

    if (!otp) throw new AppError('OTP is required', 400);
    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret!, encoding: 'base32', token: otp.toString(), window: 1,
    });
    if (!isValid) throw new AppError('Invalid OTP code', 401);

    await prisma.user.update({
      where: { id: userId },
      data:  {
        twoFactorEnabled:     false,
        twoFactorSecret:      null,
        twoFactorBackupCodes: [],
        twoFactorVerified:    false,
      },
    });

    logActivity({ userId: userId!, action: ActivityAction.TWO_FA_DISABLED, entityType: 'account', req: req as any });

    successResponse(res, null, '2FA disabled successfully');
  } catch (error) {
    next(error);
  }
};

// ── Get 2FA Status ────────────────────────────────────────────────────────────
export const get2FAStatus = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Authentication required', 401);

    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { twoFactorEnabled: true, twoFactorVerified: true, twoFactorBackupCodes: true, role: true },
    });
    if (!user) throw new AppError('User not found', 404);

    successResponse(res, {
      twoFactorEnabled:     user.twoFactorEnabled,
      twoFactorVerified:    user.twoFactorVerified,
      backupCodesRemaining: user.twoFactorBackupCodes.length,
      isAdminAccount:       user.role === 'ADMIN',
    }, '2FA status retrieved');
  } catch (error) {
    next(error);
  }
};

// ── Regenerate Backup Codes ───────────────────────────────────────────────────
export const regenerateBackupCodes = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { otp } = req.body;
    const userId  = req.user?.userId;

    if (!userId) throw new AppError('Authentication required', 401);

    // ── FIXED: only select fields needed for OTP verification ──
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });
    if (!user || !user.twoFactorEnabled) throw new AppError('2FA is not enabled', 400);

    if (!otp) throw new AppError('OTP is required to regenerate backup codes', 400);
    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret!, encoding: 'base32', token: otp.toString(), window: 1,
    });
    if (!isValid) throw new AppError('Invalid OTP code', 401);

    const rawCodes    = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );
    const hashedCodes = rawCodes.map(c => crypto.createHash('sha256').update(c).digest('hex'));

    await prisma.user.update({
      where: { id: userId },
      data:  { twoFactorBackupCodes: hashedCodes },
    });

    successResponse(res, { backupCodes: rawCodes }, 'Backup codes regenerated — save these now');
  } catch (error) {
    next(error);
  }
};

// ── Refresh Token ─────────────────────────────────────────────────────────────
export const refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) throw new AppError('Refresh token required', 400);

    const payload = verifyRefreshToken(token);

    // ── FIXED: only select id, email, role — the only fields needed for new token ──
    const user = await prisma.user.findUnique({
      where:  { id: payload.userId },
      select: { id: true, email: true, role: true },
    });
    if (!user) throw new AppError('User not found', 401);

    const newPayload      = { userId: user.id, email: user.email, role: user.role };
    const accessToken     = generateAccessToken(newPayload);
    const newRefreshToken = generateRefreshToken(newPayload);

    successResponse(res, { accessToken, refreshToken: newRefreshToken }, 'Token refreshed');
  } catch (error) {
    next(error);
  }
};

// ── Forgot Password ───────────────────────────────────────────────────────────
export const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = req.body;

    // ── FIXED: only select what's needed for the reset email ──
    const user = await prisma.user.findUnique({
      where:  { email },
      select: { id: true, email: true, firstName: true },
    });

    if (!user) {
      successResponse(res, null, 'If an account exists, a reset email has been sent.');
      return;
    }

    const resetToken = generateEmailToken();
    const expiry     = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data:  { passwordResetToken: resetToken, passwordResetExpiry: expiry },
    });

    sendPasswordResetEmail(user.email, resetToken, user.firstName).catch(err =>
      console.error('Failed to send reset email:', err)
    );

    successResponse(res, null, 'If an account exists, a reset email has been sent.');
  } catch (error) {
    next(error);
  }
};

// ── Reset Password ────────────────────────────────────────────────────────────
export const resetPassword = async (req: Request, res: any, next: NextFunction): Promise<void> => {
  try {
    const { token, password } = req.body;

    // ── FIXED: only select id — nothing else needed for the update ──
    const user = await prisma.user.findFirst({
      where:  { passwordResetToken: token, passwordResetExpiry: { gt: new Date() } },
      select: { id: true },
    });
    if (!user) throw new AppError('Invalid or expired reset token', 400);

    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data:  { password: hashedPassword, passwordResetToken: null, passwordResetExpiry: null },
    });

    successResponse(res, null, 'Password reset successfully');
  } catch (error) {
    next(error);
  }
};

// ── Get Me ────────────────────────────────────────────────────────────────────
export const getMe = async (req: any, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.user.userId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, isEmailVerified: true, createdAt: true,
        twoFactorEnabled: true, twoFactorVerified: true,
        subscriptions: {
          where:   { isActive: true },
          include: { package: true },
          orderBy: { startDate: 'desc' },
          take:    1,
        },
      },
    });

    if (!user) throw new AppError('User not found', 404);
    successResponse(res, user, 'User profile retrieved');
  } catch (error) {
    next(error);
  }
};