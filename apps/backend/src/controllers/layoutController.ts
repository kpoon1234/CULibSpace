import { Request, Response } from 'express';
import { LayoutService, LayoutFilters } from '../services/layoutService.js';
import { ScheduleService } from '../services/scheduleService.js';
import { ZoneType } from '@prisma/client';

export class LayoutController {
  static async getLayout(req: Request, res: Response): Promise<void> {
    try {
      const {
        zoneType,
        plugCap,
        hasTvScreen,
        minSeats,
        startDateTime,
        endDateTime,
        date,
        timeSlot,
      } = req.query;

      // 1. จัดการแปลงและคำนวณช่วงเวลาเป้าหมาย (US2-4: startDateTime/endDateTime หรือ date/timeSlot)
      const parsedWindow = ScheduleService.parseTargetTimeWindow({
        startDateTime: startDateTime ? String(startDateTime) : undefined,
        endDateTime: endDateTime ? String(endDateTime) : undefined,
        date: date ? String(date) : undefined,
        timeSlot: timeSlot ? String(timeSlot) : undefined,
      });

      // 2. Validate ช่วงเวลาและเงื่อนไขห้องสมุด (US2-4 / FR-2.4)
      // ตรวจสอบทั้ง format, past dates, maxAdvanceBookingDays, maxBookingDuration, และ OperatingSchedule
      const validation = await ScheduleService.validateTargetTimeWindow(
        parsedWindow.targetStart,
        parsedWindow.targetEnd,
        parsedWindow.isExplicit
      );

      // 3. จัดเตรียม Filters (ทั้งหมด optional)
      const parsedPlugCap = plugCap ? parseInt(String(plugCap), 10) : undefined;
      const parsedMinSeats = minSeats ? parseInt(String(minSeats), 10) : undefined;

      const filters: LayoutFilters = {
        zoneType:
          zoneType && Object.values(ZoneType).includes(String(zoneType).toUpperCase() as ZoneType)
            ? (String(zoneType).toUpperCase() as ZoneType)
            : undefined,
        plugCap: parsedPlugCap && !isNaN(parsedPlugCap) ? parsedPlugCap : undefined,
        minSeats: parsedMinSeats && !isNaN(parsedMinSeats) ? parsedMinSeats : undefined,
        hasTvScreen: hasTvScreen === 'true' ? true : hasTvScreen === 'false' ? false : undefined,
        targetStart: validation.targetStart,
        targetEnd: validation.targetEnd,
      };

      // 4. ดึงข้อมูลผังพร้อมสถานะโต๊ะตามช่วงเวลาเป้าหมาย
      const layout = await LayoutService.getLayoutWithStatus(filters);

      // 5. ตั้งค่า Header เพื่อรองรับ Auto-polling (US2-2)
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({
        success: true,
        data: layout,
        meta: {
          targetStart: validation.targetStart,
          targetEnd: validation.targetEnd,
          schedule: validation.schedule,
        },
      });
    } catch (err: any) {
      if (err.status) {
        res.status(err.status).json({
          success: false,
          error: err.message,
        });
        return;
      }
      console.error('[LayoutController] Error fetching layout:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch seat layout', // ข้อความ Error คงที่ตาม EPIC2
      });
    }
  }
}
