import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string,
  firstName: string
) => {
  const resetUrl = `http://localhost:3000/reset-password?token=${resetToken}`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'FileVault — Reset Your Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0f0f17; color: #e2e8f0; padding: 32px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="background: #6366f1; width: 48px; height: 48px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; font-size: 24px;">🗄️</div>
          <h1 style="color: #ffffff; margin: 16px 0 4px;">FileVault</h1>
        </div>

        <h2 style="color: #ffffff; margin-bottom: 8px;">Hi ${firstName}, reset your password</h2>
        <p style="color: #94a3b8; margin-bottom: 24px;">
          We received a request to reset your password. Click the button below.
          This link expires in <strong style="color: #e2e8f0;">1 hour</strong>.
        </p>

        <a href="${resetUrl}"
          style="display: block; background: #6366f1; color: #ffffff; text-decoration: none;
                 text-align: center; padding: 14px 24px; border-radius: 10px;
                 font-weight: 600; font-size: 16px; margin-bottom: 24px;">
          Reset Password
        </a>

        <p style="color: #64748b; font-size: 13px; margin-bottom: 8px;">Or copy this link:</p>
        <p style="color: #6366f1; font-size: 13px; word-break: break-all; margin-bottom: 24px;">
          ${resetUrl}
        </p>

        <hr style="border: none; border-top: 1px solid #1e1e2e; margin-bottom: 24px;" />
        <p style="color: #64748b; font-size: 12px; text-align: center;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });
};

export const sendVerificationEmail = async (
  email: string,
  verificationToken: string,
  firstName: string
) => {
  const verifyUrl = `http://localhost:3000/verify-email?token=${verificationToken}`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'FileVault — Verify Your Email',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0f0f17; color: #e2e8f0; padding: 32px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="background: #6366f1; width: 48px; height: 48px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; font-size: 24px;">🗄️</div>
          <h1 style="color: #ffffff; margin: 16px 0 4px;">FileVault</h1>
        </div>

        <h2 style="color: #ffffff; margin-bottom: 8px;">Hi ${firstName}, verify your email</h2>
        <p style="color: #94a3b8; margin-bottom: 24px;">
          Thanks for signing up! Please verify your email address to get started.
        </p>

        <a href="${verifyUrl}"
          style="display: block; background: #6366f1; color: #ffffff; text-decoration: none;
                 text-align: center; padding: 14px 24px; border-radius: 10px;
                 font-weight: 600; font-size: 16px; margin-bottom: 24px;">
          Verify Email
        </a>

        <hr style="border: none; border-top: 1px solid #1e1e2e; margin-bottom: 24px;" />
        <p style="color: #64748b; font-size: 12px; text-align: center;">
          If you didn't create a FileVault account, ignore this email.
        </p>
      </div>
    `,
  });
};