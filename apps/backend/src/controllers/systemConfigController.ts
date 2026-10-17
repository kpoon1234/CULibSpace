import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Same fallback values as ScheduleService.validateTargetTimeWindow and
// BookingService's score check — kept in sync with those defaults, not a
// separate source of truth.
const DEFAULTS = {
  maxBookingDurationMinutes: 120,
  maxAdvanceBookingDays: 7,
  minScoreToBook: 50,
};

export class SystemConfigController {
  /**
   * GET /api/system-config
   * Read-only, unauthenticated subset of SystemConfig the frontend needs to
   * mirror booking-window limits client-side (Table Filter dialog) and the
   * minimum booking score (admin user search) instead of hardcoding them and
   * drifting out of sync with the DB.
   */
  static async getBookingLimits(req: Request, res: Response): Promise<void> {
    let config: {
      maxBookingDurationMinutes: number;
      maxAdvanceBookingDays: number;
      minScoreToBook: number;
    } | null = null;
    try {
      config = await prisma.systemConfig.findFirst({
        select: {
          maxBookingDurationMinutes: true,
          maxAdvanceBookingDays: true,
          minScoreToBook: true,
        },
      });
    } catch {
      // Fallback to defaults if the DB is unreachable or the table is empty.
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      success: true,
      data: {
        maxBookingDurationMinutes:
          config?.maxBookingDurationMinutes ?? DEFAULTS.maxBookingDurationMinutes,
        maxAdvanceBookingDays: config?.maxAdvanceBookingDays ?? DEFAULTS.maxAdvanceBookingDays,
        minScoreToBook: config?.minScoreToBook ?? DEFAULTS.minScoreToBook,
      },
    });
  }
}
