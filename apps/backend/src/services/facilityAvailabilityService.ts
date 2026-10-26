import { IssueStatus, Prisma, TableStatus } from '@prisma/client';
import { lockTableForStatusChange } from './tableStatusService.js';

// One predicate for layout, hold, booking validation, and admin issue changes.
export const BLOCKING_ISSUE_WHERE = {
  status: IssueStatus.IN_PROGRESS,
  blocksTable: true,
} satisfies Prisma.IssueReportWhereInput;

export async function hasBlockingIssue(
  client: Pick<Prisma.TransactionClient, 'issueReport'>,
  tableId: number
): Promise<boolean> {
  const issue = await client.issueReport.findFirst({
    where: { tableId, ...BLOCKING_ISSUE_WHERE },
    select: { issueId: true },
  });
  return issue !== null;
}

export function isFacilityClosed(status: TableStatus, blockedByIssue: boolean): boolean {
  return status === TableStatus.CLOSED || blockedByIssue;
}

/**
 * The admin status/notes API owns authorization, input parsing, and ManageIssue
 * audit writes. It calls this helper INSIDE its interactive transaction, before
 * writing the audit. Never update issue availability before taking the table lock.
 * Throwing later in that transaction rolls back both this change and hold cleanup.
 * Existing bookings/check-in/no-show policies are deliberately unchanged.
 */
export async function applyIssueAvailabilityChange(
  tx: Prisma.TransactionClient,
  issueId: number,
  next: { status: IssueStatus; blocksTable: boolean }
) {
  if (!Object.values(IssueStatus).includes(next.status) || typeof next.blocksTable !== 'boolean') {
    throw {
      status: 400,
      code: 'INVALID_ISSUE_AVAILABILITY',
      message: 'Invalid issue availability.',
    };
  }

  const issue = await tx.issueReport.findUnique({
    where: { issueId },
    select: { tableId: true },
  });
  if (!issue) {
    throw { status: 404, code: 'ISSUE_NOT_FOUND', message: 'Issue report not found.' };
  }

  await lockTableForStatusChange(tx, issue.tableId);
  const table = await tx.table.findUniqueOrThrow({
    where: { tableId: issue.tableId },
    select: { status: true },
  });
  const wasClosed = isFacilityClosed(table.status, await hasBlockingIssue(tx, issue.tableId));
  const updated = await tx.issueReport.update({
    where: { issueId },
    data: {
      status: next.status,
      blocksTable: next.status === IssueStatus.IN_PROGRESS && next.blocksTable,
    },
    select: { issueId: true, tableId: true, status: true, blocksTable: true },
  });
  const closed = isFacilityClosed(table.status, await hasBlockingIssue(tx, issue.tableId));

  if (!wasClosed && closed) {
    await tx.table.update({
      where: { tableId: issue.tableId },
      data: { lockToken: null, lockedUntil: null, lockedByUid: null },
    });
  }

  // Do not persist CLOSED for an issue: that would erase the distinction from
  // a manually closed table, and completing an issue could reopen it incorrectly.
  return { ...updated, closed };
}
