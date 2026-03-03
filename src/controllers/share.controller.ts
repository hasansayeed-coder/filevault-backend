import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import prisma from '../utils/prisma';

// ── Create a share link ───────────────────────────────────────────────────────
export const createShare = async (req: AuthRequest, res: Response) => {
  try {
    const userId                       = req.user?.userId;
    const { fileId, expiryHours, password } = req.body;

    if (!fileId) {
      return res.status(400).json({ success: false, message: 'fileId is required' });
    }

    // ── FIXED: only select id to verify ownership ──
    const file = await prisma.file.findFirst({
      where:  { id: fileId, userId },
      select: { id: true },
    });
    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    await prisma.fileShare.updateMany({
      where: { fileId, userId, isActive: true },
      data:  { isActive: false },
    });

    let expiresAt: Date | null = null;
    if (expiryHours && expiryHours !== 'never') {
      expiresAt = new Date(Date.now() + parseInt(expiryHours) * 60 * 60 * 1000);
    }

    let hashedPassword: string | null = null;
    if (password?.trim()) {
      hashedPassword = await bcrypt.hash(password.trim(), 10);
    }

    // ── FIXED: select only needed fields in create response ──
    const share = await prisma.fileShare.create({
      data:   { fileId, userId: userId!, expiresAt, password: hashedPassword, isActive: true },
      select: { token: true, expiresAt: true },
    });

    const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/share/${share.token}`;

    return res.json({
      success: true,
      message: 'Share link created',
      data: {
        token:       share.token,
        shareUrl,
        expiresAt:   share.expiresAt,
        hasPassword: !!hashedPassword,
        accessCount: 0,
      },
    });
  } catch (error) {
    console.error('Create share error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create share link' });
  }
};

// ── Get share info for a file (owner only) ────────────────────────────────────
export const getFileShare = async (req: AuthRequest, res: Response) => {
  try {
    const userId         = req.user?.userId;
    const  fileId      = req.params.fileId as string;

    // ── FIXED: select only fields needed for the response — never expose password hash ──
    const share = await prisma.fileShare.findFirst({
      where:   { fileId, userId, isActive: true },
      select:  {
        token:       true,
        expiresAt:   true,
        password:    true, 
        accessCount: true,
        isActive:    true,
        createdAt:   true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!share) return res.json({ success: true, data: null });

    const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/share/${share.token}`;

    return res.json({
      success: true,
      data: {
        token:       share.token,
        shareUrl,
        expiresAt:   share.expiresAt,
        hasPassword: !!share.password, 
        accessCount: share.accessCount,
        isActive:    share.isActive,
        createdAt:   share.createdAt,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to get share info' });
  }
};

// ── Revoke a share link ───────────────────────────────────────────────────────
export const revokeShare = async (req: AuthRequest, res: Response) => {
  try {
    const userId     = req.user?.userId;
    const fileId = req.params.fileId as string;

    await prisma.fileShare.updateMany({
      where: { fileId, userId, isActive: true },
      data:  { isActive: false },
    });

    return res.json({ success: true, message: 'Share link revoked' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to revoke share' });
  }
};

// ── Public: get shared file info (no auth) ────────────────────────────────────
export const getSharedFile = async (req: Request, res: Response) => {
  try {
    const token  = req.params.token as string


    const share = await prisma.fileShare.findUnique({
      where:  { token },
      select: {
        isActive:  true,
        expiresAt: true,
        password:  true,
        accessCount: true,
        file: {
          select: {
            name:     true,
            fileType: true,
            mimeType: true,
            size:     true,
          },
        },
      },
    });

    if (!share || !share.isActive) {
      return res.status(404).json({ success: false, message: 'Share link not found or expired' });
    }

    if (share.expiresAt && new Date() > share.expiresAt) {
      await prisma.fileShare.update({ where: { token }, data: { isActive: false } });
      return res.status(410).json({ success: false, message: 'Share link has expired' });
    }

    return res.json({
      success: true,
      data: {
        fileName:    share.file.name,
        fileType:    share.file.fileType,
        mimeType:    share.file.mimeType,
        size:        share.file.size,
        hasPassword: !!share.password, 
        expiresAt:   share.expiresAt,
        accessCount: share.accessCount,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── Public: download/preview shared file (no auth) ───────────────────────────
export const accessSharedFile = async (req: Request, res: Response) => {
  try {
    const token                = req.params.token as string;
    const { password, action }        = req.query;

    // ── FIXED: path is needed here to serve the file — but select only what's needed ──
    const share = await prisma.fileShare.findUnique({
      where:  { token },
      select: {
        isActive:  true,
        expiresAt: true,
        password:  true,
        file: {
          select: {
            path:         true,  
            mimeType:     true,
            originalName: true,
          },
        },
      },
    });

    if (!share || !share.isActive) {
      return res.status(404).json({ success: false, message: 'Share link not found' });
    }

    if (share.expiresAt && new Date() > share.expiresAt) {
      await prisma.fileShare.update({ where: { token }, data: { isActive: false } });
      return res.status(410).json({ success: false, message: 'Share link has expired' });
    }

    if (share.password) {
      if (!password) {
        return res.status(401).json({ success: false, message: 'Password required' });
      }
      const valid = await bcrypt.compare(password as string, share.password);
      if (!valid) {
        return res.status(401).json({ success: false, message: 'Invalid password' });
      }
    }

    await prisma.fileShare.update({
      where: { token },
      data:  { accessCount: { increment: 1 } },
    });

    const filePath = share.file.path;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on server' });
    }

    const disposition = action === 'download' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', share.file.mimeType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${share.file.originalName}"`);
    return res.sendFile(path.resolve(filePath));
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};