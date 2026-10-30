'use client';

import useSWR from 'swr';
import { API_URL, getAuthToken } from '@/lib/auth';
import { MAX_API_PAGE_SIZE } from './types';
import type {
  AdminIssue,
  AdminIssueFilter,
  AdminIssuePage,
  AdminIssueQuery,
  IssueStatusLabel,
} from './types';

const ISSUES_PATH = '/api/admin/issues';

export async function fetchAdminIssues(
  token: string,
  query: AdminIssueQuery,
  signal?: AbortSignal
): Promise<AdminIssuePage> {
  const params = new URLSearchParams({
    page: String(query.page ?? 1),
    pageSize: String(query.pageSize ?? 20),
  });
  if (query.q?.trim()) params.set('q', query.q.trim());
  if (query.status) params.set('status', query.status);

  const response = await fetch(`${API_URL}${ISSUES_PATH}?${params}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    signal,
  });
  const body = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403) {
    throw new Error('Your admin session has expired. Please log in again.');
  }
  if (!response.ok || !body?.success) {
    throw new Error(body?.error || `Failed to load issue reports (${response.status})`);
  }
  return body.data as AdminIssuePage;
}

/** Loads every page for a search/status filter so the list can be sorted as a whole. */
export async function fetchAllAdminIssues(
  token: string,
  filter: AdminIssueFilter
): Promise<AdminIssue[]> {
  const pageSize = MAX_API_PAGE_SIZE;
  const first = await fetchAdminIssues(token, { ...filter, page: 1, pageSize });
  const pageCount = Math.ceil(first.total / pageSize);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) =>
      fetchAdminIssues(token, { ...filter, page: i + 2, pageSize })
    )
  );
  // Drop duplicates in case a new issue shifted rows between page requests.
  const byId = new Map<number, AdminIssue>();
  for (const issue of [first, ...rest].flatMap((p) => p.issues)) byId.set(issue.issueId, issue);
  return [...byId.values()];
}

export interface UseAdminIssuesResult {
  issues: AdminIssue[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | undefined;
  retry: () => void;
}

export function useAdminIssues(filter: AdminIssueFilter): UseAdminIssuesResult {
  const token = getAuthToken();
  const res = useSWR<AdminIssue[], Error>(
    token ? ['adminIssues', filter.q ?? '', filter.status ?? ''] : null,
    async () => {
      const t = getAuthToken();
      if (!t) throw new Error('No auth token');
      return fetchAllAdminIssues(t, filter);
    },
    { keepPreviousData: true, revalidateOnFocus: false, dedupingInterval: 2_000 }
  );

  return {
    issues: res.data,
    isLoading: !res.data && !res.error,
    isFetching: res.isValidating,
    error: res.error,
    retry: () => void res.mutate(),
  };
}

export type { IssueStatusLabel };
