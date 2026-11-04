import { API_URL, getAuthToken } from '@/lib/auth';

export interface FieldError {
  field: string;
  message: string;
}

/** A failed admin request, keeping the backend's error code and per-field errors. */
export class AdminRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly fieldErrors: FieldError[] = []
  ) {
    super(message);
    this.name = 'AdminRequestError';
  }
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  total?: number;
  code?: string;
  error?: string;
  errors?: FieldError[];
}

/**
 * Sends an authenticated admin request and unwraps the `{ success, data }`
 * envelope every admin endpoint returns.
 */
export async function adminRequest<T>(
  path: string,
  label: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<{ data: T | undefined; total?: number }> {
  const token = getAuthToken();
  const response = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    signal: init.signal,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

  if (response.status === 401 || response.status === 403) {
    throw new AdminRequestError(
      'Your admin session has expired or lacks permission. Please sign in again.',
      response.status
    );
  }

  let body: Envelope<T>;
  try {
    body = (await response.json()) as Envelope<T>;
  } catch {
    throw new AdminRequestError(
      `${label}: the server returned an unreadable response`,
      response.status
    );
  }
  if (!response.ok || !body.success) {
    throw new AdminRequestError(
      body.error || `${label}: HTTP ${response.status}`,
      response.status,
      body.code,
      Array.isArray(body.errors) ? body.errors : []
    );
  }
  return { data: body.data, total: body.total };
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
