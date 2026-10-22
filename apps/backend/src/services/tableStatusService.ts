import { BookingStatus, TableStatus } from '@prisma/client';

/**
 * Every booking transition which writes table.status must take this lock first.
 * A row lock serializes check-in and the background workers for the same table,
 * including when they update different booking rows.
 */
export async function lockTableForStatusChange(tx: any, tableId: number): Promise<void> {
  await tx.$queryRaw`SELECT tableid FROM "table" WHERE tableid = ${tableId} FOR UPDATE`;
}

/** Recalculate the stored current status after a booking transition, while holding the table lock. */
export async function refreshTableStatus(
  tx: any,
  tableId: number,
  now: Date,
  clearHold = false
): Promise<void> {
  const table = await tx.table.findUnique({
    where: { tableId },
    select: { status: true },
  });

  if (!table || table.status === TableStatus.CLOSED) return;

  // ACTIVE means the user has checked in, even during the early check-in window.
  const activeBooking = await tx.booking.findFirst({
    where: { tableId, status: BookingStatus.ACTIVE },
    select: { bookingId: true },
  });

  const pendingBooking = activeBooking
    ? null
    : await tx.booking.findFirst({
        where: {
          tableId,
          status: BookingStatus.PENDING,
          startDateTime: { lte: now },
          endDateTime: { gt: now },
        },
        select: { bookingId: true },
      });

  const status = activeBooking
    ? TableStatus.OCCUPIED
    : pendingBooking
      ? TableStatus.RESERVED
      : TableStatus.AVAILABLE;

  if (table.status !== status || clearHold) {
    await tx.table.update({
      where: { tableId },
      data: {
        status,
        ...(clearHold ? { lockToken: null, lockedUntil: null, lockedByUid: null } : {}),
      },
    });
  }
}
