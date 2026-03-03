import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import prisma from '../utils/prisma';
import { AppError, successResponse } from '../utils/response';


export const getAllPackages = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const packages = await prisma.subscriptionPackage.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { userSubscriptions: { where: { isActive: true } } } },
      },
    });

    successResponse(res, packages, 'Packages retrieved');
  } catch (error) {
    next(error);
  }
};

export const getPackageById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // ── full row appropriate here — needed for edit form ──
    const pkg = await prisma.subscriptionPackage.findUnique({
      where: { id: req.params.id as string },
    });

    if (!pkg) throw new AppError('Package not found', 404);
    successResponse(res, pkg, 'Package retrieved');
  } catch (error) {
    next(error);
  }
};

export const createPackage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
      return;
    }

    const {
      name, displayName, description, maxFolders, maxNestingLevel,
      allowedFileTypes, maxFileSizeMB, totalFileLimit, filesPerFolder,
    } = req.body;

    // ── FIXED: only select id to check existence — no need for full row ──
    const existing = await prisma.subscriptionPackage.findUnique({
      where:  { name },
      select: { id: true },
    });
    if (existing) throw new AppError('A package with this name already exists', 409);

    const pkg = await prisma.subscriptionPackage.create({
      data: {
        name, displayName, description, maxFolders, maxNestingLevel,
        allowedFileTypes, maxFileSizeMB, totalFileLimit, filesPerFolder,
      },
    });

    successResponse(res, pkg, 'Package created successfully', 201);
  } catch (error) {
    next(error);
  }
};

export const updatePackage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
      return;
    }

    const pkgId = req.params.id as string;

    // ── FIXED: only select id to verify existence ──
    const pkg = await prisma.subscriptionPackage.findUnique({
      where:  { id: pkgId },
      select: { id: true },
    });
    if (!pkg) throw new AppError('Package not found', 404);

    const {
      displayName, description, maxFolders, maxNestingLevel,
      allowedFileTypes, maxFileSizeMB, totalFileLimit, filesPerFolder, isActive,
    } = req.body;

    const updated = await prisma.subscriptionPackage.update({
      where: { id: pkgId },
      data:  {
        ...(displayName      !== undefined && { displayName      }),
        ...(description      !== undefined && { description      }),
        ...(maxFolders       !== undefined && { maxFolders       }),
        ...(maxNestingLevel  !== undefined && { maxNestingLevel  }),
        ...(allowedFileTypes !== undefined && { allowedFileTypes }),
        ...(maxFileSizeMB    !== undefined && { maxFileSizeMB    }),
        ...(totalFileLimit   !== undefined && { totalFileLimit   }),
        ...(filesPerFolder   !== undefined && { filesPerFolder   }),
        ...(isActive         !== undefined && { isActive         }),
      },
    });

    successResponse(res, updated, 'Package updated successfully');
  } catch (error) {
    next(error);
  }
};

export const deletePackage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const pkgId = req.params.id as string;

    const pkg = await prisma.subscriptionPackage.findUnique({
      where:   { id: pkgId },
      include: { _count: { select: { userSubscriptions: { where: { isActive: true } } } } },
    });

    if (!pkg) throw new AppError('Package not found', 404);
    if (pkg._count.userSubscriptions > 0) {
      throw new AppError(
        `Cannot delete package with ${pkg._count.userSubscriptions} active subscribers`,
        400
      );
    }

    await prisma.subscriptionPackage.delete({ where: { id: pkgId } });
    successResponse(res, null, 'Package deleted successfully');
  } catch (error) {
    next(error);
  }
};