'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthSnapshot, subscribeToAuth, type AuthUser } from '@/lib/auth';

/**
 * Client-side gate for /admin routes: redirects to /login unless a token and an
 * ADMIN user are stored. Returns the admin once verified, null until then. The
 * real enforcement is the backend's requireRoles('ADMIN') — this only keeps
 * non-admins from seeing an admin screen that would fail every request.
 */
export function useAdminGuard(): AuthUser | null {
  const router = useRouter();
  // The stored user JSON while a token exists, else null (see getAuthSnapshot).
  // `undefined` on the server/first hydration pass so we don't redirect before
  // localStorage has been read.
  const snapshot = useSyncExternalStore<string | null | undefined>(
    subscribeToAuth,
    getAuthSnapshot,
    () => undefined
  );

  const admin = useMemo<AuthUser | null>(() => {
    if (!snapshot) return null;
    try {
      const user = JSON.parse(snapshot) as AuthUser;
      return user.role === 'ADMIN' ? user : null;
    } catch {
      return null;
    }
  }, [snapshot]);

  useEffect(() => {
    if (snapshot !== undefined && !admin) router.replace('/login');
  }, [snapshot, admin, router]);

  return admin;
}
