// apps/backend/src/test/test_score_guard.ts
import { BookingService } from '../services/bookingService.js';
import { ScoreGuard } from '../services/scoreGuard.js';
import { ScheduleService } from '../services/scheduleService.js';
import { TableStatus } from '@prisma/client';

console.log('===============================================================');
console.log('🧪 US5-3: Score Check Guard (Hold/Booking) Tests');
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
  console.log('--- Test Group 1: ScoreGuard.enforceMinScore ---');

  // Test 1: User with sufficient score passes guard
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50 }),
      },
      user: {
        findUnique: async () => ({ behaviourScore: 75 }),
      },
    };

    await ScoreGuard.enforceMinScore(42, mockPrisma);
    assert(true, 'User with score 75 passes enforceMinScore guard');
  } catch (err: any) {
    assert(false, 'User with sufficient score passes guard', err?.message);
  }

  // Test 2: User with score exactly at threshold passes
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50 }),
      },
      user: {
        findUnique: async () => ({ behaviourScore: 50 }),
      },
    };

    await ScoreGuard.enforceMinScore(42, mockPrisma);
    assert(true, 'User with score exactly 50 passes enforceMinScore guard');
  } catch (err: any) {
    assert(false, 'User at threshold passes guard', err?.message);
  }

  // Test 3: User with score below threshold is rejected
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50 }),
      },
      user: {
        findUnique: async () => ({ behaviourScore: 49 }),
      },
    };

    await ScoreGuard.enforceMinScore(42, mockPrisma);
    assert(false, 'User below threshold should be rejected');
  } catch (err: any) {
    assert(err.status === 403, 'Returns 403 Forbidden');
    assert(
      err.code === 'INSUFFICIENT_BEHAVIOUR_SCORE',
      'Error code is INSUFFICIENT_BEHAVIOUR_SCORE'
    );
    assert(
      err.message.includes('49') && err.message.includes('50'),
      'Error message includes current and required scores'
    );
  }

  // Test 4: Non-existent user throws 404
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50 }),
      },
      user: {
        findUnique: async () => null,
      },
    };

    await ScoreGuard.enforceMinScore(999, mockPrisma);
    assert(false, 'Non-existent user should throw 404');
  } catch (err: any) {
    assert(err.status === 404, 'Non-existent user returns 404');
    assert(err.code === 'USER_NOT_FOUND', 'Error code is USER_NOT_FOUND');
  }

  // A configured threshold must take precedence over the default of 50.
  try {
    await ScoreGuard.enforceMinScore(42, {
      systemConfig: { findFirst: async () => ({ minScoreToBook: 70 }) },
      user: { findUnique: async () => ({ behaviourScore: 60 }) },
    });
    assert(false, 'Configured threshold of 70 should reject score 60');
  } catch (err: any) {
    assert(
      err.status === 403 && err.code === 'INSUFFICIENT_BEHAVIOUR_SCORE',
      'Configured threshold of 70 rejects score 60'
    );
  }

  try {
    await ScoreGuard.enforceMinScore(42, {
      systemConfig: { findFirst: async () => null },
      user: { findUnique: async () => ({ behaviourScore: 49 }) },
    });
    assert(false, 'Missing config should use default threshold of 50');
  } catch (err: any) {
    assert(err.status === 403, 'Missing config still rejects score 49');
  }

  const configError = new Error('SystemConfig query failed');
  try {
    await ScoreGuard.enforceMinScore(
      42,
      {
        systemConfig: {
          findFirst: async () => {
            throw configError;
          },
        },
      },
      { behaviourScore: 60 }
    );
    assert(false, 'Failed config query must not fall back to 50');
  } catch (err: any) {
    assert(err === configError, 'Failed config query is propagated');
  }

  console.log('\n--- Test Group 2: acquireLock Score Guard ---');

  // Hold acquisition now checks issue availability inside a transaction.
  function transactionalHoldMock(client: any) {
    return {
      ...client,
      $queryRaw: async () => [],
      issueReport: { findFirst: async () => null },
      $transaction: async (callback: (tx: any) => Promise<unknown>) =>
        callback({
          ...client,
          $queryRaw: async () => [],
          issueReport: { findFirst: async () => null },
        }),
    };
  }

  // Test 5: acquireLock blocks user with low score
  let lowScoreHoldWrites = 0;
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50 }),
      },
      user: {
        findUnique: async () => ({ uid: 42, isProfileComplete: true, behaviourScore: 30 }),
      },
      table: {
        findUnique: async () => ({
          tableId: 1,
          status: TableStatus.AVAILABLE,
          lockToken: null,
          lockedUntil: null,
          lockedByUid: null,
        }),
        updateMany: async () => {
          lowScoreHoldWrites++;
          return { count: 1 };
        },
      },
      booking: {
        findFirst: async () => null,
      },
    };

    await BookingService.acquireLock(1, 42, undefined, undefined, mockPrisma);
    assert(false, 'acquireLock should reject user with low score');
  } catch (err: any) {
    assert(err.status === 403, 'acquireLock returns 403');
    assert(
      err.code === 'INSUFFICIENT_BEHAVIOUR_SCORE',
      'Error code is INSUFFICIENT_BEHAVIOUR_SCORE'
    );
  }
  assert(lowScoreHoldWrites === 0, 'Low score does not write a table hold');

  // Test 6: acquireLock allows user with sufficient score
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50 }),
      },
      user: {
        findUnique: async () => ({ uid: 42, isProfileComplete: true, behaviourScore: 80 }),
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

    const lock = await BookingService.acquireLock(
      1,
      42,
      undefined,
      undefined,
      transactionalHoldMock(mockPrisma)
    );
    assert(!!lock.lockToken, 'acquireLock succeeds for user with sufficient score');
  } catch (err: any) {
    assert(false, 'acquireLock allows user with sufficient score', err?.message);
  }

  // Test 7: acquireLock with SystemConfig fallback when no config row exists
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => null, // config row doesn't exist
      },
      user: {
        findUnique: async () => ({ uid: 42, isProfileComplete: true, behaviourScore: 80 }),
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

    const lock = await BookingService.acquireLock(
      1,
      42,
      undefined,
      undefined,
      transactionalHoldMock(mockPrisma)
    );
    assert(!!lock.lockToken, 'acquireLock succeeds with default minScoreToBook (50)');
  } catch (err: any) {
    assert(false, 'acquireLock works with default config', err?.message);
  }

  // Test 8: acquireLock with user at exactly threshold (50)
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50 }),
      },
      user: {
        findUnique: async () => ({ uid: 42, isProfileComplete: true, behaviourScore: 50 }),
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

    const lock = await BookingService.acquireLock(
      1,
      42,
      undefined,
      undefined,
      transactionalHoldMock(mockPrisma)
    );
    assert(!!lock.lockToken, 'acquireLock succeeds for user at exactly minScoreToBook (50)');
  } catch (err: any) {
    assert(false, 'acquireLock allows user at threshold score (50)', err?.message);
  }

  // Test 9: acquireLock with score just below threshold (49)
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50 }),
      },
      user: {
        findUnique: async () => ({ uid: 42, isProfileComplete: true, behaviourScore: 49 }),
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
    assert(false, 'acquireLock should reject user just below threshold');
  } catch (err: any) {
    assert(err.status === 403, 'acquireLock returns 403 for score 49');
    assert(
      err.code === 'INSUFFICIENT_BEHAVIOUR_SCORE',
      'Error code is INSUFFICIENT_BEHAVIOUR_SCORE'
    );
  }

  // Test 10: acquireLock with score just above threshold (51)
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50 }),
      },
      user: {
        findUnique: async () => ({ uid: 42, isProfileComplete: true, behaviourScore: 51 }),
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

    const lock = await BookingService.acquireLock(
      1,
      42,
      undefined,
      undefined,
      transactionalHoldMock(mockPrisma)
    );
    assert(!!lock.lockToken, 'acquireLock succeeds for user just above threshold (51)');
  } catch (err: any) {
    assert(false, 'acquireLock allows user just above threshold (51)', err?.message);
  }

  let failedConfigHoldWrites = 0;
  try {
    await BookingService.acquireLock(1, 42, undefined, undefined, {
      systemConfig: {
        findFirst: async () => {
          throw configError;
        },
      },
      user: { findUnique: async () => ({ isProfileComplete: true, behaviourScore: 60 }) },
      table: {
        updateMany: async () => {
          failedConfigHoldWrites++;
          return { count: 1 };
        },
      },
    });
    assert(false, 'Failed config query must not create a hold');
  } catch (err: any) {
    assert(err === configError, 'acquireLock propagates config query failure');
  }
  assert(failedConfigHoldWrites === 0, 'Config query failure does not write a table hold');

  console.log('\n--- Test Group 3: createBooking Score Guard ---');
  const originalValidateTargetTimeWindow = ScheduleService.validateTargetTimeWindow;
  ScheduleService.validateTargetTimeWindow = async (targetStart, targetEnd) => ({
    targetStart,
    targetEnd,
    schedule: {
      name: 'Test schedule',
      openTime: '08:00',
      closeTime: '21:00',
      is24Hours: false,
      isClosed: false,
      priority: 1,
    },
    config: { maxAdvanceBookingDays: 7, maxBookingDurationMinutes: 120 },
  });

  let bookingWrites = 0;
  let bookingConfigReads = 0;
  try {
    const tx = {
      $queryRaw: async () => [],
      systemConfig: {
        findFirst: async () => {
          bookingConfigReads++;
          return { minScoreToBook: 70 };
        },
      },
      user: {
        findUnique: async () => ({
          uid: 42,
          firstname: 'Test',
          lastname: 'User',
          behaviourScore: 60,
          isProfileComplete: true,
          userType: 'UNIVERSITY',
        }),
      },
      booking: {
        create: async () => {
          bookingWrites++;
          return {};
        },
      },
    };
    await BookingService.createBooking(
      {
        userId: 42,
        tableId: 1,
        startDateTime: new Date('2030-01-01T10:00:00Z'),
        endDateTime: new Date('2030-01-01T11:00:00Z'),
        lockToken: 'test-lock',
      },
      { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) }
    );
    assert(false, 'createBooking should reject score below configured threshold');
  } catch (err: any) {
    assert(err.status === 403, 'createBooking rejects score 60 when threshold is 70');
  } finally {
    ScheduleService.validateTargetTimeWindow = originalValidateTargetTimeWindow;
  }
  assert(bookingWrites === 0, 'Rejected createBooking does not insert a booking');
  assert(bookingConfigReads === 1, 'createBooking reads score config only once');

  console.log('\n===============================================================');
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
