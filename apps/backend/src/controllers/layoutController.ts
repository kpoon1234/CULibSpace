import { Request, Response } from 'express';
import { LayoutService, LayoutFilters } from '../services/layoutService.js';
import { ZoneType } from '@prisma/client';

export class LayoutController {
  static async getLayout(req: Request, res: Response): Promise<void> {
    try {
      const { zoneType, plugCap, hasTvScreen, minSeats, startDateTime, endDateTime } = req.query;

      const now = new Date();

      // 1. จัดการช่วงเวลา (Target Time Calculation)
      // กรณีที่ 1/2: ไม่มีเวลาหรือมีแค่บางส่วน → ใช้ fallback (now, now + 1 ชม.)
      // กรณีที่ 3/4: มี startDateTime + endDateTime → ใช้ค่าที่ส่งมา
      let targetStart: Date;
      let targetEnd: Date;

      if (startDateTime && endDateTime) {
        // กรณีที่ 3/4: ส่งเวลามาครบ
        targetStart = new Date(startDateTime as string);
        targetEnd = new Date(endDateTime as string);

        // Validation เวลาที่ส่งมา
        if (isNaN(targetStart.getTime()) || isNaN(targetEnd.getTime())) {
          res
            .status(400)
            .json({ success: false, error: 'Invalid startDateTime or endDateTime format' });
          return;
        }
        if (targetEnd <= targetStart) {
          res
            .status(400)
            .json({ success: false, error: 'endDateTime must be after startDateTime' });
          return;
        }
        if (targetStart.getTime() < now.getTime() - 5 * 60 * 1000) {
          res.status(400).json({ success: false, error: 'Cannot request status for past dates' });
          return;
        }
      } else {
        // กรณีที่ 1/2: fallback → เวลาปัจจุบัน + 1 ชม.
        targetStart = now;
        targetEnd = new Date(now.getTime() + 60 * 60 * 1000);
      }

      // 2. จัดเตรียม Filters (ทั้งหมด optional)
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
        targetStart,
        targetEnd,
      };

      // 4. ดึงข้อมูล
      const layout = await LayoutService.getLayoutWithStatus(filters);

      // 5. ตั้งค่า Header เพื่อรองรับ Auto-polling (US2-2)
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({
        success: true,
        data: layout,
      });
    } catch (err: any) {
      console.error('[LayoutController] Error fetching layout:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch seat layout', // ข้อความ Error คงที่ตาม EPIC2
      });
    }
  }
}
