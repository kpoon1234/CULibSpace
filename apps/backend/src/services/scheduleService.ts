import { PrismaClient, type Prisma } from '@prisma/client';
import {
  BOOKING_POLICY_FIELDS,
  bookingRulesError,
  readBookingPolicy,
  type BookingPolicy,
  type PolicyClient,
} from './bookingPolicyService.js';

const prisma = new PrismaClient();
const DAY_MS = 86_400_000;
const BANGKOK_OFFSET_MS = 7 * 60 * 60_000;
type ScheduleClient = PolicyClient & {
  operatingSchedule: Pick<Prisma.TransactionClient['operatingSchedule'], 'findMany'>;
};
type ScheduleSummary = {
  name: string;
  openTime: string;
  closeTime: string;
  is24Hours: boolean;
  isClosed: boolean;
  priority: number;
};
type SavedSchedule = ScheduleSummary & { scheduleId: number; startDate: Date; endDate: Date };
export interface TimeWindowValidationResult {
  targetStart: Date;
  targetEnd: Date;
  schedule: ScheduleSummary;
  config: { maxAdvanceBookingDays: number; maxBookingDurationMinutes: number };
  // Optional so existing consumers/mocks of the original response remain compatible.
  policy?: BookingPolicy;
  scheduleSegments?: { date: string; schedule: ScheduleSummary }[];
}
export interface ParseTimeWindowInput {
  startDateTime?: string;
  endDateTime?: string;
  date?: string;
  timeSlot?: string;
}

