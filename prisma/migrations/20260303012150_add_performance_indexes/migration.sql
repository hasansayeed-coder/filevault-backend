-- CreateIndex
CREATE INDEX "files_userId_deletedAt_idx" ON "files"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "files_folderId_deletedAt_idx" ON "files"("folderId", "deletedAt");

-- CreateIndex
CREATE INDEX "files_fileType_idx" ON "files"("fileType");

-- CreateIndex
CREATE INDEX "folders_userId_parentId_idx" ON "folders"("userId", "parentId");

-- CreateIndex
CREATE INDEX "payments_userId_createdAt_idx" ON "payments"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "user_subscriptions_userId_isActive_idx" ON "user_subscriptions"("userId", "isActive");
