/*
  Warnings:

  - You are about to drop the column `min_score_to_book` on the `system_config` table. All the data in the column will be lost.
  - You are about to alter the column `behaviour_score` on the `user` table. The data in that column could be lost. The data in that column will be cast from `Decimal(4,1)` to `Integer`.

*/
-- AlterTable
ALTER TABLE "manage_score" ADD COLUMN     "reason" TEXT NOT NULL DEFAULT 'System Adjustment';

-- AlterTable
ALTER TABLE "system_config" DROP COLUMN "min_score_to_book",
ADD COLUMN     "behaviour_score" INTEGER NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE "user" ALTER COLUMN "behaviour_score" SET DEFAULT 100,
ALTER COLUMN "behaviour_score" SET DATA TYPE INTEGER;
