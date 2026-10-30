import { API_URL, getAuthToken } from '@/lib/auth';
import type { AdminIssuePage, AdminIssueQuery, Envelope, UpdateAdminIssueInput } from './types';

const ISSUES_PATH = process.env.NEXT_PUBLIC_ADMIN_ISSUES_PATH || '/api/admin/issues';
export const ADMIN_ISSUE_PAGE_SIZE = 20;

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
