import { adminRequest } from './http';

// US7-4: the backend's OperatingSchedule rows for the admin System Settings
// page. Priority 1 is the regular timetable; anything higher
// (2 = exam period, 3 = holiday/closure) overrides it on the dates it covers.

const SCHEDULES_PATH = '/api/admin/schedules';
// The API returns at most 100 rows per request.
const MAX_API_PAGE_SIZE = 100;

export const REGULAR_PRIORITY = 1;

export interface OperatingSchedule {
  scheduleId: number;
  name: string;
  /** @db.Date serialized as UTC midnight, e.g. "2026-10-27T00:00:00.000Z". */
  startDate: string;
  endDate: string;
  openTime: string;
  closeTime: string;
  is24Hours: boolean;
  isClosed: boolean;
  priority: number;
}

export type SchedulePhase = 'current' | 'upcoming' | 'past';

export type HoursMode = 'standard' | '24h' | 'closed';

/** The editable form state; dates are "YYYY-MM-DD", times "HH:MM". */
export interface ScheduleDraft {
  name: string;
  priority: number;
  startDate: string;
  endDate: string;
  hoursMode: HoursMode;
  openTime: string;
  closeTime: string;
}

export interface SchedulePayload {
  name: string;
  priority: number;
  startDate: string;
  endDate: string;
  openTime: string;
  closeTime: string;
  is24Hours: boolean;
  isClosed: boolean;
}

export type ScheduleDraftErrors = Partial<Record<keyof ScheduleDraft, string>>;

/** Same limit as the backend's OperatingSchedule.name column. */
export const MAX_SCHEDULE_NAME_LENGTH = 100;

export const PRIORITY_OPTIONS = [1, 2, 3] as const;

async function listSchedulePage(
  page: number,
  signal?: AbortSignal
): Promise<{ schedules: OperatingSchedule[]; total: number }> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(MAX_API_PAGE_SIZE) });
  const { data, total } = await adminRequest<OperatingSchedule[]>(
    `${SCHEDULES_PATH}?${params}`,
    'schedules',
    { signal }
  );
  if (!Array.isArray(data)) throw new Error('schedules: unexpected list format');
  return { schedules: data, total: total ?? data.length };
}

/** Every saved schedule, across all pages. */
export async function listAllSchedules(signal?: AbortSignal): Promise<OperatingSchedule[]> {
  const first = await listSchedulePage(1, signal);
  const pageCount = Math.ceil(first.total / MAX_API_PAGE_SIZE);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => listSchedulePage(i + 2, signal))
  );
  // Drop duplicates in case a write shifted rows between page requests.
  const byId = new Map<number, OperatingSchedule>();
  for (const s of [first, ...rest].flatMap((p) => p.schedules)) byId.set(s.scheduleId, s);
  return [...byId.values()];
}

/**
 * The schedule in effect today (Asia/Bangkok), or null when none covers today
 * and bookings fall back to the backend's default hours. Throws on a 409 when
 * two schedules share the top priority.
 */
export async function fetchActiveSchedule(signal?: AbortSignal): Promise<OperatingSchedule | null> {
  const { data } = await adminRequest<OperatingSchedule | null>(
    `${SCHEDULES_PATH}/active`,
    'active schedule',
    { signal }
  );
  return data ?? null;
}

export async function createSchedule(payload: SchedulePayload): Promise<OperatingSchedule> {
  const { data } = await adminRequest<OperatingSchedule>(SCHEDULES_PATH, 'create schedule', {
    method: 'POST',
    body: payload,
  });
  if (!data) throw new Error('create schedule: empty response');
  return data;
}

export async function updateSchedule(
  scheduleId: number,
  payload: SchedulePayload
): Promise<OperatingSchedule> {
  const { data } = await adminRequest<OperatingSchedule>(
    `${SCHEDULES_PATH}/${scheduleId}`,
    'update schedule',
    { method: 'PATCH', body: payload }
  );
  if (!data) throw new Error('update schedule: empty response');
  return data;
}

export async function deleteSchedule(scheduleId: number): Promise<void> {
  await adminRequest<unknown>(`${SCHEDULES_PATH}/${scheduleId}`, 'delete schedule', {
    method: 'DELETE',
  });
}

/** "YYYY-MM-DD" of a @db.Date value. */
export function dateKey(value: string): string {
  return value.slice(0, 10);
}

