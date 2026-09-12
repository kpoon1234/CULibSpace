import {
  PrismaClient,
  UserType,
  TableStatus,
  BookingStatus,
  TicketStatus,
  SystemConfig,
} from '@prisma/client';
import { ScheduleService } from './scheduleService.js';
import crypto from 'crypto';

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

      const userScore = Number(user.behaviourScore);
      if (userScore < minScoreToBook) {
        throw {
          status: 403,
          code: 'INSUFFICIENT_BEHAVIOUR_SCORE',
          message: `Your behavior credit score (${userScore.toFixed(1)}) is below the minimum required (${minScoreToBook.toFixed(1)}) to make a reservation`,
        } as BookingValidationError;
      }

      // ==========================================
      // 3. 1-Booking-Per-User Policy (US3-1 / FR-3.2)
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
      // 4. Table Existence, Maintenance & Availability (US3-1 / FR-3.1, FR-3.4)
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

      // Check if table is currently locked by another user (5-min Hold Lock)
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

  static async acquireLock(tableId: number, userId: number, prisma: any = defaultPrisma) {
    return await this.withTimeout(async () => {
      const table = await prisma.table.findUnique({ where: { tableId } });

      if (!table) throw { status: 404, code: 'TABLE_NOT_FOUND', message: 'Table not found' };
      if (table.status === TableStatus.CLOSED)
        throw { status: 400, code: 'TABLE_CLOSED', message: 'Table is closed' };

      const now = new Date();
      if (table.lockedUntil && new Date(table.lockedUntil) > now) {
        throw {
          status: 409,
          code: 'TABLE_LOCKED',
          message: 'Table is currently on hold by another user.',
        };
      }

      const lockToken = crypto.randomUUID();
      const lockedUntil = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes hold

      await prisma.table.update({
        where: { tableId },
        data: { lockToken, lockedUntil },
      });

      return { lockToken, lockedUntil };
    });
  }

  static async createBooking(input: BookingValidationInput, prisma: any = defaultPrisma) {
    // Re-validate all rules before saving (prevents bypassed holds)
    await this.validateBookingRules(input, prisma);

    // Execute database transaction to guarantee atomicity
    return await prisma.$transaction(async (tx: any) => {
      const newBooking = await tx.booking.create({
        data: {
          uid: input.userId,
          tableId: input.tableId,
          startDateTime: input.startDateTime,
          endDateTime: input.endDateTime,
          status: BookingStatus.PENDING,
        },
      });

      // Clear the hold-lock since the reservation is now secured
      await tx.table.update({
        where: { tableId: input.tableId },
        data: { lockToken: null, lockedUntil: null },
      });

      return newBooking;
    });
  }
}
