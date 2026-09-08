import { PrismaClient, Prisma, ZoneType, TableStatus } from '@prisma/client';

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
  static async getLayoutWithStatus(filters: LayoutFilters) {
    const { targetStart, targetEnd, ...restFilters } = filters;
    const tableWhere: Prisma.TableWhereInput = {};

    if (restFilters.plugCap !== undefined) tableWhere.plugCap = { gte: restFilters.plugCap };
    if (restFilters.hasTvScreen !== undefined) tableWhere.hasTvScreen = restFilters.hasTvScreen;
    if (restFilters.minSeats !== undefined) tableWhere.numberOfSeat = { gte: restFilters.minSeats };

    const zoneWhere: Prisma.ZoneWhereInput = {};
    if (restFilters.zoneType) zoneWhere.zoneType = restFilters.zoneType;

    const layout = await prisma.zone.findMany({
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
        let dynamicStatus: TableStatus = table.status;
        const isHoldLocked = table.lockedUntil ? table.lockedUntil > targetStart : false; // เช็ก Hold-Lock

        // คำนวณสถานะใหม่ หากโต๊ะไม่ได้ปิดซ่อมบำรุง
        if (table.status !== TableStatus.CLOSED) {
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

        // ถอด bookings และ lockedUntil ออกเพื่อไม่ให้ข้อมูลล้นกลับไปที่ Frontend
        const { bookings, lockedUntil, status, ...tableData } = table;

        return {
          ...tableData,
          status: dynamicStatus, // แทนที่ด้วยสถานะไดนามิก
          isLocked: isHoldLocked,
        };
      }),
    }));
  }
}
