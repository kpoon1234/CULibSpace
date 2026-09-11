import { PrismaClient, BookingStatus, Table, Zone, ZoneType } from '@prisma/client';

const prisma = new PrismaClient();

export interface BookingWithTableAndZone {
  bookingId: number;
  uid: number;
  tableId: number;
  startDateTime: Date;
  endDateTime: Date;
  arriveTime: Date | null;
  status: BookingStatus;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
  table: {
    tableId: number;
    numberOfSeat: number;
    plugCap: number | null;
    hasTvScreen: boolean;
    zone: {
      zoneId: number;
      zoneType: ZoneType;
    };
  };
}

/**
 * Fetch booking history for a user (excluding active bookings)
 * @param uid User ID
 * @returns Array of bookings with table and zone information, ordered by startDateTime descending
 */
export async function getBookingHistory(uid: number): Promise<BookingWithTableAndZone[]> {
  const now = new Date();

  // History: bookings where status is not ACTIVE (or we could also filter by endDateTime < now)
  // We'll consider history as bookings that are not active (status != ACTIVE)
  const bookings = await prisma.booking.findMany({
    where: {
      uid,
      status: {
        not: BookingStatus.ACTIVE,
      },
    },
    include: {
      table: {
        include: {
          zone: true,
        },
      },
    },
    orderBy: {
      startDateTime: 'desc',
    },
  });

  // Map to our desired shape (though include already gives us nested objects)
  // We'll just return as is, but we need to cast to our interface.
  // Prisma's findMany with include returns the nested objects already.
  return bookings as unknown as BookingWithTableAndZone[];
}

/**
 * Fetch the current active booking for a user
 * @param uid User ID
 * @returns The active booking with table and zone information, or null if none
 */
export async function getActiveBooking(uid: number): Promise<BookingWithTableAndZone | null> {
  const booking = await prisma.booking.findFirst({
    where: {
      uid,
      status: BookingStatus.ACTIVE,
    },
    include: {
      table: {
        include: {
          zone: true,
        },
      },
    },
  });

  return booking as unknown as BookingWithTableAndZone | null;
}

export default {
  getBookingHistory,
  getActiveBooking,
};
