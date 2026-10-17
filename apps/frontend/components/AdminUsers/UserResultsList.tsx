'use client';

import type { AdminUserSummary } from '@/lib/adminUsers';
import { useBookingLimits } from '@/lib/systemConfig';
import { USER_TYPE_LABEL, formatScore, fullName, identityDoc } from './format';

interface UserResultsListProps {
  users: AdminUserSummary[];
  selectedUid: number | null;
  onSelect: (user: AdminUserSummary) => void;
}

// Column template shared by the header row and every result row so they align.
const COLS = 'md:grid md:grid-cols-[minmax(0,1fr)_8.5rem_9.5rem_6rem] md:items-center md:gap-4';

// Result rows are buttons (pressed = selected), not a <table>: the whole row is
// the one action, and the list collapses to stacked rows below md.
export default function UserResultsList({ users, selectedUid, onSelect }: UserResultsListProps) {
  const { minScoreToBook } = useBookingLimits();
  return (
    <div>
      <div
        aria-hidden="true"
        className={`hidden border-b border-gray-200 px-4 py-2 text-xs font-medium text-gray-500 ${COLS}`}
      >
        <span>Name</span>
        <span>Account type</span>
        <span>ID</span>
        <span className="text-right">Score</span>
      </div>

      <ul className="divide-y divide-gray-100">
        {users.map((u) => {
          const selected = u.uid === selectedUid;
          const doc = identityDoc(u);
          const blocked = u.behaviourScore < minScoreToBook;
          return (
            <li key={u.uid}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(u)}
                className={`w-full px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-500 ${COLS} ${
                  selected ? 'bg-rose-50' : 'hover:bg-gray-50'
                }`}
              >
                <span className="flex items-baseline justify-between gap-3 md:block md:min-w-0">
                  <span className="block min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {fullName(u)}
                    </span>
                    <span className="block truncate text-sm text-gray-500">{u.email}</span>
                  </span>
                  {/* Score sits beside the name on narrow screens, in its own column on md+. */}
                  <span className="md:hidden">
                    <Score value={u.behaviourScore} blocked={blocked} />
                  </span>
                </span>
                <span className="mt-1 block text-sm text-gray-600 md:mt-0">
                  {USER_TYPE_LABEL[u.userType]}
                  <span className="text-gray-500 md:hidden">{doc ? ` · ${doc.value}` : ''}</span>
                </span>
                <span className="hidden truncate text-sm tabular-nums text-gray-600 md:block">
                  {doc?.value ?? <span className="text-gray-400">—</span>}
                </span>
                <span className="hidden text-right md:block">
                  <Score value={u.behaviourScore} blocked={blocked} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Score({ value, blocked }: { value: number; blocked: boolean }) {
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span
        className={`text-sm font-semibold tabular-nums ${blocked ? 'text-red-600' : 'text-gray-900'}`}
      >
        {formatScore(value)}
      </span>
      {blocked && <span className="text-xs font-medium text-red-600">Can&apos;t book</span>}
    </span>
  );
}
