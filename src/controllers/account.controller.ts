import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import prisma from '../utils/prisma';
import { AppError, successResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';

// ── Multer config for avatar uploads ─────────────────────────────────────────
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'avatars');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

export const avatarUpload = multer({
  storage:    avatarStorage,
  limits:     { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Only JPEG, PNG, WebP, and GIF images are allowed', 400) as any, false);
    }
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const buildAvatarUrl = (filename: string) =>
  `${process.env.BACKEND_URL || 'http://localhost:5000'}/uploads/avatars/${filename}`;

const deleteAvatarFile = (avatarUrl: string | null) => {
  if (!avatarUrl) return;
  const filename = avatarUrl.split('/').pop();
  if (!filename)  return;
  const filePath = path.join(process.cwd(), 'uploads', 'avatars', filename);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch {}
  }
};

function parseDevice(ua: string): string {
  if (/iPhone/.test(ua))    return 'iPhone';
  if (/iPad/.test(ua))      return 'iPad';
  if (/Android/.test(ua))   return 'Android';
  if (/Windows/.test(ua))   return 'Windows PC';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Linux/.test(ua))     return 'Linux';
  return 'Unknown Device';
}

function getBrowser(ua: string): string {
  if (/Edg\//.test(ua))   return 'Edge';
  if (/Chrome/.test(ua))  return 'Chrome';
  if (/Firefox/.test(ua)) return 'Firefox';
  if (/Safari/.test(ua))  return 'Safari';
  if (/Opera/.test(ua))   return 'Opera';
  return 'Browser';
}

// ── Get account overview ──────────────────────────────────────────────────────
export const getAccountOverview = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Authentication required', 401);

    // ── FIXED: run all 4 operations in parallel instead of sequential ──
    const [user, storageAgg] = await Promise.all([
      prisma.user.findUnique({
        where:  { id: userId },
        select: {
          id: true, email: true, firstName: true, lastName: true,
          role: true, isEmailVerified: true, createdAt: true,
          avatarUrl: true, twoFactorEnabled: true,
          _count:        { select: { files: true, folders: true } },
          subscriptions: {
            where:   { isActive: true },
            include: { package: { select: { displayName: true, name: true } } },
            take:    1,
          },
        },
      }),
      prisma.file.aggregate({
        where: { userId },
        _sum:  { size: true },
      }),
    ]);

    if (!user) throw new AppError('User not found', 404);

    // Clean expired sessions then count — sequential intentionally (depends on delete)
    await prisma.userSession.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
    const sessionCount = await prisma.userSession.count({ where: { userId } });

    successResponse(res, {
      ...user,
      totalStorageBytes:  storageAgg._sum.size || 0,
      activeSessionCount: sessionCount,
    }, 'Account overview retrieved');
  } catch (error) {
    next(error);
  }
};

// ── Update profile ────────────────────────────────────────────────────────────
export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Authentication required', 401);

    const { firstName, lastName } = req.body;
    if (!firstName?.trim() || !lastName?.trim()) throw new AppError('First and last name are required', 400);
    if (firstName.trim().length < 2 || lastName.trim().length < 2) throw new AppError('Names must be at least 2 characters', 400);

    const updated = await prisma.user.update({
      where:  { id: userId },
      data:   { firstName: firstName.trim(), lastName: lastName.trim() },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        avatarUrl: true, role: true, isEmailVerified: true,
      },
    });

    successResponse(res, updated, 'Profile updated successfully');
  } catch (error) {
    next(error);
  }
};

// ── Update email ──────────────────────────────────────────────────────────────
export const updateEmail = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Authentication required', 401);

    const { newEmail, password } = req.body;
    if (!newEmail || !password) throw new AppError('New email and password are required', 400);

    // ── FIXED: only select password + email — nothing else needed ──
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { password: true, email: true },
    });
    if (!user) throw new AppError('User not found', 404);

    if (!(await bcrypt.compare(password, user.password))) throw new AppError('Invalid password', 401);

    const normalised = newEmail.toLowerCase().trim();
    if (normalised === user.email) throw new AppError('This is already your current email', 400);

    // ── FIXED: only select id to check existence ──
    const existing = await prisma.user.findUnique({
      where:  { email: normalised },
      select: { id: true },
    });
    if (existing) throw new AppError('Email already in use by another account', 409);

    const updated = await prisma.user.update({
      where:  { id: userId },
      data:   { email: normalised, isEmailVerified: false },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        avatarUrl: true, role: true, isEmailVerified: true,
      },
    });

    successResponse(res, updated, 'Email updated. Please verify your new email address.');
  } catch (error) {
    next(error);
  }
};

// ── Change password ───────────────────────────────────────────────────────────
export const changePassword = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Authentication required', 401);

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)  throw new AppError('Current and new password are required', 400);
    if (newPassword.length < 8)            throw new AppError('Password must be at least 8 characters', 400);
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      throw new AppError('Password must contain uppercase, lowercase, and a number', 400);
    }

    // ── FIXED: only select password ──
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { password: true },
    });
    if (!user) throw new AppError('User not found', 404);

    if (!(await bcrypt.compare(currentPassword, user.password))) throw new AppError('Current password is incorrect', 401);
    if (await bcrypt.compare(newPassword, user.password))        throw new AppError('New password must be different from your current password', 400);

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { password: hashed } });

    const currentHash = crypto
      .createHash('sha256')
      .update(req.headers.authorization?.split(' ')[1] || '')
      .digest('hex');
    await prisma.userSession.deleteMany({ where: { userId, tokenHash: { not: currentHash } } });

    successResponse(res, null, 'Password changed successfully. Other devices have been logged out.');
  } catch (error) {
    next(error);
  }
};

