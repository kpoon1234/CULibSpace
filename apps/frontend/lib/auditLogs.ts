import { API_URL } from '@/lib/auth';

export type AuditDirection = 'deduct' | 'add';

export type AuditLogEntry = {
  id: number;
  timestamp: string;
  scoreChange: number;
  reason: string;
  user: {
    uid: number;
    firstname: string;
    lastname: string;
    email: string;
    studentId: string | null;
  };
  admin: { adminId: number; firstname: string; lastname: string; email: string };
};

export type AuditLogPage = {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export type AuditLogQuery = {
  q?: string;
  direction?: AuditDirection;
  from?: string; // yyyy-mm-dd (local)
  to?: string; // yyyy-mm-dd (local), inclusive
  page: number;
  pageSize: number;
};

// GET /api/admin/audit-logs — AdminAuditController.list (ADMIN only). Returns
// ManageScore rows newest first, with the affected user and the admin attached.
export async function fetchAuditLogs(
  token: string,
  query: AuditLogQuery,
  signal?: AbortSignal
): Promise<AuditLogPage> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.q) params.set('q', query.q);
  if (query.direction) params.set('direction', query.direction);
  // Date inputs are local calendar days; widen "to" to the end of that day.
  if (query.from) params.set('from', new Date(`${query.from}T00:00:00`).toISOString());
  if (query.to) params.set('to', new Date(`${query.to}T23:59:59.999`).toISOString());

  const response = await fetch(`${API_URL}/api/admin/audit-logs?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  const body = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403) {
    throw new Error('Your admin session has expired. Please log in again.');
  }
  if (!response.ok || !body?.success) {
    throw new Error(body?.error || `Failed to load audit logs (${response.status})`);
  }
  return body.data as AuditLogPage;
}
