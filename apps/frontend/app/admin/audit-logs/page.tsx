'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAuthToken, getStoredUser, subscribeToAuth, type AuthUser } from '@/lib/auth';
import AuditLogView from '@/components/Admin/AuditLogView';

export default function AdminAuditLogsPage() {
  const router = useRouter();
  const token = useSyncExternalStore(subscribeToAuth, getAuthToken, () => null);
  const [adminUser, setAdminUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (!token) {
      router.replace('/login');
      return;
    }
    const user = getStoredUser();
    if (!user || user.role !== 'ADMIN') {
      router.replace('/login');
      return;
    }
    setAdminUser(user);
  }, [token, router]);

  if (!token || !adminUser || adminUser.role !== 'ADMIN') {
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
