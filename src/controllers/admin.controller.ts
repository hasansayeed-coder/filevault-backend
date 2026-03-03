import { Request, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { AppError, successResponse } from '../utils/response';
import bcrypt from 'bcryptjs';

export const getDashboardStats = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [totalUsers, totalFiles, totalFolders, packageStats, recentUsers, storageStats] = await Promise.all([
      prisma.user.count({ where: { role: 'USER' } }),
      prisma.file.count(),
      prisma.folder.count(),
      prisma.subscriptionPackage.findMany({
        include: { _count: { select: { userSubscriptions: { where: { isActive: true } } } } },
      }),
      prisma.user.findMany({
        where:   { role: 'USER' },
        select:  {
          id: true, email: true, firstName: true, lastName: true,
          createdAt: true, isEmailVerified: true,
          subscriptions: {
            where:   { isActive: true },
            include: { package: { select: { displayName: true, name: true } } },
            take:    1,
          },
        },
        orderBy: { createdAt: 'desc' },
        take:    5,
      }),
      // ── FIXED: moved storageStats into Promise.all instead of separate await ──
      prisma.file.aggregate({ _sum: { size: true } }),
    ]);

    successResponse(res, {
      totalUsers,
      totalFiles,
      totalFolders,
      totalStorageBytes: storageStats._sum.size || 0,
      packageStats: packageStats.map(p => ({
        name:               p.name,
        displayName:        p.displayName,
        activeSubscribers:  p._count.userSubscriptions,
      })),
      recentUsers,
    }, 'Dashboard stats retrieved');
  } catch (error) {
    next(error);
  }
};

export const getAllUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { search, page = '1', limit = '10' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { role: 'USER' };
    if (search) {
      where.OR = [
        { email:     { contains: search as string, mode: 'insensitive' } },
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName:  { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, firstName: true, lastName: true,
          isEmailVerified: true, createdAt: true,
          subscriptions: {
            where:   { isActive: true },
            include: { package: { select: { displayName: true, name: true } } },
            take:    1,
          },
          _count: { select: { files: true, folders: true } },
        },
        skip,
        take:    parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      data:    users,
      pagination: {
        total,
        page:       parseInt(page as string),
        limit:      parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getUserDetails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.params.id as string },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, isEmailVerified: true, createdAt: true,
        subscriptions: {
          include: { package: true },
          orderBy: { startDate: 'desc' },
        },
        _count: { select: { files: true, folders: true } },
      },
    });

    if (!user) throw new AppError('User not found', 404);
    successResponse(res, user, 'User details retrieved');
  } catch (error) {
    next(error);
  }
};

export const changeUserPlan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId      = req.params.userId as string;
    const { packageId } = req.body;

    if (!packageId) throw new AppError('packageId is required', 400);

    // ── FIXED: fetch user + package in parallel instead of sequential ──
    const [user, pkg] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.subscriptionPackage.findUnique({ where: { id: packageId } }),
    ]);

    if (!user) throw new AppError('User not found', 404);
    if (!pkg)  throw new AppError('Package not found', 404);

    await prisma.userSubscription.updateMany({
      where: { userId, isActive: true },
      data:  { isActive: false, endDate: new Date() },
    });

    const subscription = await prisma.userSubscription.create({
      data:    { userId, packageId, isActive: true },
      include: { package: true },
    });

    successResponse(res, subscription, `User plan changed to ${pkg.displayName}`);
  } catch (error) {
    next(error);
  }
};

export const toggleSuspendUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId    = req.params.userId as string;
    const { reason } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    if (user.role === 'ADMIN') throw new AppError('Cannot suspend an admin account', 403);

    const nowSuspended = !user.isSuspended;

    const updated = await prisma.user.update({
      where: { id: userId },
      data:  {
        isSuspended:     nowSuspended,
        suspendedAt:     nowSuspended ? new Date() : null,
        suspendedReason: nowSuspended ? (reason || 'Suspended by admin') : null,
      },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        isSuspended: true, suspendedAt: true, suspendedReason: true,
      },
    });

    successResponse(res, updated, nowSuspended ? 'User suspended' : 'User unsuspended');
  } catch (error) {
    next(error);
  }
};

export const adminResetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId        = req.params.userId as string;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      throw new AppError('New password must be at least 8 characters', 400);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data:  { password: hashed, passwordResetToken: null, passwordResetExpiry: null },
    });

    successResponse(res, null, 'Password reset successfully');
  } catch (error) {
    next(error);
  }
};

