import { PrismaClient } from '@prisma/client';
import { BookingService } from './services/bookingService.js';

const prisma = new PrismaClient();

console.log('🧪 Starting Concurrency & Exploit Prevention Tests...\n');

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function runConcurrencyTests() {
  const tableId = 102; // Available table from seed data
  const userA = 1; // UID 1: Alice
  const userB = 2; // UID 2: Bobby

  // 0. Ensure clean state before testing
  await prisma.table.update({
    where: { tableId },
    data: { lockToken: null, lockedUntil: null, lockedByUid: null, status: 'AVAILABLE' },
  });

  // ==========================================
  // Test 1: TOCTOU Race Condition on acquireLock (Bug 1)
  // ==========================================
  console.log('\n📋 Test 1: Atomic Lock Acquisition (Race Condition Prevention)');
  try {
    // Fire two lock requests at the exact same millisecond
    const results = await Promise.allSettled([
      BookingService.acquireLock(tableId, userA, undefined, undefined, prisma),
      BookingService.acquireLock(tableId, userB, undefined, undefined, prisma),
    ]);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const rejections = results.filter((r) => r.status === 'rejected');

    assert(successes.length === 1, 'Only ONE user succeeded in acquiring the lock');
    assert(
      rejections.length === 1 && (rejections[0] as any).reason.code === 'TABLE_LOCKED',
      'The competing user was strictly rejected with TABLE_LOCKED'
    );
  } catch (err: any) {
    assert(false, `Test 1 failed unexpectedly: ${err.message}`);
  }

  // Cleanup for next test
  await prisma.table.update({
    where: { tableId },
    data: { lockToken: null, lockedUntil: null, lockedByUid: null },
  });

  // ==========================================
  // Test 2: Bypassing Hold Logic (Bug 3)
  // ==========================================
  console.log('\n📋 Test 2: Hold Bypass Prevention');
  try {
    const start = new Date(Date.now() + 24 * 3600 * 1000);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    // Attempt to book without providing a lock token
    await BookingService.createBooking(
      {
        userId: userA,
        tableId,
        startDateTime: start,
        endDateTime: end,
        lockToken: '', // Empty or undefined
      },
      prisma
    );

    assert(false, 'Should not allow booking without a lock token');
  } catch (err: any) {
    assert(
      err.code === 'LOCK_TOKEN_REQUIRED',
      'Booking without lock token correctly throws LOCK_TOKEN_REQUIRED'
    );
  }

  // ==========================================
  // Test 3: Clearing Someone Else's Lock (Bug 4)
  // ==========================================
  console.log('\n📋 Test 3: Lock Ownership & Cleanup Protection');
  try {
    // 1. User A legitimately acquires the lock
    const lock = await BookingService.acquireLock(tableId, userA, undefined, undefined, prisma);

    // 2. User B tries to force a booking on that table using a fake/incorrect token
    const start = new Date(Date.now() + 24 * 3600 * 1000);
    start.setHours(14, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    await BookingService.createBooking(
      {
        userId: userB,
        tableId,
        startDateTime: start,
        endDateTime: end,
        lockToken: 'fake-token-123',
      },
      prisma
    );

    assert(false, 'Should not allow booking with incorrect token');
  } catch (err: any) {
    assert(
      err.code === 'LOCK_EXPIRED' || err.code === 'TABLE_LOCKED',
      'Booking with wrong token correctly rejected'
    );

    // 3. Verify User A's lock is still intact and wasn't wiped by User B's failed attempt
    const table = await prisma.table.findUnique({ where: { tableId } });
    assert(
      table?.lockedByUid === userA,
      "User A's lock was safely preserved and NOT cleared by User B's failed attempt"
    );
  }

  // Final Cleanup
  await prisma.table.update({
    where: { tableId },
    data: { lockToken: null, lockedUntil: null, lockedByUid: null },
  });

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📊 Concurrency Test Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('🎉 ALL CONCURRENCY & RACE CONDITION EXPLOITS SUCCESSFULLY BLOCKED!');
  } else {
    process.exit(1);
  }
}

runConcurrencyTests().finally(() => prisma.$disconnect());
