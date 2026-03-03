import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ── Shared layout wrapper ─────────────────────────────────────────────────────
const layout = (content: string) => `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0f0f17; color: #e2e8f0; padding: 32px; border-radius: 16px;">
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="background: #6366f1; width: 48px; height: 48px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto;">🗄️</div>
      <h1 style="color: #ffffff; margin: 12px 0 0;">FileVault</h1>
    </div>
    ${content}
    <hr style="border: none; border-top: 1px solid #1e1e2e; margin: 24px 0;" />
    <p style="color: #64748b; font-size: 11px; text-align: center; margin: 0;">
      FileVault · You're receiving this because you have an active account
    </p>
  </div>
`;

// ── Verify Email ──────────────────────────────────────────────────────────────
export const sendVerificationEmail = async (
  email: string,
  token: string,
  firstName: string
) => {
  const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${token}`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'FileVault — Verify Your Email',
    html: layout(`
      <h2 style="color: #ffffff;">Hi ${firstName}, verify your email</h2>
      <p style="color: #94a3b8; margin-bottom: 24px;">Thanks for signing up! Click the button below to verify your email address.</p>
      <a href="${verifyUrl}" style="display: block; background: #6366f1; color: #ffffff; text-decoration: none; text-align: center; padding: 14px 24px; border-radius: 10px; font-weight: 600; font-size: 16px; margin-bottom: 16px;">
        Verify Email
      </a>
      <p style="color: #64748b; font-size: 12px; text-align: center;">If you didn't create a FileVault account, ignore this email.</p>
    `),
  });
};

// ── Password Reset ────────────────────────────────────────────────────────────
export const sendPasswordResetEmail = async (
  email: string,
  token: string,
  firstName: string
) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'FileVault — Reset Your Password',
    html: layout(`
      <h2 style="color: #ffffff;">Hi ${firstName}, reset your password</h2>
      <p style="color: #94a3b8; margin-bottom: 24px;">We received a request to reset your password. This link expires in <strong style="color: #e2e8f0;">1 hour</strong>.</p>
      <a href="${resetUrl}" style="display: block; background: #6366f1; color: #ffffff; text-decoration: none; text-align: center; padding: 14px 24px; border-radius: 10px; font-weight: 600; font-size: 16px; margin-bottom: 16px;">
        Reset Password
      </a>
      <p style="color: #6366f1; font-size: 13px; word-break: break-all; margin-bottom: 16px;">${resetUrl}</p>
      <p style="color: #64748b; font-size: 12px; text-align: center;">If you didn't request a password reset, ignore this email.</p>
    `),
  });
};

// ── Storage Warning (80% full) ────────────────────────────────────────────────
export const sendStorageWarningEmail = async (
  email: string,
  firstName: string,
  usedBytes: number,
  totalBytes: number,
  planName: string
) => {
  const usedMB      = (usedBytes  / (1024 * 1024)).toFixed(1);
  const totalMB     = (totalBytes / (1024 * 1024)).toFixed(1);
  const percentage  = Math.round((usedBytes / totalBytes) * 100);
  const upgradeUrl  = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/subscription`;

  // Progress bar fill width capped at 100%
  const barWidth = Math.min(percentage, 100);
  const barColor = percentage >= 95 ? '#ef4444' : '#f59e0b';

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: `FileVault — Your storage is ${percentage}% full`,
    html: layout(`
      <h2 style="color: #ffffff; margin-bottom: 4px;">Storage almost full ⚠️</h2>
      <p style="color: #94a3b8; margin-bottom: 24px;">Hi ${firstName}, you've used <strong style="color: #f59e0b;">${percentage}%</strong> of your ${planName} plan storage.</p>

      <!-- Progress bar -->
      <div style="background: #1e1e2e; border-radius: 99px; height: 12px; overflow: hidden; margin-bottom: 8px;">
        <div style="background: ${barColor}; width: ${barWidth}%; height: 100%; border-radius: 99px; transition: width 0.3s;"></div>
      </div>
      <p style="color: #64748b; font-size: 13px; margin-bottom: 24px;">${usedMB} MB used of ${totalMB} MB</p>

      <!-- Warning box -->
      <div style="background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.25); border-radius: 10px; padding: 14px 16px; margin-bottom: 24px;">
        <p style="color: #fbbf24; font-size: 13px; margin: 0;">
          When storage is full, you won't be able to upload new files. Upgrade your plan to get more space.
        </p>
      </div>

      <a href="${upgradeUrl}" style="display: block; background: #6366f1; color: #ffffff; text-decoration: none; text-align: center; padding: 14px 24px; border-radius: 10px; font-weight: 600; font-size: 16px; margin-bottom: 16px;">
        Upgrade Storage Plan
      </a>
      <p style="color: #64748b; font-size: 12px; text-align: center;">You can manage your storage from your FileVault dashboard.</p>
    `),
  });
};

