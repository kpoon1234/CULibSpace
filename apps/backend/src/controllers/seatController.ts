import { Request, Response } from 'express';
import { SeatService } from '../services/seatService.js';
import { ZoneType } from '@prisma/client';

export class SeatController {
  /**
   * GET /api/seats/layout
   */
  static async getLayout(req: Request, res: Response): Promise<void> {
    try {
      const { zoneType, plugCap, hasTvScreen, date, timeSlot, startDateTime, endDateTime } =
        req.query;

      // แปลง Parameter สำหรับ Filter
      let parsedStart: Date | undefined;
      let parsedEnd: Date | undefined;

      if (startDateTime && endDateTime) {
        parsedStart = new Date(startDateTime as string);
        parsedEnd = new Date(endDateTime as string);
      } else if (date) {
        // หากส่งมาเป็น date + timeSlot
        const dateStr = date as string;
        const slotStr = (timeSlot as string) || '09:00';
        parsedStart = new Date(`${dateStr}T${slotStr}:00`);
        parsedEnd = new Date(parsedStart.getTime() + 2 * 60 * 60 * 1000); // Default 2 hours
      }

      const layout = await SeatService.getSeatLayoutWithStatus({
        zoneType: zoneType ? (zoneType as ZoneType) : undefined,
        plugCap: plugCap ? parseInt(plugCap as string, 10) : undefined,
        hasTvScreen: hasTvScreen !== undefined ? hasTvScreen === 'true' : undefined,
        startDateTime: parsedStart,
        endDateTime: parsedEnd,
      });

      res.status(200).json({
        success: true,
        data: layout,
      });
    } catch (error: any) {
      console.error('Error fetching seat layout:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error while fetching seat layout',
      });
    }
  }
}
