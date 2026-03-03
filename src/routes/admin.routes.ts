import { Router } from "express";
import { authenticate, requireAdmin } from '../middleware/auth';
import {
  getDashboardStats,
  getAllUsers,
  getUserDetails,
  changeUserPlan,
  toggleSuspendUser,
  adminResetPassword,
  getUserStorageDetails,
  getRevenueOverview,
  getPaymentHistory,
  getFailedPayments,
  getUserPaymentHistory,
  getSystemAnalytics,           
} from "../controllers/admin.controller";

export const adminRouter = Router();

adminRouter.use(authenticate, requireAdmin);

// ── Dashboard ──
adminRouter.get('/dashboard', getDashboardStats);

// ── System Analytics ──
adminRouter.get('/analytics',getSystemAnalytics);   // ← NEW

// ── Revenue ──
adminRouter.get('/revenue/overview', getRevenueOverview);
adminRouter.get('/revenue/payments',getPaymentHistory);
adminRouter.get('/revenue/failed', getFailedPayments);

// ── Users ──
adminRouter.get('/users', getAllUsers);
adminRouter.get('/users/:userId/storage',getUserStorageDetails);
adminRouter.get('/users/:userId/payments',getUserPaymentHistory);
adminRouter.get('/users/:id', getUserDetails);

adminRouter.patch('/users/:userId/plan', changeUserPlan);
adminRouter.patch('/users/:userId/suspend', toggleSuspendUser);
adminRouter.post('/users/:userId/reset-password', adminResetPassword);