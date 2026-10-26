-- [US7-2] Support filtering reported issues by status in newest-first order.

-- CreateIndex
CREATE INDEX "idx_issue_report_status_time" ON "issue_report"("status", "time" DESC);
