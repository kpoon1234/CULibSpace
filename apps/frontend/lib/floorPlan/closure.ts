// Library-closed handling for the floor plan. Browsing on a closed day returns
// the tables with meta.libraryClosed; an explicit time window on a closed day is
// refused with LIBRARY_CLOSED. The reopening day is found by asking the layout
// endpoint about the following days, within the advance-booking reach.

/** A non-2xx /api/tables/layout response, keeping the backend's error code. */
export class LayoutRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = 'LayoutRequestError';
  }
}

/**
 * Checked by shape, not `instanceof`: SWR keeps errors across Fast Refresh, and a
 * reloaded module's class would no longer match an error thrown by the old one.
 */
function isLayoutRequestError(error: unknown): error is LayoutRequestError {
  return (
    error instanceof Error &&
    error.name === 'LayoutRequestError' &&
    typeof (error as LayoutRequestError).status === 'number'
  );
}

export function isLibraryClosedError(error: unknown): error is LayoutRequestError {
  return isLayoutRequestError(error) && error.code === 'LIBRARY_CLOSED';
}

/** Client errors (bad window, closed, too far ahead) won't fix themselves on retry. */
export function isClientLayoutError(error: unknown): boolean {
  return isLayoutRequestError(error) && error.status >= 400 && error.status < 500;
}

/**
 * How long to wait before retrying a failed layout fetch, or null to stop.
 * SWR skips its refreshInterval poll while the cache holds an error, so a closed
 * day is re-checked here on the poll cadence: a reopened library shows up on its
 * own. Other 4xx won't change on a retry; server/network errors back off.
 */
export function layoutRetryDelay(
  error: unknown,
  retryCount: number,
  pollMs: number
): number | null {
  if (isLibraryClosedError(error)) return pollMs > 0 ? pollMs : null;
  if (isClientLayoutError(error) || retryCount >= 5) return null;
  return 5_000 * 2 ** retryCount;
}

/** Today's calendar date in Asia/Bangkok, the timezone the library schedule uses. */
export function bangkokDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** The closed day named in the backend message ("Library is closed on 2026-11-03: …"). */
export function closedDateKey(error: LayoutRequestError, fallback: string): string {
  return /closed on (\d{4}-\d{2}-\d{2})/.exec(error.message)?.[1] ?? fallback;
}

export function formatDayKey(key: string, withWeekday = false): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    ...(withWeekday ? { weekday: 'long' as const } : {}),
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOURS_IN_MESSAGE = /\((\d{2}:\d{2}) - \d{2}:\d{2}\)/;

export function addDays(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function quarterHourAt(key: string, hhmm: string): { startDateTime: string; endDateTime: string } {
  const start = new Date(`${key}T${hhmm}:00+07:00`);
  return {
    startDateTime: start.toISOString(),
    endDateTime: new Date(start.getTime() + 15 * 60_000).toISOString(),
  };
}

/**
 * The first day after `closedKey` that the library is open, checking at most
 * `maxDays` days ahead (the furthest the backend answers for). `load` is
 * fetchLayout; returns null if every reachable day is closed.
 */
export async function findReopenDay(
  closedKey: string,
  maxDays: number,
  load: (window: { startDateTime: string; endDateTime: string }) => Promise<unknown>
): Promise<string | null> {
  for (let offset = 1; offset <= maxDays; offset++) {
    const key = addDays(closedKey, offset);
    // Earliest slot first, then the day's own opening time if that is outside hours.
    let slot = '00:00';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await load(quarterHourAt(key, slot));
        return key;
      } catch (error) {
        if (!isLayoutRequestError(error)) throw error;
        const opensAt = HOURS_IN_MESSAGE.exec(error.message)?.[1];
        if (error.code === 'OUTSIDE_OPERATING_HOURS' && opensAt && attempt === 0) {
          slot = opensAt;
          continue;
        }
        if (error.code === 'LIBRARY_CLOSED') break;
        // Too far ahead, schedule errors, server failures: stop looking.
        return null;
      }
    }
  }
  return null;
}
