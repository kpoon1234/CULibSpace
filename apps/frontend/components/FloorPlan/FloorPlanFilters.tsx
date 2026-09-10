'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  EMPTY_FILTER,
  MIN_SEATS_OPTIONS,
  PLUG_BUCKETS,
  SLOT_MINUTES,
  snapToSlot,
  type FloorPlanFilter,
} from '@/lib/floorPlan';
import { CloseIcon } from './icons';

interface FloorPlanFiltersProps {
  /** Current applied filter — seeds the dialog's draft state on mount. The
   *  parent mounts this component only while the dialog is open, so mount == open. */
  value: FloorPlanFilter;
  onClose: () => void;
  onApply: (next: FloorPlanFilter) => void;
}

const fieldCls =
  'mt-1 w-full rounded-md border border-gray-300 bg-paper px-3 py-2 text-sm text-ink focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200';

function plugKey(range: FloorPlanFilter['plugRange']): string {
  if (!range) return 'any';
  return `${range[0]}-${range[1]}`;
}

// Table Filter dialog — maps the Figma panel to the GET /api/seats/layout params:
// large screen -> hasTvScreen, plug amount -> plugCap (min), minimum seats ->
// minSeats, and the free "Start Date Time" / "End Date Time" fields ->
// startDateTime / endDateTime, the window the status is evaluated against.
export default function FloorPlanFilters({ value, onClose, onApply }: FloorPlanFiltersProps) {
  const [draft, setDraft] = useState<FloorPlanFilter>(value);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // `datetime-local` min = the next half-hour slot at or after now, so a past
  // window (the backend 400s) can't be picked and the min lines up with the
  // 30-minute step. Computed once when the dialog mounts.
  const [minSlot] = useState(() => {
    const slotMs = SLOT_MINUTES * 60_000;
    const next = new Date(Math.ceil(Date.now() / slotMs) * slotMs);
    return new Date(next.getTime() - next.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });

  const bothTimesSet = Boolean(draft.startDateTime) && Boolean(draft.endDateTime);
  const oneTimeSet = Boolean(draft.startDateTime) !== Boolean(draft.endDateTime);
  const outOfOrder =
    bothTimesSet &&
    new Date(draft.startDateTime as string).getTime() >=
      new Date(draft.endDateTime as string).getTime();
  const timeInvalid = oneTimeSet || outOfOrder;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'var(--overlay-scrim, rgba(0,0,0,0.4))' }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-sm rounded-xl bg-paper shadow-xl focus:outline-none"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            Table filter
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filter"
            className="-mr-1.5 rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <label className="flex items-center gap-2.5 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={draft.requiresLargeScreen}
              onChange={(e) => setDraft((d) => ({ ...d, requiresLargeScreen: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300"
            />
            Require a TV / large screen
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              Power outlets
              <select
                className={fieldCls}
                value={plugKey(draft.plugRange)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'any') return setDraft((d) => ({ ...d, plugRange: null }));
                  const bucket = PLUG_BUCKETS.find((b) => `${b.range[0]}-${b.range[1]}` === v);
                  setDraft((d) => ({ ...d, plugRange: bucket ? bucket.range : null }));
                }}
              >
                <option value="any">Any</option>
                {PLUG_BUCKETS.map((b) => (
                  <option key={b.label} value={`${b.range[0]}-${b.range[1]}`}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-gray-700">
              Minimum seats
              <select
                className={fieldCls}
                value={draft.minSeats ?? 'any'}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    minSeats: e.target.value === 'any' ? null : Number(e.target.value),
                  }))
                }
              >
                <option value="any">Any</option>
                {MIN_SEATS_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}+ seats
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              Start date &amp; time
              <input
                type="datetime-local"
                className={fieldCls}
                value={draft.startDateTime ?? ''}
                min={minSlot}
                step={SLOT_MINUTES * 60}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    startDateTime: e.target.value ? snapToSlot(e.target.value) : null,
                  }))
                }
              />
            </label>

            <label className="block text-sm font-medium text-gray-700">
              End date &amp; time
              <input
                type="datetime-local"
                className={fieldCls}
                value={draft.endDateTime ?? ''}
                min={draft.startDateTime ?? minSlot}
                step={SLOT_MINUTES * 60}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    endDateTime: e.target.value ? snapToSlot(e.target.value) : null,
                  }))
                }
              />
            </label>
          </div>
          {timeInvalid ? (
            <p className="text-xs text-red-600">
              Enter both a start and an end, with the start before the end.
            </p>
          ) : (
            <p className="text-xs text-gray-500">
              Pick the start and end of the booking window — 30-minute slots (:00 or :30).
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={() => setDraft(EMPTY_FILTER)}
            className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            Clear all
          </button>
          <button
            type="button"
            disabled={timeInvalid}
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply filter
          </button>
        </div>
      </div>
    </div>
  );
}
