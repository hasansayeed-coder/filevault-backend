import { Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import prisma from '../utils/prisma';
import { AppError, successResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { getUserActivePackage, checkFileUploadLimits } from '../services/subscription.service';
import { getFileTypeFromMime } from '../utils/fileTypes';
import { deleteFile } from '../middleware/upload';
import { logActivity } from '../utils/activity';
import { ActivityAction } from '@prisma/client';
import { sendStorageWarningEmail } from '../utils/email';

// ── Storage warning helper — fire and forget ──────────────────────────────────
const checkAndWarnStorage = async (userId: string): Promise<void> => {
  try {
    const [subscription, fileStats] = await Promise.all([
      prisma.userSubscription.findFirst({
        where:   { userId, isActive: true },
        // ── FIXED: select only needed package fields instead of include ──
        select:  {
          package: {
            select: {
              maxFileSizeMB:  true,
              totalFileLimit: true,
              displayName:    true,
            },
          },
        },
        orderBy: { startDate: 'desc' },
      }),
      prisma.file.aggregate({
        where: { userId, deletedAt: null },
        _sum:  { size: true },
      }),
    ]);

    if (!subscription) return;

    const usedBytes  = fileStats._sum.size ?? 0;
    const totalBytes = subscription.package.maxFileSizeMB
      * subscription.package.totalFileLimit * 1024 * 1024;
    const percentage = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

    if (percentage >= 80) {
      // ── FIXED: select only email + firstName ──
      const user = await prisma.user.findUnique({
        where:  { id: userId },
        select: { email: true, firstName: true },
      });
      if (user) {
        sendStorageWarningEmail(
          user.email, user.firstName, usedBytes, totalBytes,
          subscription.package.displayName
        ).catch(err => console.error('[Email] Storage warning failed:', err));
      }
    }
  } catch (err) {
    console.error('[Storage check] Failed:', err);
  }
};

// ── Shared soft-delete helper ─────────────────────────────────────────────────
export const softDeleteFile = async (fileId: string): Promise<void> => {
  const now = new Date();
  await prisma.file.update({
    where: { id: fileId },
    data:  { deletedAt: now, trashedAt: now },
  });
};

// ── Permanent hard-delete helper ──────────────────────────────────────────────
export const hardDeleteFile = async (file: { id: string; path: string }): Promise<void> => {
  deleteFile(file.path);
  await prisma.file.delete({ where: { id: file.id } });
};

// ── Get files in folder ───────────────────────────────────────────────────────
export const getFilesInFolder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId   = req.user!.userId;
    const folderId = req.params.folderId as string;
    const page     = parseInt(req.query.page as string) || 1;
    const limit    = parseInt(req.query.limit as string) || 50;
    const skip     = (page - 1) * limit;

    const [files, total] = await Promise.all([
      prisma.file.findMany({
        where:   { folderId, userId, deletedAt: null },
        // ── FIXED: never send path (disk location) to client ──
        select:  {
          id: true, name: true, originalName: true, mimeType: true,
          fileType: true, size: true, isStarred: true,
          folderId: true, userId: true, createdAt: true, updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take:    limit,
      }),
      prisma.file.count({ where: { folderId, userId, deletedAt: null } }),
    ]);

    successResponse(res, {
      files,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

// ── Get file by ID ────────────────────────────────────────────────────────────
export const getFileById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const file = await prisma.file.findFirst({
      where:  { id: req.params.id as string, userId: req.user!.userId, deletedAt: null },
      // ── FIXED: exclude path, include folder name ──
      select: {
        id: true, name: true, originalName: true, mimeType: true,
        fileType: true, size: true, isStarred: true,
        folderId: true, userId: true, createdAt: true, updatedAt: true,
        folder: { select: { id: true, name: true } },
      },
    });
    if (!file) throw new AppError('File not found', 404);
    successResponse(res, file, 'File retrieved');
  } catch (error) {
    next(error);
  }
};

// ── Upload file ───────────────────────────────────────────────────────────────
export const uploadFile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const uploadedFile = req.file;
  try {
    if (!uploadedFile) throw new AppError('No file uploaded', 400);

    const userId     = req.user!.userId;
    const { folderId } = req.body;

    if (!folderId) {
      deleteFile(uploadedFile.path);
      throw new AppError('Folder ID is required', 400);
    }

    // ── FIXED: only select id to verify folder ownership ──
    const folder = await prisma.folder.findFirst({
      where:  { id: folderId, userId },
      select: { id: true },
    });
    if (!folder) {
      deleteFile(uploadedFile.path);
      throw new AppError('Folder not found', 404);
    }

    const fileType = getFileTypeFromMime(uploadedFile.mimetype);
    if (!fileType) {
      deleteFile(uploadedFile.path);
      throw new AppError('Unsupported file type', 400);
    }

    const packageInfo = await getUserActivePackage(userId);
    await checkFileUploadLimits(userId, folderId, fileType, uploadedFile.size, packageInfo);

    const file = await prisma.file.create({
      data: {
        name:         uploadedFile.originalname,
        originalName: uploadedFile.originalname,
        mimeType:     uploadedFile.mimetype,
        fileType,
        size:         uploadedFile.size,
        path:         uploadedFile.path,
        folderId,
        userId,
      },
      // ── FIXED: exclude path from create response ──
      select: {
        id: true, name: true, originalName: true, mimeType: true,
        fileType: true, size: true, isStarred: true,
        folderId: true, userId: true, createdAt: true, updatedAt: true,
      },
    });

    logActivity({
      userId, action: ActivityAction.FILE_UPLOAD, entityType: 'file',
      entityId: file.id, entityName: file.name,
      metadata: { size: file.size, fileType: file.fileType, folderId },
      req: req as any,
    });

    checkAndWarnStorage(userId);
    successResponse(res, file, 'File uploaded successfully', 201);
  } catch (error) {
    if (uploadedFile) deleteFile(uploadedFile.path);
    next(error);
  }
};

// ── Rename file ───────────────────────────────────────────────────────────────
export const renameFile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name } = req.body;
    if (!name?.trim()) throw new AppError('File name is required', 400);

    // ── FIXED: only select name (needed for oldName in activity log) ──
    const file = await prisma.file.findFirst({
      where:  { id: req.params.id as string, userId: req.user!.userId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!file) throw new AppError('File not found', 404);

    const updated = await prisma.file.update({
      where:  { id: req.params.id as string },
      data:   { name: name.trim() },
      select: {
        id: true, name: true, originalName: true, mimeType: true,
        fileType: true, size: true, isStarred: true,
        folderId: true, userId: true, createdAt: true, updatedAt: true,
      },
    });

    logActivity({
      userId: req.user!.userId, action: ActivityAction.FILE_RENAME,
      entityType: 'file', entityId: updated.id, entityName: updated.name,
      metadata: { oldName: file.name, newName: updated.name },
      req: req as any,
    });

    successResponse(res, updated, 'File renamed successfully');
  } catch (error) {
    next(error);
  }
};

// ── Delete → moves to trash ───────────────────────────────────────────────────
export const deleteFile2 = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    // ── FIXED: only select id + name — nothing else needed ──
    const file = await prisma.file.findFirst({
      where:  { id: req.params.id as string, userId: req.user!.userId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!file) throw new AppError('File not found', 404);

    await softDeleteFile(file.id);

    logActivity({
      userId: req.user!.userId, action: ActivityAction.FILE_DELETE,
      entityType: 'file', entityId: file.id, entityName: file.name,
      req: req as any,
    });
    successResponse(res, null, 'File moved to trash');
  } catch (error) {
    next(error);
  }
};

// ── Download file — intentionally fetches path + mimeType + originalName ─────
export const downloadFile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const file = await prisma.file.findFirst({
      where:  { id: req.params.id as string, userId: req.user!.userId, deletedAt: null },
      select: { id: true, name: true, originalName: true, mimeType: true, path: true },
    });
    if (!file) throw new AppError('File not found', 404);

    const absolutePath = path.resolve(file.path);
    if (!fs.existsSync(absolutePath)) throw new AppError('File not found on server', 404);

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader('Content-Type', file.mimeType);

    logActivity({
      userId: req.user!.userId, action: ActivityAction.FILE_DOWNLOAD,
      entityType: 'file', entityId: file.id, entityName: file.name,
      req: req as any,
    });
    res.sendFile(absolutePath);
  } catch (error) {
    next(error);
  }
};

