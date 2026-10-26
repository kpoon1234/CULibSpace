import { PrismaClient, Prisma, ZoneType, TableStatus } from '@prisma/client';
import { BLOCKING_ISSUE_WHERE, isFacilityClosed } from './facilityAvailabilityService.js';

const prisma = new PrismaClient();

export interface LayoutFilters {
  zoneType?: ZoneType;
  plugCap?: number;
  hasTvScreen?: boolean;
  minSeats?: number;
  targetStart: Date;
  targetEnd: Date;
}

export class LayoutService {
  /**
   * US2-2: ดึงผังห้องสมุดพร้อมคำนวณสถานะเรียลไทม์ตามช่วงเวลาเป้าหมาย
   */
  static async getLayoutWithStatus(filters: LayoutFilters, prismaClient = prisma) {
    const { targetStart, targetEnd, ...restFilters } = filters;
    const tableWhere: Prisma.TableWhereInput = {};

    if (restFilters.plugCap !== undefined) tableWhere.plugCap = { gte: restFilters.plugCap };
    if (restFilters.hasTvScreen !== undefined) tableWhere.hasTvScreen = restFilters.hasTvScreen;
    if (restFilters.minSeats !== undefined) tableWhere.numberOfSeat = { gte: restFilters.minSeats };

    const zoneWhere: Prisma.ZoneWhereInput = {};
    if (restFilters.zoneType) zoneWhere.zoneType = restFilters.zoneType;

    const layout = await prismaClient.zone.findMany({
      where: zoneWhere,
      include: {
        tables: {
          where: tableWhere,
          select: {
            tableId: true,
            status: true, // ค่า static เดิม (เช่น CLOSED)
            numberOfSeat: true,
            plugCap: true,
            hasTvScreen: true,
            lockedUntil: true,
            lockedByUid: true,
            issueReports: {
              where: BLOCKING_ISSUE_WHERE,
              select: { issueId: true },
              take: 1,
            },
            // ค้นหาการจองที่ทับซ้อนและมีสถานะ PENDING หรือ ACTIVE
            bookings: {
              where: {
                startDateTime: { lt: targetEnd },
                endDateTime: { gt: targetStart },
                status: { in: ['PENDING', 'ACTIVE'] },
              },
            },
          },
          orderBy: { tableId: 'asc' },
        },
      },
      orderBy: { zoneId: 'asc' },
    });

    return layout.map((zone) => ({
      ...zone,
      tables: zone.tables.map((table) => {
        const closed = isFacilityClosed(table.status, table.issueReports.length > 0);
        let dynamicStatus: TableStatus = closed ? TableStatus.CLOSED : table.status;
        const now = new Date();
        const isHoldLocked = !closed && Boolean(table.lockedUntil && table.lockedUntil > now);

        // คำนวณสถานะใหม่ หากโต๊ะไม่ได้ปิดซ่อมบำรุง
        if (!closed) {
          if (table.bookings.length > 0) {
            // ถ้ามี booking ที่ทับซ้อน
            const hasActive = table.bookings.some((b) => b.status === 'ACTIVE');
            dynamicStatus = hasActive ? TableStatus.OCCUPIED : TableStatus.RESERVED;
          } else if (isHoldLocked) {
            dynamicStatus = TableStatus.RESERVED;
          } else {
            dynamicStatus = TableStatus.AVAILABLE;
          }
        }

        const bookedIntervals = table.bookings.map((b) => ({
          startDateTime: b.startDateTime.toISOString(),
          endDateTime: b.endDateTime.toISOString(),
          status: b.status,
        }));

        // ถอด bookings และ lockedUntil ออกเพื่อไม่ให้ข้อมูลล้นกลับไปที่ Frontend
        const { bookings, lockedUntil, status, issueReports, ...tableData } = table;

        return {
          ...tableData,
          status: dynamicStatus, // แทนที่ด้วยสถานะไดนามิก
          isLocked: isHoldLocked,
          lockedByUid: isHoldLocked ? table.lockedByUid : null,
          bookedIntervals, // US2-4 / AC 2.4.3: ข้อมูลช่วงเวลาสำหรับ Timetable preview
        };
      }),
    }));
  }
}
