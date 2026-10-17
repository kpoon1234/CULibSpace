'use client';

import Link from 'next/link';
import { useAdminGuard } from '@/lib/useAdminGuard';
import { ChevronRightIcon, UsersIcon } from '@/components/AdminUsers/icons';

export default function AdminDashboardPage() {
  const adminUser = useAdminGuard();

  if (!adminUser) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-canvas">
        <p className="text-stone-500">Verifying administrative credentials…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center bg-canvas px-4 text-center">
      <div className="w-full max-w-md rounded-xl border border-hairline bg-paper p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Admin Dashboard</h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-500">
          Welcome, {adminUser.firstname}. More administrative tools will be added in future sprints.
        </p>
        <Link
          href="/admin/users"
          className="mt-6 flex items-center gap-3 rounded-md border border-gray-300 px-4 py-3 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          <UsersIcon className="flex-none text-gray-500" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-gray-900">Users</span>
            <span className="block text-xs text-gray-500">
              Search users and review behaviour scores
            </span>
          </span>
          <ChevronRightIcon width={16} height={16} className="flex-none text-gray-400" />
        </Link>
      </div>
    </div>
  );
}
