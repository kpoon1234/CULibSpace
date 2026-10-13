// apps/backend/src/test/test_score_guard.ts
import { BookingService } from '../services/bookingService.js';
import { ScoreGuard } from '../services/scoreGuard.js';
import { BookingStatus, TableStatus } from '@prisma/client';

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
        findFirst: async () => ({ minScoreToBook: 50.0 }),
      },
      user: {
        findUnique: async () => ({ behaviourScore: 75.0 }),
      },
    };

    await ScoreGuard.enforceMinScore(42, mockPrisma);
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

    await ScoreGuard.enforceMinScore(42, mockPrisma);
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

    await ScoreGuard.enforceMinScore(42, mockPrisma);
    assert(false, 'User below threshold should be rejected');
  } catch (err: any) {
    assert(err.status === 403, 'Returns 403 Forbidden');
    assert(
      err.code === 'INSUFFICIENT_BEHAVIOUR_SCORE',
      'Error code is INSUFFICIENT_BEHAVIOUR_SCORE'
    );
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

    await ScoreGuard.enforceMinScore(999, mockPrisma);
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
    assert(
      err.code === 'INSUFFICIENT_BEHAVIOUR_SCORE',
      'Error code is INSUFFICIENT_BEHAVIOUR_SCORE'
    );
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

  // Test 7: acquireLock with SystemConfig fallback when table doesn't exist
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => null, // table doesn't exist
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
    assert(!!lock.lockToken, 'acquireLock succeeds with default minScoreToBook (50.0)');
  } catch (err: any) {
    assert(false, 'acquireLock works with default config', err?.message);
  }

  // Test 8: acquireLock with user at exactly threshold (50.0)
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50.0 }),
      },
      user: {
        findUnique: async () => ({ uid: 42, isProfileComplete: true, behaviourScore: 50.0 }),
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
    assert(!!lock.lockToken, 'acquireLock succeeds for user at exactly minScoreToBook (50.0)');
  } catch (err: any) {
    assert(false, 'acquireLock allows user at threshold score (50.0)', err?.message);
  }

  // Test 9: acquireLock with score just below threshold (49.9)
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50.0 }),
      },
      user: {
        findUnique: async () => ({ uid: 42, isProfileComplete: true, behaviourScore: 49.9 }),
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
    assert(err.status === 403, 'acquireLock returns 403 for score just below threshold');
    assert(
      err.code === 'INSUFFICIENT_BEHAVIOUR_SCORE',
      'Error code is INSUFFICIENT_BEHAVIOUR_SCORE'
    );
  }

  // Test 10: acquireLock with score just above threshold (50.1)
  try {
    const mockPrisma = {
      systemConfig: {
        findFirst: async () => ({ minScoreToBook: 50.0 }),
      },
      user: {
        findUnique: async () => ({ uid: 42, isProfileComplete: true, behaviourScore: 50.1 }),
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
    assert(!!lock.lockToken, 'acquireLock succeeds for user just above threshold (50.1)');
  } catch (err: any) {
    assert(false, 'acquireLock allows user just above threshold (50.1)', err?.message);
  }

  console.log('\n===============================================================');
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
