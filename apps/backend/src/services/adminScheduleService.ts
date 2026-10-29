import { Prisma, PrismaClient, OperatingSchedule } from '@prisma/client';

const defaultPrisma = new PrismaClient();

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
// Full ISO 8601 instant: every time component and the timezone offset are range-checked.
const ISO_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/i;
const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Thailand has no DST, so Asia/Bangkok is always UTC+7 (same rule as ScheduleService). */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const MIN_YEAR = 1970;
const MAX_YEAR = 2100;
const MAX_PRISMA_INT = 2_147_483_647;
const MAX_NAME_LENGTH = 100;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

/**
 * Advisory-lock namespace for schedule writes. Writers of the same priority are serialized
 * so the "no overlapping schedules with the same priority" rule cannot be raced.
 */
const SCHEDULE_LOCK_NAMESPACE = 7401;

const SCHEDULE_FIELDS = [
  'name',
  'startDate',
  'endDate',
  'openTime',
  'closeTime',
  'is24Hours',
  'isClosed',
  'priority',
] as const;

type ScheduleField = (typeof SCHEDULE_FIELDS)[number];

export interface ParsedDateResult {
  date: Date;
  dateStr: string;
}

/** Request bodies are untrusted JSON, so every field is validated at runtime. */
export type CreateScheduleInput = Partial<Record<ScheduleField, unknown>> & Record<string, unknown>;
export type UpdateScheduleInput = Partial<Record<ScheduleField | 'scheduleId', unknown>> &
  Record<string, unknown>;

export interface ListSchedulesFilters {
  q?: string;
  startDate?: string;
  endDate?: string;
  priority?: unknown;
  isClosed?: boolean;
  is24Hours?: boolean;
  page?: unknown;
  pageSize?: unknown;
}

export interface ScheduleServiceError {
  status: number;
  code: string;
  message: string;
}

function scheduleError(status: number, code: string, message: string): ScheduleServiceError {
  return { status, code, message };
}

function invalidInput(message: string): ScheduleServiceError {
  return scheduleError(400, 'INVALID_SCHEDULE_INPUT', message);
}

function notFound(): ScheduleServiceError {
  return scheduleError(404, 'SCHEDULE_NOT_FOUND', 'Operating schedule not found');
}

function isValidCalendarDay(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ]!;
  return Number.isInteger(day) && day >= 1 && day <= daysInMonth;
}

