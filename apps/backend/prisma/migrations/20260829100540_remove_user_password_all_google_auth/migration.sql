/*
  Warnings:

  - You are about to drop the column `password` on the `user` table. All the data in the column will be lost.
  - Made the column `password` on table `admin` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "admin" ALTER COLUMN "password" SET NOT NULL;

-- AlterTable
ALTER TABLE "user" DROP COLUMN "password";
