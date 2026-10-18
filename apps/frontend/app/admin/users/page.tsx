'use client';

import { useState } from 'react';
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
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);

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

      <UserSearchView
        renderActions={(user) => (
          <button
            type="button"
            onClick={() => {
              setAdjustUser(user);
              setShowAdjustmentModal(true);
            }}
            className="w-full rounded-md border border-chula-pink bg-chula-pink/5 px-3 py-2 text-sm font-semibold text-chula-pink transition-colors hover:bg-chula-pink hover:text-white"
          >
            Adjust score
          </button>
        )}
      />

      <ScoreAdjustmentModal
        isOpen={showAdjustmentModal}
        onClose={() => {
          setShowAdjustmentModal(false);
          setAdjustUser(null);
        }}
        targetUser={
          adjustUser
            ? {
                uid: adjustUser.uid,
                firstname: adjustUser.firstname,
                lastname: adjustUser.lastname,
                behaviourScore: adjustUser.behaviourScore,
              }
            : null
        }
      />
    </div>
  );
}
