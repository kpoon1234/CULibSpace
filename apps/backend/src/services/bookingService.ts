import {
  PrismaClient,
  UserType,
  TableStatus,
  BookingStatus,
  TicketStatus,
  SystemConfig,
  Table,
  Zone,
  ZoneType,
} from '@prisma/client';
import { ScheduleService } from './scheduleService.js';
import { PenaltyService } from './penaltyService.js';
import { randomUUID } from 'crypto';

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
  cancellation?: {
    allowed: boolean;
    deadline?: string;
    reason?: string;
  };
}

const defaultPrisma = new PrismaClient();

export interface BookingValidationInput {
  userId: number;
  tableId: number;
  startDateTime: Date;
  endDateTime: Date;
  lockToken?: string;
}

export interface BookingValidationError {
  status: number;
  code: string;
  message: string;
}

export interface BookingValidationResult {
  valid: boolean;
  user: {
    uid: number;
    firstname: string;
    lastname: string;
    behaviourScore: number;
    userType: UserType;
  };
  table: {
    tableId: number;
    numberOfSeat: number;
    zoneId: number;
    status: TableStatus;
  };
  timeWindow: {
    startDateTime: Date;
    endDateTime: Date;
    durationMinutes: number;
  };
  schedule: {
    name: string;
    openTime: string;
    closeTime: string;
    is24Hours: boolean;
  };
}

