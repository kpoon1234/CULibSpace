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
