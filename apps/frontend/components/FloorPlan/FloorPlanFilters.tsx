'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  EMPTY_FILTER,
  MIN_SEATS_OPTIONS,
  PLUG_BUCKETS,
  TIME_SLOTS,
  isEndTimeDisabled,
  timeToMinutes,
  toOffsetDateTime,
  type FloorPlanFilter,
} from '@/lib/floorPlan';
import { useBookingLimits } from '@/lib/systemConfig';
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

/** Latest date (local, "YYYY-MM-DD") a booking window can start on. */
function computeMaxDate(maxAdvanceBookingDays: number): string {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  d.setUTCDate(d.getUTCDate() + maxAdvanceBookingDays);
  return d.toISOString().slice(0, 10);
}

// Table Filter dialog — maps the Figma panel to the GET /api/tables/layout params:
// large screen -> hasTvScreen, plug amount -> plugCap (min), minimum seats ->
// minSeats, and a same-day Date + From + To (each a fixed half-hour slot) ->
// startDateTime / endDateTime, the window the status is evaluated against.
export default function FloorPlanFilters({ value, onClose, onApply }: FloorPlanFiltersProps) {
  const [draft, setDraft] = useState<FloorPlanFilter>(value);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // From the backend's SystemConfig (falls back to its own defaults, 120 min /
  // 7 days, until the fetch resolves) — LayoutController runs every explicit
  // window through the same reservation validation as an actual booking, so a
  // window/date outside these limits 400s and client.ts falls back to mock data.
  const { maxBookingWindowMinutes, maxAdvanceBookingDays } = useBookingLimits();

  // Today (local), the earliest date the window can start on — the backend 400s
  // a past window. Computed once when the dialog mounts.
  const [today] = useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
  );
  // Latest date the window can start on — mirrors maxAdvanceBookingDays; a
  // later date 400s the same way an over-long window does. Computed once at
  // mount, same as `today` above: this dialog only mounts while open
  // (FloorPlanView renders it conditionally), so re-opening it always re-runs
  // this against whatever useBookingLimits() has resolved to by then — SWR's
  // shared cache means that's the real config after the first successful
  // fetch anywhere in the app, not just the default.
  const [maxDate] = useState(() => computeMaxDate(maxAdvanceBookingDays));

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
  const tooLong =
    allTimeFields && timeToMinutes(toTime) - timeToMinutes(fromTime) > maxBookingWindowMinutes;
  // `max={maxDate}` below stops most of these, but a date typed directly still
  // needs catching.
  const dateTooFar = Boolean(bookDate) && bookDate > maxDate;

  // One message, most-specific reason first, so a half-picked window says
  // exactly what's missing (e.g. "Pick a start time.") instead of a generic
  // catch-all that doesn't distinguish From from Date from To.
  const timeErrorMessage = dateTooFar
    ? `Bookings can only be made up to ${maxAdvanceBookingDays} days in advance.`
    : tooLong
      ? `Booking windows can be at most ${maxBookingWindowMinutes / 60} hours.`
      : anyTimeField && !bookDate
        ? 'Pick a date.'
        : anyTimeField && !fromTime
          ? 'Pick a start time.'
          : anyTimeField && !toTime
            ? 'Pick an end time.'
            : allTimeFields && toTime <= fromTime
              ? 'End time must be after the start time.'
              : null;
  const timeInvalid = timeErrorMessage !== null;

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
                      disabled={isEndTimeDisabled(t, fromTime, maxBookingWindowMinutes)}
                    >
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {timeErrorMessage ? (
            <p className="text-xs text-red-600">{timeErrorMessage}</p>
          ) : (
            <p className="text-xs text-gray-500">
              Same-day window in 30-minute slots, up to {maxBookingWindowMinutes / 60} hours (e.g.
              10:00 – 10:30).
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
            className="rounded-md bg-chula-pink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-chula-pink-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-chula-pink disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply filter
          </button>
        </div>
      </div>
    </div>
  );
}
