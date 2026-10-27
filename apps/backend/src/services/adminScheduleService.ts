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

    // 6. Same-priority overlap check to prevent ambiguous schedule precedence
    const conflicting = await prisma.operatingSchedule.findFirst({
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
    return await prisma.operatingSchedule.create({
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
  }

  /**
   * Edit / Update an existing library operating schedule.
   * Performs partial updates by merging with existing data and validating the resulting state.
   */
  static async updateSchedule(
    scheduleId: number,
    input: UpdateScheduleInput,
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

    // 1. Name validation
    let name = existing.name;
    if (input.name !== undefined) {
      if (typeof input.name !== 'string' || input.name.trim().length === 0) {
        throw { status: 400, message: 'Schedule name cannot be empty' };
      }
      name = input.name.trim();
      if (name.length > 100) {
        throw { status: 400, message: 'Schedule name must not exceed 100 characters' };
      }
    }

    // 2. Dates validation
    let startDate = existing.startDate;
    let endDate = existing.endDate;

    if (input.startDate !== undefined) {
      const parsedStart = this.parseCalendarDate(input.startDate);
      if (!parsedStart) {
        throw { status: 400, message: 'Invalid startDate format. Expected YYYY-MM-DD or ISO 8601' };
      }
      startDate = parsedStart.date;
    }

    if (input.endDate !== undefined) {
      const parsedEnd = this.parseCalendarDate(input.endDate);
      if (!parsedEnd) {
        throw { status: 400, message: 'Invalid endDate format. Expected YYYY-MM-DD or ISO 8601' };
      }
      endDate = parsedEnd.date;
    }

    if (startDate.getTime() > endDate.getTime()) {
      const startStr = startDate.toISOString().slice(0, 10);
      const endStr = endDate.toISOString().slice(0, 10);
      throw {
        status: 400,
        message: `startDate (${startStr}) cannot be after endDate (${endStr})`,
      };
    }

    // 3. Flags validation
    const is24Hours = input.is24Hours !== undefined ? Boolean(input.is24Hours) : existing.is24Hours;
    const isClosed = input.isClosed !== undefined ? Boolean(input.isClosed) : existing.isClosed;

    if (is24Hours && isClosed) {
      throw { status: 400, message: 'Schedule cannot be both 24 hours and closed simultaneously' };
    }

    // 4. Time format & chronological validation
    let openTime = input.openTime !== undefined ? input.openTime : existing.openTime;
    let closeTime = input.closeTime !== undefined ? input.closeTime : existing.closeTime;

    if (isClosed) {
      if (input.openTime !== undefined && !this.isValidTimeFormat(openTime)) {
        throw { status: 400, message: 'Invalid openTime format. Expected HH:MM' };
      }
      if (input.closeTime !== undefined && !this.isValidTimeFormat(closeTime)) {
        throw { status: 400, message: 'Invalid closeTime format. Expected HH:MM' };
      }
    } else if (is24Hours) {
      if (input.openTime !== undefined && !this.isValidTimeFormat(openTime)) {
        throw { status: 400, message: 'Invalid openTime format. Expected HH:MM' };
      }
      if (input.closeTime !== undefined && !this.isValidTimeFormat(closeTime)) {
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
    let priority = existing.priority;
    if (input.priority !== undefined) {
      priority = Number(input.priority);
      if (!Number.isSafeInteger(priority) || priority < 1) {
        throw { status: 400, message: 'Priority must be a positive integer' };
      }
    }

    // 6. Same-priority overlap check against other schedules
    const conflicting = await prisma.operatingSchedule.findFirst({
      where: {
        scheduleId: { not: scheduleId },
        priority,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });

    if (conflicting) {
      throw {
        status: 409,
        message: `Conflicting schedule: "${conflicting.name}" already exists with the same priority (${priority}) covering this date range`,
      };
    }

    // 7. Update and return
    return await prisma.operatingSchedule.update({
      where: { scheduleId },
      data: {
        name,
        startDate,
        endDate,
        openTime,
        closeTime,
        is24Hours,
        isClosed,
        priority,
      },
    });
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
