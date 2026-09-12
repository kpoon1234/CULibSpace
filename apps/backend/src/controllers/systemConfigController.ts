import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Same fallback values as ScheduleService.validateTargetTimeWindow — kept in
// sync with that function's defaults, not a separate source of truth.
const DEFAULTS = {
  maxBookingDurationMinutes: 120,
  maxAdvanceBookingDays: 7,
};

export class SystemConfigController {
  /**
   * GET /api/system-config
   * Read-only, unauthenticated subset of SystemConfig the frontend needs to
   * mirror booking-window limits client-side (Table Filter dialog) instead of
   * hardcoding them and drifting out of sync with the DB.
   */
  static async getBookingLimits(req: Request, res: Response): Promise<void> {
    let config: { maxBookingDurationMinutes: number; maxAdvanceBookingDays: number } | null = null;
    try {
      config = await prisma.systemConfig.findFirst({
        select: { maxBookingDurationMinutes: true, maxAdvanceBookingDays: true },
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
      },
    });
  }
}
