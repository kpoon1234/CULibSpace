-- [US7-2] Track the current status of each facility issue report.
-- Existing reports start as Pending so the admin list can filter all records.

-- CreateEnum
CREATE TYPE "issue_status_enum" AS ENUM ('Pending', 'In Progress', 'Completed');

-- AlterTable
ALTER TABLE "issue_report"
ADD COLUMN "status" "issue_status_enum" NOT NULL DEFAULT 'Pending';
