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

/** Booking-start options, 30-min steps across typical library hours. */
export const START_TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 8; h <= 20; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`);
    if (h !== 20) out.push(`${String(h).padStart(2, '0')}:30`);
  }
  return out;
})();

export const DURATION_OPTIONS: { label: string; minutes: number }[] = [
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '1.5 hours', minutes: 90 },
  { label: '2 hours', minutes: 120 },
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

/** How many amenity constraints are currently active (for the filter badge). */
export function activeFilterCount(filter: FloorPlanFilter): number {
  let n = 0;
  if (filter.requiresLargeScreen) n++;
  if (filter.plugRange) n++;
  if (filter.startTime) n++;
  return n;
}

/** Derives the SeatLayoutQuery time range from the filter's start + duration. */
export function filterTimeRange(
  filter: FloorPlanFilter,
  today = new Date()
): { startDateTime: string; endDateTime: string } | null {
  if (!filter.startTime || !filter.durationMinutes) return null;

  const [h, m] = filter.startTime.split(':').map(Number);
  const start = new Date(today);
  start.setHours(h, m, 0, 0);
  const end = new Date(start.getTime() + filter.durationMinutes * 60_000);

  return { startDateTime: start.toISOString(), endDateTime: end.toISOString() };
}
