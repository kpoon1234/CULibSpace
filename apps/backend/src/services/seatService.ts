import { PrismaClient, TableStatus, ZoneType, BookingStatus } from '@prisma/client';

const prisma = new PrismaClient();

export interface SeatLayoutFilter {
  zoneType?: ZoneType;
  plugCap?: number;
  hasTvScreen?: boolean;
  startDateTime?: Date;
  endDateTime?: Date;
}

export class SeatService {
  /**
   * ดึงข้อมูลผังโซนและโต๊ะทั้งหมด พร้อมคำนวณสถานะเรียลไทม์ (Dynamic Status)
   */
  static async getSeatLayoutWithStatus(filters: SeatLayoutFilter) {
    const { zoneType, plugCap, hasTvScreen, startDateTime, endDateTime } = filters;

    // กำหนดช่วงเวลาเป้าหมายที่ต้องการเช็กสถานะ (หากไม่ได้ส่งมาจะใช้เวลาปัจจุบัน)
    const targetStart = startDateTime || new Date();
    const targetEnd = endDateTime || new Date(targetStart.getTime() + 1 * 60 * 60 * 1000); // ค่าเริ่มต้น 1 ชั่วโมง
    const now = new Date();

    // 1. ค้นหาข้อมูล Zone และ Table พร้อมกรองเงื่อนไข
    const zones = await prisma.zone.findMany({
      where: zoneType ? { zoneType } : undefined,
      include: {
        tables: {
          where: {
            ...(plugCap !== undefined && { plugCap: { gte: plugCap } }),
            ...(hasTvScreen !== undefined && { hasTvScreen }),
          },
          include: {
            bookings: {
              where: {
                status: {
                  in: [BookingStatus.PENDING, BookingStatus.ACTIVE],
                },
                // ตรวจสอบการจองที่คาบเกี่ยวกับช่วงเวลา targetStart - targetEnd
                startDateTime: { lt: targetEnd },
                endDateTime: { gt: targetStart },
              },
            },
          },
          orderBy: { tableId: 'asc' },
        },
      },
      orderBy: { zoneId: 'asc' },
    });

    // 2. คำนวณ dynamic status สำหรับแต่ละโต๊ะ
    const result = zones.map((zone) => ({
      zoneId: zone.zoneId,
      zoneType: zone.zoneType,
      tables: zone.tables.map((table) => {
        let dynamicStatus: TableStatus = TableStatus.AVAILABLE;

        // เงื่อนไขที่ 1: โต๊ะถูกปิดปรับปรุง/ซ่อมแซม
        if (table.status === TableStatus.CLOSED) {
          dynamicStatus = TableStatus.CLOSED;
        } else {
          // ค้นหา booking ที่ทับซ้อน
          const activeBooking = table.bookings.find((b) => b.status === BookingStatus.ACTIVE);
          const pendingBooking = table.bookings.find((b) => b.status === BookingStatus.PENDING);

          // ตรวจสอบ Concurrency Temporary Hold Lock
          const isHoldLocked = table.lockedUntil !== null && table.lockedUntil > now;

          // เงื่อนไขที่ 2: มีผู้เข้าใช้งานอยู่แล้ว (Occupied)
          if (activeBooking) {
            dynamicStatus = TableStatus.OCCUPIED;
          }
          // เงื่อนไขที่ 3: จองแล้วรอดำเนินการ หรือติด Temporary Lock 5 นาที (Reserved)
          else if (pendingBooking || isHoldLocked) {
            dynamicStatus = TableStatus.RESERVED;
          }
          // เงื่อนไขที่ 4: โต๊ะว่าง (Available)
          else {
            dynamicStatus = TableStatus.AVAILABLE;
          }
        }

        return {
          tableId: table.tableId,
          zoneId: table.zoneId,
          numberOfSeat: table.numberOfSeat,
          plugCap: table.plugCap,
          hasTvScreen: table.hasTvScreen,
          status: dynamicStatus, // สถานะเรียลไทม์ที่คำนวณแล้ว
          isLocked: table.lockedUntil !== null && table.lockedUntil > now,
        };
      }),
    }));

    return result;
  }
}