export const getUserStorageDetails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.params.userId as string;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);

    // ── FIXED: run all 5 queries in parallel instead of sequential ──
    const [byType, totals, folderCount, activeSub, largestFiles] = await Promise.all([
      prisma.file.groupBy({
        by:    ['fileType'],
        where: { userId },
        _sum:  { size: true },
        _count: { id: true },
      }),
      prisma.file.aggregate({
        where: { userId },
        _sum:  { size: true },
        _count: { id: true },
      }),
      prisma.folder.count({ where: { userId } }),
      prisma.userSubscription.findFirst({
        where:   { userId, isActive: true },
        include: { package: true },
        orderBy: { startDate: 'desc' },
      }),
      prisma.file.findMany({
        where:   { userId },
        orderBy: { size: 'desc' },
        take:    5,
        select:  {
          id: true, name: true, fileType: true, size: true, createdAt: true,
          folder: { select: { name: true } },
        },
      }),
    ]);

    successResponse(res, {
      totalFiles:   totals._count.id,
      totalFolders: folderCount,
      totalBytes:   totals._sum.size || 0,
      byType:       byType.map(b => ({ fileType: b.fileType, count: b._count.id, bytes: b._sum.size || 0 })),
      activePlan:   activeSub?.package || null,
      largestFiles,
    }, 'Storage details retrieved');
  } catch (error) {
    next(error);
  }
};

export const getUserDetailsEnhanced = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.params.id as string },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, isEmailVerified: true, createdAt: true,
        isSuspended: true, suspendedAt: true, suspendedReason: true,
        subscriptions: {
          include: { package: true },
          orderBy: { startDate: 'desc' },
        },
        _count: { select: { files: true, folders: true } },
      },
    });

    if (!user) throw new AppError('User not found', 404);
    successResponse(res, user, 'User details retrieved');
  } catch (error) {
    next(error);
  }
};

export const getRevenueOverview = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const now = new Date();

    const [totalRevenue, succeededCount, failedCount, refundedCount] = await Promise.all([
      prisma.payment.aggregate({ where: { status: 'SUCCEEDED' }, _sum: { amount: true } }),
      prisma.payment.count({ where: { status: 'SUCCEEDED' } }),
      prisma.payment.count({ where: { status: 'FAILED'    } }),
      prisma.payment.count({ where: { status: 'REFUNDED'  } }),
    ]);

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // ── FIXED: fetch monthly payments + this/last month + revenueByPlan in parallel ──
    const [monthlyPayments, thisMonth, lastMonth, revenueByPlan, allPackages] = await Promise.all([
      prisma.payment.findMany({
        where:   { status: 'SUCCEEDED', createdAt: { gte: twelveMonthsAgo } },
        select:  { amount: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.payment.aggregate({
        where: { status: 'SUCCEEDED', createdAt: { gte: thisMonthStart } },
        _sum:  { amount: true },
      }),
      prisma.payment.aggregate({
        where: { status: 'SUCCEEDED', createdAt: { gte: lastMonthStart, lte: lastMonthEnd } },
        _sum:  { amount: true },
      }),
      prisma.payment.groupBy({
        by:    ['packageId'],
        where: { status: 'SUCCEEDED' },
        _sum:  { amount: true },
        _count: { id: true },
      }),

      prisma.subscriptionPackage.findMany({
        select: { id: true, name: true, displayName: true },
      }),
    ]);

    // Build month buckets
    const monthMap: Record<string, number> = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap[key] = 0;
    }
    monthlyPayments.forEach(p => {
      const d   = new Date(p.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthMap[key] !== undefined) monthMap[key] += p.amount;
    });

    const mrrChart = Object.entries(monthMap).map(([month, revenue]) => ({
      month,
      label:   new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      revenue: Math.round(revenue * 100) / 100,
    }));

    const thisMonthRevenue = thisMonth._sum.amount || 0;
    const lastMonthRevenue = lastMonth._sum.amount || 0;
    const growth = lastMonthRevenue > 0
      ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : thisMonthRevenue > 0 ? 100 : 0;

    // ── FIXED N+1: use the pre-fetched allPackages map instead of querying per plan ──
    const packageMap = Object.fromEntries(allPackages.map(p => [p.id, p]));
    const planDetails = revenueByPlan.map(r => {
      const pkg = packageMap[r.packageId];
      return {
        packageId:   r.packageId,
        name:        pkg?.name        || 'UNKNOWN',
        displayName: pkg?.displayName || 'Unknown',
        revenue:     Math.round((r._sum.amount || 0) * 100) / 100,
        count:       r._count.id,
      };
    });

    successResponse(res, {
      totalRevenue:     Math.round((totalRevenue._sum.amount || 0) * 100) / 100,
      succeededCount,
      failedCount,
      refundedCount,
      thisMonthRevenue: Math.round(thisMonthRevenue * 100) / 100,
      lastMonthRevenue: Math.round(lastMonthRevenue * 100) / 100,
      growthPercent:    Math.round(growth * 10) / 10,
      mrrChart,
      revenueByPlan:    planDetails,
    }, 'Revenue overview retrieved');
  } catch (error) {
    next(error);
  }
};

