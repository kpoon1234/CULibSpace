import { BookingService } from './services/bookingService.js';
import { BookingController } from './controllers/bookingController.js';
import { BookingStatus, TableStatus } from '@prisma/client';

console.log('===============================================================');
console.log('🧪 US5-1: Cancel Booking API & Zero Penalty Test Suite');
console.log('===============================================================\n');

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
}

async function runTests() {
  const userId = 10;
  const otherUserId = 99;
  const bookingId = 501;
  const tableId = 301;
  const bookingStart = new Date('2026-10-05T16:00:00Z');
  const bookingEnd = new Date('2026-10-05T18:00:00Z');

  // =========================================================================
  // Test Group 1: Service - Valid Cancellation Before Cutoff (AC 5.1.1)
  // =========================================================================
  console.log('--- Test Group 1: Valid Cancellation Before Cutoff (AC 5.1.1) ---');
  {
    const mockNow = new Date('2026-10-05T15:30:00Z'); // 30 mins before start
    let updatedBookingStatus: any = null;
    let updatedTableData: any = null;

    const mockPrisma = {
      booking: {
        findUnique: async () => ({
          bookingId,
          uid: userId,
          tableId,
          startDateTime: bookingStart,
          endDateTime: bookingEnd,
          status: BookingStatus.PENDING,
          table: {
            tableId,
            status: TableStatus.RESERVED,
            lockToken: 'lock-token-123',
            lockedUntil: new Date('2026-10-05T15:35:00Z'),
            lockedByUid: userId,
          },
        }),
      },
      $transaction: async (callback: any) => {
        const tx = {
          booking: {
            update: async ({ data }: any) => {
              updatedBookingStatus = data.status;
              return {
                bookingId,
                uid: userId,
                tableId,
                status: data.status,
                startDateTime: bookingStart,
                endDateTime: bookingEnd,
                table: { tableId, status: TableStatus.AVAILABLE, zone: { zid: 1, name: 'Zone A' } },
              };
            },
          },
          table: {
            update: async ({ data }: any) => {
              updatedTableData = data;
              return { tableId, ...data };
            },
          },
        };
        return await callback(tx);
      },
    };

    try {
      const result = await BookingService.cancelBooking(userId, bookingId, mockNow, mockPrisma);
      assert(
        result.status === BookingStatus.CANCELLED &&
          updatedBookingStatus === BookingStatus.CANCELLED,
        'AC 5.1.1: Booking status transitions from PENDING to CANCELLED'
      );
      assert(
        updatedTableData?.status === TableStatus.AVAILABLE &&
          updatedTableData?.lockToken === null &&
          updatedTableData?.lockedUntil === null &&
          updatedTableData?.lockedByUid === null,
        'AC 5.1.1: Table status released back to AVAILABLE and locks cleared'
      );
    } catch (err: any) {
      assert(false, 'Valid cancellation before cutoff failed unexpectedly', err?.message);
    }
  }

  // =========================================================================
  // Test Group 2: Service - Rejection Scenarios (AC 5.1.1 / AC 5.1.3)
  // =========================================================================
  console.log('\n--- Test Group 2: Rejection Scenarios ---');

  // Case 2.1: Cutoff deadline passed (now >= startDateTime)
  {
    const mockNow = new Date('2026-10-05T16:00:00Z'); // Exact start time
    const mockPrisma = {
      booking: {
        findUnique: async () => ({
          bookingId,
          uid: userId,
          tableId,
          startDateTime: bookingStart,
          endDateTime: bookingEnd,
          status: BookingStatus.PENDING,
          table: { tableId, status: TableStatus.RESERVED },
        }),
      },
    };

    try {
      await BookingService.cancelBooking(userId, bookingId, mockNow, mockPrisma);
      assert(false, 'Should reject when now >= startDateTime');
    } catch (err: any) {
      assert(
        err.status === 400 && err.code === 'CANCELLATION_DEADLINE_PASSED',
        'Rejection: Past cutoff deadline returns 400 CANCELLATION_DEADLINE_PASSED'
      );
    }
  }

  // Case 2.2: Already checked in (ACTIVE)
  {
    const mockNow = new Date('2026-10-05T15:30:00Z');
    const mockPrisma = {
      booking: {
        findUnique: async () => ({
          bookingId,
          uid: userId,
          tableId,
          startDateTime: bookingStart,
          endDateTime: bookingEnd,
          status: BookingStatus.ACTIVE,
          table: { tableId, status: TableStatus.OCCUPIED },
        }),
      },
    };

    try {
      await BookingService.cancelBooking(userId, bookingId, mockNow, mockPrisma);
      assert(false, 'Should reject when status is ACTIVE');
    } catch (err: any) {
      assert(
        err.status === 400 && err.code === 'BOOKING_ALREADY_CHECKED_IN',
        'Rejection: Active booking returns 400 BOOKING_ALREADY_CHECKED_IN'
      );
    }
  }

  // Case 2.3: Already cancelled
  {
    const mockNow = new Date('2026-10-05T15:30:00Z');
    const mockPrisma = {
      booking: {
        findUnique: async () => ({
          bookingId,
          uid: userId,
          tableId,
          startDateTime: bookingStart,
          endDateTime: bookingEnd,
          status: BookingStatus.CANCELLED,
          table: { tableId, status: TableStatus.AVAILABLE },
        }),
      },
    };

    try {
      await BookingService.cancelBooking(userId, bookingId, mockNow, mockPrisma);
      assert(false, 'Should reject when already cancelled');
    } catch (err: any) {
      assert(
        err.status === 400 && err.code === 'BOOKING_ALREADY_CANCELLED',
        'Rejection: Already cancelled booking returns 400 BOOKING_ALREADY_CANCELLED'
      );
    }
  }

  // Case 2.4: Completed or No-Show (non-pending)
  {
    const mockNow = new Date('2026-10-05T15:30:00Z');
    const mockPrisma = {
      booking: {
        findUnique: async () => ({
          bookingId,
          uid: userId,
          tableId,
          startDateTime: bookingStart,
          endDateTime: bookingEnd,
          status: BookingStatus.NO_SHOW,
          table: { tableId, status: TableStatus.AVAILABLE },
        }),
      },
    };

    try {
      await BookingService.cancelBooking(userId, bookingId, mockNow, mockPrisma);
      assert(false, 'Should reject when status is NO_SHOW');
    } catch (err: any) {
      assert(
        err.status === 400 && err.code === 'BOOKING_NOT_PENDING',
        'Rejection: Non-pending booking returns 400 BOOKING_NOT_PENDING'
      );
    }
  }

  // Case 2.5: Unauthorized user trying to cancel someone else's booking
  {
    const mockNow = new Date('2026-10-05T15:30:00Z');
    const mockPrisma = {
      booking: {
        findUnique: async () => ({
          bookingId,
          uid: otherUserId, // belongs to another user
          tableId,
          startDateTime: bookingStart,
          endDateTime: bookingEnd,
          status: BookingStatus.PENDING,
          table: { tableId, status: TableStatus.RESERVED },
        }),
      },
    };

    try {
      await BookingService.cancelBooking(userId, bookingId, mockNow, mockPrisma);
      assert(false, 'Should reject when user does not own the booking');
    } catch (err: any) {
      assert(
        err.status === 403 && err.code === 'UNAUTHORIZED_CANCELLATION',
        'Rejection: Unauthorized cancellation returns 403 UNAUTHORIZED_CANCELLATION'
      );
    }
  }

  // Case 2.6: Booking not found
  {
    const mockNow = new Date('2026-10-05T15:30:00Z');
    const mockPrisma = {
      booking: {
        findUnique: async () => null,
      },
    };

    try {
      await BookingService.cancelBooking(userId, 9999, mockNow, mockPrisma);
      assert(false, 'Should reject when booking does not exist');
    } catch (err: any) {
      assert(
        err.status === 404 && err.code === 'BOOKING_NOT_FOUND',
        'Rejection: Non-existent booking returns 404 BOOKING_NOT_FOUND'
      );
    }
  }

  // =========================================================================
  // Test Group 3: Controller HTTP Request/Response Handling
  // =========================================================================
  console.log('\n--- Test Group 3: Controller HTTP Handling ---');

  // Case 3.1: Unauthenticated request
  {
    const req = { user: undefined, params: { bookingId: '501' } } as any;
    const res = createMockRes();
    await BookingController.cancel(req, res as any);
    assert(res.statusCode === 401, 'Controller: Unauthenticated request returns 401');
    assert(res.body?.error === 'Unauthorized', 'Controller: Returns 401 error message');
  }

  // Case 3.2: Invalid booking ID parameter (non-numeric)
  {
    const req = { user: { uid: 10 }, params: { bookingId: 'abc' } } as any;
    const res = createMockRes();
    await BookingController.cancel(req, res as any);
    assert(res.statusCode === 400, 'Controller: Invalid booking ID parameter returns 400');
    assert(res.body?.error === 'Invalid booking ID', 'Controller: Returns 400 error message');
  }

  // Case 3.3: Service throws an error -> controller returns proper status & payload
  {
    const req = { user: { uid: 10 }, params: { bookingId: '501' } } as any;
    const res = createMockRes();

    // Temporarily mock BookingService.cancelBooking
    const originalCancelBooking = BookingService.cancelBooking;
    BookingService.cancelBooking = async () => {
      throw {
        status: 400,
        code: 'CANCELLATION_DEADLINE_PASSED',
        message: 'The cancellation deadline has passed.',
      };
    };

    await BookingController.cancel(req, res as any);
    assert(res.statusCode === 400, 'Controller: Service error mapped to HTTP 400');
    assert(
      res.body?.code === 'CANCELLATION_DEADLINE_PASSED',
      'Controller: Returns correct error code'
    );
    assert(res.body?.success === false, 'Controller: Returns success: false on error');

    // Restore original method
    BookingService.cancelBooking = originalCancelBooking;
  }

  // Case 3.4: Successful cancellation response
  {
    const req = { user: { uid: 10 }, params: { bookingId: '501' } } as any;
    const res = createMockRes();

    const originalCancelBooking = BookingService.cancelBooking;
    BookingService.cancelBooking = async () => {
      return {
        bookingId: 501,
        uid: 10,
        status: BookingStatus.CANCELLED,
      } as any;
    };

    await BookingController.cancel(req, res as any);
    assert(res.statusCode === 200, 'Controller: Successful cancellation returns HTTP 200');
    assert(res.body?.success === true, 'Controller: Returns success: true');
    assert(
      res.body?.data?.status === BookingStatus.CANCELLED,
      'Controller: Returns cancelled booking data'
    );

    BookingService.cancelBooking = originalCancelBooking;
  }

  // =========================================================================
  // Test Group 4: Zero-Penalty Behavior Score Preservation (Andy, Poom)
  // =========================================================================
  console.log('\n--- Test Group 4: Zero-Penalty Behavior Score Logic Guarantee (Andy, Poom) ---');

  // Case 4.1: User starting with 100 behavior score maintains 100 score on valid cancellation
  {
    const mockNow = new Date('2026-10-05T15:00:00Z');
    let userScore = 100;
    let userScoreMutated = false;
    let auditLogCreated = false;

    const mockPrisma = {
      booking: {
        findUnique: async () => ({
          bookingId: 701,
          uid: userId,
          tableId,
          startDateTime: bookingStart,
          endDateTime: bookingEnd,
          status: BookingStatus.PENDING,
          table: { tableId, status: TableStatus.RESERVED },
        }),
      },
      user: {
        update: async ({ data }: any) => {
          if (data?.behaviourScore !== undefined) userScoreMutated = true;
          return { uid: userId, behaviourScore: userScore };
        },
      },
      manageScore: {
        create: async () => {
          auditLogCreated = true;
          return {};
        },
      },
      $transaction: async (callback: any) => {
        const tx = {
          booking: {
            update: async ({ data }: any) => ({
              bookingId: 701,
              uid: userId,
              status: data.status,
            }),
          },
          table: {
            update: async ({ data }: any) => ({ tableId, ...data }),
          },
        };
        return await callback(tx);
      },
    };

    const result = await BookingService.cancelBooking(userId, 701, mockNow, mockPrisma);
    assert(
      result.status === BookingStatus.CANCELLED,
      'Case 4.1: Booking status transitioned to CANCELLED'
    );
    assert(
      !userScoreMutated && userScore === 100,
      'Case 4.1: Perfect score (100) preserved without deduction'
    );
    assert(!auditLogCreated, 'Case 4.1: No ManageScore penalty log created on valid cancellation');
  }

  // Case 4.2: User starting with lower score (80) maintains 80 score without penalty
  {
    const mockNow = new Date('2026-10-05T15:00:00Z');
    let userScore = 80;
    let userScoreMutated = false;
    let auditLogCreated = false;

    const mockPrisma = {
      booking: {
        findUnique: async () => ({
          bookingId: 702,
          uid: userId,
          tableId,
          startDateTime: bookingStart,
          endDateTime: bookingEnd,
          status: BookingStatus.PENDING,
          table: { tableId, status: TableStatus.RESERVED },
        }),
      },
      user: {
        update: async ({ data }: any) => {
          if (data?.behaviourScore !== undefined) userScoreMutated = true;
          return { uid: userId, behaviourScore: userScore };
        },
      },
      manageScore: {
        create: async () => {
          auditLogCreated = true;
          return {};
        },
      },
      $transaction: async (callback: any) => {
        const tx = {
          booking: {
            update: async ({ data }: any) => ({
              bookingId: 702,
              uid: userId,
              status: data.status,
            }),
          },
          table: {
            update: async ({ data }: any) => ({ tableId, ...data }),
          },
        };
        return await callback(tx);
      },
    };

    const result = await BookingService.cancelBooking(userId, 702, mockNow, mockPrisma);
    assert(
      result.status === BookingStatus.CANCELLED,
      'Case 4.2: Booking status transitioned to CANCELLED'
    );
    assert(
      !userScoreMutated && userScore === 80,
      'Case 4.2: Pre-existing score (80) preserved without penalty'
    );
    assert(!auditLogCreated, 'Case 4.2: Zero-penalty audit log guarantee satisfied');
  }

  console.log('\n===============================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
