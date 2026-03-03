import { FileType } from '@prisma/client';
import prisma from '../utils/prisma';
import { AppError } from '../utils/response';

export interface ActivePackageInfo {
  id:               string;
  name:             string;
  displayName:      string;
  maxFolders:       number;
  maxNestingLevel:  number;
  allowedFileTypes: FileType[];
  maxFileSizeMB:    number;
  totalFileLimit:   number;
  filesPerFolder:   number;
}

export const getUserActivePackage = async (userId: string): Promise<ActivePackageInfo> => {
  // ── FIXED: use select instead of include to fetch only needed package fields ──
  const subscription = await prisma.userSubscription.findFirst({
    where:   { userId, isActive: true },
    select:  {
      package: {
        select: {
          id: true, name: true, displayName: true,
          maxFolders: true, maxNestingLevel: true, allowedFileTypes: true,
          maxFileSizeMB: true, totalFileLimit: true, filesPerFolder: true,
        },
      },
    },
    orderBy: { startDate: 'desc' },
  });

  if (!subscription) {
    throw new AppError('No active subscription found. Please select a subscription package first.', 403);
  }

  return {
    id:               subscription.package.id,
    name:             subscription.package.name,
    displayName:      subscription.package.displayName,
    maxFolders:       subscription.package.maxFolders,
    maxNestingLevel:  subscription.package.maxNestingLevel,
    allowedFileTypes: subscription.package.allowedFileTypes,
    maxFileSizeMB:    subscription.package.maxFileSizeMB,
    totalFileLimit:   subscription.package.totalFileLimit,
    filesPerFolder:   subscription.package.filesPerFolder,
  };
};

export const checkFolderCreationLimits = async (
  userId:      string,
  parentId:    string | null,
  packageInfo: ActivePackageInfo
): Promise<void> => {
  // ── FIXED: run total folder count + parent folder fetch in parallel ──
  const [totalFolders, parentFolder] = await Promise.all([
    prisma.folder.count({ where: { userId } }),
    parentId
      ? prisma.folder.findUnique({
          where:  { id: parentId, userId },
          // ── FIXED: only select nestingLevel — nothing else needed ──
          select: { nestingLevel: true },
        })
      : Promise.resolve(null),
  ]);

  if (totalFolders >= packageInfo.maxFolders) {
    throw new AppError(
      `Folder limit reached. Your ${packageInfo.displayName} plan allows a maximum of ${packageInfo.maxFolders} folders.`,
      403
    );
  }

  if (parentId) {
    if (!parentFolder) throw new AppError('Parent folder not found', 404);

    const newNestingLevel = parentFolder.nestingLevel + 1;
    if (newNestingLevel >= packageInfo.maxNestingLevel) {
      throw new AppError(
        `Nesting limit reached. Your ${packageInfo.displayName} plan allows a maximum nesting depth of ${packageInfo.maxNestingLevel} levels.`,
        403
      );
    }
  }
};

export const getNewFolderNestingLevel = async (
  parentId: string | null,
  userId:   string
): Promise<number> => {
  if (!parentId) return 0;

  // ── FIXED: only select nestingLevel — nothing else needed ──
  const parent = await prisma.folder.findUnique({
    where:  { id: parentId, userId },
    select: { nestingLevel: true },
  });

  if (!parent) throw new AppError('Parent folder not found', 404);
  return parent.nestingLevel + 1;
};

export const checkFileUploadLimits = async (
  userId:       string,
  folderId:     string,
  fileType:     FileType,
  fileSizeBytes: number,
  packageInfo:  ActivePackageInfo
): Promise<void> => {
  if (!packageInfo.allowedFileTypes.includes(fileType)) {
    throw new AppError(
      `File type "${fileType}" is not allowed on your ${packageInfo.displayName} plan. Allowed types: ${packageInfo.allowedFileTypes.join(', ')}.`,
      403
    );
  }

  const fileSizeMB = fileSizeBytes / (1024 * 1024);
  if (fileSizeMB > packageInfo.maxFileSizeMB) {
    throw new AppError(
      `File size (${fileSizeMB.toFixed(1)} MB) exceeds your ${packageInfo.displayName} plan limit of ${packageInfo.maxFileSizeMB} MB.`,
      403
    );
  }

  // ── FIXED: run both count queries in parallel instead of sequential ──
  const [totalFiles, folderFiles] = await Promise.all([
    prisma.file.count({ where: { userId,   deletedAt: null } }),
    prisma.file.count({ where: { folderId, deletedAt: null, userId } }),
  ]);

  if (totalFiles >= packageInfo.totalFileLimit) {
    throw new AppError(
      `Total file limit reached. Your ${packageInfo.displayName} plan allows a maximum of ${packageInfo.totalFileLimit} files.`,
      403
    );
  }

  if (folderFiles >= packageInfo.filesPerFolder) {
    throw new AppError(
      `This folder is full. Your ${packageInfo.displayName} plan allows a maximum of ${packageInfo.filesPerFolder} files per folder.`,
      403
    );
  }
};

export const getUserStorageStats = async (userId: string) => {
  // ── FIXED: run filesByType in same Promise.all as the other queries ──
  const [totalFolders, totalFiles, fileStats, filesByType] = await Promise.all([
    prisma.folder.count({ where: { userId } }),
    prisma.file.count({  where: { userId } }),
    prisma.file.aggregate({
      where: { userId },
      _sum:  { size: true },
    }),
    prisma.file.groupBy({
      by:    ['fileType'],
      where: { userId },
      _count: { id: true },
      _sum:   { size: true },
    }),
  ]);

  return {
    totalFolders,
    totalFiles,
    totalStorageBytes: fileStats._sum.size || 0,
    filesByType: filesByType.map(f => ({
      type:       f.fileType,
      count:      f._count.id,
      totalBytes: f._sum.size || 0,
    })),
  };
};