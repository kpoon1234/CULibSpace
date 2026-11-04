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
      // ดูผังเฉย ๆ (ไม่ระบุช่วงเวลา) ในวันที่ห้องสมุดปิด: ยังส่งรายการโต๊ะกลับไปพร้อม
      // meta.libraryClosed เพื่อให้หน้าเว็บแสดงผังได้ การระบุช่วงเวลาและการจองจริงยังถูกปฏิเสธตามเดิม
      let validation: Awaited<ReturnType<typeof ScheduleService.validateTargetTimeWindow>> | null;
      let closedReason: string | null = null;
      try {
        validation = await ScheduleService.validateTargetTimeWindow(
          parsedWindow.targetStart,
          parsedWindow.targetEnd,
          parsedWindow.isExplicit
        );
      } catch (err: any) {
        if (err?.code !== 'LIBRARY_CLOSED' || parsedWindow.isExplicit) throw err;
        validation = null;
        closedReason = err.message;
      }

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
        targetStart: validation?.targetStart ?? parsedWindow.targetStart,
        targetEnd: validation?.targetEnd ?? parsedWindow.targetEnd,
      };

      // 4. ดึงข้อมูลผังพร้อมสถานะโต๊ะตามช่วงเวลาเป้าหมาย
      const layout = await LayoutService.getLayoutWithStatus(filters);

      // 5. ตั้งค่า Header เพื่อรองรับ Auto-polling (US2-2)
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({
        success: true,
        data: layout,
        meta: {
          targetStart: filters.targetStart,
          targetEnd: filters.targetEnd,
          schedule: validation?.schedule ?? null,
          scheduleSegments: validation?.scheduleSegments ?? [],
          timeZone: 'Asia/Bangkok',
          libraryClosed: closedReason !== null,
          ...(closedReason ? { closedReason } : {}),
        },
      });
    } catch (err: any) {
      if (err.status) {
        res.status(err.status).json({
          success: false,
          error: err.message,
          code: err.code,
        });
        return;
      }
      console.error('[LayoutController] Error fetching layout:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch table layout', // ข้อความ Error คงที่ตาม EPIC2
      });
    }
  }
}
