import type { AdminIssue, IssueSortKey, IssueStatus, SortDirection } from './types';

const STATUS_ORDER: Record<IssueStatus, number> = {
  Pending: 0,
  'In Progress': 1,
  Completed: 2,
};

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

const COMPARE: Record<IssueSortKey, (a: AdminIssue, b: AdminIssue) => number> = {
  reported: (a, b) => Date.parse(a.time) - Date.parse(b.time),
  status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  table: (a, b) => a.table.tableId - b.table.tableId,
  zone: (a, b) => collator.compare(a.table.zoneType, b.table.zoneType),
  reporter: (a, b) =>
    collator.compare(
      `${a.user.firstname} ${a.user.lastname}`,
      `${b.user.firstname} ${b.user.lastname}`
    ),
};

/** Sorts a copy; ties fall back to newest first so the order is always stable. */
export function sortIssues(
  issues: AdminIssue[],
  key: IssueSortKey,
  direction: SortDirection
): AdminIssue[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...issues].sort(
    (a, b) =>
      sign * COMPARE[key](a, b) || Date.parse(b.time) - Date.parse(a.time) || b.issueId - a.issueId
  );
}
