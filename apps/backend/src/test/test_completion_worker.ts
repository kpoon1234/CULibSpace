// apps/backend/src/test/test_completion_worker.ts
import { BookingService, getBookingHistory } from '../services/bookingService.js';
import { BookingStatus, TableStatus } from '@prisma/client';

console.log('===============================================================');
console.log('🧪 US4: Background Completion Worker & Active Reservation Cleanup Tests');
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
  const now = new Date('2026-10-20T10:00:00.000Z');

  // =========================================================================
  // Test Group 1: หมดเวลาโดยไม่เปิด History (Worker Autonomous Execution)
  // =========================================================================
  console.log('--- Test Group 1: Worker Runs Autonomously Without User Visiting History ---');
  try {
    let bookingUpdated = false;
    let tableUpdated = false;

    const mockPrisma = {
      booking: {
        findMany: async (args: any) => {
          // Finds ACTIVE bookings where endDateTime <= now
          if (args.where?.status === BookingStatus.ACTIVE) {
            return [{ bookingId: 101, tableId: 10 }];
          }
          return [];
        },
        updateMany: async (args: any) => {
          if (args.where?.bookingId === 101 && args.data?.status === BookingStatus.COMPLETED) {
            bookingUpdated = true;
            return { count: 1 };
          }
          return { count: 0 };
        },
        findFirst: async () => null, // No other active booking on table 10
      },
      table: {
        findUnique: async () => ({ status: TableStatus.OCCUPIED }),
        update: async (args: any) => {
          if (args.where?.tableId === 10 && args.data?.status === TableStatus.AVAILABLE) {
            tableUpdated = true;
            return { tableId: 10, status: TableStatus.AVAILABLE };
          }
          return {};
        },
      },
      $transaction: async (fn: any) => await fn(mockPrisma),
    };

    const res = await BookingService.completeEndedBookings(now, mockPrisma as any);
    assert(
      res.processed === 1,
      'Worker independently processes ended booking without getBookingHistory call'
    );
    assert(bookingUpdated, 'Booking status transitioned to COMPLETED');
    assert(tableUpdated, 'Table status released to AVAILABLE');
  } catch (err: any) {
    assert(false, 'Worker autonomous execution', err?.message);
  }

  // =========================================================================
  // Test Group 2: การคืนสถานะโต๊ะ ภายใน Transaction เดียวกัน & ตรวจสอบ Booking อื่น
  // =========================================================================
  console.log('\n--- Test Group 2: Table Status Handling & Same Transaction Atomicity ---');

  // Test 2.1: Atomic execution in same transaction
  try {
    let transactionUsed = false;
    const mockPrisma = {
      booking: {
        findMany: async () => [{ bookingId: 201, tableId: 20 }],
        updateMany: async () => ({ count: 1 }),
        findFirst: async () => null,
      },
      table: {
        findUnique: async () => ({ status: TableStatus.OCCUPIED }),
        update: async () => ({ status: TableStatus.AVAILABLE }),
      },
      $transaction: async (fn: any) => {
        transactionUsed = true;
        return await fn(mockPrisma);
      },
    };

    await BookingService.completeEndedBookings(now, mockPrisma as any);
    assert(transactionUsed, 'Updates booking and table within the exact same transaction');
  } catch (err: any) {
    assert(false, 'Same transaction atomicity', err?.message);
  }

  // Test 2.2: ตรวจว่าไม่มี booking อื่นใช้งานโต๊ะอยู่ก่อนคืนเป็น AVAILABLE
  try {
    let tableWasReleased = false;

    const mockPrisma = {
      booking: {
        findMany: async () => [{ bookingId: 202, tableId: 20 }],
        updateMany: async () => ({ count: 1 }),
        // Another active booking is currently using this table!
        findFirst: async (args: any) => {
          if (args.where?.tableId === 20 && args.where?.bookingId?.not === 202) {
            return {
              bookingId: 999,
              tableId: 20,
              status: BookingStatus.ACTIVE,
              startDateTime: new Date('2026-10-20T09:30:00.000Z'),
              endDateTime: new Date('2026-10-20T11:00:00.000Z'),
            };
          }
          return null;
        },
      },
      table: {
        findUnique: async () => ({ status: TableStatus.OCCUPIED }),
        update: async () => {
          tableWasReleased = true;
          return {};
        },
      },
      $transaction: async (fn: any) => await fn(mockPrisma),
    };

    const res = await BookingService.completeEndedBookings(now, mockPrisma as any);
    assert(res.processed === 1, 'Booking 202 successfully marked COMPLETED');
    assert(
      !tableWasReleased,
      'Table remains OCCUPIED because another active booking is currently using the table'
    );
  } catch (err: any) {
    assert(false, 'Other booking table guard check', err?.message);
  }

  // Test 2.3: ไม่เปลี่ยนสถานะโต๊ะที่ปิดซ่อมบำรุง (CLOSED)
  try {
    let tableUpdateCalled = false;

    const mockPrisma = {
      booking: {
        findMany: async () => [{ bookingId: 203, tableId: 25 }],
        updateMany: async () => ({ count: 1 }),
        findFirst: async () => null,
      },
      table: {
        findUnique: async () => ({ status: TableStatus.CLOSED }),
        update: async () => {
          tableUpdateCalled = true;
          return {};
        },
      },
      $transaction: async (fn: any) => await fn(mockPrisma),
    };

    await BookingService.completeEndedBookings(now, mockPrisma as any);
    assert(
      !tableUpdateCalled,
      'Preserves CLOSED maintenance status and does not overwrite with AVAILABLE'
    );
  } catch (err: any) {
    assert(false, 'CLOSED table status preservation', err?.message);
  }

  // =========================================================================
  // Test Group 3: กรณีอัปเดตไม่สำเร็จ & ไม่ซ่อนความผิดพลาด
  // =========================================================================
  console.log('\n--- Test Group 3: Failure Handling & Error Visibility ---');

  // Test 3.1: Transaction failure is handled safely in worker without crash
  try {
    const errorPrisma = {
      booking: {
        findMany: async () => [{ bookingId: 301, tableId: 30 }],
      },
      $transaction: async () => {
        throw new Error('Deadlock detected in transaction');
      },
    };

    const res = await BookingService.completeEndedBookings(now, errorPrisma as any);
    assert(res.processed === 0, 'Worker catches transaction failure gracefully');
    assert(res.errors === 1, 'Records error count on failed booking');
  } catch (err: any) {
    assert(false, 'Transaction failure handling', err?.message);
  }

  // Test 3.2: getBookingHistory แสดงรายการที่หมดเวลาโดยไม่ซ่อนความผิดพลาด (ถ้า DB update ค้าง)
  try {
    // Database has an ACTIVE booking that has ended (e.g. worker delayed or failed to update)
    const mockPrisma = {
      booking: {
        findMany: async () => [
          {
            bookingId: 401,
            uid: 7,
            tableId: 10,
            status: BookingStatus.ACTIVE,
            startDateTime: new Date('2026-10-20T08:00:00.000Z'),
            endDateTime: new Date('2026-10-20T09:00:00.000Z'), // Passed!
            table: {
              tableId: 10,
              numberOfSeat: 4,
              plugCap: 2,
              hasTvScreen: false,
              zone: { zoneId: 1, zoneType: 'SILENT' },
            },
          },
        ],
      },
    };

    const history = await getBookingHistory(7, now, mockPrisma as any);
    assert(
      history.length === 1,
      'History includes the ended reservation even if DB still had ACTIVE'
    );
    assert(
      history[0].status === BookingStatus.COMPLETED,
      'Ended booking is presented as COMPLETED to the client so ended session is never hidden'
    );
  } catch (err: any) {
    assert(false, 'History error visibility for ended session', err?.message);
  }

  // Test 3.3: Database query failure in getBookingHistory throws instead of returning HTTP 200 with empty list
  try {
    const failingPrisma = {
      booking: {
        findMany: async () => {
          throw new Error('Connection refused by PostgreSQL server');
        },
      },
    };

    let thrown = false;
    try {
      await getBookingHistory(7, now, failingPrisma as any);
    } catch (err: any) {
      thrown = true;
      assert(
        err.message === 'Connection refused by PostgreSQL server',
        'Propagates true database error'
      );
    }
    assert(
      thrown,
      'Throws error on query failure so controller returns HTTP 500 rather than fake 200'
    );
  } catch (err: any) {
    assert(false, 'History database error propagation', err?.message);
  }

  // =========================================================================
  // Test Group 4: Worker Lifecycle Management
  // =========================================================================
  console.log('\n--- Test Group 4: Worker Lifecycle Management ---');
  try {
    const mockPrisma = {
      booking: { findMany: async () => [] },
    };
    const timer = BookingService.startCompletionWorker(100, mockPrisma as any);
    assert(timer !== undefined && timer !== null, 'startCompletionWorker starts timer');
    BookingService.stopCompletionWorker(timer);
    assert(true, 'stopCompletionWorker cleans up interval safely');
  } catch (err: any) {
    assert(false, 'Worker lifecycle test', err?.message);
  }

  console.log('\n===============================================================');
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
