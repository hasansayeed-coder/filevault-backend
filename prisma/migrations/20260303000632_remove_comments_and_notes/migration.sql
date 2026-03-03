/*
  Warnings:

  - You are about to drop the `file_comments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `folder_notes` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "file_comments" DROP CONSTRAINT "file_comments_fileId_fkey";

-- DropForeignKey
ALTER TABLE "file_comments" DROP CONSTRAINT "file_comments_userId_fkey";

-- DropForeignKey
ALTER TABLE "folder_notes" DROP CONSTRAINT "folder_notes_folderId_fkey";

-- DropForeignKey
ALTER TABLE "folder_notes" DROP CONSTRAINT "folder_notes_userId_fkey";

-- DropTable
DROP TABLE "file_comments";

-- DropTable
DROP TABLE "folder_notes";
