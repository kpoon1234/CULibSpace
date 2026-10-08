// apps/backend/src/test/test_score_guard.ts
import { BookingService } from '../services/bookingService.js';
import { PenaltyService } from '../services/penaltyService.js';
import { BookingStatus, TableStatus } from '@prisma/client';

console.log('===============================================================');
console.log('🧪 US5-3: Score Check Guard & Auto-Suspension Tests');
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
  console.log('--- Test Group 1: PenaltyService.enforceMinScore ---');

  // Test 1: User with sufficient score passes guard
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50.0 }),
      },
      user: {
        findUnique: async () => ({ behaviourScore: 75.0 }),
      },
    };

    await PenaltyService.enforceMinScore(42, mockPrisma);
    assert(true, 'User with score 75.0 passes enforceMinScore guard');
  } catch (err: any) {
    assert(false, 'User with sufficient score passes guard', err?.message);
  }

  // Test 2: User with score exactly at threshold passes
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50.0 }),
      },
      user: {
        findUnique: async () => ({ behaviourScore: 50.0 }),
      },
    };

    await PenaltyService.enforceMinScore(42, mockPrisma);
    assert(true, 'User with score exactly 50.0 passes enforceMinScore guard');
  } catch (err: any) {
    assert(false, 'User at threshold passes guard', err?.message);
  }

  // Test 3: User with score below threshold is rejected
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50.0 }),
      },
      user: {
        findUnique: async () => ({ behaviourScore: 49.9 }),
      },
    };

    await PenaltyService.enforceMinScore(42, mockPrisma);
    assert(false, 'User below threshold should be rejected');
  } catch (err: any) {
    assert(err.status === 403, 'Returns 403 Forbidden');
    assert(err.code === 'INSUFFICIENT_BEHAVIOUR_SCORE', 'Error code is INSUFFICIENT_BEHAVIOUR_SCORE');
    assert(
      err.message.includes('49.9') && err.message.includes('50.0'),
      'Error message includes current and required scores'
    );
  }

  // Test 4: Non-existent user throws 404
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50.0 }),
      },
      user: {
        findUnique: async () => null,
      },
    };

    await PenaltyService.enforceMinScore(999, mockPrisma);
    assert(false, 'Non-existent user should throw 404');
  } catch (err: any) {
    assert(err.status === 404, 'Non-existent user returns 404');
    assert(err.code === 'USER_NOT_FOUND', 'Error code is USER_NOT_FOUND');
  }

  console.log('\n--- Test Group 2: acquireLock Score Guard ---');

  // Test 5: acquireLock blocks user with low score
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50.0 }),
      },
      user: {
        findUnique: async () => ({ uid: 42, isProfileComplete: true, behaviourScore: 30.0 }),
      },
      table: {
        findUnique: async () => ({
          tableId: 1,
          status: TableStatus.AVAILABLE,
          lockToken: null,
          lockedUntil: null,
          lockedByUid: null,
        }),
        updateMany: async () => ({ count: 1 }),
      },
      booking: {
        findFirst: async () => null,
      },
    };

    await BookingService.acquireLock(1, 42, undefined, undefined, mockPrisma);
    assert(false, 'acquireLock should reject user with low score');
  } catch (err: any) {
    assert(err.status === 403, 'acquireLock returns 403');
    assert(err.code === 'INSUFFICIENT_BEHAVIOUR_SCORE', 'Error code is INSUFFICIENT_BEHAVIOUR_SCORE');
  }

  // Test 6: acquireLock allows user with sufficient score
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50.0 }),
      },
      user: {
        findUnique: async () => ({ uid: 42, isProfileComplete: true, behaviourScore: 80.0 }),
      },
      table: {
        findUnique: async () => ({
          tableId: 1,
          status: TableStatus.AVAILABLE,
          lockToken: null,
          lockedUntil: null,
          lockedByUid: null,
        }),
        updateMany: async () => ({ count: 1 }),
      },
      booking: {
        findFirst: async () => null,
      },
    };

    const lock = await BookingService.acquireLock(1, 42, undefined, undefined, mockPrisma);
    assert(!!lock.lockToken, 'acquireLock succeeds for user with sufficient score');
  } catch (err: any) {
    assert(false, 'acquireLock allows user with sufficient score', err?.message);
  }

  console.log('\n--- Test Group 3: checkIn (No Score Guard) ---');

  // Test 7: checkIn succeeds regardless of score (score check only on hold/booking endpoints)
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ earlyCheckInMinutes: 15, lateThresholdMinutes: 15 }),
      },
      user: {
        findUnique: async () => ({ uid: 42, behaviourScore: 30.0 }),
      },
      booking: {
        findUnique: async () => ({
          bookingId: 100,
          uid: 42,
          tableId: 1,
          startDateTime: new Date('2026-10-01T14:00:00Z'),
          endDateTime: new Date('2026-10-01T16:00:00Z'),
          status: BookingStatus.PENDING,
          table: { tableId: 1, status: TableStatus.RESERVED },
        }),
      },
      $transaction: async (callback: any) => {
        const tx = {
          booking: {
            update: async ({ data }: any) => {
              return { bookingId: 100, status: data.status, arriveTime: data.arriveTime };
            },
          },
          table: {
            update: async ({ data }: any) => {
              return { tableId: 1, status: data.status };
            },
          },
        };
        return await callback(tx);
      },
    };

    const result = await BookingService.checkIn(42, 100, new Date('2026-10-01T13:50:00Z'), mockPrisma);
    assert(result.status === BookingStatus.ACTIVE, 'checkIn succeeds even with low score (no score guard on check-in)');
  } catch (err: any) {
    assert(false, 'checkIn succeeds regardless of score', err?.message);
  }

  // Test 8: checkIn allows user with sufficient score
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ earlyCheckInMinutes: 15, lateThresholdMinutes: 15 }),
      },
      user: {
        findUnique: async () => ({ uid: 42, behaviourScore: 80.0 }),
      },
      booking: {
        findUnique: async () => ({
          bookingId: 100,
          uid: 42,
          tableId: 1,
          startDateTime: new Date('2026-10-01T14:00:00Z'),
          endDateTime: new Date('2026-10-01T16:00:00Z'),
          status: BookingStatus.PENDING,
          table: { tableId: 1, status: TableStatus.RESERVED },
        }),
      },
      $transaction: async (callback: any) => {
        const tx = {
          booking: {
            update: async ({ data }: any) => {
              return { bookingId: 100, status: data.status, arriveTime: data.arriveTime };
            },
          },
          table: {
            update: async ({ data }: any) => {
              return { tableId: 1, status: data.status };
            },
          },
        };
        return await callback(tx);
      },
    };

    const result = await BookingService.checkIn(42, 100, new Date('2026-10-01T13:50:00Z'), mockPrisma);
    assert(result.status === BookingStatus.ACTIVE, 'checkIn succeeds for user with sufficient score');
  } catch (err: any) {
    assert(false, 'checkIn allows user with sufficient score', err?.message);
  }

  console.log('\n--- Test Group 4: validateBookingRules Score Guard ---');

  const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
  futureStart.setHours(10, 0, 0, 0);
  const futureEnd = new Date(futureStart.getTime() + 90 * 60 * 1000);

  // Test 9: validateBookingRules blocks user with low score
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50.0 }),
      },
      operatingSchedule: {
        findMany: async () => [
          {
            scheduleId: 1,
            name: 'Regular Hours',
            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-12-31'),
            openTime: '08:00',
            closeTime: '21:00',
            is24Hours: false,
            isClosed: false,
            priority: 1,
          },
        ],
      },
      user: {
        findUnique: async () => ({
          uid: 42,
          firstname: 'Low',
          lastname: 'Score',
          behaviourScore: 30.0,
          userType: 'UNIVERSITY',
          isProfileComplete: true,
          outsideUser: null,
        }),
      },
      table: {
        findUnique: async () => ({ tableId: 1 }),
      },
      booking: {
        findFirst: async () => null,
      },
    };

    await BookingService.validateBookingRules(
      { userId: 42, tableId: 1, startDateTime: futureStart, endDateTime: futureEnd },
      mockPrisma
    );
    assert(false, 'validateBookingRules should reject user with low score');
  } catch (err: any) {
    assert(err.status === 403, 'validateBookingRules returns 403');
    assert(err.code === 'INSUFFICIENT_BEHAVIOUR_SCORE', 'Error code is INSUFFICIENT_BEHAVIOUR_SCORE');
  }

  // Test 10: validateBookingRules allows user with sufficient score
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50.0 }),
      },
      operatingSchedule: {
        findMany: async () => [
          {
            scheduleId: 1,
            name: 'Regular Hours',
            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-12-31'),
            openTime: '08:00',
            closeTime: '21:00',
            is24Hours: false,
            isClosed: false,
            priority: 1,
          },
        ],
      },
      user: {
        findUnique: async () => ({
          uid: 42,
          firstname: 'High',
          lastname: 'Score',
          behaviourScore: 80.0,
          userType: 'UNIVERSITY',
          isProfileComplete: true,
          outsideUser: null,
        }),
      },
      table: {
        findUnique: async () => ({ tableId: 1 }),
      },
      booking: {
        findFirst: async () => null,
      },
    };

    const result = await BookingService.validateBookingRules(
      { userId: 42, tableId: 1, startDateTime: futureStart, endDateTime: futureEnd },
      mockPrisma
    );
    assert(result.valid === true, 'validateBookingRules allows user with sufficient score');
  } catch (err: any) {
    assert(false, 'validateBookingRules allows user with sufficient score', err?.message);
  }

  console.log('\n===============================================================');
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
