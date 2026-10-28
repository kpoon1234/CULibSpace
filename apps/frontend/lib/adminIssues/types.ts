export type IssueStatusLabel = 'Pending' | 'In Progress' | 'Completed';

export interface AdminIssue {
  issueId: number;
  time: string;
  updatedAt: string;
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

export const ISSUE_STATUSES: IssueStatusLabel[] = ['Pending', 'In Progress', 'Completed'];

export const ISSUE_STATUS_LABELS: Record<IssueStatusLabel, string> = {
  Pending: 'Pending',
  'In Progress': 'In Progress',
  Completed: 'Completed',
};

export const DEFAULT_PAGE_SIZE = 20;
