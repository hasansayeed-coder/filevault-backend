# 🗄️ FileVault — Subscription-Based File Management System

A full-featured, production-ready SaaS File & Folder Management System where subscription tiers strictly control storage capabilities. Built with a modern PERN stack.

---

## 🌐 Live Demo

| Service | URL |
|--------|-----|
| 🖥️ Frontend | [filevault-frontend-two.vercel.app](https://filevault-frontend-two.vercel.app) |
| ⚙️ Backend API | [filevault-backend-production-16af.up.railway.app](https://filevault-backend-production-16af.up.railway.app) |

---

## 🎥 Project Walkthrough Video

[![FileVault Walkthrough](https://img.shields.io/badge/YouTube-Watch%20Demo-red?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/d9GI0Pb_sxQ?si=cxu1vefdyFxc6Jem)

---


## 📋 Table of Contents

- [Overview](#-overview)
- [Tech Stack](#-tech-stack)
- [Features](#-features)
- [Subscription Tiers](#-subscription-tiers)
- [Database ER Diagram](#-database-er-diagram)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [API Documentation](#-api-documentation)
- [Author](#-author)

---

## 🧭 Overview

FileVault simulates a real-world SaaS storage product where different subscription tiers unlock different capabilities. All business rules are defined dynamically by the admin — not hardcoded — and enforced on every request.

---

## 🛠️ Tech Stack

### Backend
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)

### Frontend
![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)

### Deployment
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Railway](https://img.shields.io/badge/Railway-131415?style=for-the-badge&logo=railway&logoColor=white)

---

## ✨ Features

### 👑 Admin Panel
- Secure admin login with default seeded credentials
- Full **CRUD** for subscription packages (Free, Silver, Gold, Diamond)
- Configure per-package limits:
  - Max total folders
  - Max folder nesting depth
  - Allowed file types (Image, Video, PDF, Audio)
  - Max file size per upload (MB)
  - Total file limit across account
  - Max files per folder
- View all users with storage details
- Upgrade / downgrade any user's plan
- Suspend / unsuspend user accounts
- View any user's activity log with CSV export
- Revenue dashboard with Stripe payment history

### 👤 User Panel
- User registration & login with **JWT authentication**
- **Email verification** on registration
- **Password reset** via email
- **Two-Factor Authentication (2FA)** with Google Authenticator + backup codes
- Active session management — view and revoke sessions remotely
- View & select subscription packages
- Subscription history with active date ranges
- Full **file & folder management** with package enforcement:
  - Create, rename, delete folders with unlimited nesting (up to plan limit)
  - Upload files (Image, Video, Audio, PDF) via drag & drop
  - View, preview, download, rename files
  - **Drag & drop** file moving between folders
  - **Bulk operations** — select multiple files to delete, move, or download as ZIP
  - **File versioning** — keep, restore, and delete previous versions
  - **Starred files & folders** — dedicated Starred section in sidebar
  - **File sharing** — public share links with expiry, password protection, and access tracking
  - **Recycle Bin** — soft delete with 30-day auto-purge
  - **Activity Log** — full history of all actions with CSV export
  - **Storage Analytics** — breakdown by file type, usage bar, upload trends

### 🔒 Enforcement Logic
- Every action checks the user's active package before proceeding
- Folder creation checks: Max Folders, Max Nesting Level
- File upload checks: Allowed File Types, Max File Size, Total File Limit, Files Per Folder
- All limit checks run in parallel using Promise.all for performance
- Package switches apply going forward — existing data is never deleted
- Trashed files are excluded from all storage and file counts

---

## 💎 Subscription Tiers

| Feature | 🆓 Free | 🥈 Silver | 🥇 Gold | 💎 Diamond |
|---------|--------|----------|--------|-----------|
| Max Folders | 5 | 20 | 50 | Unlimited |
| Max Nesting Level | 1 | 2 | 4 | 10 |
| Allowed File Types | Image | Image, PDF | Image, PDF, Audio | All |
| Max File Size | 5 MB | 25 MB | 100 MB | 1 GB |
| Total File Limit | 10 | 100 | 500 | Unlimited |
| Files Per Folder | 5 | 20 | 100 | Unlimited |

> ⚠️ Tier values above are defaults. Admin can customize all limits dynamically.

---

## 🗃️ Database ER Diagram

### Key Models (12 total)
- **User** — Auth, profile, Stripe customer ID, 2FA fields
- **SubscriptionPackage** — Admin-defined tiers with all limits
- **UserSubscription** — History of package assignments with date ranges
- **Folder** — Nested folder tree with nesting level tracking
- **File** — File metadata, type, size, path, folder reference
- **FileVersion** — Version history per file with restore support
- **FileShare** — Public share links with expiry, password, access count
- **ActivityLog** — Full audit trail of all user actions
- **Payment** — Stripe payment records with status tracking
- **UserSession** — Active session tracking with device info
- **PasswordResetToken** — Time-limited reset tokens
- **BackupCode** — Single-use 2FA backup codes

---

## 📁 Project Structure

```
File-Management-System/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   ├── file.controller.ts
│   │   │   ├── folder.controller.ts
│   │   │   ├── share.controller.ts
│   │   │   ├── trash.controller.ts
│   │   │   ├── account.controller.ts
│   │   │   ├── activity.controller.ts
│   │   │   ├── payment.controller.ts
│   │   │   ├── package.controller.ts
│   │   │   └── stripe.controller.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   └── rateLimiter.ts
│   │   ├── routes/
│   │   ├── services/
│   │   │   ├── subscription.service.ts
│   │   │   └── stripe.service.ts
│   │   ├── utils/
│   │   │   ├── prisma.ts
│   │   │   ├── email.ts
│   │   │   ├── activity.ts
│   │   │   └── response.ts
│   │   └── index.ts
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── admin/
    │   │   ├── dashboard/
    │   │   │   ├── files/
    │   │   │   ├── starred/
    │   │   │   ├── trash/
    │   │   │   ├── analytics/
    │   │   │   └── search/
    │   │   ├── login/
    │   │   ├── register/
    │   │   └── subscription/
    │   ├── components/
    │   │   ├── files/
    │   │   │   ├── FilePreviewModal.tsx
    │   │   │   ├── ShareModal.tsx
    │   │   │   └── VersionHistoryPanel.tsx
    │   │   └── layout/
    │   │       ├── AppLayout.tsx
    │   │       └── AuthGuard.tsx
    │   └── lib/
    │       └── api.ts
    └── package.json
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- PostgreSQL
- npm or yarn

### 1. Clone the repositories

```bash
# Backend
git clone https://github.com/hasansayeed-coder/filevault-backend.git
cd filevault-backend
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev

# Frontend
git clone https://github.com/hasansayeed-coder/filevault-frontend.git
cd filevault-frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`
Backend runs on `http://localhost:5000`

---

## 🔧 Environment Variables

### Backend `.env`
```env
DATABASE_URL="postgresql://user:password@localhost:5432/filevault"
JWT_SECRET="your-jwt-secret"
JWT_REFRESH_SECRET="your-refresh-secret"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
PORT=5000
NODE_ENV="development"
FRONTEND_URL="http://localhost:3000"

# Email
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your@email.com"
SMTP_PASS="your-app-password"
EMAIL_FROM="FileVault <your@email.com>"

# File uploads
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE_MB=500

# Stripe
STRIPE_SECRET_KEY="sk_test_xxx"
STRIPE_WEBHOOK_SECRET="whsec_xxx"
STRIPE_FREE_PRICE_ID="price_xxx"
STRIPE_SILVER_PRICE_ID="price_xxx"
STRIPE_GOLD_PRICE_ID="price_xxx"
STRIPE_DIAMOND_PRICE_ID="price_xxx"
```

### Frontend `.env.local`
```env
NEXT_PUBLIC_API_URL="http://localhost:5000/api"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_xxx"
```

---

## 📡 API Documentation

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password |
| GET | `/api/auth/verify-email/:token` | Verify email |
| POST | `/api/auth/setup-2fa` | Set up 2FA |
| POST | `/api/auth/confirm-2fa` | Confirm 2FA setup |
| POST | `/api/auth/disable-2fa` | Disable 2FA |
| POST | `/api/auth/verify-2fa` | Verify 2FA on login |

### Admin — Packages
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/packages` | List all packages |
| POST | `/api/packages` | Create package |
| PUT | `/api/packages/:id` | Update package |
| DELETE | `/api/packages/:id` | Delete package |

### Folders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/folders` | List folders |
| GET | `/api/folders/:id` | Get folder by ID |
| POST | `/api/folders` | Create folder |
| PUT | `/api/folders/:id/rename` | Rename folder |
| DELETE | `/api/folders/:id` | Delete folder |
| PUT | `/api/folders/:id/star` | Toggle star |

### Files
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/files/upload` | Upload file |
| GET | `/api/files/:id` | Get file info |
| GET | `/api/files/:id/download` | Download file |
| GET | `/api/files/:id/preview` | Preview file |
| PUT | `/api/files/:id/rename` | Rename file |
| DELETE | `/api/files/:id` | Move to trash |
| POST | `/api/files/bulk-delete` | Bulk delete |
| POST | `/api/files/bulk-move` | Bulk move |
| PUT | `/api/files/:id/star` | Toggle star |
| GET | `/api/files/:id/versions` | Get version history |
| POST | `/api/files/:id/versions` | Upload new version |
| POST | `/api/files/:id/versions/:vId/restore` | Restore version |

### Sharing
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/share` | Create share link |
| GET | `/api/share/:fileId` | Get share info |
| DELETE | `/api/share/:token` | Revoke share |
| GET | `/api/share/public/:token` | Access shared file |

### Trash
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/trash` | Get trashed files |
| POST | `/api/trash/:id/restore` | Restore file |
| DELETE | `/api/trash/:id` | Permanently delete |
| DELETE | `/api/trash` | Empty trash |

---

## 👨‍💻 Author

**Mahamudul Hasan (Hasan Sayeed)**

[![GitHub](https://img.shields.io/badge/GitHub-hasansayeed--coder-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/hasansayeed-coder)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-mahamudul--hasan-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/mahamudul-hasan-3b52b829a)
[![YouTube](https://img.shields.io/badge/YouTube-Project%20Demo-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/d9GI0Pb_sxQ?si=cxu1vefdyFxc6Jem)

---

## 📄 License

This project was built as a technical assessment submission for ZOOM IT. All rights reserved.