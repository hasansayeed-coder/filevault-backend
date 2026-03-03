import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError, successResponse } from '../utils/response';
import { ActivityAction } from '@prisma/client';
import prisma from '../utils/prisma';

const PAGE_SIZE = 50;

// ── Reusable select for log list — excludes heavy metadata for pagination ─────
const logListSelect = {
  id:         true,
  action:     true,
  entityType: true,
  entityId:   true,
  entityName: true,
  ipAddress:  true,
  createdAt:  true,
};

// ── Reusable select for CSV export — includes userAgent ───────────────────────
const logCsvSelect = {
  action:     true,
  entityType: true,
  entityName: true,
  ipAddress:  true,
  userAgent:  true,
  createdAt:  true,
};

// ── helpers ───────────────────────────────────────────────────────────────────
function buildWhere(userId: string, query: any) {
  const where: any = { userId };
  if (query.action)     where.action     = query.action;
  if (query.entityType) where.entityType = query.entityType;
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from as string);
    if (query.to)   where.createdAt.lte = new Date(query.to   as string);
  }
  if (query.search) {
    where.entityName = { contains: query.search as string, mode: 'insensitive' };
  }
  return where;
}

function toCSV(rows: any[]): string {
  const headers = ['Date', 'Action', 'Entity Type', 'Entity Name', 'IP Address', 'User Agent'];
  const escape  = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines   = [
    headers.join(','),
    ...rows.map(r => [
      new Date(r.createdAt).toISOString(),
      r.action,
      r.entityType ?? '',
      r.entityName ?? '',
      r.ipAddress  ?? '',
      r.userAgent  ?? '',
    ].map(escape).join(',')),
  ];
  return lines.join('\n');
}

// ── GET own activity log ──────────────────────────────────────────────────────
export const getMyActivity = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const page   = Math.max(1, parseInt(req.query.page as string) || 1);
    const where  = buildWhere(userId, req.query);

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        // ── FIXED: select only list-view fields — skip metadata + userAgent ──
        select:  logListSelect,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * PAGE_SIZE,
        take:    PAGE_SIZE,
      }),
      prisma.activityLog.count({ where }),
    ]);

    successResponse(res, {
      logs,
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) },
    }, 'Activity log retrieved');
  } catch (error) {
    next(error);
  }
};

// ── EXPORT own activity log as CSV ────────────────────────────────────────────
export const exportMyActivityCSV = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const where  = buildWhere(userId, req.query);

    const logs = await prisma.activityLog.findMany({
      where,
      // ── FIXED: select only the 6 fields toCSV actually uses ──
      select:  logCsvSelect,
      orderBy: { createdAt: 'desc' },
      take:    10000,
    });

    const csv      = toCSV(logs);
    const filename = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

// ── ADMIN: get any user's activity log ────────────────────────────────────────
export const getAdminUserActivity = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const targetUserId = req.params.userId as string;
    const page         = Math.max(1, parseInt(req.query.page as string) || 1);
    const where        = buildWhere(targetUserId, req.query);

    // ── FIXED: run user check + log query in parallel ──
    const [user, [logs, total]] = await Promise.all([
      prisma.user.findUnique({
        where:  { id: targetUserId },
        select: { id: true, email: true, firstName: true, lastName: true, role: true },
      }),
      Promise.all([
        prisma.activityLog.findMany({
          where,
          select:  logListSelect,
          orderBy: { createdAt: 'desc' },
          skip:    (page - 1) * PAGE_SIZE,
          take:    PAGE_SIZE,
        }),
        prisma.activityLog.count({ where }),
      ]),
    ]);

    if (!user) throw new AppError('User not found', 404);

    successResponse(res, {
      user,
      logs,
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) },
    }, 'User activity log retrieved');
  } catch (error) {
    next(error);
  }
};

// ── ADMIN: export any user's log as CSV ───────────────────────────────────────
export const exportAdminUserActivityCSV = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const targetUserId = req.params.userId as string;
    const where        = buildWhere(targetUserId, req.query);

    const [user, logs] = await Promise.all([
      prisma.user.findUnique({
        where:  { id: targetUserId },
        select: { email: true },
      }),
      prisma.activityLog.findMany({
        where,
        // ── FIXED: select only the 6 fields toCSV actually uses ──
        select:  logCsvSelect,
        orderBy: { createdAt: 'desc' },
        take:    10000,
      }),
    ]);
    if (!user) throw new AppError('User not found', 404);

    const csv      = toCSV(logs);
    const filename = `activity-${user.email}-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

// ── Purge logs older than N days (cron) ───────────────────────────────────────
export const purgeOldActivityLogs = async (days = 90): Promise<void> => {
  const cutoff     = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const { count }  = await prisma.activityLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  if (count > 0) console.log(`[ActivityPurge] Deleted ${count} logs older than ${days} days`);
};