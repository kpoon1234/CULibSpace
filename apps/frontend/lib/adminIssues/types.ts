export type IssueStatus = 'Pending' | 'In Progress' | 'Completed';

export const ISSUE_STATUSES: readonly IssueStatus[] = ['Pending', 'In Progress', 'Completed'];

export interface AdminIssue {
  issueId: number;
  time: string;
  issueInformation: string;
  status: IssueStatus;
  blocksTable: boolean;
  notes: string;
  user: { uid: number; firstname: string; lastname: string; email: string };
  table: { tableId: number; zoneId: number; zoneType: string };
}

export interface AdminIssuePage {
  issues: AdminIssue[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminIssueQuery {
  q?: string;
  status?: IssueStatus;
  page?: number;
  pageSize?: number;
}

export type Envelope<T> = { success: boolean; data?: T; error?: string };

export interface UpdateAdminIssueInput {
  status: IssueStatus;
  blocksTable: boolean;
  notes: string;
}
