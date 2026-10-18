'use client';

import useSWR from 'swr';
import { API_URL, getAuthToken } from '@/lib/auth';
import { mockSearchUsers } from './mockData';
import type { UserSearchEnvelope, UserSearchPage, UserSearchQuery } from './types';
import { DEFAULT_PAGE_SIZE } from './types';

// Data access for the admin user search (US5-4). One backend endpoint
// (AdminUserController.search) — contract in lib/ARCHITECTURE.md:
//
//   GET /api/admin/users?q=&userType=&page=&pageSize=  ->  { success, data: UserSearchPage }
//
// ADMIN-only (authenticateToken + requireRoles('ADMIN')), so the request
// carries the stored Bearer token. A network/HTTP/parse failure REJECTS — the
// UI shows an error with a retry. Sample users are served only when
// NEXT_PUBLIC_ADMIN_USERS_MOCK=1 is set explicitly, never as an error fallback.

const USERS_PATH = process.env.NEXT_PUBLIC_ADMIN_USERS_PATH || '/api/admin/users';

const FORCE_MOCK = process.env.NEXT_PUBLIC_ADMIN_USERS_MOCK === '1';

export interface SourcedUserPage {
  data: UserSearchPage;
  source: 'api' | 'mock';
}

function toQueryString(q: UserSearchQuery): string {
  const p = new URLSearchParams();
  if (q.q?.trim()) p.set('q', q.q.trim());
  if (q.userType) p.set('userType', q.userType);
  p.set('page', String(q.page ?? 1));
  p.set('pageSize', String(q.pageSize ?? DEFAULT_PAGE_SIZE));
  return `?${p.toString()}`;
}

export async function searchUsers(
  query: UserSearchQuery,
  signal?: AbortSignal
): Promise<SourcedUserPage> {
  if (FORCE_MOCK) return { data: mockSearchUsers(query), source: 'mock' };

  const token = getAuthToken();
  const res = await fetch(`${API_URL}${USERS_PATH}${toQueryString(query)}`, {
    signal,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('Your admin session has expired. Sign in again to search users.');
  }
  if (!res.ok) throw new Error(`users ${res.status}`);

  const body = (await res.json()) as UserSearchEnvelope;
  if (!body.success || !body.data || !Array.isArray(body.data.users)) {
    throw new Error(body.error || 'users: unsuccessful response');
  }
  return {
    data: {
      ...body.data,
      users: body.data.users.map((u) => ({ ...u, behaviourScore: Number(u.behaviourScore) })),
    },
    source: 'api',
  };
}

export interface UseUserSearchResult {
  page: UserSearchPage | undefined;
  source: 'api' | 'mock' | undefined;
  isLoading: boolean;
  /** True while a new query is in flight and the previous results are still shown. */
  isFetching: boolean;
  error: Error | undefined;
  retry: () => void;
}

/**
 * Searches as the query changes. `keepPreviousData` holds the last results on
 * screen while the next page/query loads, so the list doesn't flash empty on
 * every keystroke (the caller debounces `q`).
 */
export function useUserSearch(query: UserSearchQuery): UseUserSearchResult {
  const res = useSWR<SourcedUserPage, Error>(
    ['adminUsers', query],
    ([, q]: [string, UserSearchQuery]) => searchUsers(q),
    { keepPreviousData: true, revalidateOnFocus: false, dedupingInterval: 2_000 }
  );

  return {
    page: res.data?.data,
    source: res.data?.source,
    isLoading: !res.data && !res.error,
    isFetching: res.isValidating,
    error: res.error,
    retry: () => void res.mutate(),
  };
}
