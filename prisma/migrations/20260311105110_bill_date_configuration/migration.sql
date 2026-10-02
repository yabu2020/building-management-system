-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('Active', 'Inactive');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "showAllBuildings" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'Active';

-- CreateTable
CREATE TABLE "ApplicationSetting" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "billDateConfiguration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "ApplicationSetting_pkey" PRIMARY KEY ("id")
);
