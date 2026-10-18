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

// MOCK: main has no admin-wide audit-log endpoint yet. Until the backend team ships one,
// this serves sample data shaped like ManageScore rows. When it lands, replace the body of
// fetchAuditLogs with a real fetch to that endpoint and set IS_MOCK_AUDIT_DATA to false.
export const IS_MOCK_AUDIT_DATA = true;

const MOCK_ADMINS = [
  { adminId: 1, firstname: 'Library', lastname: 'Master', email: 'admin@chula.ac.th' },
  { adminId: 2, firstname: 'Ploy', lastname: 'Srisuk', email: 'ploy.s@chula.ac.th' },
];

const MOCK_USERS = [
  {
    uid: 1,
    firstname: 'Alice',
    lastname: 'Wonderland',
    email: 'alice@student.chula.ac.th',
    studentId: '6700000001',
  },
  {
    uid: 2,
    firstname: 'Bob',
    lastname: 'Builder',
    email: 'bob@student.chula.ac.th',
    studentId: '6700000002',
  },
  {
    uid: 3,
    firstname: 'Lowscore',
    lastname: 'Student',
    email: 'lowscore@student.chula.ac.th',
    studentId: '6700000003',
  },
  { uid: 4, firstname: 'Somchai', lastname: 'Jaidee', email: 'somchai@gmail.com', studentId: null },
];

const MOCK_REASONS: [number, string][] = [
  [-10, 'No-show: booking not checked in within 15 minutes'],
  [-5, 'Late cancellation (less than 1 hour before start)'],
  [-20, 'Noise complaint reported by library staff'],
  [10, 'Score restored after appeal review'],
  [-10, 'No-show: booking not checked in within 15 minutes'],
  [5, 'Manual adjustment: system error during check-in'],
  [-60, 'System Adjustment'],
];

const MOCK_LOGS: AuditLogEntry[] = Array.from({ length: 47 }, (_, i) => {
  const [scoreChange, reason] = MOCK_REASONS[i % MOCK_REASONS.length];
  return {
    id: 47 - i,
    // Spread entries back from a fixed date, roughly 9 hours apart.
    timestamp: new Date(
      Date.UTC(2026, 9, 18, 9, 30) - i * 9 * 3_600_000 - (i % 4) * 731_000
    ).toISOString(),
    scoreChange,
    reason,
    user: MOCK_USERS[(i * 3) % MOCK_USERS.length],
    admin: MOCK_ADMINS[i % 5 === 0 ? 1 : 0],
  };
});

export async function fetchAuditLogs(
  token: string,
  query: AuditLogQuery,
  signal?: AbortSignal
): Promise<AuditLogPage> {
  void token; // the real endpoint will need it

  await new Promise((resolve) => setTimeout(resolve, 250));
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const q = query.q?.toLowerCase() ?? '';
  // Date inputs are local calendar days; widen "to" to the end of that day.
  const from = query.from ? new Date(`${query.from}T00:00:00`).getTime() : -Infinity;
  const to = query.to ? new Date(`${query.to}T23:59:59.999`).getTime() : Infinity;

  const matches = MOCK_LOGS.filter((log) => {
    if (query.direction === 'deduct' && log.scoreChange >= 0) return false;
    if (query.direction === 'add' && log.scoreChange <= 0) return false;
    const time = new Date(log.timestamp).getTime();
    if (time < from || time > to) return false;
    if (!q) return true;
    return [
      log.reason,
      log.user.firstname,
      log.user.lastname,
      log.user.email,
      log.user.studentId ?? '',
      log.admin.firstname,
      log.admin.lastname,
      log.admin.email,
    ].some((field) => field.toLowerCase().includes(q));
  });

  const start = (query.page - 1) * query.pageSize;
  return {
    logs: matches.slice(start, start + query.pageSize),
    total: matches.length,
    page: query.page,
    pageSize: query.pageSize,
  };
}
