export type IssueStatusLabel = 'Pending' | 'In Progress' | 'Completed';

export interface AdminIssue {
  issueId: number;
  time: string;
  issueInformation: string;
  status: IssueStatusLabel;
  blocksTable: boolean;
  user: {
    uid: number;
    firstname: string;
    lastname: string;
    email: string;
  };
  table: {
    tableId: number;
    zoneId: number;
    zoneType: string;
  };
}

export type AdminIssuePage = {
  issues: AdminIssue[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminIssueQuery = {
  q?: string;
  status?: IssueStatusLabel;
  page: number;
  pageSize: number;
};

export type AdminIssueFilter = Pick<AdminIssueQuery, 'q' | 'status'>;

export const ISSUE_STATUSES: IssueStatusLabel[] = ['Pending', 'In Progress', 'Completed'];

export const ISSUE_STATUS_LABELS: Record<IssueStatusLabel, string> = {
  Pending: 'Pending',
  'In Progress': 'In Progress',
  Completed: 'Completed',
};

export const DEFAULT_PAGE_SIZE = 20;

export type IssueSortKey = 'reported' | 'status' | 'table' | 'zone' | 'reporter';
export type SortDirection = 'asc' | 'desc';

/**
 * Each sort key names its two directions in words that fit the data,
 * instead of a bare "ascending / descending".
 */
export const ISSUE_SORT_OPTIONS: Record<
  IssueSortKey,
  { label: string; defaultDirection: SortDirection; directions: Record<SortDirection, string> }
> = {
  reported: {
    label: 'Date reported',
    defaultDirection: 'desc',
    directions: { desc: 'Newest first', asc: 'Oldest first' },
  },
  status: {
    label: 'Status',
    defaultDirection: 'asc',
    directions: { asc: 'Pending first', desc: 'Completed first' },
  },
  table: {
    label: 'Table number',
    defaultDirection: 'asc',
    directions: { asc: 'Lowest first', desc: 'Highest first' },
  },
  zone: {
    label: 'Zone',
    defaultDirection: 'asc',
    directions: { asc: 'A to Z', desc: 'Z to A' },
  },
  reporter: {
    label: 'Reporter name',
    defaultDirection: 'asc',
    directions: { asc: 'A to Z', desc: 'Z to A' },
  },
};

export const ISSUE_SORT_KEYS = Object.keys(ISSUE_SORT_OPTIONS) as IssueSortKey[];

/** The API returns at most 100 rows per request. */
export const MAX_API_PAGE_SIZE = 100;
