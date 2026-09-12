import type { FloorPlanFilter, TableLayout } from './types';

// Options for the Table Filter panel. The Figma annotation asks for the plug
// filter to be a "drop down list range" (1–3, 4–6, ...), so plug capacity is
// bucketed rather than a free number.

export interface PlugBucket {
  label: string;
  /** Inclusive [min, max]; use Infinity for an open upper bound. */
  range: [number, number];
}

export const PLUG_BUCKETS: PlugBucket[] = [
  { label: '1–3 plugs', range: [1, 3] },
  { label: '4–6 plugs', range: [4, 6] },
  { label: '7+ plugs', range: [7, Number.POSITIVE_INFINITY] },
];

/** "Minimum seats" options for the Table Filter — maps to the backend `minSeats`. */
export const MIN_SEATS_OPTIONS: number[] = [2, 4, 6, 8];

/** Bookable times: every half hour, 00:00 → 23:30. Start/end can only be one of
 *  these, so the window is always on a :00 / :30 boundary. */
export const TIME_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  return `${h}:${i % 2 === 0 ? '00' : '30'}`;
});

/**
 * Longest booking window the backend will evaluate a status for — mirrors
 * `SystemConfig.maxBookingDurationMinutes` (seeded to 120). `LayoutController`
 * runs every `startDateTime`/`endDateTime` request through the same US2-4
 * reservation validation, so any wider window 400s and `client.ts` falls back
 * to mock data. Kept as a constant here (rather than fetched) because the
 * backend has no endpoint exposing `SystemConfig` yet — if that value ever
 * changes, update this too.
 */
export const MAX_BOOKING_WINDOW_MINUTES = 120;

/**
 * Furthest a booking date can be in the future — mirrors
 * `SystemConfig.maxAdvanceBookingDays` (seeded to 7). Same US2-4 validation as
 * `MAX_BOOKING_WINDOW_MINUTES` above, same reason it's a constant here rather
 * than fetched: a date past this 400s and falls back to mock data.
 */
export const MAX_ADVANCE_BOOKING_DAYS = 7;

/** Minutes since midnight for a "HH:mm" `TIME_SLOTS` entry. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** True when a table clears every active amenity constraint in `filter`. */
export function tablePassesFilter(table: TableLayout, filter: FloorPlanFilter): boolean {
  if (filter.requiresLargeScreen && !table.hasTvScreen) return false;

  if (filter.plugRange) {
    const [min, max] = filter.plugRange;
    const plugs = table.plugCap ?? 0;
    if (plugs < min || plugs > max) return false;
  }

  if (filter.minSeats != null && table.seats < filter.minSeats) return false;

  return true;
}

/** The attribute filters as GET /api/tables/layout query params (time window excluded). */
export function filterAmenityQuery(filter: FloorPlanFilter): {
  plugCap?: number;
  hasTvScreen?: boolean;
  minSeats?: number;
} {
  const q: { plugCap?: number; hasTvScreen?: boolean; minSeats?: number } = {};
  if (filter.plugRange) q.plugCap = filter.plugRange[0];
  if (filter.requiresLargeScreen) q.hasTvScreen = true;
  if (filter.minSeats != null) q.minSeats = filter.minSeats;
  return q;
}

/** True when the filter carries a usable booking window (both ends set, ordered). */
export function hasValidTimeRange(filter: FloorPlanFilter): boolean {
  return filterTimeRange(filter) !== null;
}

/** How many constraints are currently active (for the filter badge). */
export function activeFilterCount(filter: FloorPlanFilter): number {
  let n = 0;
  if (filter.requiresLargeScreen) n++;
  if (filter.plugRange) n++;
  if (filter.minSeats != null) n++;
  if (hasValidTimeRange(filter)) n++;
  return n;
}

/**
 * Combine a "YYYY-MM-DD" date and "HH:mm" time into an ISO string that carries
 * this browser's UTC offset (e.g. "2026-09-11T14:00:00+07:00"). A bare
 * "YYYY-MM-DDTHH:mm" string has no timezone designator, so `new Date(...)`
 * parses it as local time OF WHATEVER MACHINE RUNS THE CODE — the backend
 * re-interprets it in the server's own timezone, not the browser's. That
 * silently shifts the intended instant whenever the two differ (e.g. a
 * Bangkok browser against a UTC-hosted API), which can push a valid window
 * outside operating hours or the past-date tolerance and 400 the request —
 * which client.ts then swallows into the mock-data fallback. Encoding the
 * offset makes the instant unambiguous no matter where it's parsed.
 */
export function toOffsetDateTime(date: string, time: string): string {
  const local = new Date(`${date}T${time}:00`);
  const offsetMin = -local.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${date}T${time}:00${sign}${hh}:${mm}`;
}

/**
 * The booking window to check availability against — the Figma "Start Date Time"
 * / "End Date Time" fields, passed straight to GET /api/tables/layout (which takes
 * exactly `startDateTime` + `endDateTime`). Returns null unless both ends are set
 * and start is before end.
 */
export function filterTimeRange(
  filter: FloorPlanFilter
): { startDateTime: string; endDateTime: string } | null {
  const { startDateTime, endDateTime } = filter;
  if (!startDateTime || !endDateTime) return null;
  if (new Date(startDateTime).getTime() >= new Date(endDateTime).getTime()) return null;
  return { startDateTime, endDateTime };
}