export const getPaymentHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = '1', limit = '20', status, search } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (status && status !== 'ALL') where.status = status;
    if (search) {
      where.user = {
        OR: [
          { email:     { contains: search as string, mode: 'insensitive' } },
          { firstName: { contains: search as string, mode: 'insensitive' } },
          { lastName:  { contains: search as string, mode: 'insensitive' } },
        ],
      };
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          user:    { select: { id: true, email: true, firstName: true, lastName: true } },
          package: { select: { name: true, displayName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take:    parseInt(limit as string),
      }),
      prisma.payment.count({ where }),
    ]);

    res.json({
      success: true,
      data:    payments,
      pagination: {
        total,
        page:       parseInt(page as string),
        limit:      parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getFailedPayments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where:   { status: 'FAILED' },
        include: {
          user:    { select: { id: true, email: true, firstName: true, lastName: true } },
          package: { select: { name: true, displayName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take:    parseInt(limit as string),
      }),
      prisma.payment.count({ where: { status: 'FAILED' } }),
    ]);

    res.json({
      success: true,
      data:    payments,
      pagination: {
        total,
        page:       parseInt(page as string),
        limit:      parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getUserPaymentHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.params.userId as string;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);

    const payments = await prisma.payment.findMany({
      where:   { userId },
      include: { package: { select: { name: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const totalSpent = payments
      .filter(p => p.status === 'SUCCEEDED')
      .reduce((sum, p) => sum + p.amount, 0);

    successResponse(res, {
      payments,
      totalSpent:    Math.round(totalSpent * 100) / 100,
      totalPayments: payments.length,
    }, 'User payment history retrieved');
  } catch (error) {
    next(error);
  }
};

export const getSystemAnalytics = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const twelveWeeksAgo = new Date(now);
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 83);
    twelveWeeksAgo.setHours(0, 0, 0, 0);

    const today    = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo  = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today); monthAgo.setDate(monthAgo.getDate() - 30);

    // ── FIXED: run ALL top-level queries in one big Promise.all ──────────────
    const [
      storageAgg, storageByType, storagePerUser,
      tierStats, allPackages,
      newUsersRaw, newUsersWeekly,
      regToday, regThisWeek, regThisMonth,
      uploadsRaw, uploadsByType,
      totalUsers, totalFiles, totalFolders, suspendedUsers, unverifiedUsers,
    ] = await Promise.all([
      prisma.file.aggregate({ _sum: { size: true } }),
      prisma.file.groupBy({ by: ['fileType'], _sum: { size: true }, _count: { id: true } }),
      prisma.file.groupBy({
        by:      ['userId'],
        _sum:    { size: true },
        _count:  { id: true },
        orderBy: { _sum: { size: 'desc' } },
        take:    8,
      }),
      prisma.userSubscription.groupBy({
        by:      ['packageId'],
        where:   { isActive: true },
        _count:  { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      // ── FIXED N+1: fetch ALL packages once instead of one query per tier ──
      prisma.subscriptionPackage.findMany({ select: { id: true, name: true, displayName: true } }),
      prisma.user.findMany({
        where:   { role: 'USER', createdAt: { gte: thirtyDaysAgo } },
        select:  { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.user.findMany({
        where:  { role: 'USER', createdAt: { gte: twelveWeeksAgo } },
        select: { createdAt: true },
      }),
      prisma.user.count({ where: { role: 'USER', createdAt: { gte: today    } } }),
      prisma.user.count({ where: { role: 'USER', createdAt: { gte: weekAgo  } } }),
      prisma.user.count({ where: { role: 'USER', createdAt: { gte: monthAgo } } }),
      prisma.file.findMany({
        where:   { createdAt: { gte: thirtyDaysAgo } },
        select:  { createdAt: true, size: true, fileType: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.file.groupBy({
        by:    ['fileType'],
        where: { createdAt: { gte: thirtyDaysAgo } },
        _count: { id: true },
        _sum:   { size: true },
      }),
      prisma.user.count({ where: { role: 'USER' } }),
      prisma.file.count(),
      prisma.folder.count(),
      prisma.user.count({ where: { role: 'USER', isSuspended:      true  } }),
      prisma.user.count({ where: { role: 'USER', isEmailVerified:  false } }),
    ]);

    const totalStorageBytes = storageAgg._sum.size || 0;

    // ── FIXED N+1: use pre-fetched users map for topStorageUsers ─────────────
    const topUserIds   = storagePerUser.map(s => s.userId);
    const topUsersList = await prisma.user.findMany({
      where:  { id: { in: topUserIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const userMap      = Object.fromEntries(topUsersList.map(u => [u.id, u]));
    const topStorageUsers = storagePerUser.map(s => {
      const user = userMap[s.userId];
      return {
        userId:    s.userId,
        name:      user ? `${user.firstName} ${user.lastName}` : 'Unknown',
        email:     user?.email || '',
        bytes:     s._sum.size || 0,
        fileCount: s._count.id,
      };
    });

    // ── FIXED N+1: use pre-fetched packageMap for tierStats ──────────────────
    const packageMap   = Object.fromEntries(allPackages.map(p => [p.id, p]));
    const tierDetails  = tierStats.map(t => {
      const pkg = packageMap[t.packageId];
      return {
        packageId:   t.packageId,
        name:        pkg?.name        || 'UNKNOWN',
        displayName: pkg?.displayName || 'Unknown',
        count:       t._count.id,
      };
    });
    const totalSubbed  = tierDetails.reduce((s, t) => s + t.count, 0);
    const tierWithPcts = tierDetails.map(t => ({
      ...t, pct: totalSubbed > 0 ? Math.round((t.count / totalSubbed) * 100) : 0,
    }));

    // Daily registration buckets
    const dailyRegMap: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      dailyRegMap[d.toISOString().slice(0, 10)] = 0;
    }
    newUsersRaw.forEach(u => {
      const key = new Date(u.createdAt).toISOString().slice(0, 10);
      if (dailyRegMap[key] !== undefined) dailyRegMap[key]++;
    });
    const dailyRegistrations = Object.entries(dailyRegMap).map(([date, count]) => ({
      date, count,
      label: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }));

    // Weekly registration buckets
    const weeklyRegMap: Record<string, number> = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i * 7 - d.getDay());
      weeklyRegMap[d.toISOString().slice(0, 10)] = 0;
    }
    newUsersWeekly.forEach(u => {
      const d = new Date(u.createdAt); d.setDate(d.getDate() - d.getDay());
      const key = d.toISOString().slice(0, 10);
      if (weeklyRegMap[key] !== undefined) weeklyRegMap[key]++;
    });
    const weeklyRegistrations = Object.entries(weeklyRegMap).map(([date, count]) => ({
      date, count,
      label: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }));

    // Daily upload buckets
    const dailyUploadMap: Record<string, { count: number; bytes: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      dailyUploadMap[d.toISOString().slice(0, 10)] = { count: 0, bytes: 0 };
    }
    uploadsRaw.forEach(f => {
      const key = new Date(f.createdAt).toISOString().slice(0, 10);
      if (dailyUploadMap[key]) { dailyUploadMap[key].count++; dailyUploadMap[key].bytes += f.size; }
    });
    const dailyUploads = Object.entries(dailyUploadMap).map(([date, data]) => ({
      date, count: data.count, bytes: data.bytes,
      label: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }));

    const peakDay = dailyUploads.reduce(
      (max, d) => d.count > max.count ? d : max,
      { date: '', label: '', count: 0, bytes: 0 }
    );

    successResponse(res, {
      totalStorageBytes,
      storageByType: storageByType.map(s => ({
        fileType: s.fileType, bytes: s._sum.size || 0, count: s._count.id,
        pct: totalStorageBytes > 0 ? Math.round(((s._sum.size || 0) / totalStorageBytes) * 100) : 0,
      })),
      topStorageUsers,
      tierStats:        tierWithPcts,
      mostPopularTier:  tierWithPcts[0] || null,
      dailyRegistrations, weeklyRegistrations,
      regToday, regThisWeek, regThisMonth,
      dailyUploads,
      uploadsByType: uploadsByType.map(u => ({
        fileType: u.fileType, count: u._count.id, bytes: u._sum.size || 0,
      })),
      peakUploadDay:     peakDay.count > 0 ? peakDay : null,
      totalUsers, totalFiles, totalFolders, suspendedUsers, unverifiedUsers,
      avgFilesPerUser:   totalUsers > 0 ? Math.round((totalFiles   / totalUsers) * 10) / 10 : 0,
      avgStoragePerUser: totalUsers > 0 ? Math.round(totalStorageBytes / totalUsers)         : 0,
    }, 'System analytics retrieved');
  } catch (error) {
    next(error);
  }
};