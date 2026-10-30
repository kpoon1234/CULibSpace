// Falls back to the local backend so a missing .env.local degrades to a working dev URL
// instead of silently producing "undefined/api/auth/...".
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export const AUTH_TOKEN_KEY = 'culibspace_token';
export const AUTH_USER_KEY = 'culibspace_user';
const AUTH_CHANGE_EVENT = 'culibspace-auth-change';

export type AuthUser = {
  uid?: number;
  adminId?: number;
  email: string;
  firstname: string;
  lastname: string;
  role: 'STUDENT' | 'STAFF' | 'OUTSIDER' | 'ADMIN';
  userType?: 'UNIVERSITY' | 'THAI' | 'FOREIGN';
  isProfileComplete?: boolean;
  behaviourScore?: number;
  phone?: string | null;
  studentId?: string;
  citizenId?: string;
  passportId?: string;
  imageUrl?: string | null;
};

export function saveAuth(token: string, user: AuthUser): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const storedUser = localStorage.getItem(AUTH_USER_KEY);
  if (!storedUser) return null;

  try {
    return JSON.parse(storedUser) as AuthUser;
  } catch {
    clearAuth();
    return null;
  }
}

export function getAuthSnapshot(): string | null {
  return getAuthToken() ? localStorage.getItem(AUTH_USER_KEY) : null;
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

/** Seconds-since-epoch `exp` claim of a JWT, or null if it can't be read. */
function readTokenExpiry(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

/**
 * Whether the stored session still works.
 *   'invalid' → expired, malformed, or rejected by the server: safe to clear.
 *   'unknown' → the server could not be asked (offline, 5xx): keep the session,
 *               so a backend outage does not sign everyone out.
 * The expiry check runs first and needs no network.
 */
export async function verifyStoredSession(): Promise<'valid' | 'invalid' | 'unknown'> {
  const token = getAuthToken();
  if (!token) return 'invalid';

  const exp = readTokenExpiry(token);
  if (exp === null || exp * 1000 <= Date.now()) return 'invalid';

  try {
    const response = await fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) return 'valid';
    // 404: the account behind the token no longer exists.
    if ([401, 403, 404].includes(response.status)) return 'invalid';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function subscribeToAuth(listener: () => void): () => void {
  window.addEventListener(AUTH_CHANGE_EVENT, listener);
  return () => window.removeEventListener(AUTH_CHANGE_EVENT, listener);
}