/** "YYYY-MM-DD" of an instant as seen on a calendar in Asia/Bangkok. */
function bangkokDateKey(instantMs: number): string {
  return new Date(instantMs + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

function parseStrictInteger(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null;
  }
  if (typeof value === 'string' && /^[+-]?\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function assertPlainObject(input: unknown): asserts input is Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw invalidInput('Request body must be a JSON object');
  }
}

function rejectUnknownFields(input: Record<string, unknown>, allowed: readonly string[]): void {
  const unknownKeys = Object.keys(input).filter((key) => !allowed.includes(key));
  if (unknownKeys.length > 0) {
    throw invalidInput(`Unknown schedule field(s): ${unknownKeys.join(', ')}`);
  }
}

export class AdminScheduleService {
  /**
   * Helper to convert "HH:MM" 24-hour time string to minutes from midnight (0..1439).
   */
  static timeToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + (m || 0);
  }

  /**
   * Validate "HH:MM" 24-hour time format (00:00 - 23:59).
   */
  static isValidTimeFormat(timeStr: unknown): timeStr is string {
    return typeof timeStr === 'string' && TIME_FORMAT.test(timeStr);
  }

  /**
   * Today's calendar date ("YYYY-MM-DD") in Asia/Bangkok (UTC+7).
   * Used whenever the caller does not specify a date, so the active schedule follows Thai time
   * instead of the server's UTC date (which is still "yesterday" between 00:00 and 06:59 in Thailand).
   */
  static getTodayDateStringBangkok(referenceDate: Date = new Date()): string {
    return bangkokDateKey(referenceDate.getTime());
  }

  /**
   * Parse and validate a calendar date (YYYY-MM-DD or a full ISO 8601 instant with offset).
   *
   * - YYYY-MM-DD is taken as the calendar date itself (month, day-of-month and leap years checked).
   * - An ISO instant must have valid hours/minutes/seconds/offset and is converted to its
   *   Asia/Bangkok calendar date, matching how ScheduleService maps @db.Date columns to bookings
   *   (e.g. "2026-10-26T17:00:00.000Z" is 2026-10-27 in Bangkok).
   *
   * Returns the @db.Date value (UTC midnight of that calendar date) and "YYYY-MM-DD".
   */
  static parseCalendarDate(value: unknown): ParsedDateResult | null {
    let key: string;

    if (value instanceof Date) {
      if (!Number.isFinite(value.getTime())) return null;
      key = bangkokDateKey(value.getTime());
    } else if (typeof value === 'string') {
      const trimmed = value.trim();
      const dateOnly = ISO_DATE_ONLY.exec(trimmed);
      if (dateOnly) {
        key = trimmed;
      } else {
        const dateTime = ISO_DATETIME.exec(trimmed);
        if (!dateTime) return null;
        // Reject impossible literal dates (e.g. 2026-02-30T10:00:00Z) before Date() rolls them over.
        if (!isValidCalendarDay(Number(dateTime[1]), Number(dateTime[2]), Number(dateTime[3]))) {
          return null;
        }
        const instant = new Date(trimmed).getTime();
        if (!Number.isFinite(instant)) return null;
        key = bangkokDateKey(instant);
      }
    } else {
      return null;
    }

    const [year, month, day] = key.split('-').map(Number);
    if (!isValidCalendarDay(year!, month!, day!)) return null;

    return { date: new Date(`${key}T00:00:00.000Z`), dateStr: key };
  }

  private static parseName(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw invalidInput('Schedule name is required');
    }
    const trimmed = value.trim();
    if (trimmed.length > MAX_NAME_LENGTH) {
      throw invalidInput(`Schedule name must not exceed ${MAX_NAME_LENGTH} characters`);
    }
    return trimmed;
  }

  private static parseDateField(value: unknown, field: 'startDate' | 'endDate'): ParsedDateResult {
    const parsed = this.parseCalendarDate(value);
    if (!parsed) {
      throw invalidInput(
        `Invalid ${field} format. Expected YYYY-MM-DD or ISO 8601 with timezone offset`
      );
    }
    return parsed;
  }

  /** Booleans must be real JSON booleans: "false" or 0 must never be coerced. */
  private static parseFlag(value: unknown, field: 'is24Hours' | 'isClosed'): boolean {
    if (typeof value !== 'boolean') {
      throw invalidInput(`${field} must be a boolean (true or false)`);
    }
    return value;
  }

  private static parseTime(value: unknown, field: 'openTime' | 'closeTime'): string {
    if (!this.isValidTimeFormat(value)) {
      throw invalidInput(`Invalid ${field} format. Expected HH:MM (00:00 - 23:59)`);
    }
    return value;
  }

  /** Accepts a JSON integer or an integer string; rejects booleans, decimals and empty strings. */
  private static parsePriority(value: unknown): number {
    const priority = parseStrictInteger(value);
    if (priority === null || priority < 1 || priority > MAX_PRISMA_INT) {
      throw invalidInput('Priority must be a positive integer (e.g. 1=Normal, 2=Exam, 3=Holiday)');
    }
    return priority;
  }

  private static assertChronological(start: Date, end: Date): void {
    if (start.getTime() > end.getTime()) {
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);
      throw invalidInput(`startDate (${startStr}) cannot be after endDate (${endStr})`);
    }
  }

  private static assertFlagsAndHours(
    is24Hours: boolean,
    isClosed: boolean,
    openTime: string,
    closeTime: string
  ): void {
    if (is24Hours && isClosed) {
      throw invalidInput('Schedule cannot be both 24 hours and closed simultaneously');
    }
    // Closed days and 24-hour days do not use the opening window (same as ScheduleService).
    if (!is24Hours && !isClosed) {
      if (this.timeToMinutes(closeTime) <= this.timeToMinutes(openTime)) {
        throw invalidInput(
          `closeTime (${closeTime}) must be strictly after openTime (${openTime}) for standard hours`
        );
      }
    }
  }

  /**
   * Transaction-scoped advisory lock per priority.
   * - Both arguments are cast to integer: the two-argument overload is (integer, integer) and
   *   Prisma binds JS numbers as bigint, which fails with PostgreSQL 42883.
   * - The void result is cast to text because Prisma's $queryRaw cannot deserialize `void`
   *   (same pattern as SystemConfigService on main).
   */
  private static async lockPriority(tx: any, priority: number): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${SCHEDULE_LOCK_NAMESPACE}::integer, ${priority}::integer)::text`;
  }

  private static async assertNoSamePriorityOverlap(
    tx: any,
    priority: number,
    startDate: Date,
    endDate: Date,
    excludeScheduleId?: number
  ): Promise<void> {
    const conflicting = await tx.operatingSchedule.findFirst({
      where: {
        ...(excludeScheduleId !== undefined ? { scheduleId: { not: excludeScheduleId } } : {}),
        priority,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });

    if (conflicting) {
      throw scheduleError(
        409,
        'SCHEDULE_CONFLICT',
        `Conflicting schedule: "${conflicting.name}" already exists with the same priority (${priority}) covering this date range`
      );
    }
  }

  private static async runInTransaction<T>(
    prisma: PrismaClient,
    work: (tx: any) => Promise<T>
  ): Promise<T> {
    if (typeof (prisma as any).$transaction === 'function') {
      return await (prisma as any).$transaction(work);
    }
    return await work(prisma);
  }

  /**
   * Create a new library operating schedule with strict validation.
   * Uses interactive transaction with concurrency lock to prevent overlap race conditions.
   */
  static async createSchedule(
    input: CreateScheduleInput,
    prisma: PrismaClient = defaultPrisma
  ): Promise<OperatingSchedule> {
    assertPlainObject(input);
    rejectUnknownFields(input, SCHEDULE_FIELDS);

    // 1. Name
    const name = this.parseName(input.name);

    // 2. Dates
    const parsedStart = this.parseDateField(input.startDate, 'startDate');
    const parsedEnd = this.parseDateField(input.endDate, 'endDate');
    this.assertChronological(parsedStart.date, parsedEnd.date);

    // 3. Status flags (strict booleans)
    const is24Hours =
      input.is24Hours === undefined ? false : this.parseFlag(input.is24Hours, 'is24Hours');
    const isClosed =
      input.isClosed === undefined ? false : this.parseFlag(input.isClosed, 'isClosed');

    // 4. Times (defaults depend on the schedule type)
    const [defaultOpen, defaultClose] = isClosed
      ? ['00:00', '00:00']
      : is24Hours
        ? ['00:00', '23:59']
        : ['08:00', '21:00'];
    const openTime =
      input.openTime === undefined ? defaultOpen : this.parseTime(input.openTime, 'openTime');
    const closeTime =
      input.closeTime === undefined ? defaultClose : this.parseTime(input.closeTime, 'closeTime');
    this.assertFlagsAndHours(is24Hours, isClosed, openTime, closeTime);

    // 5. Priority
    const priority = input.priority === undefined ? 1 : this.parsePriority(input.priority);

    return await this.runInTransaction(prisma, async (tx) => {
      // 6. Serialize writers of this priority, then check for same-priority overlaps
      await this.lockPriority(tx, priority);
      await this.assertNoSamePriorityOverlap(tx, priority, parsedStart.date, parsedEnd.date);

      // 7. Persist schedule
      return await tx.operatingSchedule.create({
        data: {
          name,
          startDate: parsedStart.date,
          endDate: parsedEnd.date,
          openTime,
          closeTime,
          is24Hours,
          isClosed,
          priority,
        },
      });
    });
  }

  /**
   * Edit / Update an existing library operating schedule.
   * Performs partial updates by merging with existing data, validating the resulting state,
   * acquiring a row lock, and writing ONLY the fields that were provided in the request
   * to avoid overwriting concurrent updates to other fields.
   */
  static async updateSchedule(
    scheduleId: number,
    input: UpdateScheduleInput,
    prisma: PrismaClient = defaultPrisma
  ): Promise<OperatingSchedule> {
    if (!Number.isSafeInteger(scheduleId) || scheduleId < 1 || scheduleId > MAX_PRISMA_INT) {
      throw invalidInput('scheduleId must be a positive integer');
    }

    assertPlainObject(input);
    rejectUnknownFields(input, [...SCHEDULE_FIELDS, 'scheduleId']);

    if (input.scheduleId !== undefined && parseStrictInteger(input.scheduleId) !== scheduleId) {
      throw invalidInput('scheduleId in the body does not match the schedule being updated');
    }

    // Validate the format of every provided field before opening a transaction.
    const updateData: Prisma.OperatingScheduleUpdateInput = {};
    if (input.name !== undefined) updateData.name = this.parseName(input.name);
    if (input.startDate !== undefined) {
      updateData.startDate = this.parseDateField(input.startDate, 'startDate').date;
    }
    if (input.endDate !== undefined) {
      updateData.endDate = this.parseDateField(input.endDate, 'endDate').date;
    }
    if (input.openTime !== undefined) {
      updateData.openTime = this.parseTime(input.openTime, 'openTime');
    }
    if (input.closeTime !== undefined) {
      updateData.closeTime = this.parseTime(input.closeTime, 'closeTime');
    }
    if (input.is24Hours !== undefined) {
      updateData.is24Hours = this.parseFlag(input.is24Hours, 'is24Hours');
    }
    if (input.isClosed !== undefined) {
      updateData.isClosed = this.parseFlag(input.isClosed, 'isClosed');
    }
    if (input.priority !== undefined) updateData.priority = this.parsePriority(input.priority);

    if (Object.keys(updateData).length === 0) {
      throw invalidInput('At least one schedule field must be provided');
    }

    return await this.runInTransaction(prisma, async (tx) => {
      // 1. Row-level lock so concurrent edits of this schedule are applied one at a time
      await tx.$queryRaw`SELECT schedule_id FROM operating_schedule WHERE schedule_id = ${scheduleId}::integer FOR UPDATE`;

      const existing: OperatingSchedule | null = await tx.operatingSchedule.findUnique({
        where: { scheduleId },
      });
      if (!existing) {
        throw notFound();
      }

      // 2. Validate the merged (resulting) state against the freshly locked row
      const effectiveStart = (updateData.startDate as Date | undefined) ?? existing.startDate;
      const effectiveEnd = (updateData.endDate as Date | undefined) ?? existing.endDate;
      this.assertChronological(effectiveStart, effectiveEnd);

      this.assertFlagsAndHours(
        (updateData.is24Hours as boolean | undefined) ?? existing.is24Hours,
        (updateData.isClosed as boolean | undefined) ?? existing.isClosed,
        (updateData.openTime as string | undefined) ?? existing.openTime,
        (updateData.closeTime as string | undefined) ?? existing.closeTime
      );

      // 3. Same-priority overlap check against other schedules (serialized per priority)
      const effectivePriority = (updateData.priority as number | undefined) ?? existing.priority;
      await this.lockPriority(tx, effectivePriority);
      await this.assertNoSamePriorityOverlap(
        tx,
        effectivePriority,
        effectiveStart,
        effectiveEnd,
        scheduleId
      );

      // 4. Update only the fields provided in the request
      return await tx.operatingSchedule.update({
        where: { scheduleId },
        data: updateData,
      });
    });
  }

  /**
   * Get single schedule by ID.
   */
  static async getScheduleById(
    scheduleId: number,
    prisma: PrismaClient = defaultPrisma
  ): Promise<OperatingSchedule> {
    if (!Number.isSafeInteger(scheduleId) || scheduleId < 1 || scheduleId > MAX_PRISMA_INT) {
      throw invalidInput('scheduleId must be a positive integer');
    }

    const schedule = await prisma.operatingSchedule.findUnique({
      where: { scheduleId },
    });

    if (!schedule) {
      throw notFound();
    }

    return schedule;
  }

  /**
   * List schedules with optional filters and sorting.
   * Invalid filters are rejected with 400 instead of being silently ignored.
   */
  static async listSchedules(
    filters: ListSchedulesFilters = {},
    prisma: PrismaClient = defaultPrisma
  ): Promise<{ schedules: OperatingSchedule[]; total: number }> {
    const where: Prisma.OperatingScheduleWhereInput = {};

    if (filters.q !== undefined && filters.q.trim().length > 0) {
      where.name = { contains: filters.q.trim(), mode: 'insensitive' };
    }

    // Overlap semantics: schedules that are effective on any day within [startDate, endDate]
    if (filters.startDate !== undefined) {
      where.endDate = { gte: this.parseDateField(filters.startDate, 'startDate').date };
    }
    if (filters.endDate !== undefined) {
      where.startDate = { lte: this.parseDateField(filters.endDate, 'endDate').date };
    }

    if (filters.priority !== undefined) {
      where.priority = this.parsePriority(filters.priority);
    }
    if (filters.isClosed !== undefined) {
      where.isClosed = filters.isClosed;
    }
    if (filters.is24Hours !== undefined) {
      where.is24Hours = filters.is24Hours;
    }

    const page = filters.page === undefined ? 1 : parseStrictInteger(filters.page);
    if (page === null || page < 1) {
      throw invalidInput('page must be a positive integer');
    }
    const pageSize =
      filters.pageSize === undefined ? DEFAULT_PAGE_SIZE : parseStrictInteger(filters.pageSize);
    if (pageSize === null || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw invalidInput(`pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}`);
    }

    const [schedules, total] = await Promise.all([
      prisma.operatingSchedule.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { startDate: 'asc' }, { scheduleId: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.operatingSchedule.count({ where }),
    ]);

    return { schedules, total };
  }

  /**
   * Delete schedule by ID.
   */
  static async deleteSchedule(
    scheduleId: number,
    prisma: PrismaClient = defaultPrisma
  ): Promise<OperatingSchedule> {
    if (!Number.isSafeInteger(scheduleId) || scheduleId < 1 || scheduleId > MAX_PRISMA_INT) {
      throw invalidInput('scheduleId must be a positive integer');
    }

    const existing = await prisma.operatingSchedule.findUnique({
      where: { scheduleId },
    });

    if (!existing) {
      throw notFound();
    }

    try {
      return await prisma.operatingSchedule.delete({
        where: { scheduleId },
      });
    } catch (error: any) {
      // Deleted by another request between the lookup and the delete
      if (error?.code === 'P2025') throw notFound();
      throw error;
    }
  }

  /**
   * Determine the effective active schedule on a specific target date,
   * respecting the priority hierarchy (Holiday/Closed (3) > Exam 24h (2) > Regular (1)).
   * If targetDate is not provided or null, defaults to today in Bangkok time (Asia/Bangkok, UTC+7).
   * Returns null when no saved schedule covers the date (bookings then use the default regular hours).
   */
  static async getActiveScheduleOnDate(
    targetDate?: Date | string | null,
    prisma: PrismaClient = defaultPrisma
  ): Promise<OperatingSchedule | null> {
    const effectiveDate =
      targetDate === undefined ||
      targetDate === null ||
      (typeof targetDate === 'string' && targetDate.trim() === '')
        ? this.getTodayDateStringBangkok()
        : targetDate;

    const parsed = this.parseCalendarDate(effectiveDate);
    if (!parsed) {
      throw invalidInput('Invalid date. Expected YYYY-MM-DD or ISO 8601 with timezone offset');
    }

    const schedules = await prisma.operatingSchedule.findMany({
      where: {
        startDate: { lte: parsed.date },
        endDate: { gte: parsed.date },
      },
      orderBy: [{ priority: 'desc' }, { scheduleId: 'asc' }],
      take: 2,
    });

    const [top, runnerUp] = schedules;
    if (top && runnerUp && top.priority === runnerUp.priority) {
      // Same rule as ScheduleService: two schedules at the top priority are ambiguous.
      throw scheduleError(
        409,
        'SCHEDULE_CONFLICT',
        `Multiple schedules have the same effective priority (${top.priority}) on ${parsed.dateStr}`
      );
    }

    return top ?? null;
  }
}
