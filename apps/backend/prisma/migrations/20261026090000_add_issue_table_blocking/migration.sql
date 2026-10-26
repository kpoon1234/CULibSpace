-- Existing reports do not close tables unless an admin explicitly opts in.
ALTER TABLE "issue_report"
ADD COLUMN "blocks_table" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "issue_report"
ADD CONSTRAINT "issue_blocks_table_only_in_progress"
CHECK (NOT "blocks_table" OR "status" = 'In Progress'::"issue_status_enum");
