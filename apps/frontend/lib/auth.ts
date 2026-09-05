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

export function subscribeToAuth(listener: () => void): () => void {
  window.addEventListener(AUTH_CHANGE_EVENT, listener);
  return () => window.removeEventListener(AUTH_CHANGE_EVENT, listener);
}
