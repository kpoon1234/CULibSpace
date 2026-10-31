import { API_URL, getAuthToken } from '@/lib/auth';
import type {
  AdminIssue,
  AdminIssueFilter,
  AdminIssuePage,
  AdminIssueQuery,
  Envelope,
  UpdateAdminIssueInput,
} from './types';

const ISSUES_PATH = process.env.NEXT_PUBLIC_ADMIN_ISSUES_PATH || '/api/admin/issues';
export const ADMIN_ISSUE_PAGE_SIZE = 20;
// The API returns at most 100 rows per request.
const MAX_API_PAGE_SIZE = 100;

function queryString(query: AdminIssueQuery): string {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set('q', query.q.trim());
  if (query.status) params.set('status', query.status);
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(query.pageSize ?? ADMIN_ISSUE_PAGE_SIZE));
  return `?${params.toString()}`;
}

async function readEnvelope<T>(response: Response, label: string): Promise<T> {
  if (response.status === 401 || response.status === 403) {
    throw new Error('เซสชันผู้ดูแลระบบหมดอายุหรือไม่มีสิทธิ์ กรุณาเข้าสู่ระบบใหม่');
  }
  let body: Envelope<T>;
  try {
    body = (await response.json()) as Envelope<T>;
  } catch {
    throw new Error(`${label}: เซิร์ฟเวอร์ตอบกลับข้อมูลที่อ่านไม่ได้`);
  }
  if (!response.ok || !body.success || body.data === undefined) {
    throw new Error(body.error || `${label}: HTTP ${response.status}`);
  }
  return body.data;
}

export async function listAdminIssues(
  query: AdminIssueQuery,
  signal?: AbortSignal
): Promise<AdminIssuePage> {
  const token = getAuthToken();
  const response = await fetch(`${API_URL}${ISSUES_PATH}${queryString(query)}`, {
    signal,
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: 'no-store',
  });
  const data = await readEnvelope<AdminIssuePage>(response, 'issues');
  if (!Array.isArray(data.issues)) throw new Error('issues: รูปแบบรายการไม่ถูกต้อง');
  return data;
}

/**
 * Loads every page for a search/status filter. The API has no sort parameter,
 * so the admin view sorts and pages the whole filtered set itself.
 */
export async function listAllAdminIssues(
  filter: AdminIssueFilter,
  signal?: AbortSignal
): Promise<AdminIssue[]> {
  const pageSize = MAX_API_PAGE_SIZE;
  const first = await listAdminIssues({ ...filter, page: 1, pageSize }, signal);
  const pageCount = Math.ceil(first.total / pageSize);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) =>
      listAdminIssues({ ...filter, page: i + 2, pageSize }, signal)
    )
  );
  // Drop duplicates in case a new issue shifted rows between page requests.
  const byId = new Map<number, AdminIssue>();
  for (const issue of [first, ...rest].flatMap((p) => p.issues)) byId.set(issue.issueId, issue);
  return [...byId.values()];
}

export async function updateAdminIssue(
  issueId: number,
  input: UpdateAdminIssueInput
): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(`${API_URL}${ISSUES_PATH}/${issueId}`, {
    method: 'PATCH',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });
  await readEnvelope<unknown>(response, 'update issue');
}
