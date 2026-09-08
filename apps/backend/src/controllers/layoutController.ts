import { Request, Response } from 'express';
import { LayoutService, LayoutFilters } from '../services/layoutService.js';
import { ZoneType } from '@prisma/client';

export class LayoutController {
  static async getLayout(req: Request, res: Response): Promise<void> {
    try {
      const {
        zoneType,
        plugCap,
        hasTvScreen,
        minSeats,
        date,
        timeSlot,
        startDateTime,
        endDateTime,
      } = req.query;
      const now = new Date();

      // 1. จัดการช่วงเวลา (Target Time Calculation)
      let targetStart: Date;
      let targetEnd: Date;

      if (startDateTime && endDateTime) {
        targetStart = new Date(startDateTime as string);
        targetEnd = new Date(endDateTime as string);
      } else if (date) {
        // หากส่ง date มา ให้คำนวณกับ timeSlot (หรือใช้เวลาต้นชั่วโมงปัจจุบันเป็นค่าเริ่มต้น)
        const currentHour = now.getHours().toString().padStart(2, '0');
        const slot = (timeSlot as string) || `${currentHour}:00`;
        targetStart = new Date(`${date}T${slot}:00`);
        targetEnd = new Date(targetStart.getTime() + 1 * 60 * 60 * 1000); // กำหนด default เป็น 1 ชม.
      } else {
        // กรณีไม่ส่งเวลามาเลย (US2-1/US2-2 โหลดครั้งแรก) ใช้เวลาปัจจุบัน
        targetStart = new Date();
        targetEnd = new Date(targetStart.getTime() + 1 * 60 * 60 * 1000);
      }

      // 2. Validation เช็กข้อผิดพลาดของเวลา
      if (targetEnd <= targetStart) {
        res.status(400).json({ success: false, error: 'endDateTime must be after startDateTime' });
        return;
      }

      // อนุโลมเวลาในอดีตได้เล็กน้อย (เผื่อ Server lag) แต่ปฏิเสธวันที่ในอดีตชัดเจน
      if (targetStart.getTime() < now.getTime() - 5 * 60 * 1000) {
        res.status(400).json({ success: false, error: 'Cannot request status for past dates' });
        return;
      }

      // 3. จัดเตรียม Filters
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
