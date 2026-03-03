# 🗄️ FileVault — Subscription-Based File Management System

A full-featured, production-ready SaaS File & Folder Management System where subscription tiers strictly control storage capabilities. Built with a modern PERN stack.

---

## 🌐 Live Demo

| Service | URL |
|--------|-----|
| 🖥️ Frontend | [filevault.vercel.app](https://your-frontend-url.vercel.app) |
| ⚙️ Backend API | [filevault-api.railway.app](https://your-backend-url.railway.app) |

---

## 🔐 Default Credentials

| Role | Email | Password |
|------|-------|----------|
| 👑 Admin | admin@filevault.com | Admin@123 |
| 👤 User | user@filevault.com | User@123 |

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Tech Stack](#-tech-stack)
- [Features](#-features)
- [Subscription Tiers](#-subscription-tiers)
- [Screenshots — Admin](#-screenshots--admin-panel)
- [Screenshots — User](#-screenshots--user-panel)
- [Database ER Diagram](#-database-er-diagram)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [API Documentation](#-api-documentation)

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

### 👤 User Panel
- User registration & login with **JWT authentication**
- **Email verification** on registration
- **Password reset** via email
- View & select subscription packages
- Subscription history with active date ranges
- Full **file & folder management** with package enforcement:
  - Create, rename, delete folders
  - Nested sub-folders up to package limit
  - Upload files (Image, Video, Audio, PDF)
  - View, download, rename files
  - All actions validated against active subscription

### 🔒 Enforcement Logic
- Every action checks the user's active package before proceeding
- Folder creation checks: Max Folders, Max Nesting Level
- File upload checks: Allowed File Types, Max File Size, Total File Limit, Files Per Folder
- Package switches apply going forward — existing data is never deleted

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

---

## 🗃️ Database ER Diagram

### Key Tables
- **users** — Auth, profile, active subscription
- **subscription_packages** — Admin-defined tiers with all limits
- **user_subscriptions** — History of package assignments with date ranges
- **folders** — Nested folder tree with depth tracking per user
- **files** — File metadata, type, size, folder reference

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
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   └── index.ts
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── admin/
    │   │   ├── dashboard/
    │   │   ├── login/
    │   │   ├── register/
    │   │   └── subscription/
    │   ├── components/
    │   │   ├── admin/
    │   │   ├── files/
    │   │   ├── folders/
    │   │   ├── layout/
    │   │   └── ui/
    │   ├── hooks/
    │   ├── lib/
    │   ├── store/
    │   └── types/
    └── package.json
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- PostgreSQL
- npm or yarn

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/file-management-system.git
cd file-management-system
```

### 2. Backend Setup
```bash
cd backend
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

### 3. Frontend Setup
```bash
cd frontend
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
JWT_EXPIRES_IN="7d"
PORT=5000
CLIENT_URL="http://localhost:3000"

# Email (for verification & password reset)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your@email.com"
SMTP_PASS="your-app-password"

# File uploads
UPLOAD_DIR="uploads"
MAX_FILE_SIZE=1073741824
```

### Frontend `.env.local`
```env
NEXT_PUBLIC_API_URL="http://localhost:5000/api"
```

---

## 📡 API Documentation

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password |
| GET | `/api/auth/verify-email/:token` | Verify email |

### Admin — Packages
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/packages` | List all packages |
| POST | `/api/admin/packages` | Create package |
| PUT | `/api/admin/packages/:id` | Update package |
| DELETE | `/api/admin/packages/:id` | Delete package |

### Subscriptions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/subscriptions` | Get all packages (user view) |
| POST | `/api/subscriptions/select` | Select a package |
| GET | `/api/subscriptions/history` | Get subscription history |

### Folders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/folders` | List root folders |
| GET | `/api/folders/:id` | Get folder contents |
| POST | `/api/folders` | Create folder |
| PUT | `/api/folders/:id` | Rename folder |
| DELETE | `/api/folders/:id` | Delete folder |

### Files
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/files/upload` | Upload file |
| GET | `/api/files/:id` | Get file info |
| GET | `/api/files/:id/download` | Download file |
| PUT | `/api/files/:id` | Rename file |
| DELETE | `/api/files/:id` | Delete file |

---

## 👨‍💻 Author

**Hasan**  
[GitHub](https://github.com/yourusername) · [LinkedIn](https://linkedin.com/in/yourusername)

---

## 📄 License

This project is for educational purposes as part of a SaaS File Management System assignment.