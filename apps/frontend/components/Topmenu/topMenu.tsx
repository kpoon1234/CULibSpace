'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import TopMenuItem from './topMenuItem';
import { API_URL, clearAuth, getAuthSnapshot, subscribeToAuth, type AuthUser } from '@/lib/auth';
import { useProfileModal } from '@/lib/profileModalContext';

export default function TopMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const { isOpen: isProfileOpen, openProfile } = useProfileModal();
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
    <header className="sticky top-0 z-50 flex h-16 w-full items-stretch bg-chula-pink px-3 sm:px-8">
      <nav aria-label="Primary" className="flex w-full items-center">
        <Link
          href="/"
          aria-label="CULibSpace home"
          className="group flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-chula-pink"
        >
          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-white/70 transition group-hover:ring-white">
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
              <button
                type="button"
                onClick={openProfile}
                aria-haspopup="dialog"
                aria-expanded={isProfileOpen}
                className={`rounded-md px-2 py-3 text-sm font-medium text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-chula-pink sm:px-3 ${
                  isProfileOpen ? 'bg-chula-pink-hover' : 'hover:bg-chula-pink-hover'
                }`}
              >
                Profile
              </button>
              <div className="hidden min-w-0 flex-col justify-center text-right sm:flex">
                <p className="truncate text-sm font-semibold text-ink">{user.firstname}</p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink/70">
                  {user.role}
                </p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="rounded-md bg-rose-700 px-3 py-3 text-sm font-medium text-white transition-colors hover:bg-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-chula-pink sm:px-4"
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
