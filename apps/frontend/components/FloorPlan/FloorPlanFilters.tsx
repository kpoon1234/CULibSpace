'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  DURATION_OPTIONS,
  EMPTY_FILTER,
  PLUG_BUCKETS,
  START_TIME_OPTIONS,
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

const selectCls =
  'mt-1 w-full rounded-md border border-gray-300 bg-paper px-3 py-2 text-sm text-ink focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200';

function plugKey(range: FloorPlanFilter['plugRange']): string {
  if (!range) return 'any';
  return `${range[0]}-${range[1]}`;
}

// Table Filter dialog — maps the Figma panel to the SeatLayoutQuery inputs:
// large screen -> hasTvScreen, plug amount -> plugCap bucket, start time +
// duration -> the booking window the status feed is evaluated against.
export default function FloorPlanFilters({ value, onClose, onApply }: FloorPlanFiltersProps) {
  const [draft, setDraft] = useState<FloorPlanFilter>(value);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

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

          <label className="block text-sm font-medium text-gray-700">
            Power outlets
            <select
              className={selectCls}
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

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-gray-700">
              Start time
              <select
                className={selectCls}
                value={draft.startTime ?? 'any'}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    startTime: e.target.value === 'any' ? null : e.target.value,
                  }))
                }
              >
                <option value="any">Any</option>
                {START_TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-gray-700">
              Duration
              <select
                className={selectCls}
                value={draft.durationMinutes ?? 60}
                disabled={!draft.startTime}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, durationMinutes: Number(e.target.value) }))
                }
              >
                {DURATION_OPTIONS.map((o) => (
                  <option key={o.minutes} value={o.minutes}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-gray-500">
            Start time and duration set the booking window that availability is checked against.
          </p>
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
            onClick={() => {
              onApply({
                ...draft,
                durationMinutes: draft.startTime ? (draft.durationMinutes ?? 60) : null,
              });
              onClose();
            }}
            className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            Apply filter
          </button>
        </div>
      </div>
    </div>
  );
}
