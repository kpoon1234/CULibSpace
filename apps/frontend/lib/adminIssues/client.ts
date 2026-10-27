'use client';

import useSWR from 'swr';
import { API_URL, getAuthToken } from '@/lib/auth';
import type { AdminIssuePage, AdminIssueQuery, IssueStatusLabel } from './types';

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

export interface UseAdminIssuesResult {
  page: AdminIssuePage | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | undefined;
  retry: () => void;
}

export function useAdminIssues(query: AdminIssueQuery): UseAdminIssuesResult {
  const token = getAuthToken();
  const res = useSWR<AdminIssuePage, Error>(
    token ? ['adminIssues', query] : null,
    async ([, q]: [string, AdminIssueQuery]) => {
      const t = getAuthToken();
      if (!t) throw new Error('No auth token');
      return fetchAdminIssues(t, q);
    },
    { keepPreviousData: true, revalidateOnFocus: false, dedupingInterval: 2_000 }
  );

  return {
    page: res.data,
    isLoading: !res.data && !res.error,
    isFetching: res.isValidating,
    error: res.error,
    retry: () => void res.mutate(),
  };
}

export type { IssueStatusLabel };