// ── Preview file — intentionally fetches path + mimeType ─────────────────────
export const previewFile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const file = await prisma.file.findFirst({
      where:  { id: req.params.id as string, userId: req.user!.userId, deletedAt: null },
      select: { id: true, mimeType: true, path: true },
    });
    if (!file) throw new AppError('File not found', 404);

    const absolutePath = path.resolve(file.path);
    if (!fs.existsSync(absolutePath)) throw new AppError('File not found on server', 404);

    res.setHeader('Content-Type', file.mimeType);
    res.sendFile(absolutePath);
  } catch (error) {
    next(error);
  }
};

// ── Move file ─────────────────────────────────────────────────────────────────
export const moveFile = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { targetFolderId } = req.body;
    const userId = req.user!.userId;

    // ── FIXED: run file + folder ownership checks in parallel ──
    const [file, targetFolder] = await Promise.all([
      prisma.file.findFirst({
        where:  { id: req.params.id as string, userId, deletedAt: null },
        select: { id: true, name: true, folderId: true },
      }),
      prisma.folder.findFirst({
        where:  { id: targetFolderId, userId },
        select: { id: true },
      }),
    ]);

    if (!file)         throw new AppError('File not found', 404);
    if (!targetFolder) throw new AppError('Target folder not found', 404);

    const packageInfo     = await getUserActivePackage(userId);
    const folderFileCount = await prisma.file.count({
      where: { folderId: targetFolderId, userId, deletedAt: null },
    });
    if (folderFileCount >= packageInfo.filesPerFolder) {
      throw new AppError(
        `Target folder is full. Your ${packageInfo.displayName} plan allows ${packageInfo.filesPerFolder} files per folder.`,
        403
      );
    }

    const updated = await prisma.file.update({
      where:  { id: req.params.id as string },
      data:   { folderId: targetFolderId },
      // ── FIXED: exclude path from update response ──
      select: {
        id: true, name: true, originalName: true, mimeType: true,
        fileType: true, size: true, isStarred: true,
        folderId: true, userId: true, createdAt: true, updatedAt: true,
      },
    });

    logActivity({
      userId, action: ActivityAction.FILE_MOVE, entityType: 'file',
      entityId: updated.id, entityName: updated.name,
      metadata: { fromFolderId: file.folderId, toFolderId: targetFolderId },
      req: req as any,
    });
    successResponse(res, updated, 'File moved successfully');
  } catch (error) {
    next(error);
  }
};

