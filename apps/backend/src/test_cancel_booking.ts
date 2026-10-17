import { BookingService, getActiveBooking } from './services/bookingService.js';
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
    const mockNow = new Date('2026-10-05T15:30:00Z'); // 30 mins before start (before 15-min check-in window)
    let updatedBookingStatus: any = null;
    let updatedTableStatus: any = null;
    let updatedTableLockData: any = null;

    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ earlyCheckInMinutes: 15 }),
      },
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
            updateMany: async ({ data }: any) => {
              updatedBookingStatus = data.status;
              return { count: 1 };
            },
            findFirst: async () => null, // No other overlapping booking
            findUnique: async () => ({
              bookingId,
              uid: userId,
              tableId,
              status: BookingStatus.CANCELLED,
              startDateTime: bookingStart,
              endDateTime: bookingEnd,
              table: { tableId, status: TableStatus.AVAILABLE, zone: { zid: 1, name: 'Zone A' } },
            }),
          },
          table: {
            update: async ({ data }: any) => {
              updatedTableStatus = data.status;
              return { tableId, ...data };
            },
            updateMany: async ({ where, data }: any) => {
              updatedTableLockData = { where, data };
              return { count: 1 };
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
        updatedTableStatus === TableStatus.AVAILABLE,
        'AC 5.1.1: Table status released back to AVAILABLE'
      );
      assert(
        updatedTableLockData?.where?.lockedByUid === userId &&
          updatedTableLockData?.data?.lockToken === null &&
          updatedTableLockData?.data?.lockedUntil === null &&
          updatedTableLockData?.data?.lockedByUid === null,
        'AC 5.1.1: Hold locks scoped to user cleared upon cancellation'
      );
    } catch (err: any) {
      assert(false, 'Valid cancellation before cutoff failed unexpectedly', err?.message);
    }
  }

  // =========================================================================
  // Test Group 2: Table Overlap & Concurrency Guards (PR Review Items 1 & 2)
  // =========================================================================
  console.log('\n--- Test Group 2: Table Overlap & Concurrency Guards ---');

  // Case 2.1: Table has another ongoing ACTIVE booking -> Table status preserved as OCCUPIED
  {
    const mockNow = new Date('2026-10-05T15:30:00Z');
    let recordedTableStatus: any = null;

    const mockPrisma = {
      systemConfig: { findFirst: async () => ({ earlyCheckInMinutes: 15 }) },
      booking: {
        findUnique: async () => ({
          bookingId,
          uid: userId,
          tableId,
          startDateTime: bookingStart,
          endDateTime: bookingEnd,
          status: BookingStatus.PENDING,
          table: { tableId, status: TableStatus.OCCUPIED },
        }),
      },
      $transaction: async (callback: any) => {
        const tx = {
          booking: {
            updateMany: async () => ({ count: 1 }),
            // Another active booking exists covering now
            findFirst: async () => ({
              bookingId: 999,
              tableId,
              status: BookingStatus.ACTIVE,
            }),
            findUnique: async () => ({
              bookingId,
              uid: userId,
              status: BookingStatus.CANCELLED,
            }),
          },
          table: {
            update: async ({ data }: any) => {
              recordedTableStatus = data.status;
              return { tableId, ...data };
            },
            updateMany: async () => ({ count: 0 }),
          },
        };
        return await callback(tx);
      },
    };

    try {
      await BookingService.cancelBooking(userId, bookingId, mockNow, mockPrisma);
      assert(
        recordedTableStatus === TableStatus.OCCUPIED,
        'Item 2: Preserves OCCUPIED table status when another active booking is ongoing'
      );
    } catch (err: any) {
      assert(false, 'Case 2.1 failed unexpectedly', err?.message);
    }
  }

  // Case 2.2: Race condition - Concurrent check-in happens before cancel (updateMany count === 0)
  {
    const mockNow = new Date('2026-10-05T15:30:00Z');

    const mockPrisma = {
      systemConfig: { findFirst: async () => ({ earlyCheckInMinutes: 15 }) },
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
      $transaction: async (callback: any) => {
        const tx = {
          booking: {
            updateMany: async () => ({ count: 0 }), // 0 updated due to race condition
            findUnique: async () => ({
              bookingId,
              status: BookingStatus.ACTIVE, // Already checked in concurrently
            }),
          },
          table: {
            update: async () => ({}),
            updateMany: async () => ({ count: 0 }),
          },
        };
        return await callback(tx);
      },
    };

    try {
      await BookingService.cancelBooking(userId, bookingId, mockNow, mockPrisma);
      assert(false, 'Should throw error when updateMany count is 0 due to concurrent check-in');
    } catch (err: any) {
      assert(
        err.status === 400 && err.code === 'BOOKING_ALREADY_CHECKED_IN',
        'Item 1: Race condition guard detects concurrent check-in and rejects with BOOKING_ALREADY_CHECKED_IN'
      );
    }
  }

  // Case 2.3: Race condition - Concurrent cancellation happens before cancel (updateMany count === 0)
  {
    const mockNow = new Date('2026-10-05T15:30:00Z');

    const mockPrisma = {
      systemConfig: { findFirst: async () => ({ earlyCheckInMinutes: 15 }) },
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
      $transaction: async (callback: any) => {
        const tx = {
          booking: {
            updateMany: async () => ({ count: 0 }),
            findUnique: async () => ({
              bookingId,
              status: BookingStatus.CANCELLED, // Already cancelled concurrently
            }),
          },
          table: {
            update: async () => ({}),
            updateMany: async () => ({ count: 0 }),
          },
        };
        return await callback(tx);
      },
    };

    try {
      await BookingService.cancelBooking(userId, bookingId, mockNow, mockPrisma);
      assert(false, 'Should throw error when updateMany count is 0 due to concurrent cancellation');
    } catch (err: any) {
      assert(
        err.status === 400 && err.code === 'BOOKING_ALREADY_CANCELLED',
        'Item 1: Race condition guard detects concurrent cancellation and rejects with BOOKING_ALREADY_CANCELLED'
      );
    }
  }

  // =========================================================================
  // Test Group 3: Rejection Scenarios (AC 5.1.1 / AC 5.1.3 / PR Review Item 3)
  // =========================================================================
  console.log('\n--- Test Group 3: Rejection Scenarios ---');

  // Case 3.1: Inside check-in window (e.g. 10 mins before start) -> CANCELLATION_DEADLINE_PASSED
  {
    const mockNow = new Date('2026-10-05T15:50:00Z'); // 10 mins before start (inside 15-min check-in window)
    const mockPrisma = {
      systemConfig: { findFirst: async () => ({ earlyCheckInMinutes: 15 }) },
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
      assert(false, 'Should reject when now is within the check-in window');
    } catch (err: any) {
      assert(
        err.status === 400 && err.code === 'CANCELLATION_DEADLINE_PASSED',
        'Item 3: Rejects cancellation within early check-in window with 400 CANCELLATION_DEADLINE_PASSED'
      );
    }
  }

  // Case 3.2: Past start time (now >= startDateTime)
  {
    const mockNow = new Date('2026-10-05T16:00:00Z'); // Exact start time
    const mockPrisma = {
      systemConfig: { findFirst: async () => ({ earlyCheckInMinutes: 15 }) },
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

  // Case 3.3: Already checked in (ACTIVE)
  {
    const mockNow = new Date('2026-10-05T15:30:00Z');
    const mockPrisma = {
      systemConfig: { findFirst: async () => ({ earlyCheckInMinutes: 15 }) },
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

  // Case 3.4: Already cancelled
  {
    const mockNow = new Date('2026-10-05T15:30:00Z');
    const mockPrisma = {
      systemConfig: { findFirst: async () => ({ earlyCheckInMinutes: 15 }) },
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

  // Case 3.5: Completed or No-Show (non-pending)
  {
    const mockNow = new Date('2026-10-05T15:30:00Z');
    const mockPrisma = {
      systemConfig: { findFirst: async () => ({ earlyCheckInMinutes: 15 }) },
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

  // Case 3.6: Unauthorized user trying to cancel someone else's booking
  {
    const mockNow = new Date('2026-10-05T15:30:00Z');
    const mockPrisma = {
      systemConfig: { findFirst: async () => ({ earlyCheckInMinutes: 15 }) },
      booking: {
        findUnique: async () => ({
          bookingId,
          uid: otherUserId,
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

  // Case 3.7: Booking not found
  {
    const mockNow = new Date('2026-10-05T15:30:00Z');
    const mockPrisma = {
      systemConfig: { findFirst: async () => ({ earlyCheckInMinutes: 15 }) },
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
  // Test Group 4: Controller HTTP Handling (PR Review Item 5)
  // =========================================================================
  console.log('\n--- Test Group 4: Controller HTTP Handling ---');

  // Case 4.1: Unauthenticated request
  {
    const req = { user: undefined, params: { bookingId: '501' } } as any;
    const res = createMockRes();
    await BookingController.cancel(req, res as any);
    assert(res.statusCode === 401, 'Controller: Unauthenticated request returns 401');
    assert(res.body?.error === 'Unauthorized', 'Controller: Returns 401 error message');
  }

  // Case 4.2: Invalid booking ID parameter (non-numeric string '12abc')
  {
    const req = { user: { uid: 10 }, params: { bookingId: '12abc' } } as any;
    const res = createMockRes();
    await BookingController.cancel(req, res as any);
    assert(res.statusCode === 400, 'Item 5: Strict validation rejects 12abc with 400');
    assert(res.body?.error === 'Invalid booking ID', 'Item 5: Returns 400 error message for 12abc');
  }

  // Case 4.3: Invalid booking ID parameter (pure non-numeric 'abc')
  {
    const req = { user: { uid: 10 }, params: { bookingId: 'abc' } } as any;
    const res = createMockRes();
    await BookingController.cancel(req, res as any);
    assert(res.statusCode === 400, 'Controller: Invalid booking ID parameter returns 400');
    assert(res.body?.error === 'Invalid booking ID', 'Controller: Returns 400 error message');
  }

  // Case 4.4: Service throws an error -> controller returns proper status & payload
  {
    const req = { user: { uid: 10 }, params: { bookingId: '501' } } as any;
    const res = createMockRes();

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

    BookingService.cancelBooking = originalCancelBooking;
  }

  // Case 4.5: Successful cancellation response
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
  // Test Group 5: Zero-Penalty Behavior Score Preservation (PR Review Item 4)
  // =========================================================================
  console.log('\n--- Test Group 5: Zero-Penalty Behavior Score Logic Guarantee (Andy, Poom) ---');

  // Case 5.1: User starting with 100 behavior score maintains 100 score on valid cancellation
  {
    const mockNow = new Date('2026-10-05T15:00:00Z');
    let userScore = 100;
    let userScoreMutated = false;
    let auditLogCreated = false;

    const mockPrisma = {
      systemConfig: { findFirst: async () => ({ earlyCheckInMinutes: 15 }) },
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
            updateMany: async () => ({ count: 1 }),
            findFirst: async () => null,
            findUnique: async () => ({
              bookingId: 701,
              uid: userId,
              status: BookingStatus.CANCELLED,
            }),
          },
          table: {
            update: async ({ data }: any) => ({ tableId, ...data }),
            updateMany: async () => ({ count: 1 }),
          },
          user: {
            update: async () => {
              userScoreMutated = true;
              throw new Error(
                'VIOLATION: user.update was invoked during zero-penalty cancellation!'
              );
            },
          },
          manageScore: {
            create: async () => {
              auditLogCreated = true;
              throw new Error(
                'VIOLATION: manageScore.create was invoked during zero-penalty cancellation!'
              );
            },
          },
        };
        return await callback(tx);
      },
    };

    const result = await BookingService.cancelBooking(userId, 701, mockNow, mockPrisma);
    assert(
      result.status === BookingStatus.CANCELLED,
      'Case 5.1: Booking status transitioned to CANCELLED'
    );
    assert(
      !userScoreMutated && userScore === 100,
      'Case 5.1: Perfect score (100) preserved without deduction'
    );
    assert(!auditLogCreated, 'Case 5.1: No ManageScore penalty log created on valid cancellation');
  }

  // Case 5.2: User starting with lower score (80) maintains 80 score without penalty
  {
    const mockNow = new Date('2026-10-05T15:00:00Z');
    let userScore = 80;
    let userScoreMutated = false;
    let auditLogCreated = false;

    const mockPrisma = {
      systemConfig: { findFirst: async () => ({ earlyCheckInMinutes: 15 }) },
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
            updateMany: async () => ({ count: 1 }),
            findFirst: async () => null,
            findUnique: async () => ({
              bookingId: 702,
              uid: userId,
              status: BookingStatus.CANCELLED,
            }),
          },
          table: {
            update: async ({ data }: any) => ({ tableId, ...data }),
            updateMany: async () => ({ count: 1 }),
          },
          user: {
            update: async () => {
              userScoreMutated = true;
              throw new Error(
                'VIOLATION: user.update was invoked during zero-penalty cancellation!'
              );
            },
          },
          manageScore: {
            create: async () => {
              auditLogCreated = true;
              throw new Error(
                'VIOLATION: manageScore.create was invoked during zero-penalty cancellation!'
              );
            },
          },
        };
        return await callback(tx);
      },
    };

    const result = await BookingService.cancelBooking(userId, 702, mockNow, mockPrisma);
    assert(
      result.status === BookingStatus.CANCELLED,
      'Case 5.2: Booking status transitioned to CANCELLED'
    );
    assert(
      !userScoreMutated && userScore === 80,
      'Case 5.2: Pre-existing score (80) preserved without penalty'
    );
    assert(!auditLogCreated, 'Case 5.2: Zero-penalty audit log guarantee satisfied');
  }

  // =========================================================================
  // Test Group 6: getActiveBooking Cancellation Window Alignment (PR Review Item 3)
  // =========================================================================
  console.log('\n--- Test Group 6: getActiveBooking Cancellation Window Alignment ---');

  // Case 6.1: Before check-in window (e.g. 30 mins before start) -> cancellation allowed
  {
    const mockNow = new Date('2026-10-05T15:30:00Z');
    const mockPrisma = {
      systemConfig: { findFirst: async () => ({ earlyCheckInMinutes: 15 }) },
      booking: {
        findFirst: async () => ({
          bookingId: 801,
          uid: userId,
          tableId,
          startDateTime: bookingStart, // 16:00
          endDateTime: bookingEnd,
          status: BookingStatus.PENDING,
          table: { tableId, numberOfSeat: 4, zone: { zoneId: 1, zoneType: 'SILENT' } },
        }),
      },
    };

    const activeBooking = await getActiveBooking(userId, mockNow, mockPrisma);
    assert(activeBooking !== null, 'Case 6.1: Active booking found');
    assert(
      activeBooking?.cancellation?.allowed === true,
      'Case 6.1: Cancellation is allowed before check-in window opens'
    );
    assert(
      activeBooking?.cancellation?.deadline === '2026-10-05T15:45:00.000Z',
      'Case 6.1: Deadline aligns with early check-in window (15:45:00)'
    );
  }

  // Case 6.2: Inside check-in window (e.g. 10 mins before start) -> cancellation NOT allowed
  {
    const mockNow = new Date('2026-10-05T15:50:00Z');
    const mockPrisma = {
      systemConfig: { findFirst: async () => ({ earlyCheckInMinutes: 15 }) },
      booking: {
        findFirst: async () => ({
          bookingId: 802,
          uid: userId,
          tableId,
          startDateTime: bookingStart, // 16:00
          endDateTime: bookingEnd,
          status: BookingStatus.PENDING,
          table: { tableId, numberOfSeat: 4, zone: { zoneId: 1, zoneType: 'SILENT' } },
        }),
      },
    };

    const activeBooking = await getActiveBooking(userId, mockNow, mockPrisma);
    assert(
      activeBooking?.cancellation?.allowed === false,
      'Case 6.2: Cancellation is not allowed once check-in window opens'
    );
    assert(
      activeBooking?.cancellation?.reason?.includes('check-in window is open') === true,
      'Case 6.2: Provides clear reason for check-in window expiration'
    );
  }

  // Case 6.3: Booking already checked in (ACTIVE) -> cancellation NOT allowed
  {
    const mockNow = new Date('2026-10-05T15:50:00Z');
    const mockPrisma = {
      systemConfig: { findFirst: async () => ({ earlyCheckInMinutes: 15 }) },
      booking: {
        findFirst: async () => ({
          bookingId: 803,
          uid: userId,
          tableId,
          startDateTime: bookingStart,
          endDateTime: bookingEnd,
          status: BookingStatus.ACTIVE,
          table: { tableId, numberOfSeat: 4, zone: { zoneId: 1, zoneType: 'SILENT' } },
        }),
      },
    };

    const activeBooking = await getActiveBooking(userId, mockNow, mockPrisma);
    assert(
      activeBooking?.cancellation?.allowed === false,
      'Case 6.3: Checked-in booking cannot be cancelled'
    );
    assert(
      activeBooking?.cancellation?.reason === 'Checked-in reservations cannot be cancelled.',
      'Case 6.3: Reason explains checked-in reservations cannot be cancelled'
    );
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