export class BookingService {
  /**
   * Execute an asynchronous database operation with a strict timeout guard
   * to prevent connection pool starvation and deadlock under high concurrency.
   */
  static async withTimeout<T>(operation: () => Promise<T>, timeoutMs: number = 5000): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject({
          status: 504,
          code: 'DATABASE_TIMEOUT',
          message: `Database query timed out after ${timeoutMs}ms during concurrent reservation validation. Please try again.`,
        } as BookingValidationError);
      }, timeoutMs);
      timer.unref?.();
    });

    try {
      return await Promise.race([operation(), timeoutPromise]);
    } finally {
      clearTimeout(timer!);
    }
  }

  /**
   * Validate all booking rules under US3-1 (FR-3.1, FR-3.2, FR-3.3, FR-5.3, FR-6.3)
   *
   * Validates:
   * 1. Target time window, operating schedule hours, maxAdvanceBookingDays, maxBookingDuration (reusing ScheduleService)
   * 2. User existence & minimum behavior score requirement (SystemConfig.minScoreToBook, default 50.0)
   * 3. 1-Booking-Per-User policy (no overlapping active/pending reservations for the same user)
   * 4. Table existence, maintenance status (not CLOSED), and availability (no overlapping bookings)
   * 5. Table hold-lock concurrency (if lockedUntil > now, verifies lockToken matches)
   * 6. Outside visitor ticket check (THAI and FOREIGN users require active PAID ticket covering the slot)
   *
   * Protected with strict timeout guard (default 5000ms) to eliminate concurrent deadlock risks.
   */
  static async validateBookingRules(
    input: BookingValidationInput,
    prisma: any = defaultPrisma,
    timeoutMs: number = 5000
  ): Promise<BookingValidationResult> {
    const { userId, tableId, startDateTime, endDateTime, lockToken } = input;

    // ==========================================
    // 1. Time Window & Operating Schedule Validation (US2-4 / US3-1)
    // ==========================================
    const scheduleValidation = await ScheduleService.validateTargetTimeWindow(
      startDateTime,
      endDateTime,
      true
    );

    const durationMinutes = Math.round(
      (endDateTime.getTime() - startDateTime.getTime()) / (60 * 1000)
    );

    // ==========================================
    // Database Queries protected with Concurrency Timeout Guard
    // ==========================================
    return await this.withTimeout(async () => {
      // Fetch SystemConfig for rules (or fallback defaults)
      let config: SystemConfig | null = null;
      try {
        config = await prisma.systemConfig.findFirst();
      } catch {
        // Fallback if table doesn't exist yet or query fails
      }

      const minScoreToBook = Number(config?.minScoreToBook ?? 50.0);

      // ==========================================
      // 2. User Lookup & Behavior Credit Score Check (US3-1 / FR-5.3)
      // ==========================================
      const user = await prisma.user.findUnique({
        where: { uid: userId },
        select: {
          uid: true,
          firstname: true,
          lastname: true,
          behaviourScore: true,
          userType: true,
          isProfileComplete: true,
          outsideUser: {
            include: {
              tickets: {
                where: {
                  status: TicketStatus.PAID,
                  startDateTime: { lte: startDateTime },
                  endDateTime: { gte: endDateTime },
                },
              },
            },
          },
        },
      });

      if (!user) {
        throw {
          status: 404,
          code: 'USER_NOT_FOUND',
          message: `User with ID ${userId} not found`,
        } as BookingValidationError;
      }

      if (!user.isProfileComplete) {
        throw {
          status: 403,
          code: 'PROFILE_INCOMPLETE',
          message: 'Please complete your profile onboarding before making a reservation',
        } as BookingValidationError;
      }

      const userScore = Number(user.behaviourScore);
      if (userScore < minScoreToBook) {
        throw {
          status: 403,
          code: 'INSUFFICIENT_BEHAVIOUR_SCORE',
          message: `Your behavior credit score (${userScore.toFixed(1)}) is below the minimum required (${minScoreToBook.toFixed(1)}) to make a reservation`,
        } as BookingValidationError;
      }

      // ==========================================
      // 3. Table Existence, Maintenance & Availability (US3-1 / FR-3.1, FR-3.4)
      // ==========================================
      const table = await prisma.table.findUnique({
        where: { tableId },
      });

      if (!table) {
        throw {
          status: 404,
          code: 'TABLE_NOT_FOUND',
          message: `Table with ID ${tableId} not found`,
        } as BookingValidationError;
      }

      if (table.status === TableStatus.CLOSED) {
        throw {
          status: 400,
          code: 'TABLE_CLOSED',
          message: 'This table is currently closed for maintenance',
        } as BookingValidationError;
      }

      // Check if table is currently locked by another user (5-min Hold Lock - AC 3.2.1)
      const now = new Date();
      const isHoldLocked = table.lockedUntil && new Date(table.lockedUntil) > now;
      if (isHoldLocked) {
        // If user does not provide the token or token does not match
        if (!lockToken || table.lockToken !== lockToken) {
          throw {
            status: 409,
            code: 'TABLE_LOCKED',
            message:
              'This table is currently on hold by another user. Please choose another table or try again later.',
          } as BookingValidationError;
        }

        // Check sneaky token (only if lockedByUid is recorded)
        if (table.lockedByUid != null && table.lockedByUid !== userId) {
          throw {
            status: 403,
            code: 'UNAUTHORIZED_LOCK_OWNER',
            message: 'You do not have permission to use this hold lock.',
          } as BookingValidationError;
        }
      }

      // Check overlapping bookings on this table
      const tableOverlap = await prisma.booking.findFirst({
        where: {
          tableId,
          status: { in: [BookingStatus.PENDING, BookingStatus.ACTIVE] },
          startDateTime: { lt: endDateTime },
          endDateTime: { gt: startDateTime },
        },
      });

      if (tableOverlap) {
        throw {
          status: 409,
          code: 'TABLE_ALREADY_BOOKED',
          message:
            'This table is already reserved by another user during the requested time window',
        } as BookingValidationError;
      }

      // ==========================================
      // 4. 1-Booking-Per-User Policy (US3-1 / FR-3.2, AC 3.1.3)
      // ==========================================
      const userOverlap = await prisma.booking.findFirst({
        where: {
          uid: userId,
          status: { in: [BookingStatus.PENDING, BookingStatus.ACTIVE] },
          startDateTime: { lt: endDateTime },
          endDateTime: { gt: startDateTime },
        },
      });

      if (userOverlap) {
        throw {
          status: 409,
          code: 'USER_BOOKING_OVERLAP',
          message:
            'You already have an active or pending reservation during this time window (1-booking-per-user policy)',
        } as BookingValidationError;
      }

      // ==========================================
      // 5. Outside Visitor Ticket Check (US3-1 / FR-6.3)
      // ==========================================
      if (user.userType === UserType.THAI || user.userType === UserType.FOREIGN) {
        const activeTickets = user.outsideUser?.tickets || [];
        if (activeTickets.length === 0) {
          throw {
            status: 403,
            code: 'TICKET_REQUIRED',
            message:
              'External visitors (Thai / Foreign) require an active paid ticket covering the requested reservation time window',
          } as BookingValidationError;
        }
      }

      return {
        valid: true,
        user: {
          uid: user.uid,
          firstname: user.firstname,
          lastname: user.lastname,
          behaviourScore: userScore,
          userType: user.userType,
        },
        table: {
          tableId: table.tableId,
          numberOfSeat: table.numberOfSeat,
          zoneId: table.zoneId,
          status: table.status,
        },
        timeWindow: {
          startDateTime,
          endDateTime,
          durationMinutes,
        },
        schedule: {
          name: scheduleValidation.schedule.name,
          openTime: scheduleValidation.schedule.openTime,
          closeTime: scheduleValidation.schedule.closeTime,
          is24Hours: scheduleValidation.schedule.is24Hours,
        },
      };
    }, timeoutMs);
  }

  static async acquireLock(
    tableId: number,
    userId: number,
    startDateTime?: Date,
    endDateTime?: Date,
    prisma: any = defaultPrisma
  ) {
    return await this.withTimeout(async () => {
      const user = await prisma.user.findUnique({
        where: { uid: userId },
        select: { isProfileComplete: true, behaviourScore: true },
      });
      if (user && !user.isProfileComplete) {
        throw {
          status: 403,
          code: 'PROFILE_INCOMPLETE',
          message: 'Please complete your profile onboarding before making a reservation',
        };
      }

      await PenaltyService.enforceMinScore(userId, prisma, user);

      const now = new Date();

      if (startDateTime && endDateTime) {
        await ScheduleService.validateTargetTimeWindow(startDateTime, endDateTime, true);

        const overlap = await prisma.booking.findFirst({
          where: {
            tableId,
            status: { in: [BookingStatus.PENDING, BookingStatus.ACTIVE] },
            startDateTime: { lt: endDateTime },
            endDateTime: { gt: startDateTime },
          },
        });

        if (overlap) {
          throw {
            status: 409,
            code: 'TABLE_ALREADY_BOOKED',
            message: 'This table is already booked for the requested time window.',
          };
        }
      }

      await prisma.table.updateMany({
        where: {
          lockedByUid: userId,
          tableId: { not: tableId },
        },
        data: {
          lockToken: null,
          lockedUntil: null,
          lockedByUid: null,
        },
      });

      const lockToken = randomUUID();
      const lockedUntil = new Date(now.getTime() + 5 * 60 * 1000);

      const updated = await prisma.table.updateMany({
        where: {
          tableId,
          status: { not: TableStatus.CLOSED },
          OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }, { lockedByUid: userId }],
        },
        data: {
          lockToken,
          lockedUntil,
          lockedByUid: userId,
        },
      });

      if (updated.count === 0) {
        throw {
          status: 409,
          code: 'TABLE_LOCKED',
          message: 'Table is currently on hold, closed, or unavailable.',
        };
      }

      return { lockToken, lockedUntil };
    });
  }

  /**
   * Release hold lock manually when user cancels or leaves the modal
   */
  static async releaseLock(
    tableId: number,
    lockToken: string,
    userId: number,
    prisma: any = defaultPrisma
  ) {
    return await this.withTimeout(async () => {
      const lockRelease = await prisma.table.updateMany({
        where: {
          tableId,
          lockToken,
          lockedByUid: userId,
        },
        data: {
          lockToken: null,
          lockedUntil: null,
          lockedByUid: null,
        },
      });

      // If no records were updated, the token is invalid, expired, or belongs to someone else
      if (lockRelease.count === 0) {
        throw {
          status: 400,
          code: 'INVALID_LOCK',
          message: 'Invalid lock token, unauthorized, or the lock has already expired.',
        };
      }

      return { success: true };
    });
  }

  /**
   * Create finalized booking (US3-1 / FR-3.1 - FR-3.3)
   * Fixes Bug 2 & 4: Atomic transaction with validation inside tx and scoped lock cleanup
   */
  static async createBooking(input: BookingValidationInput, prisma: any = defaultPrisma) {
    if (!input.lockToken) {
      throw {
        status: 400,
        code: 'LOCK_TOKEN_REQUIRED',
        message: 'A valid table hold lock is required to complete this reservation.',
      };
    }

    return await prisma.$transaction(async (tx: any) => {
      // 1. Run all rule checks INSIDE the transaction using tx
      await this.validateBookingRules(input, tx);

      // 2. Insert new reservation
      const newBooking = await tx.booking.create({
        data: {
          uid: input.userId,
          tableId: input.tableId,
          startDateTime: input.startDateTime,
          endDateTime: input.endDateTime,
          status: BookingStatus.PENDING,
        },
      });

      // 3. Clear the hold lock ONLY if matching this specific lockToken
      const lockRelease = await tx.table.updateMany({
        where: {
          tableId: input.tableId,
          lockToken: input.lockToken,
        },
        data: {
          lockToken: null,
          lockedUntil: null,
          lockedByUid: null,
        },
      });

      if (lockRelease.count === 0) {
        throw {
          status: 409,
          code: 'LOCK_EXPIRED',
          message: 'Your hold on this table expired before the booking could be finalized.',
        };
      }

      return newBooking;
    });
  }

  static async checkIn(
    userId: number,
    bookingId: number,
    now: Date = new Date(),
    prisma: any = defaultPrisma
  ) {
    // 1. ดึงการตั้งค่าระบบ (พร้อม fallback ค่าเริ่มต้น 15 นาที)
    let config = null;
    try {
      config = await prisma.systemConfig.findFirst();
    } catch {
      // Fallback defaults if SystemConfig query fails
    }
    const earlyCheckInMinutes = config?.earlyCheckInMinutes ?? 15;
    const lateThresholdMinutes = config?.lateThresholdMinutes ?? 15;

    // 2. ดึงข้อมูลการจอง
    const booking = await prisma.booking.findUnique({
      where: { bookingId },
      include: { table: true },
    });

    if (!booking) {
      throw { status: 404, code: 'BOOKING_NOT_FOUND', message: 'Booking not found' };
    }

    if (booking.uid !== userId) {
      throw {
        status: 403,
        code: 'UNAUTHORIZED_CHECKIN',
        message: 'Not allowed to check in for this booking',
      };
    }

    // Specific rejection messages based on AC 4.1.3
    if (booking.status === BookingStatus.NO_SHOW) {
      throw {
        status: 400,
        code: 'RESERVATION_CANCELLED_NO_SHOW',
        message: 'This reservation was cancelled due to No-show.',
      };
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw {
        status: 400,
        code: 'RESERVATION_CANCELLED',
        message: 'This reservation has been cancelled.',
      };
    }

    if (booking.status === BookingStatus.ACTIVE) {
      throw {
        status: 400,
        code: 'ALREADY_CHECKED_IN',
        message: 'You have already checked in for this reservation.',
      };
    }

    if (booking.status !== BookingStatus.PENDING) {
      throw {
        status: 400,
        code: 'INVALID_BOOKING_STATUS',
        message: `Cannot check in. Current status: ${booking.status}`,
      };
    }

    // 3. คำนวณ Check-in Window (AC 4.1.1, AC 4.1.2)
    const earlyCheckInMs = earlyCheckInMinutes * 60 * 1000;
    const lateThresholdMs = lateThresholdMinutes * 60 * 1000;

    const startWindow = new Date(booking.startDateTime.getTime() - earlyCheckInMs);
    const endWindow = new Date(booking.startDateTime.getTime() + lateThresholdMs);

    if (now < startWindow) {
      throw {
        status: 400,
        code: 'CHECK_IN_TOO_EARLY',
        message: `It is too early to check in. Check-in opens at ${startWindow.toISOString()}`,
        checkInAvailableAt: startWindow.toISOString(),
      };
    }

    if (now > endWindow) {
      throw {
        status: 400,
        code: 'CHECK_IN_TOO_LATE',
        message: 'Check-in window has expired.',
      };
    }

    // 4. Update สถานะใน Transaction
    const updatedBooking = await prisma.$transaction(async (tx: any) => {
      const b = await tx.booking.update({
        where: { bookingId },
        data: {
          status: BookingStatus.ACTIVE,
          arriveTime: now,
        },
        include: {
          table: {
            include: {
              zone: true,
            },
          },
        },
      });

      await tx.table.update({
        where: { tableId: booking.tableId },
        data: {
          status: TableStatus.OCCUPIED,
        },
      });

      return b;
    });

    return updatedBooking;
  }

  /**
   * Cancel an upcoming reservation before the cutoff deadline with zero score penalty (US5-1 / FR-5.1)
   *
   * Verifies:
   * 1. Booking existence & ownership (uid matches) -> 404 / 403 UNAUTHORIZED_CANCELLATION
   * 2. Booking status is PENDING:
   *    - ACTIVE (already checked in) -> 400 BOOKING_ALREADY_CHECKED_IN
   *    - CANCELLED -> 400 BOOKING_ALREADY_CANCELLED
   *    - COMPLETED / NO_SHOW -> 400 BOOKING_NOT_PENDING
   * 3. Cutoff deadline check:
   *    - Cancellation must occur before startDateTime (cutoff time).
   *    - If now >= startDateTime -> 400 CANCELLATION_DEADLINE_PASSED
   * 4. Atomic Transaction:
   *    - Updates booking status to CANCELLED
   *    - Releases table status back to AVAILABLE
   *    - Clears any temporary hold locks on the table
   *    - ZERO PENALTY: User behavior score is untouched, no record inserted into ManageScore
   */
  static async cancelBooking(
    userId: number,
    bookingId: number,
    now: Date = new Date(),
    prisma: any = defaultPrisma
  ) {
    return await this.withTimeout(async () => {
      // 1. Fetch system configuration (with fallback) for check-in window & cancellation cutoff
      let config = null;
      try {
        config = prisma.systemConfig?.findFirst ? await prisma.systemConfig.findFirst() : null;
      } catch {
        // Fallback defaults if SystemConfig query fails
      }
      const earlyCheckInMinutes = config?.earlyCheckInMinutes ?? 15;
      const cancellationCutoffMs = earlyCheckInMinutes * 60 * 1000;

      const booking = await prisma.booking.findUnique({
        where: { bookingId },
        include: { table: true },
      });

      if (!booking) {
        throw { status: 404, code: 'BOOKING_NOT_FOUND', message: 'Booking not found' };
      }

      if (booking.uid !== userId) {
        throw {
          status: 403,
          code: 'UNAUTHORIZED_CANCELLATION',
          message: 'You do not have permission to cancel this reservation.',
        };
      }

      if (booking.status === BookingStatus.ACTIVE) {
        throw {
          status: 400,
          code: 'BOOKING_ALREADY_CHECKED_IN',
          message: 'You’ve already checked in. This reservation can no longer be cancelled.',
        };
      }

      if (booking.status === BookingStatus.CANCELLED) {
        throw {
          status: 400,
          code: 'BOOKING_ALREADY_CANCELLED',
          message: 'This reservation is already cancelled.',
        };
      }

      if (booking.status !== BookingStatus.PENDING) {
        throw {
          status: 400,
          code: 'BOOKING_NOT_PENDING',
          message: 'This reservation is no longer pending and cannot be cancelled.',
        };
      }

      // Cutoff deadline check: Must cancel before the early check-in window opens (AC 5.1.1)
      const cutoffTime = new Date(booking.startDateTime.getTime() - cancellationCutoffMs);
      if (now >= cutoffTime) {
        throw {
          status: 400,
          code: 'CANCELLATION_DEADLINE_PASSED',
          message:
            'The cancellation deadline has passed. This reservation can no longer be cancelled.',
        };
      }

      // Atomic Transaction: Cancel booking, restore table availability, zero penalty to user score
      const executeInTx = async (tx: any) => {
        // Optimistic Concurrency Guard: Atomic update only if still PENDING (prevents check-in race condition)
        const updateResult = await tx.booking.updateMany({
          where: {
            bookingId,
            status: BookingStatus.PENDING,
          },
          data: {
            status: BookingStatus.CANCELLED,
          },
        });

        if (updateResult.count === 0) {
          // If count === 0, the booking state changed concurrently (e.g. checked in or cancelled)
          const currentBooking = tx.booking.findUnique
            ? await tx.booking.findUnique({
                where: { bookingId },
                select: { status: true },
              })
            : null;

          if (currentBooking?.status === BookingStatus.ACTIVE) {
            throw {
              status: 400,
              code: 'BOOKING_ALREADY_CHECKED_IN',
              message: 'You’ve already checked in. This reservation can no longer be cancelled.',
            };
          }
          if (currentBooking?.status === BookingStatus.CANCELLED) {
            throw {
              status: 400,
              code: 'BOOKING_ALREADY_CANCELLED',
              message: 'This reservation is already cancelled.',
            };
          }
          throw {
            status: 400,
            code: 'BOOKING_NOT_PENDING',
            message: 'This reservation is no longer pending and cannot be cancelled.',
          };
        }

        // Release table back to AVAILABLE (if table exists and is not closed for maintenance)
        if (booking.table && booking.table.status !== TableStatus.CLOSED) {
          // Check if another active or pending booking overlaps right now
          let ongoingBooking = null;
          if (tx.booking.findFirst) {
            ongoingBooking = await tx.booking.findFirst({
              where: {
                tableId: booking.tableId,
                bookingId: { not: bookingId },
                status: { in: [BookingStatus.ACTIVE, BookingStatus.PENDING] },
                startDateTime: { lte: now },
                endDateTime: { gt: now },
              },
            });
          }

          const targetStatus = ongoingBooking
            ? ongoingBooking.status === BookingStatus.ACTIVE
              ? TableStatus.OCCUPIED
              : TableStatus.RESERVED
            : TableStatus.AVAILABLE;

          if (tx.table.update) {
            await tx.table.update({
              where: { tableId: booking.tableId },
              data: {
                status: targetStatus,
              },
            });
          }
        }

        // Clear hold lock ONLY if locked by this user (prevent clearing another user's active hold lock)
        if (tx.table.updateMany) {
          await tx.table.updateMany({
            where: {
              tableId: booking.tableId,
              lockedByUid: userId,
            },
            data: {
              lockToken: null,
              lockedUntil: null,
              lockedByUid: null,
            },
          });
        }

        // Zero-penalty behavior score logic (Andy, Poom):
        // Upon valid cancellation before cutoff, the user's behaviourScore remains untouched.
        // We deliberately omit score deductions and ManageScore log records to ensure a zero-penalty guarantee.

        // Structured audit logging for booking cancellation
        console.log(
          `[BookingCancellation] Booking #${bookingId} successfully cancelled by User #${userId} at ${now.toISOString()}`
        );

        // Fetch updated booking payload
        const updatedBooking = tx.booking.findUnique
          ? await tx.booking.findUnique({
              where: { bookingId },
              include: {
                table: {
                  include: {
                    zone: true,
                  },
                },
              },
            })
          : { ...booking, status: BookingStatus.CANCELLED };

        return updatedBooking;
      };

      if (prisma.$transaction) {
        return await prisma.$transaction(executeInTx);
      } else {
        return await executeInTx(prisma);
      }
    });
  }
}

