import { BookingService } from '../services/bookingService.js';
import { BookingStatus, TableStatus } from '@prisma/client';

console.log('===============================================================');
console.log('🧪 US4-1: Check-in Window Logic & State Transition Test Suite');
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

async function runTests() {
  console.log('--- Test Group 1: Check-in Window & Valid Check-in (AC 4.1.1) ---');
  // Start time: 14:00
  const bookingStart = new Date('2026-10-01T14:00:00Z');
  const bookingEnd = new Date('2026-10-01T16:00:00Z');
  const bookingId = 100;
  const userId = 42;
  const tableId = 201;

  // Window opens at 13:45 (15 mins before), grace period ends at 14:15 (15 mins after)
  // Let's test checking in at 13:50 (within early window)
  {
    const mockNow = new Date('2026-10-01T13:50:00Z');
    let updatedBookingStatus: any = null;
    let updatedTableStatus: any = null;

    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ earlyCheckInMinutes: 15, lateThresholdMinutes: 15 }),
      },
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
            update: async ({ data }: any) => {
              updatedBookingStatus = data.status;
              return { bookingId, status: data.status, arriveTime: data.arriveTime };
            },
          },
          table: {
            update: async ({ data }: any) => {
              updatedTableStatus = data.status;
              return { tableId, status: data.status };
            },
          },
        };
        return await callback(tx);
      },
    };

    // Test calling checkIn
    try {
      // @ts-ignore
      const result = await BookingService.checkIn(userId, bookingId, mockNow, mockPrisma);
      assert(
        result.status === BookingStatus.ACTIVE && updatedTableStatus === TableStatus.OCCUPIED,
        'AC 4.1.1: Valid check-in within window transitions booking to ACTIVE and table to OCCUPIED'
      );
    } catch (err: any) {
      assert(false, 'AC 4.1.1: Valid check-in within window', err?.message);
    }
  }

  console.log('\n--- Test Group 2: Too Early Check-in (AC 4.1.2) ---');
  // Check-in at 13:30 (30 mins before start, window opens 13:45)
  {
    const mockNow = new Date('2026-10-01T13:30:00Z');
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ earlyCheckInMinutes: 15, lateThresholdMinutes: 15 }),
      },
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
      // @ts-ignore
      await BookingService.checkIn(userId, bookingId, mockNow, mockPrisma);
      assert(false, 'AC 4.1.2: Too early check-in should be rejected');
    } catch (err: any) {
      assert(
        err.status === 400 && err.code === 'CHECK_IN_TOO_EARLY',
        'AC 4.1.2: Rejects check-in before window opens with CHECK_IN_TOO_EARLY',
        `Received code: ${err?.code}`
      );
    }
  }

  console.log('\n--- Test Group 3: Grace Period Expired / No-Show (AC 4.1.3) ---');
  // Check-in at 14:20 (grace period expired at 14:15)
  {
    const mockNow = new Date('2026-10-01T14:20:00Z');
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ earlyCheckInMinutes: 15, lateThresholdMinutes: 15 }),
      },
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
      // @ts-ignore
      await BookingService.checkIn(userId, bookingId, mockNow, mockPrisma);
      assert(false, 'AC 4.1.3: Check-in after grace period should be rejected');
    } catch (err: any) {
      assert(
        err.status === 400 && err.code === 'CHECK_IN_TOO_LATE',
        'AC 4.1.3: Rejects check-in after grace period expires with CHECK_IN_TOO_LATE',
        `Received code: ${err?.code}`
      );
    }
  }

  // Check-in on a reservation already marked NO_SHOW
  {
    const mockNow = new Date('2026-10-01T14:20:00Z');
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ earlyCheckInMinutes: 15, lateThresholdMinutes: 15 }),
      },
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
      // @ts-ignore
      await BookingService.checkIn(userId, bookingId, mockNow, mockPrisma);
      assert(false, 'AC 4.1.3: Check-in on NO_SHOW reservation should be rejected');
    } catch (err: any) {
      assert(
        err.status === 400,
        'AC 4.1.3: Rejects check-in on already NO_SHOW marked reservation',
        `Received: ${err?.code} - ${err?.message}`
      );
    }
  }

  console.log('\n--- Test Group 4: Ownership & Non-Existent Guard ---');
  // Check-in on someone else's booking
  {
    const mockNow = new Date('2026-10-01T13:50:00Z');
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ earlyCheckInMinutes: 15, lateThresholdMinutes: 15 }),
      },
      booking: {
        findUnique: async () => ({
          bookingId,
          uid: 999, // Someone else
          tableId,
          startDateTime: bookingStart,
          endDateTime: bookingEnd,
          status: BookingStatus.PENDING,
          table: { tableId, status: TableStatus.RESERVED },
        }),
      },
    };

    try {
      // @ts-ignore
      await BookingService.checkIn(userId, bookingId, mockNow, mockPrisma);
      assert(false, 'Should reject check-in by unauthorized user');
    } catch (err: any) {
      assert(
        err.status === 403 && err.code === 'UNAUTHORIZED_CHECKIN',
        'Rejects check-in attempt by non-owner with 403 UNAUTHORIZED_CHECKIN',
        `Received: ${err?.code}`
      );
    }
  }

  console.log('\n--- Test Group 5: BookingController.checkIn HTTP Endpoint ---');
  {
    // Test 5.1: Missing authentication returns 401
    const req = { user: undefined, params: { bookingId: '100' } } as any;
    let statusCode = 0;
    let body: any = null;
    const res = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => {
            body = data;
          },
        };
      },
    } as any;
    // @ts-ignore
    const { BookingController } = await import('../controllers/bookingController.js');
    await BookingController.checkIn(req, res);
    assert(
      statusCode === 401 && body?.error === 'Unauthorized',
      'Controller: Missing auth returns 401 Unauthorized'
    );
  }

  {
    // Test 5.2: Invalid bookingId parameter returns 400
    const req = { user: { uid: 42 }, params: { bookingId: 'abc' } } as any;
    let statusCode = 0;
    let body: any = null;
    const res = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => {
            body = data;
          },
        };
      },
    } as any;
    const { BookingController } = await import('../controllers/bookingController.js');
    await BookingController.checkIn(req, res);
    assert(
      statusCode === 400 && body?.error === 'Invalid booking ID',
      'Controller: Non-numeric bookingId returns 400'
    );
  }

  console.log('\n===============================================================');
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
