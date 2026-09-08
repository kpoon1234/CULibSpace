import { PrismaClient, Prisma, ZoneType } from '@prisma/client';

const prisma = new PrismaClient();

export interface LayoutFilters {
  zoneType?: string;
  plugCap?: number;
  hasTvScreen?: boolean;
  minSeats?: number;
}

export class LayoutService {
  static async getFloorLayout(filters: LayoutFilters) {
    const tableWhere: Prisma.TableWhereInput = {};

    // Filter tables based on user requirements
    if (filters.plugCap !== undefined) {
      tableWhere.plugCap = { gte: filters.plugCap };
    }
    if (filters.hasTvScreen !== undefined) {
      tableWhere.hasTvScreen = filters.hasTvScreen;
    }
    if (filters.minSeats !== undefined) {
      tableWhere.numberOfSeat = { gte: filters.minSeats }; // "I need a table with at least 4 seats"
    }

    const zoneWhere: Prisma.ZoneWhereInput = {};
    if (filters.zoneType) {
      zoneWhere.zoneType = filters.zoneType as ZoneType;
    }

    // Fetch Zones and nest their Tables exactly as the UI needs it
    const layout = await prisma.zone.findMany({
      where: zoneWhere,
      include: {
        tables: {
          // Note: If Prisma generated this as plural, change 'Table' to 'tables'
          where: tableWhere,
          select: {
            tableId: true,
            status: true,
            numberOfSeat: true,
            plugCap: true,
            hasTvScreen: true,
            // We intentionally OMIT lockToken and lockedUntil so the frontend
            // doesn't receive sensitive concurrency data.
          },
          orderBy: { tableId: 'asc' },
        },
      },
      orderBy: { zoneId: 'asc' },
    });

    return layout;
  }
}
