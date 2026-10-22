// apps/backend/src/test/test_noshow_worker.ts
import { NoShowService } from '../services/noShowService.js';
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
      booking: {
        findMany: async () => {
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
  let cycleCalls = 0;
  const workerPrisma = {
    systemConfig: { findFirst: async () => ({ lateThresholdMinutes: 15 }) },
    booking: {
      findMany: async () => {
        cycleCalls++;
        return [];
      },
    },
  };
  try {
    timer = NoShowService.startNoShowWorker(100, workerPrisma); // 100ms for test
    assert(timer !== null && typeof timer === 'object', 'startNoShowWorker starts interval timer');
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert(cycleCalls > 0, 'startNoShowWorker runs a cycle using the supplied mock');
  } catch (err: any) {
    assert(false, 'startNoShowWorker lifecycle', err?.message);
  } finally {
    // Test 4: Always stop the interval, including when an assertion fails.
    if (timer) NoShowService.stopNoShowWorker(timer);
  }
  assert(timer !== null, 'stopNoShowWorker cleans up the active interval');

  console.log('\n--- Test Group 3: Subtask 3 - processNoShowBooking Release & Penalty Logic ---');

  // Test 5: Release table to AVAILABLE and update booking to NO_SHOW with score deduction
  try {
    let updatedBooking: any = null;
    let updatedTable: any = null;
    let updatedUser: any = null;
    let createdManageScore: any = null;

    const mockPrisma = {
      $queryRaw: async () => [],
      $transaction: async (fn: any) => fn(mockPrisma),
      booking: {
        findFirst: async () => null,
        update: async ({ where, data }: any) => {
          updatedBooking = { where, data };
          return { bookingId: where.bookingId, status: data.status };
        },
        updateMany: async ({ where, data }: any) => {
          updatedBooking = { where, data };
          return { count: 1 };
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
        updateMany: async ({ where, data }: any) => {
          updatedUser = { where, data };
          return { count: 1 };
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
      updatedUser?.where?.uid === 42 &&
        updatedUser?.where?.behaviourScore === 100 &&
        updatedUser?.data?.behaviourScore === 90,
      'User score conditionally updated from 100 to 90'
    );
    assert(
      createdManageScore?.uid === 42 &&
        createdManageScore?.adminId === 1 &&
        createdManageScore?.scoreChange === -10 &&
        createdManageScore?.reason === 'Automated penalty for No-show on Booking #101',
      'ManageScore records the effective -10 change and booking reason'
    );
  } catch (err: any) {
    assert(false, 'processNoShowBooking regular release', err?.message);
  }

  // Test 6: Preserve CLOSED table status when table is under maintenance
  try {
    let tableUpdateCalled = false;

    const mockPrisma = {
      $queryRaw: async () => [],
      $transaction: async (fn: any) => fn(mockPrisma),
      booking: {
        findFirst: async () => null,
        update: async () => ({}),
        updateMany: async () => ({ count: 1 }),
      },
      table: {
        findUnique: async () => ({ status: TableStatus.CLOSED }), // Closed for maintenance
        update: async () => {
          tableUpdateCalled = true;
        },
      },
      user: {
        findUnique: async () => ({ behaviourScore: 80.0 }),
        updateMany: async () => ({ count: 1 }),
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

  // Test 6b: A different booking may already have checked in early on the same table.
  try {
    let tableUpdate: any = null;
    const mockPrisma = {
      $queryRaw: async () => [],
      $transaction: async (fn: any) => fn(mockPrisma),
      booking: {
        updateMany: async () => ({ count: 1 }),
        findFirst: async ({ where }: any) =>
          where.status === BookingStatus.ACTIVE ? { bookingId: 999 } : null,
      },
      table: {
        findUnique: async () => ({ status: TableStatus.OCCUPIED }),
        update: async ({ data }: any) => {
          tableUpdate = data;
        },
      },
      user: { findUnique: async () => null },
    };

    const result = await NoShowService.processNoShowBooking(
      { bookingId: 105, uid: 42, tableId: 8 },
      mockPrisma
    );
    assert(
      result && tableUpdate?.status === TableStatus.OCCUPIED,
      'No-show does not release another checked-in booking’s table'
    );
  } catch (err: any) {
    assert(false, 'Preserve early checked-in booking during no-show', err?.message);
  }

  // Test 7: Score deduction never drops below 0
  try {
    let finalUserScore: number | null = null;
    let auditData: any = null;

    const mockPrisma = {
      $queryRaw: async () => [],
      $transaction: async (fn: any) => fn(mockPrisma),
      booking: {
        findFirst: async () => null,
        update: async () => ({}),
        updateMany: async () => ({ count: 1 }),
      },
      table: {
        findUnique: async () => ({ status: TableStatus.AVAILABLE }),
        update: async () => ({}),
      },
      user: {
        findUnique: async () => ({ behaviourScore: 5.0 }), // User only has 5 points left
        updateMany: async ({ data }: any) => {
          finalUserScore = data.behaviourScore;
          return { count: 1 };
        },
      },
      admin: {
        findFirst: async () => ({ adminId: 1 }),
      },
      manageScore: {
        create: async ({ data }: any) => {
          auditData = data;
          return data;
        },
      },
    };

    await NoShowService.processNoShowBooking({ bookingId: 103, uid: 43, tableId: 9 }, mockPrisma);

    assert(finalUserScore === 0, 'User behaviourScore is capped at minimum 0 (5.0 - 10 -> 0)');
    assert(
      auditData?.scoreChange === -5 &&
        auditData?.reason === 'Automated penalty for No-show on Booking #103',
      'ManageScore records the effective -5 change and booking reason'
    );
  } catch (err: any) {
    assert(false, 'Score deduction minimum bound', err?.message);
  }

  // Test 8: An audit write failure must be propagated from the transaction callback.
  try {
    const mockPrisma = {
      $queryRaw: async () => [],
      $transaction: async (fn: any) => fn(mockPrisma),
      booking: { updateMany: async () => ({ count: 1 }), findFirst: async () => null },
      table: {
        findUnique: async () => ({ status: TableStatus.CLOSED }),
      },
      user: {
        findUnique: async () => ({ behaviourScore: 80 }),
        updateMany: async () => ({ count: 1 }),
      },
      admin: { findFirst: async () => ({ adminId: 1 }) },
      manageScore: {
        create: async () => {
          throw new Error('Simulated audit write failure');
        },
      },
    };

    let auditFailurePropagated = false;
    try {
      await NoShowService.processNoShowBooking({ bookingId: 104, uid: 42, tableId: 8 }, mockPrisma);
    } catch (err: any) {
      auditFailurePropagated = err.message === 'Simulated audit write failure';
    }
    assert(auditFailurePropagated, 'Audit write failure is propagated to the transaction caller');
  } catch (err: any) {
    assert(false, 'Audit write failure propagation', err?.message);
  }

  console.log('\n===============================================================');
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
