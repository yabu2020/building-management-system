/*
  Warnings:

  - Made the column `branchName` on table `Building` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Building" ALTER COLUMN "branchName" SET NOT NULL;
