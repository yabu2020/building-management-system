-- AlterTable
ALTER TABLE "User" ADD COLUMN     "nibBranch" TEXT,
ADD COLUMN     "showAllUsers" BOOLEAN NOT NULL DEFAULT false;
