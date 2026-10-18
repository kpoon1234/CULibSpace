'use client';

import Link from 'next/link';
import { getAuthToken } from '@/lib/auth';
import { useAdminGuard } from '@/lib/useAdminGuard';
import AuditLogView from '@/components/AuditLog/AuditLogView';

export default function AdminAuditLogsPage() {
  const adminUser = useAdminGuard();
  // useAdminGuard only returns an admin once a token is stored, so this is set whenever it renders.
  const token = adminUser ? getAuthToken() : null;

  if (!adminUser || !token) {
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
          ← Admin Dashboard
        </Link>
        <header className="mb-6 mt-2 border-l-4 border-chula-pink pl-3">
          <h1 className="text-2xl font-semibold text-ink">Audit History</h1>
          <p className="mt-1 text-sm text-stone-500">
            Every behaviour-score change, who made it, and why — newest first.
          </p>
        </header>
        <AuditLogView token={token} />
      </div>
    </div>
  );
}
