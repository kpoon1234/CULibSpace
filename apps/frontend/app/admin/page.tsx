'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthToken, getStoredUser, subscribeToAuth, type AuthUser } from '@/lib/auth';

export default function AdminDashboardPage() {
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
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center bg-canvas px-4 text-center">
      <div className="w-full max-w-md rounded-xl border border-hairline bg-paper p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Admin Dashboard</h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-500">
          Welcome, {adminUser.firstname}. The administrative portal features will be implemented in
          future sprints.
        </p>
      </div>
    </div>
  );
}