// ── Upload avatar ─────────────────────────────────────────────────────────────
export const uploadAvatar = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId)   throw new AppError('Authentication required', 401);
    if (!req.file) throw new AppError('No image file provided', 400);

    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { avatarUrl: true },
    });
    deleteAvatarFile(user?.avatarUrl || null);

    const avatarUrl = buildAvatarUrl(req.file.filename);
    const updated   = await prisma.user.update({
      where:  { id: userId },
      data:   { avatarUrl },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        avatarUrl: true, role: true, isEmailVerified: true,
      },
    });

    successResponse(res, updated, 'Avatar updated successfully');
  } catch (error) {
    next(error);
  }
};

// ── Delete avatar ─────────────────────────────────────────────────────────────
export const deleteAvatar = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Authentication required', 401);

    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { avatarUrl: true },
    });
    if (!user) throw new AppError('User not found', 404);

    deleteAvatarFile(user.avatarUrl);

    const updated = await prisma.user.update({
      where:  { id: userId },
      data:   { avatarUrl: null },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        avatarUrl: true, role: true, isEmailVerified: true,
      },
    });

    successResponse(res, updated, 'Avatar removed');
  } catch (error) {
    next(error);
  }
};

// ── Register / upsert session ─────────────────────────────────────────────────
export const upsertSession = async (
  userId:    string,
  token:     string,
  req:       AuthRequest,
  expiresAt: Date
): Promise<void> => {
  const tokenHash  = crypto.createHash('sha256').update(token).digest('hex');
  const ua         = req.headers['user-agent'] || '';
  const ipAddress  = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
                   || req.socket?.remoteAddress || 'Unknown';
  const deviceInfo = `${parseDevice(ua)} · ${getBrowser(ua)}`;

  await prisma.userSession.upsert({
    where:  { tokenHash },
    update: { lastUsedAt: new Date(), ipAddress },
    create: { userId, tokenHash, deviceInfo, ipAddress, expiresAt },
  });
};

// ── Get sessions ──────────────────────────────────────────────────────────────
export const getSessions = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Authentication required', 401);

    const currentToken = req.headers.authorization?.split(' ')[1] || '';
    const currentHash  = crypto.createHash('sha256').update(currentToken).digest('hex');

    await prisma.userSession.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });

    // ── FIXED: never send tokenHash to client — security issue ──
    const sessions = await prisma.userSession.findMany({
      where:   { userId },
      select:  {
        id: true, deviceInfo: true, ipAddress: true,
        lastUsedAt: true, createdAt: true, expiresAt: true,
        tokenHash: true, 
      },
      orderBy: { lastUsedAt: 'desc' },
    });

    successResponse(res, sessions.map(({ tokenHash, ...s }) => ({
      ...s,
      isCurrent: tokenHash === currentHash,
    })), 'Sessions retrieved');
  } catch (error) {
    next(error);
  }
};

// ── Revoke one session ────────────────────────────────────────────────────────
export const revokeSession = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId    = req.user?.userId;
    const sessionId = req.params.sessionId as string;
    if (!userId) throw new AppError('Authentication required', 401);

    // ── FIXED: only select userId + tokenHash — nothing else needed ──
    const session = await prisma.userSession.findUnique({
      where:  { id: sessionId },
      select: { userId: true, tokenHash: true },
    });
    if (!session || session.userId !== userId) throw new AppError('Session not found', 404);

    const currentHash = crypto
      .createHash('sha256')
      .update(req.headers.authorization?.split(' ')[1] || '')
      .digest('hex');
    if (session.tokenHash === currentHash) {
      throw new AppError('Cannot revoke your current session — use logout instead', 400);
    }

    await prisma.userSession.delete({ where: { id: sessionId } });
    successResponse(res, null, 'Session revoked');
  } catch (error) {
    next(error);
  }
};

// ── Revoke ALL other sessions ─────────────────────────────────────────────────
export const revokeAllSessions = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Authentication required', 401);

    const currentHash = crypto
      .createHash('sha256')
      .update(req.headers.authorization?.split(' ')[1] || '')
      .digest('hex');

    const { count } = await prisma.userSession.deleteMany({
      where: { userId, tokenHash: { not: currentHash } },
    });

    successResponse(res, { revokedCount: count }, `${count} other session${count !== 1 ? 's' : ''} revoked`);
  } catch (error) {
    next(error);
  }
};

// ── Delete account ────────────────────────────────────────────────────────────
export const deleteAccount = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError('Authentication required', 401);

    const { password, confirmation } = req.body;
    if (!password) throw new AppError('Password is required to delete your account', 400);
    if (confirmation !== 'DELETE MY ACCOUNT') throw new AppError('Type "DELETE MY ACCOUNT" exactly to confirm', 400);

    // ── FIXED: only select password + avatarUrl — nothing else needed ──
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { password: true, avatarUrl: true },
    });
    if (!user) throw new AppError('User not found', 404);

    if (!(await bcrypt.compare(password, user.password))) throw new AppError('Invalid password', 401);

    deleteAvatarFile(user.avatarUrl);
    await prisma.user.delete({ where: { id: userId } });

    successResponse(res, null, 'Account permanently deleted');
  } catch (error) {
    next(error);
  }
};