'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import TopMenuItem from './topMenuItem';
import { clearAuth, getAuthSnapshot, subscribeToAuth, type AuthUser } from '@/lib/auth';
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
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      clearAuth();
      router.replace('/login');
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-pink-300 bg-pink-400 shadow-sm">
      <div className="flex h-16 w-full items-center gap-3 px-2 sm:px-3">
        <Link
          href="/"
          className="group flex min-w-0 items-center gap-3"
          aria-label="CULibSpace home"
        >
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-white/70 transition group-hover:ring-white">
            <Image
              src="/img/Logo.jpg"
              alt="CULibSpace logo"
              fill
              sizes="40px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold tracking-tight text-white">CULibSpace</p>
            <p className="hidden text-xs text-pink-100 sm:block">Library seat reservation</p>
          </div>
        </Link>

        <nav className="ml-auto flex h-full items-center gap-2" aria-label="Main navigation">
          {user ? (
            <>
              <button
                type="button"
                onClick={openProfile}
                aria-haspopup="dialog"
                aria-expanded={isProfileOpen}
                className={`inline-flex h-10 w-28 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  isProfileOpen ? 'bg-white/20 text-white' : 'text-white hover:bg-white/15'
                }`}
              >
                Profile
              </button>
              <div className="hidden h-10 w-28 min-w-0 flex-col justify-center rounded-lg bg-white/15 px-3 text-right sm:flex">
                <p className="truncate text-sm font-semibold text-white">{user.firstname}</p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-pink-100">
                  {user.role}
                </p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="inline-flex h-10 w-28 items-center justify-center rounded-lg bg-white px-3 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <span className="hidden sm:inline">Logout</span>
                <span className="sm:hidden">Log out</span>
              </button>
            </>
          ) : (
            <TopMenuItem label="Login" href="/login" isActive={pathname === '/login'} />
          )}
        </nav>
      </div>
    </header>
  );
}
