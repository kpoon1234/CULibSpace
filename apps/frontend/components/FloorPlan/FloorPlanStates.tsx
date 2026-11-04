'use client';

import { formatDayKey } from '@/lib/floorPlan';

// Loading and error states for the floor-plan view. Kept in one file since both
// are small and always used together with FloorPlanView.

export function FloorPlanSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="flex items-center justify-between">
        <div className="h-9 w-64 rounded-md bg-gray-200" />
        <div className="h-8 w-40 rounded-md bg-gray-200" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="h-[520px] rounded-xl border border-gray-200 bg-stone-50" />
        <div className="hidden h-[520px] rounded-xl border border-gray-200 bg-stone-50 lg:block" />
      </div>
      <div className="mt-4 h-5 w-80 rounded bg-gray-200" />
    </div>
  );
}

export function FloorPlanError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-gray-200 bg-paper p-8 text-center shadow-sm"
    >
      <h3 className="text-base font-semibold text-gray-900">Couldn&apos;t load the floor plan</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600">
        The layout service didn&apos;t respond. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-md bg-chula-pink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-chula-pink-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-chula-pink"
      >
        Try again
      </button>
    </div>
  );
}

/**
 * The backend refused the layout because the library is closed (LIBRARY_CLOSED).
 * Shown when the user's own date/time filter falls on a closed day.
 */
export function FloorPlanClosed({
  closedKey,
  todayKey,
  onClearTime,
}: {
  closedKey: string;
  todayKey: string;
  /** Set when the closed day came from the user's own date filter. */
  onClearTime?: () => void;
}) {
  const isToday = closedKey === todayKey;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-gray-200 bg-paper p-8 text-center shadow-sm"
    >
      <h3 className="text-base font-semibold text-gray-900">
        {isToday
          ? 'The library is closed today'
          : `The library is closed on ${formatDayKey(closedKey)}`}
      </h3>
      {onClearTime && (
        <button
          type="button"
          onClick={onClearTime}
          className="mt-4 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-chula-pink"
        >
          Clear date &amp; time
        </button>
      )}
    </div>
  );
}
