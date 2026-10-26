-- Support the table-scoped availability check without rewriting older migrations.
CREATE INDEX "idx_issue_table_blocking"
ON "issue_report"("tableid", "status", "blocks_table");
