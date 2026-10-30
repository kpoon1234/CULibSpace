'use client';

import Link from 'next/link';
import { useAdminGuard } from '@/lib/useAdminGuard';
import { ChevronLeftIcon } from '@/components/AdminUsers/icons';
import { IssueManagementView } from '@/components/AdminIssues/IssueManagementView';

export default function AdminIssuesPage() {
  const admin = useAdminGuard();

  if (!admin) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-canvas">
        <p className="text-stone-500">Verifying administrative credentials…</p>
      </div>
    );
  }

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-canvas px-4 py-8 sm:px-10 sm:py-10 lg:px-16 xl:px-24">
      <Link
        href="/admin"
        className="-ml-1 mb-3 inline-flex items-center gap-1 rounded-md px-1 text-sm font-medium text-gray-600 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
      >
        <ChevronLeftIcon width={16} height={16} /> Admin
      </Link>
      <IssueManagementView />
    </main>
  );
}
