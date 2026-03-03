import { Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { AppError, successResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { hardDeleteFile } from './file.controller';
import { deleteFile } from '../middleware/upload';

const TRASH_DAYS = 30;

// ── Get trash contents ────────────────────────────────────────────────────────
export const getTrash = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const files = await prisma.file.findMany({
      where:   { userId, deletedAt: { not: null } },
      // ── FIXED: exclude path (disk location) from client response ──
      select:  {
        id: true, name: true, originalName: true, mimeType: true,
        fileType: true, size: true, isStarred: true,
        folderId: true, userId: true,
        deletedAt: true, trashedAt: true,
        createdAt: true, updatedAt: true,
        folder: { select: { id: true, name: true } },
      },
      orderBy: { deletedAt: 'desc' },
    });

    // Annotate with days remaining before auto-purge
    const now       = Date.now();
    const annotated = files.map(f => {
      const trashedMs = f.deletedAt ? new Date(f.deletedAt).getTime() : now;
      const expiresAt = new Date(trashedMs + TRASH_DAYS * 24 * 60 * 60 * 1000);
      const daysLeft  = Math.max(0, Math.ceil((expiresAt.getTime() - now) / (24 * 60 * 60 * 1000)));
      return { ...f, expiresAt, daysLeft };
    });

    successResponse(res, annotated, 'Trash contents retrieved');
  } catch (error) {
    next(error);
  }
};

// ── Get trash item count ──────────────────────────────────────────────────────
export const getTrashCount = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const count = await prisma.file.count({
      where: { userId: req.user!.userId, deletedAt: { not: null } },
    });
    successResponse(res, { count }, 'Trash count retrieved');
  } catch (error) {
    next(error);
  }
};

// ── Restore one file from trash ───────────────────────────────────────────────
export const restoreFile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const fileId = req.params.fileId as string;

    // ── FIXED: only select folderId — needed to check if original folder exists ──
    const file = await prisma.file.findFirst({
      where:  { id: fileId, userId, deletedAt: { not: null } },
      select: { id: true, folderId: true },
    });
    if (!file) throw new AppError('File not found in trash', 404);

    const [folderExists, fallback] = await Promise.all([
      prisma.folder.findFirst({
        where:  { id: file.folderId, userId },
        select: { id: true },
      }),
      prisma.folder.findFirst({
        where:   { userId },
        select:  { id: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    let targetFolderId = file.folderId;
    if (!folderExists) {
      if (!fallback) throw new AppError('No folder available to restore file into', 400);
      targetFolderId = fallback.id;
    }

    const restored = await prisma.file.update({
      where:  { id: fileId },
      data:   { deletedAt: null, trashedAt: null, folderId: targetFolderId },
      select: {
        id: true, name: true, originalName: true, mimeType: true,
        fileType: true, size: true, isStarred: true,
        folderId: true, userId: true,
        deletedAt: true, trashedAt: true,
        createdAt: true, updatedAt: true,
      },
    });

    successResponse(res, restored, 'File restored successfully');
  } catch (error) {
    next(error);
  }
};

// ── Restore ALL files from trash ──────────────────────────────────────────────
export const restoreAll = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;

    // ── FIXED: only select id + folderId — nothing else needed for restore logic ──
    const trashedFiles = await prisma.file.findMany({
      where:  { userId, deletedAt: { not: null } },
      select: { id: true, folderId: true },
    });
    if (trashedFiles.length === 0) throw new AppError('Trash is already empty', 400);

    const folderIds = [...new Set(trashedFiles.map(f => f.folderId))];

    // ── FIXED: run existing folders check + fallback fetch in parallel ──
    const [existingFolders, fallback] = await Promise.all([
      prisma.folder.findMany({
        where:  { id: { in: folderIds }, userId },
        select: { id: true },
      }),
      prisma.folder.findFirst({
        where:   { userId },
        select:  { id: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const existingIds = new Set(existingFolders.map(f => f.id));

    let restored = 0;
    for (const file of trashedFiles) {
      const targetFolderId = existingIds.has(file.folderId)
        ? file.folderId
        : fallback?.id ?? file.folderId;

      await prisma.file.update({
        where:  { id: file.id },
        data:   { deletedAt: null, trashedAt: null, folderId: targetFolderId },
        select: { id: true },
      });
      restored++;
    }

    successResponse(res, { restored }, `${restored} file(s) restored`);
  } catch (error) {
    next(error);
  }
};

// ── Permanently delete one file from trash ────────────────────────────────────
export const permanentDelete = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const fileId = req.params.fileId as string;

    // ── path is required here — hardDeleteFile needs it to remove from disk ──
    const file = await prisma.file.findFirst({
      where:  { id: fileId, userId, deletedAt: { not: null } },
      select: { id: true, path: true },
    });
    if (!file) throw new AppError('File not found in trash', 404);

    await hardDeleteFile(file);
    successResponse(res, null, 'File permanently deleted');
  } catch (error) {
    next(error);
  }
};

// ── Empty trash ───────────────────────────────────────────────────────────────
export const emptyTrash = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;

    // ── FIXED: only select path + id — path for disk delete, id for logging ──
    const trashedFiles = await prisma.file.findMany({
      where:  { userId, deletedAt: { not: null } },
      select: { id: true, path: true },
    });

    if (trashedFiles.length === 0) {
      successResponse(res, { deleted: 0 }, 'Trash is already empty');
      return;
    }

    for (const file of trashedFiles) {
      deleteFile(file.path);
    }

    await prisma.file.deleteMany({
      where: { userId, deletedAt: { not: null } },
    });

    successResponse(res, { deleted: trashedFiles.length }, `${trashedFiles.length} file(s) permanently deleted`);
  } catch (error) {
    next(error);
  }
};

// ── Auto-purge files older than 30 days (cron job) ───────────────────────────
export const purgeExpiredTrash = async (): Promise<void> => {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000);

  // ── FIXED: only select path + id — path for disk delete, id for deleteMany ──
  const expired = await prisma.file.findMany({
    where:  { deletedAt: { not: null, lte: cutoff } },
    select: { id: true, path: true },
  });

  if (expired.length === 0) return;

  console.log(`[Trash Purge] Auto-deleting ${expired.length} file(s) older than ${TRASH_DAYS} days`);

  for (const file of expired) {
    deleteFile(file.path);
  }

  await prisma.file.deleteMany({
    where: { deletedAt: { not: null, lte: cutoff } },
  });

  console.log(`[Trash Purge] Done — ${expired.length} file(s) permanently removed`);
};