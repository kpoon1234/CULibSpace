import { BookingController } from './controllers/bookingController.js';
import { BookingService } from './services/bookingService.js';
import { UserType, TableStatus } from '@prisma/client';

console.log('🧪 Starting BookingController HTTP Request/Response Tests...\n');

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

function createMockRes() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
}

async function runTests() {
  const now = new Date();
  const validStart = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  validStart.setHours(10, 0, 0, 0);
  const validEnd = new Date(validStart.getTime() + 60 * 60 * 1000);

  // ==========================================
  // Suite 1: Input Validation & Missing Fields
  // ==========================================
  console.log('📋 Suite 1: Controller Input Validation');

  // Case 1: Missing userId & unauthenticated
  {
    const req = { body: {}, user: undefined } as any;
    const res = createMockRes();
    await BookingController.validate(req, res as any);
    assert(res.statusCode === 401, 'Case 1: Missing user session/userId returns 401');
    assert(res.body.success === false, 'Case 1: success === false');
  }

  // Case 2: Missing tableId
  {
    const req = {
      body: { userId: 1, startDateTime: validStart.toISOString() },
      user: undefined,
    } as any;
    const res = createMockRes();
    await BookingController.validate(req, res as any);
    assert(res.statusCode === 400, 'Case 2: Missing tableId returns 400');
    assert(res.body.error.includes('tableId'), 'Case 2: Error mentions tableId');
  }

  // Case 3: Missing startDateTime or endDateTime
  {
    const req = {
      body: { userId: 1, tableId: 10, startDateTime: validStart.toISOString() },
      user: undefined,
    } as any;
    const res = createMockRes();
    await BookingController.validate(req, res as any);
    assert(res.statusCode === 400, 'Case 3: Missing endDateTime returns 400');
  }

  // Case 4: Invalid date format
  {
    const req = {
      body: { userId: 1, tableId: 10, startDateTime: 'invalid-date', endDateTime: 'not-a-date' },
    } as any;
    const res = createMockRes();
    await BookingController.validate(req, res as any);
    assert(res.statusCode === 400, 'Case 4: Malformed date string returns 400');
  }

  // ==========================================
  // Suite 2: Service Delegation & Response Mapping
  // ==========================================
  console.log('\n📋 Suite 2: Service Delegation & Response Handling');

  // Case 5: When BookingService succeeds
  {
    const originalValidate = BookingService.validateBookingRules;
    BookingService.validateBookingRules = async () => ({
      valid: true,
      user: {
        uid: 1,
        firstname: 'Somchai',
        lastname: 'Deejai',
        behaviourScore: 100,
        userType: UserType.UNIVERSITY,
      },
      table: { tableId: 10, numberOfSeat: 4, zoneId: 1, status: TableStatus.AVAILABLE },
      timeWindow: { startDateTime: validStart, endDateTime: validEnd, durationMinutes: 60 },
      schedule: { name: 'Normal', openTime: '08:00', closeTime: '21:00', is24Hours: false },
    });

    const req = {
      body: {
        userId: 1,
        tableId: 10,
        startDateTime: validStart.toISOString(),
        endDateTime: validEnd.toISOString(),
      },
    } as any;
    const res = createMockRes();
    await BookingController.validate(req, res as any);

    assert(res.statusCode === 200, 'Case 5: Success returns HTTP 200');
    assert(res.body.success === true, 'Case 5: Body success === true');
    assert(res.body.data.table.tableId === 10, 'Case 5: Returns payload data');

    // Restore
    BookingService.validateBookingRules = originalValidate;
  }

  // Case 6: When BookingService throws business rule violation (e.g. 409 Conflict)
  {
    const originalValidate = BookingService.validateBookingRules;
    BookingService.validateBookingRules = async () => {
      throw { status: 409, code: 'USER_BOOKING_OVERLAP', message: 'Overlapping reservation' };
    };

    const req = {
      user: { uid: 1 },
      body: {
        tableId: 10,
        startDateTime: validStart.toISOString(),
        endDateTime: validEnd.toISOString(),
      },
    } as any;
    const res = createMockRes();
    await BookingController.validate(req, res as any);

    assert(res.statusCode === 409, 'Case 6: Business error propagates status 409');
    assert(res.body.code === 'USER_BOOKING_OVERLAP', 'Case 6: Error code propagated');
    assert(res.body.success === false, 'Case 6: success === false on error');

    // Restore
    BookingService.validateBookingRules = originalValidate;
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📊 BookingController Test Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('🎉 ALL BOOKING CONTROLLER TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('⚠️  Some tests FAILED.');
    process.exit(1);
  }
}

runTests();
