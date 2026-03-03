import express from 'express'; 
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv'; 
import path from 'path'; 
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import compression from 'compression';


dotenv.config(); 

import { authRouter } from './routes/auth.routes';
import { userRouter } from './routes/user.routes';
import { adminRouter } from './routes/admin.routes';
import { packageRouter } from './routes/package.routes';
import { folderRouter } from './routes/folder.routes';
import { fileRouter } from './routes/file.routes';
import { errorHandler } from './middleware/errorHandler'; 
import { notFound } from './middleware/notFound';
import paymentRouter from './routes/payment.routes';
import shareRouter from './routes/share.routes';
import { accountRouter } from './routes/account.routes';
import { trashRouter } from './routes/trash.routes';
import { activityRouter } from './routes/activity.routes';
import { purgeOldActivityLogs } from './controllers/activity.controller';
import { purgeExpiredTrash } from './controllers/trash.controller';
import { sendWeeklyStorageSummaryEmail } from './utils/email';
import { getUserStorageStats } from './services/subscription.service';
import prisma from './utils/prisma';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

app.use(compression());


// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin:         process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));


// ── Rate Limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      100,
  message:  { success: false, message: 'Too many requests, please try again!' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      28,
  message:  { success: false, message: 'Too many auth attempts, please try again!' },
});

app.use('/api/auth', authLimiter);
app.use(limiter);

// ── Static files & raw body for Stripe webhook ────────────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',     authRouter);
app.use('/api/users',    userRouter);
app.use('/api/admin',    adminRouter);
app.use('/api/packages', packageRouter);
app.use('/api/folders',  folderRouter);
app.use('/api/files',    fileRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/shares',   shareRouter);
app.use('/api/account',  accountRouter);
app.use('/api/trash',    trashRouter);
app.use('/api/activity', activityRouter);

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'FileVault API is running', timeStamp: new Date() });
});

// ── Error handling ────────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────

// -- Auto-seed on startup ------------------------------------------------------
async function seedDatabase() {
  try {
    const bcrypt = require('bcryptjs');
    const { PackageName, FileType, Role } = require('@prisma/client');

    const packages = [
      { name: 'FREE', displayName: 'Free', description: 'Get started with basic storage', maxFolders: 5, maxNestingLevel: 2, allowedFileTypes: ['IMAGE', 'PDF'], maxFileSizeMB: 5, totalFileLimit: 20, filesPerFolder: 5 },
      { name: 'SILVER', displayName: 'Silver', description: 'Perfect for personal use', maxFolders: 20, maxNestingLevel: 3, allowedFileTypes: ['IMAGE', 'PDF', 'AUDIO'], maxFileSizeMB: 25, totalFileLimit: 100, filesPerFolder: 20 },
      { name: 'GOLD', displayName: 'Gold', description: 'Great for professionals', maxFolders: 50, maxNestingLevel: 5, allowedFileTypes: ['IMAGE', 'PDF', 'AUDIO', 'VIDEO'], maxFileSizeMB: 100, totalFileLimit: 500, filesPerFolder: 50 },
      { name: 'DIAMOND', displayName: 'Diamond', description: 'Unlimited power', maxFolders: 200, maxNestingLevel: 10, allowedFileTypes: ['IMAGE', 'PDF', 'AUDIO', 'VIDEO'], maxFileSizeMB: 500, totalFileLimit: 5000, filesPerFolder: 200 },
    ];

    for (const pkg of packages) {
      await prisma.subscriptionPackage.upsert({ where: { name: pkg.name as any }, update: pkg, create: pkg as any });
    }
    console.log('? Packages seeded');

    const adminPassword = await bcrypt.hash('Admin@123', 12);
    await prisma.user.upsert({
      where: { email: 'admin@filevault.com' },
      update: {},
      create: { email: 'admin@filevault.com', password: adminPassword, firstName: 'System', lastName: 'Admin', role: 'ADMIN' as any, isEmailVerified: true },
    });
    console.log('? Admin seeded');

    const userPassword = await bcrypt.hash('User@123', 12);
    await prisma.user.upsert({
      where: { email: 'user@filevault.com' },
      update: {},
      create: { email: 'user@filevault.com', password: userPassword, firstName: 'Demo', lastName: 'User', role: 'USER' as any, isEmailVerified: true },
    });
    console.log('? Demo user seeded');
  } catch (err) {
    console.error('Seed error:', err);
  }
}
seedDatabase().then(() => {}).catch(console.error);
const server = app.listen(PORT, () => {
  console.log(`FileVault API running on port ${PORT}`);
  console.log(`Upload directory: ${path.join(process.cwd(), 'uploads')}`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = async (signal: string) => {
  console.log(`[Server] ${signal} received — shutting down gracefully...`);
  
  // Stop all cron jobs first
  cron.getTasks().forEach(task => task.stop());
  console.log('[Server] Cron jobs stopped.');

  server.close(async () => {
    await prisma.$disconnect();
    console.log('[Server] All connections closed. Exiting.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ── Cron Jobs ─────────────────────────────────────────────────────────────────

// Daily at 2 AM — purge trash older than 30 days
cron.schedule('0 2 * * *', async () => {
  console.log('[Cron] Running trash purge...');
  try {
    await purgeExpiredTrash();
  } catch (err) {
    console.error('[Cron] Trash purge failed:', err);
  }
});

// Daily at 3 AM — purge activity logs older than 90 days
cron.schedule('0 3 * * *', async () => {
  try {
    await purgeOldActivityLogs(90);
  } catch (err) {
    console.error('[Cron] Activity purge failed:', err);
  }
});

// Every Monday at 8 AM — weekly storage summary emails
cron.schedule('0 8 * * 1', async () => {
  console.log('[Cron] Sending weekly storage summary emails...');
  try {
    const activeSubscriptions = await prisma.userSubscription.findMany({
      where:   { isActive: true },
      include: {
        user:    { select: { id: true, email: true, firstName: true } },
        package: true,
      },
    });

    let sent = 0;
    for (const sub of activeSubscriptions) {
      try {
        const stats      = await getUserStorageStats(sub.userId);
        const totalBytes = sub.package.maxFileSizeMB * sub.package.totalFileLimit * 1024 * 1024;

        await sendWeeklyStorageSummaryEmail(
          sub.user.email,
          sub.user.firstName,
          {
            usedBytes:    stats.totalStorageBytes,
            totalBytes,
            planName:     sub.package.displayName,
            totalFiles:   stats.totalFiles,
            totalFolders: stats.totalFolders,
            filesByType:  stats.filesByType,
          }
        );
        sent++;
      } catch (err) {
        console.error(`[WeeklySummary] Failed for user ${sub.userId}:`, err);
      }
    }
    console.log(`[Cron] Weekly summary sent to ${sent} users`);
  } catch (err) {
    console.error('[Cron] Weekly summary cron failed:', err);
  }
});

export default app;