/**
 * Fetch booking history for a user (Completed, Cancelled, and No-show bookings) - AC 3.3.1
 * Active and Pending bookings are excluded as they are displayed on the Home dashboard card.
 * @param uid User ID
 * @returns Array of bookings with table and zone information, ordered by startDateTime descending
 */
export async function getBookingHistory(uid: number): Promise<BookingWithTableAndZone[]> {
  const bookings = await defaultPrisma.booking.findMany({
    where: {
      uid,
      status: {
        in: [BookingStatus.COMPLETED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW],
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
export async function getActiveBooking(
  uid: number,
  now: Date = new Date(),
  prisma: any = defaultPrisma
): Promise<BookingWithTableAndZone | null> {
  const booking = await prisma.booking.findFirst({
    where: {
      uid,
      status: {
        in: [BookingStatus.PENDING, BookingStatus.ACTIVE],
      },
      endDateTime: {
        gt: now,
      },
    },
    include: {
      table: {
        include: {
          zone: true,
        },
      },
    },
  });

  if (!booking) return null;

  // Read system configuration for early check-in window / cancellation cutoff
  let config = null;
  try {
    config = prisma.systemConfig?.findFirst ? await prisma.systemConfig.findFirst() : null;
  } catch {
    // fallback
  }
  const earlyCheckInMinutes = config?.earlyCheckInMinutes ?? 15;
  const cancellationCutoffMs = earlyCheckInMinutes * 60 * 1000;
  const deadline = new Date(booking.startDateTime.getTime() - cancellationCutoffMs);

  // Compute cancellation metadata for frontend ActiveBookingCard / CancelReservationModal
  const isPending = booking.status === BookingStatus.PENDING;
  const isBeforeDeadline = now < deadline;
  const allowed = isPending && isBeforeDeadline;

  let reason: string | undefined;
  if (booking.status === BookingStatus.ACTIVE) {
    reason = 'Checked-in reservations cannot be cancelled.';
  } else if (!isBeforeDeadline) {
    reason = 'The cancellation deadline has passed (check-in window is open).';
  }

  const result = {
    ...booking,
    cancellation: {
      allowed,
      deadline: deadline.toISOString(),
      ...(reason ? { reason } : {}),
    },
  };

  return result as unknown as BookingWithTableAndZone;
}

export default BookingService;
