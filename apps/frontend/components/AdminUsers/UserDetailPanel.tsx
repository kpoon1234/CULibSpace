'use client';

import type { ReactNode } from 'react';
import type { AdminUserSummary } from '@/lib/adminUsers';
import { useBookingLimits } from '@/lib/systemConfig';
import { CloseIcon } from './icons';
import {
  USER_TYPE_LABEL,
  formatJoined,
  formatScore,
  fullName,
  identityDoc,
  initials,
} from './format';

interface UserDetailPanelProps {
  user: AdminUserSummary | null;
  onClose: () => void;
  /**
   * Mount point for the Score Adjustment Form (US5-4, separate task). Rendered
   * under the score; when omitted, a placeholder says adjustment isn't available yet.
   */
  actions?: ReactNode;
}

// Detail card for the selected user. Presentational — placement (side column on
// lg, stacked under the results below that) is the parent's call.
export default function UserDetailPanel({ user, onClose, actions }: UserDetailPanelProps) {
  // Called before the early return so the hook order never changes.
  const { minScoreToBook } = useBookingLimits();

  if (!user) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-500">
        Select a user to see their behaviour score and account details.
      </div>
    );
  }

  const doc = identityDoc(user);
  const blocked = user.behaviourScore < minScoreToBook;
  const fill = Math.min(100, Math.max(0, user.behaviourScore));

  return (
    <section
      aria-labelledby="admin-user-detail-name"
      className="rounded-xl border border-gray-200 bg-paper p-5 shadow-sm"
    >
      <div className="flex items-start gap-3">
        {user.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.imageUrl}
            alt=""
            className="h-11 w-11 flex-none rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600"
          >
            {initials(user)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2
            id="admin-user-detail-name"
            className="truncate text-lg font-semibold leading-tight text-gray-900"
          >
            {fullName(user)}
          </h2>
          <p className="truncate text-sm text-gray-500">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close user details"
          className="-mr-1.5 -mt-1.5 rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-gray-700">Behaviour score</span>
          <span className="text-sm text-gray-500">
            <span
              className={`text-2xl font-semibold tabular-nums ${blocked ? 'text-red-600' : 'text-gray-900'}`}
            >
              {formatScore(user.behaviourScore)}
            </span>{' '}
            / 100
          </span>
        </div>
        {/* Meter, not a control: brass measures; below the booking minimum it turns scarlet. */}
        <div
          role="meter"
          aria-label="Behaviour score"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={user.behaviourScore}
          className="relative mt-2 h-2 rounded-full bg-gray-200"
        >
          <div
            className={`h-full rounded-full ${blocked ? 'bg-red-500' : 'bg-brass-600'}`}
            style={{ width: `${fill}%` }}
          />
          <span
            aria-hidden="true"
            className="absolute -top-1 h-4 w-px bg-gray-500"
            style={{ left: `${minScoreToBook}%` }}
          />
        </div>
        <p className={`mt-2 text-xs ${blocked ? 'font-medium text-red-600' : 'text-gray-500'}`}>
          {blocked
            ? `Below the ${minScoreToBook}-point minimum — this user can't reserve tables.`
            : `Can reserve tables. Booking is blocked below ${minScoreToBook} points.`}
        </p>
      </div>

      <dl className="mt-5 space-y-2.5 border-t border-gray-100 pt-4 text-sm">
        <Fact term="Account type">{USER_TYPE_LABEL[user.userType]}</Fact>
        {doc && (
          <Fact term={doc.label}>
            <span className="tabular-nums">{doc.value}</span>
          </Fact>
        )}
        <Fact term="Phone">
          {user.phone ? (
            <span className="tabular-nums">{user.phone}</span>
          ) : (
            <span className="text-gray-500">Not provided</span>
          )}
        </Fact>
        <Fact term="Profile">
          {user.isProfileComplete ? (
            'Complete'
          ) : (
            <span className="text-gray-500">Onboarding not finished</span>
          )}
        </Fact>
        <Fact term="Joined">{formatJoined(user.createdAt)}</Fact>
      </dl>

      <div className="mt-5 border-t border-gray-100 pt-4">
        {actions ?? (
          // Placeholder until the Score Adjustment Form (US5-4) mounts via `actions`.
          <div className="rounded-md bg-gray-100 p-3 text-sm text-gray-600">
            <p className="font-medium text-gray-700">Adjust score</p>
            <p className="mt-0.5 text-xs">Manual score adjustment isn&apos;t available yet.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{term}</dt>
      <dd className="min-w-0 truncate text-right text-gray-900">{children}</dd>
    </div>
  );
}