// ── Weekly Storage Summary ────────────────────────────────────────────────────
export const sendWeeklyStorageSummaryEmail = async (
  email: string,
  firstName: string,
  stats: {
    usedBytes:   number;
    totalBytes:  number;
    planName:    string;
    totalFiles:  number;
    totalFolders: number;
    filesByType: { type: string; count: number; totalBytes: number }[];
  }
) => {
  const usedMB     = (stats.usedBytes  / (1024 * 1024)).toFixed(1);
  const totalMB    = (stats.totalBytes / (1024 * 1024)).toFixed(1);
  const percentage = stats.totalBytes > 0
    ? Math.round((stats.usedBytes / stats.totalBytes) * 100)
    : 0;
  const barColor   = percentage >= 80 ? '#ef4444' : percentage >= 60 ? '#f59e0b' : '#10b981';
  const dashUrl    = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard`;

  const typeIcons: Record<string, string> = {
    IMAGE: '🖼️', VIDEO: '🎬', AUDIO: '🎵', PDF: '📄',
  };

  const typeRows = stats.filesByType.map(t => `
    <tr>
      <td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">${typeIcons[t.type] ?? '📁'} ${t.type}</td>
      <td style="padding: 8px 0; color: #e2e8f0; font-size: 13px; text-align: right;">${t.count} files</td>
      <td style="padding: 8px 0; color: #64748b; font-size: 13px; text-align: right;">${(t.totalBytes / (1024 * 1024)).toFixed(1)} MB</td>
    </tr>
  `).join('');

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'FileVault — Your weekly storage summary',
    html: layout(`
      <h2 style="color: #ffffff; margin-bottom: 4px;">Weekly Storage Summary 📊</h2>
      <p style="color: #94a3b8; margin-bottom: 24px;">Hi ${firstName}, here's how your FileVault storage looks this week.</p>

      <!-- Stats row -->
      <div style="display: flex; gap: 12px; margin-bottom: 20px;">
        <div style="flex: 1; background: #1e1e2e; border-radius: 10px; padding: 14px; text-align: center;">
          <p style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 4px;">Files</p>
          <p style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0;">${stats.totalFiles}</p>
        </div>
        <div style="flex: 1; background: #1e1e2e; border-radius: 10px; padding: 14px; text-align: center;">
          <p style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 4px;">Folders</p>
          <p style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0;">${stats.totalFolders}</p>
        </div>
        <div style="flex: 1; background: #1e1e2e; border-radius: 10px; padding: 14px; text-align: center;">
          <p style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 4px;">Used</p>
          <p style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0;">${percentage}%</p>
        </div>
      </div>

      <!-- Progress bar -->
      <div style="background: #1e1e2e; border-radius: 99px; height: 10px; overflow: hidden; margin-bottom: 6px;">
        <div style="background: ${barColor}; width: ${Math.min(percentage, 100)}%; height: 100%; border-radius: 99px;"></div>
      </div>
      <p style="color: #64748b; font-size: 12px; margin-bottom: 20px;">${usedMB} MB of ${totalMB} MB used · ${stats.planName} plan</p>

      <!-- File type breakdown -->
      ${typeRows ? `
        <div style="background: #1e1e2e; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
          <p style="color: #ffffff; font-weight: 600; font-size: 13px; margin: 0 0 8px;">Storage by file type</p>
          <table style="width: 100%; border-collapse: collapse;">
            ${typeRows}
          </table>
        </div>
      ` : ''}

      <a href="${dashUrl}" style="display: block; background: #6366f1; color: #ffffff; text-decoration: none; text-align: center; padding: 14px 24px; border-radius: 10px; font-weight: 600; font-size: 16px; margin-bottom: 16px;">
        Go to Dashboard
      </a>
    `),
  });
};

// ── Payment Receipt ───────────────────────────────────────────────────────────
export const sendPaymentReceiptEmail = async (
  email: string,
  firstName: string,
  receipt: {
    planName:    string;
    amount:      number;
    currency:    string;
    paymentId:   string;
    date:        Date;
  }
) => {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: receipt.currency.toUpperCase(),
  }).format(receipt.amount);

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long', timeStyle: 'short',
  }).format(receipt.date);

  const dashUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: `FileVault — Payment receipt for ${receipt.planName}`,
    html: layout(`
      <h2 style="color: #ffffff; margin-bottom: 4px;">Payment confirmed ✅</h2>
      <p style="color: #94a3b8; margin-bottom: 24px;">Hi ${firstName}, thanks for your payment. Your ${receipt.planName} plan is now active.</p>

      <!-- Receipt card -->
      <div style="background: #1e1e2e; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 16px;">Receipt</p>

        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="color: #94a3b8; font-size: 13px;">Plan</span>
          <span style="color: #e2e8f0; font-size: 13px; font-weight: 600;">${receipt.planName}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="color: #94a3b8; font-size: 13px;">Date</span>
          <span style="color: #e2e8f0; font-size: 13px;">${formattedDate}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="color: #94a3b8; font-size: 13px;">Payment ID</span>
          <span style="color: #64748b; font-size: 11px; font-family: monospace;">${receipt.paymentId}</span>
        </div>

        <hr style="border: none; border-top: 1px solid #2e2e3e; margin: 14px 0;" />

        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #ffffff; font-size: 15px; font-weight: 600;">Total paid</span>
          <span style="color: #10b981; font-size: 20px; font-weight: 700;">${formattedAmount}</span>
        </div>
      </div>

      <!-- Success badge -->
      <div style="background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); border-radius: 10px; padding: 12px 16px; margin-bottom: 24px; text-align: center;">
        <p style="color: #34d399; font-size: 13px; margin: 0;">🎉 Your storage has been upgraded. Enjoy your new plan!</p>
      </div>

      <a href="${dashUrl}" style="display: block; background: #6366f1; color: #ffffff; text-decoration: none; text-align: center; padding: 14px 24px; border-radius: 10px; font-weight: 600; font-size: 16px; margin-bottom: 16px;">
        Go to Dashboard
      </a>
      <p style="color: #64748b; font-size: 12px; text-align: center;">Keep this email as your payment receipt.</p>
    `),
  });
};