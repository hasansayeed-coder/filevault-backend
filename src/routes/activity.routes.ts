import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import {
  getMyActivity,
  exportMyActivityCSV,
  getAdminUserActivity,
  exportAdminUserActivityCSV,
} from '../controllers/activity.controller';

export const activityRouter = Router();

// ── User routes ───────────────────────────────────────────────────────────────
activityRouter.get('/',          authenticate, getMyActivity);
activityRouter.get('/export',    authenticate, exportMyActivityCSV);

// ── Admin routes ──────────────────────────────────────────────────────────────
activityRouter.get('/admin/:userId',        authenticate, requireAdmin, getAdminUserActivity);
activityRouter.get('/admin/:userId/export', authenticate, requireAdmin, exportAdminUserActivityCSV);