function badWindow(message: string): never {
  throw bookingRulesError('INVALID_TIME_WINDOW', message, 400);
}
function localMidnight(instant: number): number {
  return Math.floor((instant + BANGKOK_OFFSET_MS) / DAY_MS) * DAY_MS - BANGKOK_OFFSET_MS;
}
function localDateKey(instant: number): string {
  return new Date(instant + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}
function dateColumn(key: string): Date {
  const value = new Date(`${key}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(key) ||
    !Number.isFinite(value.getTime()) ||
    value.toISOString().slice(0, 10) !== key
  ) {
    badWindow('Invalid calendar date.');
  }
  return value;
}
function isoInstant(input: string): Date {
  if (
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/i.test(
      input
    )
  ) {
    badWindow('startDateTime and endDateTime must include a timezone offset.');
  }
  dateColumn(input.slice(0, 10));
  const value = new Date(input);
  if (!Number.isFinite(value.getTime())) badWindow('Invalid startDateTime or endDateTime format');
  return value;
}

export class ScheduleService {
  static timeToMinutes(timeStr: string): number {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(timeStr)) {
      throw bookingRulesError(
        'SCHEDULE_CONFIGURATION_INVALID',
        'The saved schedule contains an invalid time.'
      );
    }
    const [hour, minute] = timeStr.split(':').map(Number);
    return hour! * 60 + minute!;
  }

  /** ISO instants include an offset; date/timeSlot always means Asia/Bangkok. */
  static parseTargetTimeWindow(input: ParseTimeWindowInput, now = new Date()) {
    const hasStart = input.startDateTime !== undefined;
    const hasEnd = input.endDateTime !== undefined;
    if (hasStart || hasEnd) {
      if (!hasStart || !hasEnd) badWindow('Both startDateTime and endDateTime are required.');
      return {
        targetStart: isoInstant(input.startDateTime!),
        targetEnd: isoInstant(input.endDateTime!),
        isExplicit: true,
      };
    }
    if (input.date !== undefined) {
      const key = input.date.trim();
      dateColumn(key);
      const slot = input.timeSlot?.trim();
      if (slot && !/^(?:[01]\d|2[0-3]):[0-5]\d(?:\s*-\s*(?:[01]\d|2[0-3]):[0-5]\d)?$/.test(slot)) {
        badWindow('Invalid timeSlot. Use HH:MM or HH:MM-HH:MM.');
      }
      const [start, end] = slot?.split('-').map((time) => time.trim()) ?? [];
      const hour = new Date(now.getTime() + BANGKOK_OFFSET_MS).getUTCHours();
      const startTime = start ?? `${String(hour).padStart(2, '0')}:00`;
      const targetStart = new Date(`${key}T${startTime}:00+07:00`);
      const targetEnd = end
        ? new Date(`${key}T${end}:00+07:00`)
        : new Date(targetStart.getTime() + 60 * 60_000);
      return { targetStart, targetEnd, isExplicit: true };
    }
    if (input.timeSlot !== undefined) badWindow('date is required with timeSlot.');
    return {
      targetStart: now,
      targetEnd: new Date(now.getTime() + 60 * 60_000),
      isExplicit: false,
    };
  }

  static async validateTargetTimeWindow(
    targetStart: Date,
    targetEnd: Date,
    isExplicit = true,
    client: ScheduleClient = prisma,
    options: { now?: Date; policy?: BookingPolicy } = {}
  ): Promise<TimeWindowValidationResult> {
    const now = options.now ?? new Date();
    const startMs = targetStart.getTime(),
      endMs = targetEnd.getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs))
      badWindow('Invalid startDateTime or endDateTime format');
    if (endMs <= startMs) badWindow('endDateTime must be after startDateTime');
    if (startMs < now.getTime() - 5 * 60_000) badWindow('Cannot request status for past dates');

    const policy = options.policy ?? (await readBookingPolicy(client, BOOKING_POLICY_FIELDS));
    if (isExplicit) {
      // Preserve the existing rolling-day definition; both server and UI must use it.
      if (startMs > now.getTime() + policy.maxAdvanceBookingDays * DAY_MS) {
        throw bookingRulesError(
          'BOOKING_TOO_FAR_IN_ADVANCE',
          `Target date exceeds maximum advance booking limit of ${policy.maxAdvanceBookingDays} days`,
          400
        );
      }
      if (endMs - startMs > policy.maxBookingDurationMinutes * 60_000) {
        throw bookingRulesError(
          'BOOKING_DURATION_EXCEEDED',
          `Requested duration exceeds maximum allowed duration of ${policy.maxBookingDurationMinutes} minutes`,
          400
        );
      }
    }

    // @db.Date is a calendar date at UTC midnight, not a server-local instant.
    const firstKey = localDateKey(startMs),
      lastKey = localDateKey(endMs - 1);
    let schedules: SavedSchedule[];
    try {
      schedules = await client.operatingSchedule.findMany({
        where: { startDate: { lte: dateColumn(lastKey) }, endDate: { gte: dateColumn(firstKey) } },
        orderBy: [{ priority: 'desc' }, { scheduleId: 'asc' }],
        select: {
          scheduleId: true,
          name: true,
          startDate: true,
          endDate: true,
          openTime: true,
          closeTime: true,
          is24Hours: true,
          isClosed: true,
          priority: true,
        },
      });
    } catch {
      throw bookingRulesError(
        'BOOKING_SETTINGS_UNAVAILABLE',
        'Operating schedules are temporarily unavailable.'
      );
    }
    for (const row of schedules) {
      if (
        !Number.isInteger(row.priority) ||
        row.priority < 1 ||
        !Number.isFinite(row.startDate.getTime()) ||
        !Number.isFinite(row.endDate.getTime()) ||
        row.endDate < row.startDate
      ) {
        throw bookingRulesError('SCHEDULE_CONFIGURATION_INVALID', 'The saved schedule is invalid.');
      }
    }

    const segments: NonNullable<TimeWindowValidationResult['scheduleSegments']> = [];
    for (let day = localMidnight(startMs); day < endMs; day += DAY_MS) {
      const key = localDateKey(day);
      const matches = schedules.filter(
        (row) =>
          row.startDate.toISOString().slice(0, 10) <= key &&
          row.endDate.toISOString().slice(0, 10) >= key
      );
      const priority = matches.reduce((highest, row) => Math.max(highest, row.priority), 0);
      const top = matches.filter((row) => row.priority === priority);
      if (top.length > 1) {
        throw bookingRulesError(
          'SCHEDULE_CONFLICT',
          'Multiple schedules have the same effective priority. Please contact the library.'
        );
      }
      // Retain the existing missing-day default until the team's policy is confirmed.
      const selected: ScheduleSummary = top[0] ?? {
        name: 'เวลาทำการปกติ (Default Regular Hours)',
        openTime: '08:00',
        closeTime: '21:00',
        is24Hours: false,
        isClosed: false,
        priority: 1,
      };
      const schedule: ScheduleSummary = {
        name: selected.name,
        openTime: selected.openTime,
        closeTime: selected.closeTime,
        is24Hours: selected.is24Hours,
        isClosed: selected.isClosed,
        priority: selected.priority,
      };
      if (schedule.isClosed) {
        throw bookingRulesError(
          'LIBRARY_CLOSED',
          `Library is closed on ${key}: ${schedule.name}`,
          400
        );
      }
      if (!schedule.is24Hours) {
        const open = ScheduleService.timeToMinutes(schedule.openTime);
        const close = ScheduleService.timeToMinutes(schedule.closeTime);
        if (close <= open)
          throw bookingRulesError(
            'SCHEDULE_CONFIGURATION_INVALID',
            'The saved opening window is invalid.'
          );
        // Browsing an implicit layout outside opening hours is not a booking.
        if (
          isExplicit &&
          (Math.max(startMs, day) < day + open * 60_000 ||
            Math.min(endMs, day + DAY_MS) > day + close * 60_000)
        ) {
          throw bookingRulesError(
            'OUTSIDE_OPERATING_HOURS',
            `Requested time is outside library operating hours (${schedule.openTime} - ${schedule.closeTime}) on ${key}`,
            400
          );
        }
      }
      segments.push({ date: key, schedule });
    }
    return {
      targetStart,
      targetEnd,
      schedule: segments[0]!.schedule,
      config: {
        maxAdvanceBookingDays: policy.maxAdvanceBookingDays,
        maxBookingDurationMinutes: policy.maxBookingDurationMinutes,
      },
      policy,
      scheduleSegments: segments,
    };
  }
}
