import { ActivityAction } from '@prisma/client';
import { Request } from 'express';
import prisma from './prisma';

interface LogOptions {
  userId:     string;
  action:     ActivityAction;
  entityType?: string;
  entityId?:   string;
  entityName?: string;
  metadata?:   Record<string, any>;
  req?:        Request;
}

export const logActivity = (opts: LogOptions): void => {
  // Fire-and-forget — never awaited so it never blocks a response
  prisma.activityLog.create({
    data: {
      userId:     opts.userId,
      action:     opts.action,
      entityType: opts.entityType ?? null,
      entityId:   opts.entityId   ?? null,
      entityName: opts.entityName ?? null,
      metadata:   opts.metadata   ?? null,
      ipAddress:  opts.req
        ? (opts.req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
          || opts.req.socket?.remoteAddress
          || null
        : null,
      userAgent: opts.req?.headers['user-agent'] ?? null,
    },
  }).catch(err => console.error('[ActivityLog] Failed to write log:', err));
};