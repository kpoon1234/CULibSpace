'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  EMPTY_FILTER,
  MAX_ADVANCE_BOOKING_DAYS,
  MAX_BOOKING_WINDOW_MINUTES,
  MIN_SEATS_OPTIONS,
  PLUG_BUCKETS,
  TIME_SLOTS,
  timeToMinutes,
  toOffsetDateTime,
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

/** Split a stored "YYYY-MM-DDTHH:mm" into date + "HH:mm" parts (or blanks). */
function parts(local: string | null): { date: string; time: string } {
  if (!local || local.length < 16) return { date: '', time: '' };
  const [date, time] = local.split('T');
  return { date, time: time.slice(0, 5) };
}

// Table Filter dialog — maps the Figma panel to the GET /api/tables/layout params:
// large screen -> hasTvScreen, plug amount -> plugCap (min), minimum seats ->
// minSeats, and a same-day Date + From + To (each a fixed half-hour slot) ->
// startDateTime / endDateTime, the window the status is evaluated against.
export default function FloorPlanFilters({ value, onClose, onApply }: FloorPlanFiltersProps) {
  const [draft, setDraft] = useState<FloorPlanFilter>(value);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Today (local), the earliest date the window can start on — the backend 400s
  // a past window. Computed once when the dialog mounts.
  const [today] = useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
  );
  // Latest date the window can start on — mirrors the backend's
  // MAX_ADVANCE_BOOKING_DAYS (SystemConfig.maxAdvanceBookingDays); a later date
  // 400s the same way an over-long window does.
  const [maxDate] = useState(() => {
    const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
    d.setUTCDate(d.getUTCDate() + MAX_ADVANCE_BOOKING_DAYS);
    return d.toISOString().slice(0, 10);
  });

  // The booking window is a same-day Date + From + To, each held on its own so a
  // half-picked window (e.g. a time chosen before a date) still shows what you
  // clicked. They're combined into startDateTime / endDateTime only on Apply.
  const [bookDate, setBookDate] = useState(
    () => parts(value.startDateTime).date || parts(value.endDateTime).date
  );
  const [fromTime, setFromTime] = useState(() => parts(value.startDateTime).time);
  const [toTime, setToTime] = useState(() => parts(value.endDateTime).time);

  const anyTimeField = Boolean(bookDate || fromTime || toTime);
  const allTimeFields = Boolean(bookDate && fromTime && toTime);
  // The backend (LayoutController / US2-4) 400s any window longer than
  // MAX_BOOKING_WINDOW_MINUTES, which client.ts then quietly turns into a
  // mock-data fallback — so this dialog can't offer a "To" the backend would
  // reject.
  const tooLong =
    allTimeFields && timeToMinutes(toTime) - timeToMinutes(fromTime) > MAX_BOOKING_WINDOW_MINUTES;
  // Same story for a date past MAX_ADVANCE_BOOKING_DAYS — `max={maxDate}` below
  // stops most of these, but a date typed directly still needs catching.
  const dateTooFar = Boolean(bookDate) && bookDate > maxDate;
  const timeInvalid =
    (anyTimeField && !allTimeFields) ||
    (allTimeFields && toTime <= fromTime) ||
    tooLong ||
    dateTooFar;

  const apply = () => {
    onApply({
      ...draft,
      startDateTime: allTimeFields ? toOffsetDateTime(bookDate, fromTime) : null,
      endDateTime: allTimeFields ? toOffsetDateTime(bookDate, toTime) : null,
    });
    onClose();
  };

  const clearAll = () => {
    setDraft(EMPTY_FILTER);
    setBookDate('');
    setFromTime('');
    setToTime('');
  };

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

          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Date
              <input
                type="date"
                className={fieldCls}
                value={bookDate}
                min={today}
                max={maxDate}
                onChange={(e) => setBookDate(e.target.value)}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-gray-700">
                From
                <select
                  className={fieldCls}
                  value={fromTime}
                  onChange={(e) => setFromTime(e.target.value)}
                >
                  <option value="">—</option>
                  {TIME_SLOTS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-gray-700">
                To
                <select
                  className={fieldCls}
                  value={toTime}
                  onChange={(e) => setToTime(e.target.value)}
                >
                  <option value="">—</option>
                  {TIME_SLOTS.map((t) => (
                    <option
                      key={t}
                      value={t}
                      disabled={
                        Boolean(fromTime) &&
                        (t <= fromTime ||
                          timeToMinutes(t) - timeToMinutes(fromTime) > MAX_BOOKING_WINDOW_MINUTES)
                      }
                    >
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {timeInvalid ? (
            <p className="text-xs text-red-600">
              {dateTooFar
                ? `Bookings can only be made up to ${MAX_ADVANCE_BOOKING_DAYS} days in advance.`
                : tooLong
                  ? `Booking windows can be at most ${MAX_BOOKING_WINDOW_MINUTES / 60} hours.`
                  : 'Pick a date, a start time and a later end time.'}
            </p>
          ) : (
            <p className="text-xs text-gray-500">
              Same-day window in 30-minute slots, up to {MAX_BOOKING_WINDOW_MINUTES / 60} hours
              (e.g. 10:00 – 10:30).
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={clearAll}
            className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            Clear all
          </button>
          <button
            type="button"
            disabled={timeInvalid}
            onClick={apply}
            className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply filter
          </button>
        </div>
      </div>
    </div>
  );
}
