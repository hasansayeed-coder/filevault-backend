import { Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import prisma from '../utils/prisma';
import { AppError, successResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import {
  getUserActivePackage,
  checkFolderCreationLimits,
  getNewFolderNestingLevel,
} from '../services/subscription.service';

// ── Reusable select shape for folder list responses ───────────────────────────
const folderSelect = {
  id: true, name: true, userId: true, parentId: true,
  nestingLevel: true, isStarred: true,
  createdAt: true, updatedAt: true,
  _count: { select: { subfolders: true, files: true } },
};

export const getFolders = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId    = req.user!.userId;
    const { parentId } = req.query;

    const where: any = { userId };
    if (parentId === 'root' || parentId === '' || !parentId) {
      where.parentId = null;
    } else {
      where.parentId = parentId as string;
    }

    const folders = await prisma.folder.findMany({
      where,
      // ── FIXED: use shared select shape instead of full row ──
      select:  folderSelect,
      orderBy: { createdAt: 'asc' },
    });

    successResponse(res, folders, 'Folders retrieved');
  } catch (error) {
    next(error);
  }
};

export const getFolderById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const folder = await prisma.folder.findFirst({
      where:  { id: req.params.id as string, userId: req.user!.userId },
      select: {
        id: true, name: true, userId: true, parentId: true,
        nestingLevel: true, isStarred: true,
        createdAt: true, updatedAt: true,
        // ── FIXED: parent only needs id + name ──
        parent:     { select: { id: true, name: true } },
        // ── FIXED: subfolders use same minimal select, not full rows ──
        subfolders: {
          select: folderSelect,
        },
        _count: { select: { files: true, subfolders: true } },
      },
    });

    if (!folder) throw new AppError('Folder not found', 404);
    successResponse(res, folder, 'Folder retrieved');
  } catch (error) {
    next(error);
  }
};

export const getFolderBreadcrumb = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const folderId = req.params.id as string;
    const userId   = req.user!.userId;
    const breadcrumb: any[] = [];

    let currentId: string | null = folderId;
    while (currentId) {
      const folder = await prisma.folder.findFirst({
        where:  { id: currentId, userId },
        select: { id: true, name: true, parentId: true },
      });
      if (!folder) break;
      breadcrumb.unshift({ id: folder.id, name: folder.name });
      currentId = folder.parentId;
    }

    successResponse(res, breadcrumb, 'Breadcrumb retrieved');
  } catch (error) {
    next(error);
  }
};

export const createFolder = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
      return;
    }

    const userId            = req.user!.userId;
    const { name, parentId } = req.body;

    const packageInfo  = await getUserActivePackage(userId);
    await checkFolderCreationLimits(userId, parentId || null, packageInfo);
    const nestingLevel = await getNewFolderNestingLevel(parentId || null, userId);

    // ── FIXED: only select id to check existence — no need for full row ──
    const existing = await prisma.folder.findFirst({
      where:  { userId, name, parentId: parentId || null },
      select: { id: true },
    });
    if (existing) throw new AppError('A folder with this name already exists here', 409);

    const folder = await prisma.folder.create({
      data:   { name, userId, parentId: parentId || null, nestingLevel },
      // ── FIXED: use shared select shape instead of full row ──
      select: folderSelect,
    });

    successResponse(res, folder, 'Folder created successfully', 201);
  } catch (error) {
    next(error);
  }
};

export const renameFolder = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
      return;
    }

    const userId     = req.user!.userId;
    const { name }   = req.body;
    const folderId   = req.params.id as string;

    // ── FIXED: only select parentId — needed to check name uniqueness in same parent ──
    const folder = await prisma.folder.findFirst({
      where:  { id: folderId, userId },
      select: { id: true, parentId: true },
    });
    if (!folder) throw new AppError('Folder not found', 404);

    // ── FIXED: only select id to check existence ──
    const existing = await prisma.folder.findFirst({
      where:  { userId, name, parentId: folder.parentId, id: { not: folderId } },
      select: { id: true },
    });
    if (existing) throw new AppError('A folder with this name already exists here', 409);

    const updated = await prisma.folder.update({
      where:  { id: folderId },
      data:   { name },
      // ── FIXED: use shared select shape in update response ──
      select: folderSelect,
    });

    successResponse(res, updated, 'Folder renamed successfully');
  } catch (error) {
    next(error);
  }
};

export const deleteFolder = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId   = req.user!.userId;
    const folderId = req.params.id as string;

    // ── FIXED: only select id to verify ownership ──
    const folder = await prisma.folder.findFirst({
      where:  { id: folderId, userId },
      select: { id: true },
    });
    if (!folder) throw new AppError('Folder not found', 404);

    await prisma.folder.delete({ where: { id: folderId } });

    successResponse(res, null, 'Folder deleted successfully');
  } catch (error) {
    next(error);
  }
};

export const getAllUserFolders = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    // ── Already correct — minimal select in place ──
    const folders = await prisma.folder.findMany({
      where:   { userId: req.user!.userId },
      select:  { id: true, name: true, parentId: true, nestingLevel: true },
      orderBy: [{ nestingLevel: 'asc' }, { name: 'asc' }],
    });

    successResponse(res, folders, 'All folders retrieved');
  } catch (error) {
    next(error);
  }
};

export const toggleFolderStar = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId   = req.user!.userId;
    const folderId = req.params.id as string;

    // ── FIXED: only select isStarred to determine toggle value ──
    const folder = await prisma.folder.findFirst({
      where:  { id: folderId, userId },
      select: { id: true, isStarred: true },
    });
    if (!folder) throw new AppError('Folder not found', 404);

    const updated = await prisma.folder.update({
      where:  { id: folderId },
      data:   { isStarred: !folder.isStarred },
      // ── FIXED: use shared select shape in update response ──
      select: folderSelect,
    });

    successResponse(res, updated, updated.isStarred ? 'Folder starred' : 'Folder unstarred');
  } catch (error) {
    next(error);
  }
};

export const getStarredFolders = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const folders = await prisma.folder.findMany({
      where:   { userId, isStarred: true },
      // ── FIXED: use shared select shape instead of full rows ──
      select:  folderSelect,
      orderBy: { updatedAt: 'desc' },
    });

    successResponse(res, folders, 'Starred folders retrieved');
  } catch (error) {
    next(error);
  }
};