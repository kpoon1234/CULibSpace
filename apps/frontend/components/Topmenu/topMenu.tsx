'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import TopMenuItem from './topMenuItem';
import { API_URL, clearAuth, getAuthSnapshot, subscribeToAuth, type AuthUser } from '@/lib/auth';
import { useProfileModal } from '@/lib/profileModalContext';
import HistoryModal from '../Profile/HistoryModal';

export default function TopMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const { openProfile } = useProfileModal();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
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
    <>
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
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={isDropdownOpen}
                  aria-label={`Open menu for ${user.firstname}`}
                  className={`flex min-w-0 items-center gap-2.5 rounded-full py-1 pl-1.5 pr-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
                    isDropdownOpen ? 'bg-chula-pink-hover' : 'hover:bg-chula-pink-hover'
                  } cursor-pointer`}
                >
                  <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full ring-2 ring-hairline">
                    {user.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-chula-pink-hover text-sm font-semibold text-ink">
                        {user.firstname.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </span>

                  <span className="flex min-w-0 flex-col justify-center text-left">
                    <span className="truncate text-sm font-semibold text-ink">
                      {user.firstname}
                    </span>
                    <span className="hidden text-[11px] font-medium uppercase tracking-wide text-ink/70 sm:block">
                      {user.role}
                    </span>
                  </span>
                  <svg
                    className={`ml-1 h-4 w-4 shrink-0 text-ink transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {isDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsDropdownOpen(false)}
                      aria-hidden="true"
                    />

                    <div
                      role="menu"
                      className="absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-md border border-hairline bg-white py-1 shadow-lg"
                    >
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          openProfile();
                          setIsDropdownOpen(false);
                        }}
                        className="block w-full px-4 py-2 text-left text-sm text-ink hover:bg-gray-100"
                      >
                        Profile
                      </button>
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setIsHistoryOpen(true);
                          setIsDropdownOpen(false);
                        }}
                        className="block w-full px-4 py-2 text-left text-sm text-ink hover:bg-gray-100"
                      >
                        History Log
                      </button>
                      <hr className="my-1 border-hairline" />
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          logout();
                          setIsDropdownOpen(false);
                        }}
                        className="block w-full px-4 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"
                      >
                        Log Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <TopMenuItem label="Log In" href="/login" isActive={pathname === '/login'} />
            )}
          </div>
        </nav>
      </header>

      <HistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
    </>
  );
}