/** Today's calendar date in Asia/Bangkok, the timezone the backend schedules use. */
export function todayKeyBangkok(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function schedulePhase(schedule: OperatingSchedule, todayKey: string): SchedulePhase {
  if (dateKey(schedule.endDate) < todayKey) return 'past';
  if (dateKey(schedule.startDate) > todayKey) return 'upcoming';
  return 'current';
}

export function priorityLabel(priority: number): string {
  if (priority === REGULAR_PRIORITY) return 'Regular';
  if (priority === 2) return 'Exam period';
  if (priority === 3) return 'Holiday / closure';
  return `Priority ${priority}`;
}

export function hoursLabel(schedule: OperatingSchedule): string {
  if (schedule.isClosed) return 'Closed';
  if (schedule.is24Hours) return 'Open 24 hours';
  return `${schedule.openTime}–${schedule.closeTime}`;
}

export function formatDateKey(key: string): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? key
    : new Intl.DateTimeFormat('en-GB', {
        timeZone: 'UTC',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(date);
}

export function dateRangeLabel(schedule: OperatingSchedule): string {
  const start = dateKey(schedule.startDate);
  const end = dateKey(schedule.endDate);
  return start === end ? formatDateKey(start) : `${formatDateKey(start)} – ${formatDateKey(end)}`;
}

const PHASE_ORDER: Record<SchedulePhase, number> = { current: 0, upcoming: 1, past: 2 };

/**
 * Splits schedules into the regular timetable and its exceptions. Each group
 * lists what is in effect now first, then upcoming (soonest first), then past
 * (most recent first).
 */
export function groupSchedules(
  schedules: OperatingSchedule[],
  todayKey: string
): { regular: OperatingSchedule[]; exceptions: OperatingSchedule[] } {
  const sorted = [...schedules].sort((a, b) => {
    const phaseA = schedulePhase(a, todayKey);
    const phaseB = schedulePhase(b, todayKey);
    if (phaseA !== phaseB) return PHASE_ORDER[phaseA] - PHASE_ORDER[phaseB];
    const byStart = dateKey(a.startDate).localeCompare(dateKey(b.startDate));
    if (byStart !== 0) return phaseA === 'past' ? -byStart : byStart;
    return a.scheduleId - b.scheduleId;
  });
  return {
    regular: sorted.filter((s) => s.priority === REGULAR_PRIORITY),
    exceptions: sorted.filter((s) => s.priority !== REGULAR_PRIORITY),
  };
}

const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

export function emptyScheduleDraft(priority: number, todayKey: string): ScheduleDraft {
  return {
    name: '',
    priority,
    startDate: todayKey,
    endDate: todayKey,
    hoursMode: priority === 3 ? 'closed' : 'standard',
    openTime: '08:00',
    closeTime: '21:00',
  };
}

export function draftFromSchedule(schedule: OperatingSchedule): ScheduleDraft {
  const hoursMode: HoursMode = schedule.isClosed
    ? 'closed'
    : schedule.is24Hours
      ? '24h'
      : 'standard';
  return {
    name: schedule.name,
    priority: schedule.priority,
    startDate: dateKey(schedule.startDate),
    endDate: dateKey(schedule.endDate),
    hoursMode,
    // Closed / 24-hour rows store placeholder times; offer the usual window if switched back.
    openTime: hoursMode === 'standard' ? schedule.openTime : '08:00',
    closeTime: hoursMode === 'standard' ? schedule.closeTime : '21:00',
  };
}

function minutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h! * 60 + m!;
}

/** Mirrors the backend's schedule checks so most mistakes never leave the form. */
export function validateScheduleDraft(draft: ScheduleDraft): ScheduleDraftErrors {
  const errors: ScheduleDraftErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'Enter a name.';
  else if (name.length > MAX_SCHEDULE_NAME_LENGTH) {
    errors.name = `Use ${MAX_SCHEDULE_NAME_LENGTH} characters or fewer.`;
  }

  if (!DATE_FORMAT.test(draft.startDate)) errors.startDate = 'Choose a start date.';
  if (!DATE_FORMAT.test(draft.endDate)) errors.endDate = 'Choose an end date.';
  else if (!errors.startDate && draft.endDate < draft.startDate) {
    errors.endDate = 'End date cannot be before the start date.';
  }

  if (draft.hoursMode === 'standard') {
    if (!TIME_FORMAT.test(draft.openTime)) errors.openTime = 'Enter an opening time.';
    if (!TIME_FORMAT.test(draft.closeTime)) errors.closeTime = 'Enter a closing time.';
    else if (!errors.openTime && minutes(draft.closeTime) <= minutes(draft.openTime)) {
      errors.closeTime = 'Closing time must be after opening time.';
    }
  }
  return errors;
}

export function payloadFromDraft(draft: ScheduleDraft): SchedulePayload {
  // Same placeholder times the backend itself stores for closed and 24-hour days.
  const [openTime, closeTime] =
    draft.hoursMode === 'closed'
      ? ['00:00', '00:00']
      : draft.hoursMode === '24h'
        ? ['00:00', '23:59']
        : [draft.openTime, draft.closeTime];
  return {
    name: draft.name.trim(),
    priority: draft.priority,
    startDate: draft.startDate,
    endDate: draft.endDate,
    openTime,
    closeTime,
    is24Hours: draft.hoursMode === '24h',
    isClosed: draft.hoursMode === 'closed',
  };
}
