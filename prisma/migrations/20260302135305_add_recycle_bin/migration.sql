-- AlterTable
ALTER TABLE "files" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "trashedAt" TIMESTAMP(3);
