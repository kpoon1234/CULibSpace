'use client';

import Link from 'next/link';
import { ChevronLeftIcon } from '@/components/AdminUsers/icons';
import { useAdminGuard } from '@/lib/useAdminGuard';
import IssueListView from '@/components/AdminIssues';

export default function AdminIssuesPage() {
  const adminUser = useAdminGuard();

  if (!adminUser) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-canvas">
        <p className="text-stone-500">Verifying administrative credentials…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-canvas px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-6xl">
        <Link href="/admin" className="text-sm font-medium text-stone-500 hover:text-chula-pink">
          <ChevronLeftIcon width={16} height={16} className="mr-1.5" /> Admin
        </Link>
        <header className="mb-6 mt-2 border-l-4 border-chula-pink pl-3">
          <h1 className="text-2xl font-semibold text-ink">Issue Reports</h1>
          <p className="mt-1 text-sm text-stone-500">
            Review and manage facility issue reports submitted by members — newest first.
          </p>
        </header>
        <IssueListView />
      </div>
    </div>
  );
}
