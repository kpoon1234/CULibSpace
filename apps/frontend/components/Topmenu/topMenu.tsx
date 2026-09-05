'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import TopMenuItem from './topMenuItem';
import { API_URL, clearAuth, getAuthSnapshot, subscribeToAuth, type AuthUser } from '@/lib/auth';

export default function TopMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const storedUser = useSyncExternalStore(subscribeToAuth, getAuthSnapshot, () => null);
  const user = useMemo(() => {
    if (!storedUser) return null;
    try {
      return JSON.parse(storedUser) as AuthUser;
    } catch {
      return null;
    }
  }, [storedUser]);

  async function logout() {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      clearAuth();
      router.replace('/login');
    }
  }

  return (
    <header className="sticky top-0 z-50 flex min-h-16 w-full flex-wrap items-stretch border-b border-hairline bg-white px-3 sm:px-8">
      <nav aria-label="Primary" className="flex w-full flex-wrap items-center gap-y-2 py-2">
        <Link
          href="/"
          aria-label="CULibSpace home"
          className="group flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-hairline transition group-hover:ring-cta-primary">
            <Image src="/img/Logo.jpg" alt="" fill sizes="40px" className="object-cover" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-sans text-base font-bold tracking-tight text-ink">
              CULibSpace
            </span>
            <span className="hidden text-xs text-ink/70 sm:block">Library seat reservation</span>
          </span>
        </Link>

        <div className="flex flex-1 items-center justify-end gap-2 sm:gap-4">
          {user ? (
            <>
              <div className="hidden min-w-0 flex-col justify-center text-right sm:flex">
                <p className="truncate text-sm font-semibold text-ink">{user.firstname}</p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink/70">
                  {user.role}
                </p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="rounded-md bg-cta-primary px-3 py-3 text-sm font-medium text-white transition-colors hover:bg-cta-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:px-4"
              >
                Log Out
              </button>
            </>
          ) : (
            <TopMenuItem label="Log In" href="/login" isActive={pathname === '/login'} />
          )}
        </div>
      </nav>
    </header>
  );
}
