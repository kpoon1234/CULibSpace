'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { UserSearchView } from '@/components/AdminUsers';
import { useAdminGuard } from '@/lib/useAdminGuard';
import { ChevronLeftIcon } from '@/components/AdminUsers/icons';
import ScoreAdjustmentModal from '@/components/Profile/ScoreAdjustmentModal';
import type { AdminUserSummary } from '@/lib/adminUsers';

// Admin user search (US5-4). Data comes from GET /api/admin/users (see
// lib/ARCHITECTURE.md) — set NEXT_PUBLIC_ADMIN_USERS_MOCK=1 to use sample users
// instead (e.g. without a running backend).
export default function AdminUsersPage() {
  const admin = useAdminGuard();
  const [adjustUser, setAdjustUser] = useState<AdminUserSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const retryRef = useRef<(() => void) | null>(null);

  if (!admin) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-canvas">
        <p className="text-stone-500">Verifying administrative credentials…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-canvas px-4 py-8 sm:px-10 sm:py-10 lg:px-16 xl:px-24">
      <Link
        href="/admin"
        className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
      >
        <ChevronLeftIcon width={16} height={16} /> Admin
      </Link>
      <header className="mb-6 mt-2 max-w-2xl">
        <h1 className="text-2xl font-semibold text-gray-900">Users</h1>
        <p className="mt-1 text-sm text-gray-600">
          Find a library user to review their behaviour score and account details.
        </p>
      </header>

      {notice && (
        <div className="mb-4 rounded-md bg-emerald-50 px-4 py-3 border border-emerald-100">
          <p className="text-sm text-emerald-700">{notice}</p>
        </div>
      )}

      <UserSearchView
        renderActions={(user, { retry, source }) => {
          retryRef.current = retry;
          const isMock = source === 'mock';
          return (
            <button
              type="button"
              disabled={isMock}
              onClick={() => {
                setAdjustUser(user);
                setNotice(null);
              }}
              aria-label={`Adjust score for ${user.firstname} ${user.lastname}`}
              className={`w-full rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                isMock
                  ? 'border-gray-300 bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'border-chula-pink bg-chula-pink/5 text-chula-pink hover:bg-chula-pink hover:text-white'
              }`}
            >
              {isMock ? 'ไม่สามารถปรับคะแนนในโหมดตัวอย่าง' : 'Adjust score'}
            </button>
          );
        }}
      />

      {adjustUser && (
        <ScoreAdjustmentModal
          key={adjustUser.uid}
          onClose={() => {
            setAdjustUser(null);
          }}
          targetUser={{
            uid: adjustUser.uid,
            firstname: adjustUser.firstname,
            lastname: adjustUser.lastname,
            userType: adjustUser.userType,
            behaviourScore: adjustUser.behaviourScore,
          }}
          onSuccess={() => {
            setAdjustUser(null);
            setNotice(`ปรับคะแนน ${adjustUser.firstname} ${adjustUser.lastname} เรียบร้อยแล้ว`);
            retryRef.current?.();
          }}
        />
      )}
    </div>
  );
}