// ── Get all user files ────────────────────────────────────────────────────────
export const getAllUserFiles = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { fileType, search } = req.query;
    const userId = req.user!.userId;

    const where: any = { userId, deletedAt: null };
    if (fileType) where.fileType = fileType;
    if (search) {
      where.OR = [
        { name:         { contains: search as string, mode: 'insensitive' } },
        { originalName: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const files = await prisma.file.findMany({
      where,
      // ── FIXED: exclude path, include folder name ──
      select: {
        id: true, name: true, originalName: true, mimeType: true,
        fileType: true, size: true, isStarred: true,
        folderId: true, userId: true, createdAt: true, updatedAt: true,
        folder: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    successResponse(res, files, 'Files retrieved');
  } catch (error) {
    next(error);
  }
};

// ── Bulk delete ───────────────────────────────────────────────────────────────
export const bulkDeleteFiles = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId      = req.user!.userId;
    const { fileIds } = req.body;

    if (!Array.isArray(fileIds) || fileIds.length === 0)
      throw new AppError('fileIds array is required', 400);

    // ── FIXED: only select id + name for activity logging ──
    const files = await prisma.file.findMany({
      where:  { id: { in: fileIds }, userId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (files.length === 0) throw new AppError('No files found', 404);

    const now = new Date();
    await prisma.file.updateMany({
      where: { id: { in: files.map(f => f.id) }, userId },
      data:  { deletedAt: now, trashedAt: now },
    });

    files.forEach(f => logActivity({
      userId, action: ActivityAction.FILE_DELETE,
      entityType: 'file', entityId: f.id, entityName: f.name,
      req: req as any,
    }));

    successResponse(res, { trashed: files.length }, `${files.length} file(s) moved to trash`);
  } catch (error) {
    next(error);
  }
};

// ── Bulk move ─────────────────────────────────────────────────────────────────
export const bulkMoveFiles = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId                   = req.user!.userId;
    const { fileIds, targetFolderId } = req.body;

    if (!Array.isArray(fileIds) || fileIds.length === 0)
      throw new AppError('fileIds array is required', 400);
    if (!targetFolderId)
      throw new AppError('targetFolderId is required', 400);

    // ── FIXED: run folder check + file fetch in parallel ──
    const [targetFolder, files] = await Promise.all([
      prisma.folder.findFirst({
        where:  { id: targetFolderId, userId },
        select: { id: true },
      }),
      prisma.file.findMany({
        where:  { id: { in: fileIds }, userId, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);

    if (!targetFolder)   throw new AppError('Target folder not found', 404);
    if (files.length === 0) throw new AppError('No files found', 404);

    const packageInfo  = await getUserActivePackage(userId);
    const currentCount = await prisma.file.count({
      where: { folderId: targetFolderId, userId, deletedAt: null },
    });
    if (currentCount + files.length > packageInfo.filesPerFolder) {
      throw new AppError(
        `Target folder would exceed limit. Your ${packageInfo.displayName} plan allows ${packageInfo.filesPerFolder} files per folder.`,
        403
      );
    }

    await prisma.file.updateMany({
      where: { id: { in: files.map(f => f.id) }, userId },
      data:  { folderId: targetFolderId },
    });

    successResponse(res, { moved: files.length }, `${files.length} file(s) moved successfully`);
  } catch (error) {
    next(error);
  }
};

// ── File versions ─────────────────────────────────────────────────────────────
export const getFileVersions = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const fileId = req.params.id as string;

    // ── FIXED: only select id to verify ownership ──
    const file = await prisma.file.findFirst({
      where:  { id: fileId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!file) throw new AppError('File not found', 404);

    const versions = await prisma.fileVersion.findMany({
      where:   { fileId },
      // ── FIXED: exclude path from version list ──
      select:  {
        id: true, fileId: true, versionNumber: true, name: true,
        originalName: true, mimeType: true, fileType: true,
        size: true, createdAt: true,
      },
      orderBy: { versionNumber: 'desc' },
    });

    successResponse(res, versions, 'Versions retrieved');
  } catch (error) {
    next(error);
  }
};

export const uploadNewVersion = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const uploadedFile = req.file;
  try {
    if (!uploadedFile) throw new AppError('No file uploaded', 400);

    const userId = req.user!.userId;
    const fileId = req.params.id as string;

    // ── FIXED: select only fields needed for version snapshot + mime check ──
    const existingFile = await prisma.file.findFirst({
      where:  { id: fileId, userId, deletedAt: null },
      select: {
        id: true, name: true, originalName: true,
        mimeType: true, fileType: true, size: true, path: true,
      },
    });
    if (!existingFile) {
      deleteFile(uploadedFile.path);
      throw new AppError('File not found', 404);
    }

    if (uploadedFile.mimetype !== existingFile.mimeType) {
      deleteFile(uploadedFile.path);
      throw new AppError(`Version must be the same file type (${existingFile.mimeType})`, 400);
    }

    const versionCount = await prisma.fileVersion.count({ where: { fileId } });

    await prisma.fileVersion.create({
      data: {
        fileId,
        versionNumber: versionCount + 1,
        name:         existingFile.name,
        originalName: existingFile.originalName,
        mimeType:     existingFile.mimeType,
        fileType:     existingFile.fileType,
        size:         existingFile.size,
        path:         existingFile.path,
      },
    });

    const updatedFile = await prisma.file.update({
      where:  { id: fileId },
      data:   {
        name:         uploadedFile.originalname,
        originalName: uploadedFile.originalname,
        size:         uploadedFile.size,
        path:         uploadedFile.path,
        updatedAt:    new Date(),
      },
      // ── FIXED: exclude path from response ──
      select: {
        id: true, name: true, originalName: true, mimeType: true,
        fileType: true, size: true, isStarred: true,
        folderId: true, userId: true, createdAt: true, updatedAt: true,
      },
    });

    successResponse(res, updatedFile, 'New version uploaded successfully');
  } catch (error) {
    if (uploadedFile) deleteFile(uploadedFile.path);
    next(error);
  }
};

export const restoreVersion = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId    = req.user!.userId;
    const fileId    = req.params.id as string;
    const versionId = req.params.versionId as string;

    // ── FIXED: run file + version fetch in parallel ──
    const [existingFile, version] = await Promise.all([
      prisma.file.findFirst({
        where:  { id: fileId, userId, deletedAt: null },
        select: {
          id: true, name: true, originalName: true,
          mimeType: true, fileType: true, size: true, path: true,
        },
      }),
      prisma.fileVersion.findFirst({
        where:  { id: versionId, fileId },
        select: {
          id: true, versionNumber: true, name: true,
          originalName: true, size: true, path: true,
        },
      }),
    ]);

    if (!existingFile) throw new AppError('File not found', 404);
    if (!version)      throw new AppError('Version not found', 404);

    const versionCount = await prisma.fileVersion.count({ where: { fileId } });

    await prisma.fileVersion.create({
      data: {
        fileId,
        versionNumber: versionCount + 1,
        name:         existingFile.name,
        originalName: existingFile.originalName,
        mimeType:     existingFile.mimeType,
        fileType:     existingFile.fileType,
        size:         existingFile.size,
        path:         existingFile.path,
      },
    });

    await prisma.file.update({
      where: { id: fileId },
      data:  {
        name:         version.name,
        originalName: version.originalName,
        size:         version.size,
        path:         version.path,
        updatedAt:    new Date(),
      },
    });

    successResponse(res, { restored: true }, `Restored to version ${version.versionNumber}`);
  } catch (error) {
    next(error);
  }
};

export const deleteVersion = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId    = req.user!.userId;
    const fileId    = req.params.id as string;
    const versionId = req.params.versionId as string;

    // ── FIXED: run file + version fetch in parallel, select only needed fields ──
    const [file, version] = await Promise.all([
      prisma.file.findFirst({
        where:  { id: fileId, userId },
        select: { id: true, path: true },
      }),
      prisma.fileVersion.findFirst({
        where:  { id: versionId, fileId },
        select: { id: true, path: true },
      }),
    ]);

    if (!file)    throw new AppError('File not found', 404);
    if (!version) throw new AppError('Version not found', 404);

    if (version.path !== file.path) deleteFile(version.path);

    await prisma.fileVersion.delete({ where: { id: versionId } });
    successResponse(res, null, 'Version deleted');
  } catch (error) {
    next(error);
  }
};

// ── Star ──────────────────────────────────────────────────────────────────────
export const toggleFileStar = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const fileId = req.params.id as string;

    // ── FIXED: only select isStarred + id + name ──
    const file = await prisma.file.findFirst({
      where:  { id: fileId, userId, deletedAt: null },
      select: { id: true, name: true, isStarred: true },
    });
    if (!file) throw new AppError('File not found', 404);

    const updated = await prisma.file.update({
      where:  { id: fileId },
      data:   { isStarred: !file.isStarred },
      // ── FIXED: exclude path from response ──
      select: {
        id: true, name: true, originalName: true, mimeType: true,
        fileType: true, size: true, isStarred: true,
        folderId: true, userId: true, createdAt: true, updatedAt: true,
      },
    });

    logActivity({
      userId,
      action: updated.isStarred ? ActivityAction.FILE_STAR : ActivityAction.FILE_UNSTAR,
      entityType: 'file', entityId: updated.id, entityName: updated.name,
      req: req as any,
    });

    successResponse(res, updated, updated.isStarred ? 'File starred' : 'File unstarred');
  } catch (error) {
    next(error);
  }
};

// ── Starred files ─────────────────────────────────────────────────────────────
export const getStarredFiles = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const files = await prisma.file.findMany({
      where:   { userId, isStarred: true, deletedAt: null },
      // ── FIXED: exclude path, include folder name ──
      select:  {
        id: true, name: true, originalName: true, mimeType: true,
        fileType: true, size: true, isStarred: true,
        folderId: true, userId: true, createdAt: true, updatedAt: true,
        folder: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    successResponse(res, files, 'Starred files retrieved');
  } catch (error) {
    next(error);
  }
};