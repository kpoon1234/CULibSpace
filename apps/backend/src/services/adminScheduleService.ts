import { Prisma, PrismaClient, OperatingSchedule } from '@prisma/client';

const defaultPrisma = new PrismaClient();

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface ParsedDateResult {
  date: Date;
  dateStr: string;
}

export interface CreateScheduleInput {
  name: string;
  startDate: string;
  endDate: string;
  openTime?: string;
  closeTime?: string;
  is24Hours?: boolean;
  isClosed?: boolean;
  priority?: number;
}

export interface UpdateScheduleInput {
  name?: string;
  startDate?: string;
  endDate?: string;
  openTime?: string;
  closeTime?: string;
  is24Hours?: boolean;
  isClosed?: boolean;
  priority?: number;
}

export interface ListSchedulesFilters {
  q?: string;
  startDate?: string;
  endDate?: string;
  priority?: number;
  isClosed?: boolean;
  is24Hours?: boolean;
  page?: number;
  pageSize?: number;
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
   * Parse and validate a calendar date string (YYYY-MM-DD or full ISO 8601).
   * Validates month (1-12), day according to days in month (including leap year rules),
   * and returns a normalized UTC Date at midnight (00:00:00.000Z) along with "YYYY-MM-DD".
   */
  static parseCalendarDate(value: unknown): ParsedDateResult | null {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      const y = value.getUTCFullYear();
      const m = value.getUTCMonth() + 1;
      const d = value.getUTCDate();
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return { date: new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)), dateStr };
    }

    if (typeof value !== 'string') return null;

    let yearStr = '';
    let monthStr = '';
    let dayStr = '';

    const dateOnlyMatch = ISO_DATE_ONLY.exec(value.trim());
    if (dateOnlyMatch) {
      [, yearStr, monthStr, dayStr] = dateOnlyMatch;
    } else {
      const dateTimeMatch = ISO_DATETIME.exec(value.trim());
      if (dateTimeMatch) {
        [, yearStr, monthStr, dayStr] = dateTimeMatch;
      } else {
        return null;
      }
    }

    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);

    if (year < 1970 || year > 2100) return null;
    if (month < 1 || month > 12) return null;

    const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
      month - 1
    ];

    if (day < 1 || day > daysInMonth) return null;

    const normalizedDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    return { date: normalizedDate, dateStr };
  }

  /**
   * Create a new library operating schedule with strict validation.
   * Uses interactive transaction with concurrency lock to prevent overlap race conditions.
   */
  static async createSchedule(
    input: CreateScheduleInput,
    prisma: PrismaClient = defaultPrisma
  ): Promise<OperatingSchedule> {
    // 1. Name validation
    if (typeof input.name !== 'string' || input.name.trim().length === 0) {
      throw { status: 400, message: 'Schedule name is required' };
    }
    const trimmedName = input.name.trim();
    if (trimmedName.length > 100) {
      throw { status: 400, message: 'Schedule name must not exceed 100 characters' };
    }

    // 2. Date validation
    const parsedStart = this.parseCalendarDate(input.startDate);
    if (!parsedStart) {
      throw { status: 400, message: 'Invalid startDate format. Expected YYYY-MM-DD or ISO 8601' };
    }

    const parsedEnd = this.parseCalendarDate(input.endDate);
    if (!parsedEnd) {
      throw { status: 400, message: 'Invalid endDate format. Expected YYYY-MM-DD or ISO 8601' };
    }

    if (parsedStart.date.getTime() > parsedEnd.date.getTime()) {
      throw {
        status: 400,
        message: `startDate (${parsedStart.dateStr}) cannot be after endDate (${parsedEnd.dateStr})`,
      };
    }

    // 3. Status flags validation
    const is24Hours = Boolean(input.is24Hours);
    const isClosed = Boolean(input.isClosed);

    if (is24Hours && isClosed) {
      throw { status: 400, message: 'Schedule cannot be both 24 hours and closed simultaneously' };
    }

    // 4. Time format & chronological validation
    let openTime = input.openTime ?? '08:00';
    let closeTime = input.closeTime ?? '21:00';

    if (isClosed) {
      openTime = input.openTime ?? '00:00';
      closeTime = input.closeTime ?? '00:00';
      if (!this.isValidTimeFormat(openTime)) {
        throw { status: 400, message: 'Invalid openTime format. Expected HH:MM' };
      }
      if (!this.isValidTimeFormat(closeTime)) {
        throw { status: 400, message: 'Invalid closeTime format. Expected HH:MM' };
      }
    } else if (is24Hours) {
      openTime = input.openTime ?? '00:00';
      closeTime = input.closeTime ?? '23:59';
      if (!this.isValidTimeFormat(openTime)) {
        throw { status: 400, message: 'Invalid openTime format. Expected HH:MM' };
      }
      if (!this.isValidTimeFormat(closeTime)) {
        throw { status: 400, message: 'Invalid closeTime format. Expected HH:MM' };
      }
    } else {
      if (!this.isValidTimeFormat(openTime)) {
        throw { status: 400, message: 'Invalid openTime format. Expected HH:MM (00:00 - 23:59)' };
      }
      if (!this.isValidTimeFormat(closeTime)) {
        throw { status: 400, message: 'Invalid closeTime format. Expected HH:MM (00:00 - 23:59)' };
      }

      const openMinutes = this.timeToMinutes(openTime);
      const closeMinutes = this.timeToMinutes(closeTime);
      if (closeMinutes <= openMinutes) {
        throw {
          status: 400,
          message: `closeTime (${closeTime}) must be strictly after openTime (${openTime}) for standard hours`,
        };
      }
    }

    // 5. Priority validation
    let priority = input.priority !== undefined ? Number(input.priority) : 1;
    if (!Number.isSafeInteger(priority) || priority < 1) {
      throw {
        status: 400,
        message: 'Priority must be a positive integer (e.g. 1=Normal, 2=Exam, 3=Holiday)',
      };
    }

    const runInTx = async (tx: any) => {
      // Advisory transaction lock by priority to serialize concurrent overlap checks for the same priority
      // NOTE: pg_advisory_xact_lock(int, int) requires both params as integer.
      // Prisma $executeRaw sends JS numbers as bigint which triggers PostgreSQL error 42883.
      // Using Prisma.sql with ::integer cast ensures correct type for the two-param overload.
      if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7401, ${priority}::integer);`;
      } else if (typeof tx.$executeRawUnsafe === 'function') {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(7401, ${priority}::integer);`);
      }

      // 6. Same-priority overlap check to prevent ambiguous schedule precedence
      const conflicting = await tx.operatingSchedule.findFirst({
        where: {
          priority,
          startDate: { lte: parsedEnd.date },
          endDate: { gte: parsedStart.date },
        },
      });

      if (conflicting) {
        throw {
          status: 409,
          message: `Conflicting schedule: "${conflicting.name}" already exists with the same priority (${priority}) covering this date range`,
        };
      }

      // 7. Persist schedule
      return await tx.operatingSchedule.create({
        data: {
          name: trimmedName,
          startDate: parsedStart.date,
          endDate: parsedEnd.date,
          openTime,
          closeTime,
          is24Hours,
          isClosed,
          priority,
        },
      });
    };

    if (typeof (prisma as any).$transaction === 'function') {
      return await (prisma as any).$transaction(runInTx);
    }
    return await runInTx(prisma);
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
    if (!Number.isSafeInteger(scheduleId) || scheduleId < 1) {
      throw { status: 400, message: 'scheduleId must be a positive integer' };
    }

    const runInTx = async (tx: any) => {
      // 1. Acquire row-level lock on the target schedule to prevent concurrent update races
      if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT schedule_id FROM operating_schedule WHERE schedule_id = ${scheduleId} FOR UPDATE;`;
      } else if (typeof tx.$executeRawUnsafe === 'function') {
        await tx.$executeRawUnsafe(
          `SELECT schedule_id FROM operating_schedule WHERE schedule_id = ${scheduleId} FOR UPDATE;`
        );
      }

      const existing = await tx.operatingSchedule.findUnique({
        where: { scheduleId },
      });

      if (!existing) {
        throw { status: 404, message: 'Operating schedule not found' };
      }

      const updateData: Prisma.OperatingScheduleUpdateInput = {};

      // 1. Name validation
      let effectiveName = existing.name;
      if (input.name !== undefined) {
        if (typeof input.name !== 'string' || input.name.trim().length === 0) {
          throw { status: 400, message: 'Schedule name cannot be empty' };
        }
        effectiveName = input.name.trim();
        if (effectiveName.length > 100) {
          throw { status: 400, message: 'Schedule name must not exceed 100 characters' };
        }
        updateData.name = effectiveName;
      }

      // 2. Dates validation
      let effectiveStartDate = existing.startDate;
      let effectiveEndDate = existing.endDate;

      if (input.startDate !== undefined) {
        const parsedStart = this.parseCalendarDate(input.startDate);
        if (!parsedStart) {
          throw {
            status: 400,
            message: 'Invalid startDate format. Expected YYYY-MM-DD or ISO 8601',
          };
        }
        effectiveStartDate = parsedStart.date;
        updateData.startDate = effectiveStartDate;
      }

      if (input.endDate !== undefined) {
        const parsedEnd = this.parseCalendarDate(input.endDate);
        if (!parsedEnd) {
          throw { status: 400, message: 'Invalid endDate format. Expected YYYY-MM-DD or ISO 8601' };
        }
        effectiveEndDate = parsedEnd.date;
        updateData.endDate = effectiveEndDate;
      }

      if (effectiveStartDate.getTime() > effectiveEndDate.getTime()) {
        const startStr = effectiveStartDate.toISOString().slice(0, 10);
        const endStr = effectiveEndDate.toISOString().slice(0, 10);
        throw {
          status: 400,
          message: `startDate (${startStr}) cannot be after endDate (${endStr})`,
        };
      }

      // 3. Flags validation
      const effectiveIs24Hours =
        input.is24Hours !== undefined ? Boolean(input.is24Hours) : existing.is24Hours;
      const effectiveIsClosed =
        input.isClosed !== undefined ? Boolean(input.isClosed) : existing.isClosed;

      if (effectiveIs24Hours && effectiveIsClosed) {
        throw {
          status: 400,
          message: 'Schedule cannot be both 24 hours and closed simultaneously',
        };
      }

      if (input.is24Hours !== undefined) {
        updateData.is24Hours = effectiveIs24Hours;
      }
      if (input.isClosed !== undefined) {
        updateData.isClosed = effectiveIsClosed;
      }

      // 4. Time format & chronological validation
      let effectiveOpenTime = input.openTime !== undefined ? input.openTime : existing.openTime;
      let effectiveCloseTime = input.closeTime !== undefined ? input.closeTime : existing.closeTime;

      if (effectiveIsClosed) {
        if (input.openTime !== undefined) {
          if (!this.isValidTimeFormat(effectiveOpenTime)) {
            throw { status: 400, message: 'Invalid openTime format. Expected HH:MM' };
          }
          updateData.openTime = effectiveOpenTime;
        }
        if (input.closeTime !== undefined) {
          if (!this.isValidTimeFormat(effectiveCloseTime)) {
            throw { status: 400, message: 'Invalid closeTime format. Expected HH:MM' };
          }
          updateData.closeTime = effectiveCloseTime;
        }
      } else if (effectiveIs24Hours) {
        if (input.openTime !== undefined) {
          if (!this.isValidTimeFormat(effectiveOpenTime)) {
            throw { status: 400, message: 'Invalid openTime format. Expected HH:MM' };
          }
          updateData.openTime = effectiveOpenTime;
        }
        if (input.closeTime !== undefined) {
          if (!this.isValidTimeFormat(effectiveCloseTime)) {
            throw { status: 400, message: 'Invalid closeTime format. Expected HH:MM' };
          }
          updateData.closeTime = effectiveCloseTime;
        }
      } else {
        if (input.openTime !== undefined) {
          if (!this.isValidTimeFormat(effectiveOpenTime)) {
            throw {
              status: 400,
              message: 'Invalid openTime format. Expected HH:MM (00:00 - 23:59)',
            };
          }
          updateData.openTime = effectiveOpenTime;
        }
        if (input.closeTime !== undefined) {
          if (!this.isValidTimeFormat(effectiveCloseTime)) {
            throw {
              status: 400,
              message: 'Invalid closeTime format. Expected HH:MM (00:00 - 23:59)',
            };
          }
          updateData.closeTime = effectiveCloseTime;
        }

        const openMinutes = this.timeToMinutes(effectiveOpenTime);
        const closeMinutes = this.timeToMinutes(effectiveCloseTime);
        if (closeMinutes <= openMinutes) {
          throw {
            status: 400,
            message: `closeTime (${effectiveCloseTime}) must be strictly after openTime (${effectiveOpenTime}) for standard hours`,
          };
        }
      }

      // 5. Priority validation
      let effectivePriority = existing.priority;
      if (input.priority !== undefined) {
        effectivePriority = Number(input.priority);
        if (!Number.isSafeInteger(effectivePriority) || effectivePriority < 1) {
          throw { status: 400, message: 'Priority must be a positive integer' };
        }
        updateData.priority = effectivePriority;
      }

      // 6. Same-priority overlap check against other schedules
      // NOTE: ::integer cast required — see note in createSchedule advisory lock above.
      if (typeof tx.$executeRaw === 'function') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7401, ${effectivePriority}::integer);`;
      } else if (typeof tx.$executeRawUnsafe === 'function') {
        await tx.$executeRawUnsafe(
          `SELECT pg_advisory_xact_lock(7401, ${effectivePriority}::integer);`
        );
      }

      const conflicting = await tx.operatingSchedule.findFirst({
        where: {
          scheduleId: { not: scheduleId },
          priority: effectivePriority,
          startDate: { lte: effectiveEndDate },
          endDate: { gte: effectiveStartDate },
        },
      });

      if (conflicting) {
        throw {
          status: 409,
          message: `Conflicting schedule: "${conflicting.name}" already exists with the same priority (${effectivePriority}) covering this date range`,
        };
      }

      // If no fields changed, return existing
      if (Object.keys(updateData).length === 0) {
        return existing;
      }

      // 7. Update only the fields provided in the request
      return await tx.operatingSchedule.update({
        where: { scheduleId },
        data: updateData,
      });
    };

    if (typeof (prisma as any).$transaction === 'function') {
      return await (prisma as any).$transaction(runInTx);
    }
    return await runInTx(prisma);
  }

  /**
   * Get single schedule by ID.
   */
  static async getScheduleById(
    scheduleId: number,
    prisma: PrismaClient = defaultPrisma
  ): Promise<OperatingSchedule> {
    if (!Number.isSafeInteger(scheduleId) || scheduleId < 1) {
      throw { status: 400, message: 'scheduleId must be a positive integer' };
    }

    const schedule = await prisma.operatingSchedule.findUnique({
      where: { scheduleId },
    });

    if (!schedule) {
      throw { status: 404, message: 'Operating schedule not found' };
    }

    return schedule;
  }

  /**
   * List schedules with optional filters and sorting.
   */
  static async listSchedules(
    filters: ListSchedulesFilters = {},
    prisma: PrismaClient = defaultPrisma
  ): Promise<{ schedules: OperatingSchedule[]; total: number }> {
    const where: Prisma.OperatingScheduleWhereInput = {};

    if (filters.q && filters.q.trim().length > 0) {
      where.name = { contains: filters.q.trim(), mode: 'insensitive' };
    }

    if (filters.startDate) {
      const parsed = this.parseCalendarDate(filters.startDate);
      if (parsed) {
        where.endDate = { gte: parsed.date };
      }
    }

    if (filters.endDate) {
      const parsed = this.parseCalendarDate(filters.endDate);
      if (parsed) {
        where.startDate = { lte: parsed.date };
      }
    }

    if (filters.priority !== undefined) {
      const p = Number(filters.priority);
      if (Number.isSafeInteger(p) && p >= 1) {
        where.priority = p;
      }
    }

    if (filters.isClosed !== undefined) {
      where.isClosed = Boolean(filters.isClosed);
    }

    if (filters.is24Hours !== undefined) {
      where.is24Hours = Boolean(filters.is24Hours);
    }

    const page = filters.page && filters.page >= 1 ? filters.page : 1;
    const pageSize =
      filters.pageSize && filters.pageSize >= 1 ? Math.min(filters.pageSize, 100) : 50;

    const [schedules, total] = await Promise.all([
      prisma.operatingSchedule.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { startDate: 'asc' }],
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
    if (!Number.isSafeInteger(scheduleId) || scheduleId < 1) {
      throw { status: 400, message: 'scheduleId must be a positive integer' };
    }

    const existing = await prisma.operatingSchedule.findUnique({
      where: { scheduleId },
    });

    if (!existing) {
      throw { status: 404, message: 'Operating schedule not found' };
    }

    return await prisma.operatingSchedule.delete({
      where: { scheduleId },
    });
  }

  /**
   * Determine the effective active schedule on a specific target date,
   * respecting the priority hierarchy (Holiday/Closed (3) > Exam 24h (2) > Regular (1)).
   */
  static async getActiveScheduleOnDate(
    targetDate: Date | string,
    prisma: PrismaClient = defaultPrisma
  ): Promise<OperatingSchedule | null> {
    const parsed = this.parseCalendarDate(targetDate);
    if (!parsed) {
      throw { status: 400, message: 'Invalid targetDate' };
    }

    const schedules = await prisma.operatingSchedule.findMany({
      where: {
        startDate: { lte: parsed.date },
        endDate: { gte: parsed.date },
      },
      orderBy: {
        priority: 'desc',
      },
      take: 1,
    });

    return schedules.length > 0 ? schedules[0] : null;
  }
}
