// apps/backend/src/test/test_penalty_service.ts
import { PenaltyService } from '../services/penaltyService.js';
import { BookingStatus, TableStatus } from '@prisma/client';

console.log('===============================================================');
console.log('🧪 US5-2: Penalty Service Unit Tests');
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
  console.log('--- Test Group 1: applyPenalty Core Logic ---');

  // Test 1: Standard penalty deduction
  try {
    let updatedUser: any = null;
    let createdAudit: any = null;

    const mockPrisma = {
      user: {
        findUnique: async () => ({ behaviourScore: 100.0 }),
        update: async ({ where, data }: any) => {
          updatedUser = { where, data };
          return { uid: where.uid, ...data };
        },
      },
      admin: {
        findFirst: async () => ({ adminId: 1 }),
      },
      manageScore: {
        create: async ({ data }: any) => {
          createdAudit = data;
          return data;
        },
      },
    };

    const result = await PenaltyService.applyPenalty(
      { uid: 42, amount: 10, reason: 'No-show penalty' },
      mockPrisma
    );

    assert(result.newScore === 90, 'Score deducted from 100 to 90');
    assert(result.deducted === 10, 'Deducted amount is 10');
    assert(result.auditCreated === true, 'ManageScore audit record was created');
    assert(
      createdAudit?.uid === 42 && createdAudit?.scoreChange === -10,
      'ManageScore has correct uid and scoreChange'
    );
  } catch (err: any) {
    assert(false, 'Standard penalty deduction', err?.message);
  }

  // Test 2: Score clamping at 0
  try {
    let finalScore: number | null = null;

    const mockPrisma = {
      user: {
        findUnique: async () => ({ behaviourScore: 5.0 }),
        update: async ({ data }: any) => {
          finalScore = data.behaviourScore;
          return { behaviourScore: data.behaviourScore };
        },
      },
      admin: {
        findFirst: async () => ({ adminId: 1 }),
      },
      manageScore: {
        create: async () => ({}),
      },
    };

    const result = await PenaltyService.applyPenalty(
      { uid: 43, amount: 10, reason: 'No-show penalty' },
      mockPrisma
    );

    assert(result.newScore === 0, 'Score is clamped at 0 (5.0 - 10 = 0)');
    assert(finalScore === 0, 'User updated score is 0');
  } catch (err: any) {
    assert(false, 'Score clamping at 0', err?.message);
  }

  // Test 3: Missing user throws error
  try {
    const mockPrisma = {
      user: {
        findUnique: async () => null,
      },
      admin: { findFirst: async () => null },
      manageScore: { create: async () => ({}) },
    };

    await PenaltyService.applyPenalty(
      { uid: 999, amount: 10, reason: 'Test' },
      mockPrisma
    );
    assert(false, 'Missing user throws 404 error');
  } catch (err: any) {
    assert(err.status === 404, 'Missing user throws 404');
    assert(err.code === 'USER_NOT_FOUND', 'Error code is USER_NOT_FOUND');
  }

  console.log('\n--- Test Group 2: applyNoShowPenalty Full Workflow ---');

  // Test 4: Full no-show workflow in transaction
  try {
    let bookingStatus: any = null;
    let tableStatus: any = null;
    let userScore: any = null;
    let auditCreated: any = null;

    const mockPrisma = {
      $transaction: async (fn: any) => fn(mockPrisma),
      booking: {
        updateMany: async ({ where, data }: any) => {
          bookingStatus = data.status;
          return { count: 1 };
        },
      },
      table: {
        findUnique: async () => ({ status: TableStatus.RESERVED }),
        update: async ({ where, data }: any) => {
          tableStatus = data;
          return { tableId: where.tableId, ...data };
        },
      },
      user: {
        findUnique: async () => ({ behaviourScore: 100.0 }),
        update: async ({ data }: any) => {
          userScore = data.behaviourScore;
          return { behaviourScore: data.behaviourScore };
        },
      },
      admin: {
        findFirst: async () => ({ adminId: 1 }),
      },
      manageScore: {
        create: async ({ data }: any) => {
          auditCreated = data;
          return data;
        },
      },
    };

    const success = await PenaltyService.applyNoShowPenalty(
      { uid: 42, tableId: 7, bookingId: 101 },
      mockPrisma
    );

    assert(success === true, 'applyNoShowPenalty returns true on success');
    assert(bookingStatus === BookingStatus.NO_SHOW, 'Booking updated to NO_SHOW');
    assert(
      tableStatus?.status === TableStatus.AVAILABLE &&
        tableStatus?.lockToken === null &&
        tableStatus?.lockedUntil === null &&
        tableStatus?.lockedByUid === null,
      'Table released to AVAILABLE with locks cleared'
    );
    assert(userScore === 90, 'User score deducted to 90');
    assert(auditCreated?.scoreChange === -10, 'ManageScore audit created with -10');
  } catch (err: any) {
    assert(false, 'Full no-show workflow', err?.message);
  }

  // Test 5: Preserve CLOSED table status
  try {
    let tableUpdateCalled = false;

    const mockPrisma = {
      $transaction: async (fn: any) => fn(mockPrisma),
      booking: {
        updateMany: async () => ({ count: 1 }),
      },
      table: {
        findUnique: async () => ({ status: TableStatus.CLOSED }),
        update: async () => {
          tableUpdateCalled = true;
        },
      },
      user: {
        findUnique: async () => ({ behaviourScore: 80.0 }),
        update: async () => ({}),
      },
      admin: {
        findFirst: async () => ({ adminId: 1 }),
      },
      manageScore: {
        create: async () => ({}),
      },
    };

    await PenaltyService.applyNoShowPenalty({ uid: 42, tableId: 8, bookingId: 102 }, mockPrisma);

    assert(tableUpdateCalled === false, 'CLOSED table status is preserved');
  } catch (err: any) {
    assert(false, 'Preserve CLOSED table status', err?.message);
  }

  // Test 6: Skipped when booking already transitioned
  try {
    let userUpdateCalled = false;

    const mockPrisma = {
      $transaction: async (fn: any) => fn(mockPrisma),
      booking: {
        updateMany: async () => ({ count: 0 }),
      },
      table: {
        findUnique: async () => ({ status: TableStatus.AVAILABLE }),
        update: async () => ({}),
      },
      user: {
        findUnique: async () => ({ behaviourScore: 100.0 }),
        update: async () => {
          userUpdateCalled = true;
          return {};
        },
      },
      admin: {
        findFirst: async () => ({ adminId: 1 }),
      },
      manageScore: {
        create: async () => ({}),
      },
    };

    const success = await PenaltyService.applyNoShowPenalty(
      { uid: 42, tableId: 7, bookingId: 101 },
      mockPrisma
    );

    assert(success === false, 'Returns false when booking already transitioned');
    assert(userUpdateCalled === false, 'Score not deducted when booking already transitioned');
  } catch (err: any) {
    assert(false, 'Skipped when already transitioned', err?.message);
  }

  console.log('\n--- Test Group 3: getScoreHistory ---');

  // Test 7: Fetch score history
  try {
    const mockPrisma = {
      user: {
        findUnique: async () => ({
          uid: 42,
          firstname: 'Alice',
          lastname: 'Student',
          behaviourScore: 90.0,
        }),
      },
      manageScore: {
        findMany: async () => [
          {
            timestamp: new Date('2026-10-08T12:00:00Z'),
            scoreChange: -10,
            adminId: 1,
            admin: { firstname: 'Admin', lastname: 'User', email: 'admin@example.com' },
          },
        ],
      },
    };

    const history = await PenaltyService.getScoreHistory(42, mockPrisma);

    assert(history.uid === 42, 'Returns correct uid');
    assert(history.behaviourScore === 90.0, 'Returns correct behaviourScore');
    assert(Array.isArray(history.history), 'History is an array');
    assert(history.history.length === 1, 'History has 1 entry');
    assert(history.history[0].scoreChange === -10, 'History scoreChange is -10');
    assert(history.history[0].adminName === 'Admin User', 'Admin name is formatted correctly');
  } catch (err: any) {
    assert(false, 'Fetch score history', err?.message);
  }

  // Test 8: Non-existent user throws 404
  try {
    const mockPrisma = {
      user: {
        findUnique: async () => null,
      },
      manageScore: {
        findMany: async () => [],
      },
    };

    await PenaltyService.getScoreHistory(999, mockPrisma);
    assert(false, 'Non-existent user throws 404');
  } catch (err: any) {
    assert(err.status === 404, 'Non-existent user throws 404');
  }

  console.log('\n===============================================================');
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
