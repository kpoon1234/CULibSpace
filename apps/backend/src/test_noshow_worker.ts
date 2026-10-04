// apps/backend/src/test_noshow_worker.ts
import { NoShowService } from './services/noShowService.js';
import { BookingStatus, TableStatus } from '@prisma/client';

console.log('===============================================================');
console.log('🧪 US4-2: Background Cron Worker & No-Show Release Unit Tests');
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
  console.log('--- Test Group 1: NoShowService.checkNoShows Execution ---');

  // Test 1: checkNoShows executes cleanly with default mock
  try {
    const mockPrisma = {
      systemConfig: { findFirst: async () => ({ lateThresholdMinutes: 15 }) },
      booking: { findMany: async () => [] },
    };
    const result = await NoShowService.checkNoShows(mockPrisma);
    assert(
      result !== undefined && typeof result.processed === 'number',
      'NoShowService.checkNoShows returns execution result object with processed count'
    );
  } catch (err: any) {
    assert(false, 'NoShowService.checkNoShows execution', err?.message);
  }

  // Test 2: Error boundary test - checkNoShows catches exceptions gracefully
  try {
    const failingPrisma = {
      systemConfig: {
        findFirst: async () => {
          throw new Error('Simulated Database Connection Failure');
        },
      },
    };
    const errorResult = await NoShowService.checkNoShows(failingPrisma);
    assert(
      errorResult.processed === 0,
      'NoShowService.checkNoShows handles DB error gracefully without crashing'
    );
  } catch (err: any) {
    assert(false, 'NoShowService error boundary should not throw', err?.message);
  }

  console.log('\n--- Test Group 2: Worker Lifecycle Management ---');

  // Test 3: startNoShowWorker creates and returns active interval timer
  let timer: NodeJS.Timeout | null = null;
  try {
    timer = NoShowService.startNoShowWorker(100); // 100ms for test
    assert(timer !== null && typeof timer === 'object', 'startNoShowWorker starts interval timer');
  } catch (err: any) {
    assert(false, 'startNoShowWorker starts interval timer', err?.message);
  }

  // Wait a short moment to ensure interval triggers safely
  await new Promise((resolve) => setTimeout(resolve, 250));

  // Test 4: stopNoShowWorker cleans up timer
  try {
    if (timer) {
      NoShowService.stopNoShowWorker(timer);
      assert(true, 'stopNoShowWorker stops timer cleanly without leaking intervals');
    }
  } catch (err: any) {
    assert(false, 'stopNoShowWorker stops timer cleanly', err?.message);
  }

  console.log('\n--- Test Group 3: Subtask 3 - processNoShowBooking Release & Penalty Logic ---');

  // Test 5: Release table to AVAILABLE and update booking to NO_SHOW with score deduction
  try {
    let updatedBooking: any = null;
    let updatedTable: any = null;
    let updatedUser: any = null;
    let createdManageScore: any = null;

    const mockPrisma = {
      $transaction: async (fn: any) => fn(mockPrisma),
      booking: {
        update: async ({ where, data }: any) => {
          updatedBooking = { where, data };
          return { bookingId: where.bookingId, status: data.status };
        },
      },
      table: {
        findUnique: async () => ({ status: TableStatus.RESERVED }),
        update: async ({ where, data }: any) => {
          updatedTable = { where, data };
          return { tableId: where.tableId, ...data };
        },
      },
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
          createdManageScore = data;
          return data;
        },
      },
    };

    const success = await NoShowService.processNoShowBooking(
      { bookingId: 101, uid: 42, tableId: 7 },
      mockPrisma
    );

    assert(success === true, 'processNoShowBooking returns true on success');
    assert(
      updatedBooking?.data?.status === BookingStatus.NO_SHOW,
      'Booking status updated to NO_SHOW'
    );
    assert(
      updatedTable?.data?.status === TableStatus.AVAILABLE &&
        updatedTable?.data?.lockToken === null &&
        updatedTable?.data?.lockedUntil === null &&
        updatedTable?.data?.lockedByUid === null,
      'Table status released to AVAILABLE and hold locks cleared'
    );
    assert(
      updatedUser?.data?.behaviourScore === 90,
      'User behaviourScore deducted by 10 points (100 -> 90)'
    );
    assert(
      createdManageScore?.uid === 42 &&
        createdManageScore?.adminId === 1 &&
        createdManageScore?.scoreChange === -10,
      'ManageScore audit record created with -10 scoreChange'
    );
  } catch (err: any) {
    assert(false, 'processNoShowBooking regular release', err?.message);
  }

  // Test 6: Preserve CLOSED table status when table is under maintenance
  try {
    let tableUpdateCalled = false;

    const mockPrisma = {
      $transaction: async (fn: any) => fn(mockPrisma),
      booking: {
        update: async () => ({}),
      },
      table: {
        findUnique: async () => ({ status: TableStatus.CLOSED }), // Closed for maintenance
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

    await NoShowService.processNoShowBooking({ bookingId: 102, uid: 42, tableId: 8 }, mockPrisma);

    assert(
      tableUpdateCalled === false,
      'CLOSED table status is preserved and not overwritten to AVAILABLE'
    );
  } catch (err: any) {
    assert(false, 'Preserve CLOSED table status', err?.message);
  }

  // Test 7: Score deduction never drops below 0
  try {
    let finalUserScore: number | null = null;

    const mockPrisma = {
      $transaction: async (fn: any) => fn(mockPrisma),
      booking: {
        update: async () => ({}),
      },
      table: {
        findUnique: async () => ({ status: TableStatus.AVAILABLE }),
        update: async () => ({}),
      },
      user: {
        findUnique: async () => ({ behaviourScore: 5.0 }), // User only has 5 points left
        update: async ({ data }: any) => {
          finalUserScore = data.behaviourScore;
        },
      },
      admin: {
        findFirst: async () => ({ adminId: 1 }),
      },
      manageScore: {
        create: async () => ({}),
      },
    };

    await NoShowService.processNoShowBooking({ bookingId: 103, uid: 43, tableId: 9 }, mockPrisma);

    assert(finalUserScore === 0, 'User behaviourScore is capped at minimum 0 (5.0 - 10 -> 0)');
  } catch (err: any) {
    assert(false, 'Score deduction minimum bound', err?.message);
  }

  console.log('\n===============================================================');
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
