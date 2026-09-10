import { BookingService, BookingValidationInput } from './services/bookingService.js';
import { UserType, TableStatus, BookingStatus, TicketStatus } from '@prisma/client';

console.log('🧪 Starting US3-1 Booking Rules Validation Tests...\n');

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

// Mock Prisma factory for isolated, deterministic rule testing
function createMockPrisma(overrides: {
  user?: any;
  table?: any;
  userOverlap?: any;
  tableOverlap?: any;
  config?: any;
}) {
  return {
    systemConfig: {
      findFirst: async () =>
        overrides.config !== undefined
          ? overrides.config
          : {
              configId: 1,
              maxBookingDurationMinutes: 120,
              minScoreToBook: 50.0,
              maxAdvanceBookingDays: 7,
            },
    },
    user: {
      findUnique: async () => overrides.user,
    },
    table: {
      findUnique: async () => overrides.table,
    },
    booking: {
      findFirst: async ({ where }: any) => {
        if (where.uid !== undefined) {
          return overrides.userOverlap || null;
        }
        if (where.tableId !== undefined) {
          return overrides.tableOverlap || null;
        }
        return null;
      },
    },
  };
}

async function runTests() {
  const now = new Date();
  const ONE_HOUR = 60 * 60 * 1000;

  // Tomorrow 10:00 - 11:30 (valid within default 08:00 - 21:00 operating hours)
  const validStart = new Date(now.getTime() + 24 * ONE_HOUR);
  validStart.setHours(10, 0, 0, 0);
  const validEnd = new Date(validStart.getTime() + 90 * 60 * 1000); // 90 min

  const defaultUser = {
    uid: 101,
    firstname: 'Somchai',
    lastname: 'Deejai',
    behaviourScore: 100.0,
    userType: UserType.UNIVERSITY,
    outsideUser: null,
  };

  const defaultTable = {
    tableId: 1,
    zoneId: 1,
    numberOfSeat: 4,
    status: TableStatus.AVAILABLE,
    lockedUntil: null,
    lockToken: null,
  };

  // ==========================================
  // Suite 1: User Existence & Behavior Credit Score (FR-5.3)
  // ==========================================
  console.log('📋 Suite 1: User Existence & Behavior Credit Score');

  // Case 1: User Not Found
  try {
    const mockPrisma = createMockPrisma({ user: null, table: defaultTable });
    await BookingService.validateBookingRules(
      { userId: 999, tableId: 1, startDateTime: validStart, endDateTime: validEnd },
      mockPrisma
    );
    assert(false, 'Case 1: Non-existent user should fail');
  } catch (err: any) {
    assert(
      err.status === 404 && err.code === 'USER_NOT_FOUND',
      'Case 1: User not found throws 404'
    );
  }

  // Case 2: User Score < 50.0 (e.g. 45.0)
  try {
    const lowScoreUser = { ...defaultUser, behaviourScore: 45.0 };
    const mockPrisma = createMockPrisma({ user: lowScoreUser, table: defaultTable });
    await BookingService.validateBookingRules(
      { userId: 101, tableId: 1, startDateTime: validStart, endDateTime: validEnd },
      mockPrisma
    );
    assert(false, 'Case 2: Score < 50.0 should fail');
  } catch (err: any) {
    assert(
      err.status === 403 && err.code === 'INSUFFICIENT_BEHAVIOUR_SCORE',
      'Case 2: Score < 50.0 throws 403 INSUFFICIENT_BEHAVIOUR_SCORE'
    );
  }

  // Case 3: User Score exactly 50.0 (passes minimum threshold)
  try {
    const edgeScoreUser = { ...defaultUser, behaviourScore: 50.0 };
    const mockPrisma = createMockPrisma({ user: edgeScoreUser, table: defaultTable });
    const res = await BookingService.validateBookingRules(
      { userId: 101, tableId: 1, startDateTime: validStart, endDateTime: validEnd },
      mockPrisma
    );
    assert(res.valid === true && res.user.behaviourScore === 50, 'Case 3: Score = 50.0 passes');
  } catch (err: any) {
    assert(false, `Case 3: Score = 50.0 should pass, failed: ${err.message}`);
  }

  // ==========================================
  // Suite 2: 1-Booking-Per-User Policy (FR-3.1, FR-3.2)
  // ==========================================
  console.log('\n📋 Suite 2: 1-Booking-Per-User Policy');

  // Case 4: User already has an active or pending reservation overlapping
  try {
    const existingBooking = {
      bookingId: 500,
      uid: 101,
      tableId: 2,
      startDateTime: validStart,
      endDateTime: validEnd,
      status: BookingStatus.PENDING,
    };
    const mockPrisma = createMockPrisma({
      user: defaultUser,
      table: defaultTable,
      userOverlap: existingBooking,
    });
    await BookingService.validateBookingRules(
      { userId: 101, tableId: 1, startDateTime: validStart, endDateTime: validEnd },
      mockPrisma
    );
    assert(false, 'Case 4: Overlapping user booking should fail');
  } catch (err: any) {
    assert(
      err.status === 409 && err.code === 'USER_BOOKING_OVERLAP',
      'Case 4: User overlapping booking throws 409 USER_BOOKING_OVERLAP'
    );
  }

  // ==========================================
  // Suite 3: Table Existence, Maintenance & Overlap Availability
  // ==========================================
  console.log('\n📋 Suite 3: Table Existence, Maintenance & Overlap Availability');

  // Case 5: Table Not Found
  try {
    const mockPrisma = createMockPrisma({ user: defaultUser, table: null });
    await BookingService.validateBookingRules(
      { userId: 101, tableId: 999, startDateTime: validStart, endDateTime: validEnd },
      mockPrisma
    );
    assert(false, 'Case 5: Non-existent table should fail');
  } catch (err: any) {
    assert(
      err.status === 404 && err.code === 'TABLE_NOT_FOUND',
      'Case 5: Table not found throws 404'
    );
  }

  // Case 6: Table Closed for Maintenance
  try {
    const closedTable = { ...defaultTable, status: TableStatus.CLOSED };
    const mockPrisma = createMockPrisma({ user: defaultUser, table: closedTable });
    await BookingService.validateBookingRules(
      { userId: 101, tableId: 1, startDateTime: validStart, endDateTime: validEnd },
      mockPrisma
    );
    assert(false, 'Case 6: Closed table should fail');
  } catch (err: any) {
    assert(
      err.status === 400 && err.code === 'TABLE_CLOSED',
      'Case 6: Closed table throws 400 TABLE_CLOSED'
    );
  }

  // Case 7: Table already reserved by another user
  try {
    const existingTableBooking = {
      bookingId: 501,
      uid: 999,
      tableId: 1,
      startDateTime: validStart,
      endDateTime: validEnd,
      status: BookingStatus.ACTIVE,
    };
    const mockPrisma = createMockPrisma({
      user: defaultUser,
      table: defaultTable,
      tableOverlap: existingTableBooking,
    });
    await BookingService.validateBookingRules(
      { userId: 101, tableId: 1, startDateTime: validStart, endDateTime: validEnd },
      mockPrisma
    );
    assert(false, 'Case 7: Reserved table should fail');
  } catch (err: any) {
    assert(
      err.status === 409 && err.code === 'TABLE_ALREADY_BOOKED',
      'Case 7: Already booked table throws 409 TABLE_ALREADY_BOOKED'
    );
  }

  // ==========================================
  // Suite 4: Hold-Lock Concurrency Protection (FR-3.4)
  // ==========================================
  console.log('\n📋 Suite 4: Hold-Lock Concurrency Protection');

  // Case 8: Table hold-locked by another user (no token or mismatched token)
  try {
    const lockedTable = {
      ...defaultTable,
      lockedUntil: new Date(Date.now() + 4 * 60 * 1000), // locked for next 4 minutes
      lockToken: 'uuid-user-a',
    };
    const mockPrisma = createMockPrisma({ user: defaultUser, table: lockedTable });
    await BookingService.validateBookingRules(
      {
        userId: 101,
        tableId: 1,
        startDateTime: validStart,
        endDateTime: validEnd,
        lockToken: 'uuid-user-b',
      },
      mockPrisma
    );
    assert(false, 'Case 8: Table locked by another token should fail');
  } catch (err: any) {
    assert(
      err.status === 409 && err.code === 'TABLE_LOCKED',
      'Case 8: Table locked by another token throws 409 TABLE_LOCKED'
    );
  }

  // Case 9: Table hold-locked by same user (matching lock token) -> PASSES
  try {
    const lockToken = 'my-valid-token-123';
    const lockedTable = {
      ...defaultTable,
      lockedUntil: new Date(Date.now() + 4 * 60 * 1000),
      lockToken,
    };
    const mockPrisma = createMockPrisma({ user: defaultUser, table: lockedTable });
    const res = await BookingService.validateBookingRules(
      {
        userId: 101,
        tableId: 1,
        startDateTime: validStart,
        endDateTime: validEnd,
        lockToken,
      },
      mockPrisma
    );
    assert(res.valid === true, 'Case 9: Matching lock token passes successfully');
  } catch (err: any) {
    assert(false, `Case 9: Matching lock token should PASS, failed: ${err.message}`);
  }

  // ==========================================
  // Suite 5: Outside Visitor Ticket Check (FR-6.3)
  // ==========================================
  console.log('\n📋 Suite 5: Outside Visitor Ticket Check');

  // Case 10: Thai / Foreign Outside visitor WITHOUT paid ticket
  try {
    const outsideUserNoTicket = {
      ...defaultUser,
      userType: UserType.THAI,
      outsideUser: { tickets: [] },
    };
    const mockPrisma = createMockPrisma({ user: outsideUserNoTicket, table: defaultTable });
    await BookingService.validateBookingRules(
      { userId: 101, tableId: 1, startDateTime: validStart, endDateTime: validEnd },
      mockPrisma
    );
    assert(false, 'Case 10: Outside visitor without paid ticket should fail');
  } catch (err: any) {
    assert(
      err.status === 403 && err.code === 'TICKET_REQUIRED',
      'Case 10: Outside user without ticket throws 403 TICKET_REQUIRED'
    );
  }

  // Case 11: Thai Outside visitor WITH active paid ticket -> PASSES
  try {
    const outsideUserWithTicket = {
      ...defaultUser,
      userType: UserType.THAI,
      outsideUser: {
        tickets: [
          {
            ticketId: 1,
            status: TicketStatus.PAID,
            startDateTime: validStart,
            endDateTime: validEnd,
          },
        ],
      },
    };
    const mockPrisma = createMockPrisma({ user: outsideUserWithTicket, table: defaultTable });
    const res = await BookingService.validateBookingRules(
      { userId: 101, tableId: 1, startDateTime: validStart, endDateTime: validEnd },
      mockPrisma
    );
    assert(res.valid === true, 'Case 11: Outside user with active PAID ticket passes');
  } catch (err: any) {
    assert(false, `Case 11: Outside user with paid ticket should PASS, failed: ${err.message}`);
  }

  // ==========================================
  // Suite 6: Full Valid Reservation
  // ==========================================
  console.log('\n📋 Suite 6: Full Valid Reservation');

  // Case 12: Completely valid University booking
  try {
    const mockPrisma = createMockPrisma({ user: defaultUser, table: defaultTable });
    const res = await BookingService.validateBookingRules(
      { userId: 101, tableId: 1, startDateTime: validStart, endDateTime: validEnd },
      mockPrisma
    );
    assert(res.valid === true, 'Case 12: Valid booking passes');
    assert(res.user.uid === 101, 'Case 12: Returns user details');
    assert(res.table.tableId === 1, 'Case 12: Returns table details');
    assert(res.timeWindow.durationMinutes === 90, 'Case 12: Returns correct duration (90 min)');
    assert(res.schedule.name !== undefined, 'Case 12: Returns operating schedule');
  } catch (err: any) {
    assert(false, `Case 12: Valid booking should PASS, failed: ${err.message}`);
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📊 Booking Validation Test Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('🎉 ALL US3-1 BOOKING VALIDATION TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('⚠️  Some tests FAILED.');
    process.exit(1);
  }
}

runTests();
