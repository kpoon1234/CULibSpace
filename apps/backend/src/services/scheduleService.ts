import { PrismaClient, OperatingSchedule, SystemConfig } from '@prisma/client';

const prisma = new PrismaClient();

export interface TimeWindowValidationResult {
  targetStart: Date;
  targetEnd: Date;
  schedule: {
    name: string;
    openTime: string;
    closeTime: string;
    is24Hours: boolean;
    isClosed: boolean;
    priority: number;
  };
  config: {
    maxAdvanceBookingDays: number;
    maxBookingDurationMinutes: number;
  };
}

export interface ParseTimeWindowInput {
  startDateTime?: string;
  endDateTime?: string;
  date?: string;
  timeSlot?: string;
}

export class ScheduleService {
  /**
   * Helper to convert "HH:MM" string to minutes from midnight
   */
  static timeToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + (m || 0);
  }

  /**
   * Parse target start and end dates from either:
   * 1. startDateTime and endDateTime (ISO format)
   * 2. date (YYYY-MM-DD) and timeSlot ("HH:MM" or "HH:MM-HH:MM")
   * 3. fallback to current time -> current time + 1 hour
   */
  static parseTargetTimeWindow(input: ParseTimeWindowInput): {
    targetStart: Date;
    targetEnd: Date;
    isExplicit: boolean;
  } {
    const now = new Date();

    // Option 1: startDateTime & endDateTime
    if (input.startDateTime && input.endDateTime) {
      const targetStart = new Date(input.startDateTime);
      const targetEnd = new Date(input.endDateTime);
      return { targetStart, targetEnd, isExplicit: true };
    }

    // Option 2: date & timeSlot
    if (input.date) {
      const datePart = input.date.trim();
      let startTimeStr = '08:00';
      let endTimeStr = '09:00';

      if (input.timeSlot) {
        const slot = input.timeSlot.trim();
        if (slot.includes('-')) {
          const parts = slot.split('-');
          startTimeStr = parts[0].trim();
          endTimeStr = parts[1].trim();
        } else {
          startTimeStr = slot;
          const [hour, minute] = slot.split(':').map(Number);
          endTimeStr = `${String(hour + 1).padStart(2, '0')}:${String(minute || 0).padStart(2, '0')}`;
        }
      } else {
        const currentHour = now.getHours().toString().padStart(2, '0');
        startTimeStr = `${currentHour}:00`;
        endTimeStr = `${String(now.getHours() + 1).padStart(2, '0')}:00`;
      }

      const targetStart = new Date(`${datePart}T${startTimeStr}:00`);
      const targetEnd = new Date(`${datePart}T${endTimeStr}:00`);
      return { targetStart, targetEnd, isExplicit: true };
    }

    // Option 3: Fallback (Now -> Now + 1 Hour)
    const targetStart = now;
    const targetEnd = new Date(now.getTime() + 60 * 60 * 1000);
    return { targetStart, targetEnd, isExplicit: false };
  }

  /**
   * Validate target time window against:
   * 1. Basic format & chronological ordering
   * 2. Past dates (with 5-minute tolerance)
   * 3. Max advance booking days (from SystemConfig)
   * 4. Max booking duration (from SystemConfig)
   * 5. OperatingSchedule priority hierarchy (Closed/Holiday > Exam 24h > Regular Hours)
   */
  static async validateTargetTimeWindow(
    targetStart: Date,
    targetEnd: Date,
    isExplicit: boolean = true
  ): Promise<TimeWindowValidationResult> {
    const now = new Date();

    // 1. Format validation
    if (isNaN(targetStart.getTime()) || isNaN(targetEnd.getTime())) {
      throw { status: 400, message: 'Invalid startDateTime or endDateTime format' };
    }

    // 2. Chronological check
    if (targetEnd <= targetStart) {
      throw { status: 400, message: 'endDateTime must be after startDateTime' };
    }

    // 3. Past date check (5 minutes tolerance for server/network clock drift)
    if (targetStart.getTime() < now.getTime() - 5 * 60 * 1000) {
      throw { status: 400, message: 'Cannot request status for past dates' };
    }

    // 4. Fetch SystemConfig (with offline/default fallback)
    let config = {
      maxAdvanceBookingDays: 7,
      maxBookingDurationMinutes: 120,
    };

    try {
      const dbConfig = await prisma.systemConfig.findFirst();
      if (dbConfig) {
        config.maxAdvanceBookingDays = dbConfig.maxAdvanceBookingDays;
        config.maxBookingDurationMinutes = dbConfig.maxBookingDurationMinutes;
      }
    } catch {
      // Database offline fallback to defaults
    }

    // Only strictly enforce advance days and duration limits if the user explicitly specified the window
    if (isExplicit) {
      // 4.1 Max advance booking check
      const maxAdvanceMs = config.maxAdvanceBookingDays * 24 * 60 * 60 * 1000;
      if (targetStart.getTime() > now.getTime() + maxAdvanceMs) {
        throw {
          status: 400,
          message: `Target date exceeds maximum advance booking limit of ${config.maxAdvanceBookingDays} days`,
        };
      }

      // 4.2 Max duration check
      const durationMinutes = (targetEnd.getTime() - targetStart.getTime()) / (60 * 1000);
      if (durationMinutes > config.maxBookingDurationMinutes) {
        throw {
          status: 400,
          message: `Requested duration exceeds maximum allowed duration of ${config.maxBookingDurationMinutes} minutes`,
        };
      }
    }

    // 5. OperatingSchedule & Priority Hierarchy
    let activeSchedule = {
      name: 'เวลาทำการปกติ (Default Regular Hours)',
      openTime: '08:00',
      closeTime: '21:00',
      is24Hours: false,
      isClosed: false,
      priority: 1,
    };

    try {
      // Find all schedules covering targetStart/targetEnd
      // Using date boundary for calendar day comparison
      const targetStartDay = new Date(
        targetStart.getFullYear(),
        targetStart.getMonth(),
        targetStart.getDate()
      );
      const targetEndDay = new Date(
        targetEnd.getFullYear(),
        targetEnd.getMonth(),
        targetEnd.getDate(),
        23,
        59,
        59
      );

      const schedules = await prisma.operatingSchedule.findMany({
        where: {
          startDate: { lte: targetEndDay },
          endDate: { gte: targetStartDay },
        },
        orderBy: {
          priority: 'desc',
        },
      });

      if (schedules.length > 0) {
        const topSchedule = schedules[0];
        activeSchedule = {
          name: topSchedule.name,
          openTime: topSchedule.openTime,
          closeTime: topSchedule.closeTime,
          is24Hours: topSchedule.is24Hours,
          isClosed: topSchedule.isClosed,
          priority: topSchedule.priority,
        };
      }
    } catch {
      // Database offline fallback
    }

    // 5.1 If library is closed on this schedule (Priority 3 Holiday/Maintenance)
    if (activeSchedule.isClosed) {
      throw {
        status: 400,
        message: `Library is closed on this date: ${activeSchedule.name}`,
      };
    }

    // 5.2 If not 24 Hours, verify that target times fall within openTime - closeTime
    if (!activeSchedule.is24Hours && isExplicit) {
      const openMinutes = ScheduleService.timeToMinutes(activeSchedule.openTime);
      const closeMinutes = ScheduleService.timeToMinutes(activeSchedule.closeTime);

      const isSameDay =
        targetStart.getFullYear() === targetEnd.getFullYear() &&
        targetStart.getMonth() === targetEnd.getMonth() &&
        targetStart.getDate() === targetEnd.getDate();

      const startMinutes = targetStart.getHours() * 60 + targetStart.getMinutes();
      const endMinutes = targetEnd.getHours() * 60 + targetEnd.getMinutes();

      if (
        !isSameDay ||
        startMinutes < openMinutes ||
        startMinutes >= closeMinutes ||
        endMinutes > closeMinutes
      ) {
        throw {
          status: 400,
          message: `Requested time is outside library operating hours (${activeSchedule.openTime} - ${activeSchedule.closeTime})`,
        };
      }
    }

    return {
      targetStart,
      targetEnd,
      schedule: activeSchedule,
      config,
    };
  }
}
