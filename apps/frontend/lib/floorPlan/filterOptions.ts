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

/** True when a table clears every active amenity constraint in `filter`. */
export function tablePassesFilter(table: TableLayout, filter: FloorPlanFilter): boolean {
  if (filter.requiresLargeScreen && !table.hasTvScreen) return false;

  if (filter.plugRange) {
    const [min, max] = filter.plugRange;
    const plugs = table.plugCap ?? 0;
    if (plugs < min || plugs > max) return false;
  }

  return true;
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
  if (hasValidTimeRange(filter)) n++;
  return n;
}

/**
 * The booking window to check availability against — the Figma "Start Date Time"
 * / "End Date Time" fields, passed straight to GET /api/seats/layout (which takes
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
