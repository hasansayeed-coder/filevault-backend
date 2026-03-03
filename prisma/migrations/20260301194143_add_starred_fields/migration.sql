-- AlterTable
ALTER TABLE "files" ADD COLUMN     "isStarred" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "folders" ADD COLUMN     "isStarred" BOOLEAN NOT NULL DEFAULT false;
