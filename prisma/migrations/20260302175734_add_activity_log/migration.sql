-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('LOGIN', 'LOGOUT', 'REGISTER', 'LOGIN_FAILED', 'PASSWORD_CHANGED', 'EMAIL_CHANGED', 'TWO_FA_ENABLED', 'TWO_FA_DISABLED', 'FILE_UPLOAD', 'FILE_DELETE', 'FILE_RESTORE', 'FILE_PERMANENT_DELETE', 'FILE_RENAME', 'FILE_MOVE', 'FILE_DOWNLOAD', 'FILE_STAR', 'FILE_UNSTAR', 'FOLDER_CREATE', 'FOLDER_DELETE', 'FOLDER_RENAME', 'TRASH_EMPTIED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_UNSUSPENDED', 'PASSWORD_RESET_ADMIN');

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "ActivityAction" NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "entityName" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_logs_userId_createdAt_idx" ON "activity_logs"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_action_idx" ON "activity_logs"("action");

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
