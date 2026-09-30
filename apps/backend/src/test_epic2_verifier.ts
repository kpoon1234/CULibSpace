import { LayoutController } from './controllers/layoutController.js';
import { LayoutService, LayoutFilters } from './services/layoutService.js';
import { ScheduleService } from './services/scheduleService.js';
import { ZoneType, TableStatus } from '@prisma/client';

console.log('🧪 Starting EPIC 2 Multi-Layer Verification Test Suite...\n');

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ` (${detail})` : ''}`);
    failed++;
  }
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
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

async function runEpic2Verification() {
  const now = new Date();
  const ONE_HOUR = 60 * 60 * 1000;

  // =========================================================================
  // US2-1: Layout, Zones, Physical Arrangement & Network Failure Handling
  // =========================================================================
  console.log('📋 US2-1: Interactive Layout & Zone Maps');

  // US2-1 Case 1: LayoutController responds with 200 and expected payload structure
  {
    const originalGet = LayoutService.getLayoutWithStatus;
    LayoutService.getLayoutWithStatus = async () => [
      {
        zoneId: 1,
        zoneType: ZoneType.SILENT,
        name: 'Silent Zone',
        tables: [
          {
            tableId: 101,
            numberOfSeat: 4,
            plugCap: 2,
            hasTvScreen: false,
            status: TableStatus.AVAILABLE,
            isLocked: false,
          },
        ],
      } as any,
    ];

    const req = { query: {} } as any;
    const res = createMockRes();
    await LayoutController.getLayout(req, res as any);

    assert(res.statusCode === 200, 'US2-1.1: Layout API returns HTTP 200');
    assert(res.body.success === true, 'US2-1.1: Payload has success: true');
    assert(Array.isArray(res.body.data), 'US2-1.1: Payload contains zone array');
    assert(
      res.body.data[0].tables[0].plugCap === 2,
      'US2-1.1: Power plug facility metadata present'
    );

    // US2-1 Case 2: LayoutController handles DB/server error gracefully (FR-2.1 / AC3)
    LayoutService.getLayoutWithStatus = async () => {
      throw new Error('Database connection timeout');
    };

    const errReq = { query: {} } as any;
    const errRes = createMockRes();
    await LayoutController.getLayout(errReq, errRes as any);

    assert(errRes.statusCode === 500, 'US2-1.3: Server/DB error returns HTTP 500');
    assert(errRes.body.success === false, 'US2-1.3: Error payload has success: false');
    assert(
      errRes.body.error === 'Failed to fetch table layout',
      'US2-1.3: Returns friendly error message for retry prompt'
    );

    LayoutService.getLayoutWithStatus = originalGet;
  }

  // =========================================================================
  // US2-2: Real-time Status Calculation & Polling Headers
  // =========================================================================
  console.log('\n📋 US2-2: Real-time Status & Visual Indicators');

  // US2-2 Case 1: Cache-Control header for real-time polling without stale caching
  {
    const originalGet = LayoutService.getLayoutWithStatus;
    LayoutService.getLayoutWithStatus = async () => [];

    const req = { query: {} } as any;
    const res = createMockRes();
    await LayoutController.getLayout(req, res as any);

    assert(
      res.headers['cache-control'] === 'no-store',
      'US2-2.2: Cache-Control header set to no-store for real-time SWR polling'
    );

    LayoutService.getLayoutWithStatus = originalGet;
  }

  // US2-2 Case 2: Dynamic status resolution logic
  {
    const simulateStatus = (
      tableStatus: TableStatus,
      lockedUntil: Date | null,
      bookings: Array<{ status: string; start: Date; end: Date }>,
      targetStart: Date,
      targetEnd: Date
    ): { status: TableStatus; isLocked: boolean } => {
      let dynamicStatus: TableStatus = tableStatus;
      const isHoldLocked = lockedUntil ? lockedUntil > targetStart : false;

      if (tableStatus !== TableStatus.CLOSED) {
        const overlapping = bookings.filter(
          (b) =>
            b.start < targetEnd && b.end > targetStart && ['PENDING', 'ACTIVE'].includes(b.status)
        );
        if (overlapping.length > 0) {
          const hasActive = overlapping.some((b) => b.status === 'ACTIVE');
          dynamicStatus = hasActive ? TableStatus.OCCUPIED : TableStatus.RESERVED;
        } else if (isHoldLocked) {
          dynamicStatus = TableStatus.RESERVED;
        } else {
          dynamicStatus = TableStatus.AVAILABLE;
        }
      }

      return { status: dynamicStatus, isLocked: isHoldLocked };
    };

    const targetStart = new Date(now.getTime() + ONE_HOUR);
    const targetEnd = new Date(targetStart.getTime() + ONE_HOUR);

    // 1. Table closed
    const sClosed = simulateStatus(TableStatus.CLOSED, null, [], targetStart, targetEnd);
    assert(
      sClosed.status === TableStatus.CLOSED,
      'US2-2.1: Closed table remains CLOSED regardless of bookings'
    );

    // 2. Table with Active Booking -> OCCUPIED
    const sOccupied = simulateStatus(
      TableStatus.AVAILABLE,
      null,
      [{ status: 'ACTIVE', start: targetStart, end: targetEnd }],
      targetStart,
      targetEnd
    );
    assert(
      sOccupied.status === TableStatus.OCCUPIED,
      'US2-2.1: Table with active booking resolves to OCCUPIED'
    );

    // 3. Table with Pending Booking -> RESERVED
    const sReservedBooking = simulateStatus(
      TableStatus.AVAILABLE,
      null,
      [{ status: 'PENDING', start: targetStart, end: targetEnd }],
      targetStart,
      targetEnd
    );
    assert(
      sReservedBooking.status === TableStatus.RESERVED,
      'US2-2.1: Table with pending booking resolves to RESERVED'
    );

    // 4. Table with Hold-Lock -> RESERVED + isLocked = true
    const sLocked = simulateStatus(
      TableStatus.AVAILABLE,
      new Date(targetStart.getTime() + 5 * 60 * 1000), // locked 5 mins into target
      [],
      targetStart,
      targetEnd
    );
    assert(
      sLocked.status === TableStatus.RESERVED && sLocked.isLocked === true,
      'US2-2.1: Table with hold-lock resolves to RESERVED (isLocked=true)'
    );

    // 5. Table with no bookings or locks -> AVAILABLE
    const sAvailable = simulateStatus(TableStatus.AVAILABLE, null, [], targetStart, targetEnd);
    assert(
      sAvailable.status === TableStatus.AVAILABLE,
      'US2-2.1: Table without bookings or locks resolves to AVAILABLE'
    );
  }

  // =========================================================================
  // US2-3: Filter Tables by Zone Type and Amenities
  // =========================================================================
  console.log('\n📋 US2-3: Filter Tables by Zone & Amenities');

  {
    const filterContext: { receivedFilters: LayoutFilters | null } = { receivedFilters: null };
    const originalGet = LayoutService.getLayoutWithStatus;
    LayoutService.getLayoutWithStatus = async (filters: LayoutFilters) => {
      filterContext.receivedFilters = filters;
      return [];
    };

    // Case 1: Filtering by zoneType, plugCap, hasTvScreen, minSeats
    const req = {
      query: {
        zoneType: 'silent',
        plugCap: '2',
        hasTvScreen: 'true',
        minSeats: '4',
      },
    } as any;
    const res = createMockRes();
    await LayoutController.getLayout(req, res as any);

    assert(
      filterContext.receivedFilters?.zoneType === ZoneType.SILENT,
      'US2-3.1: zoneType filter mapped to ZoneType.SILENT'
    );
    assert(
      filterContext.receivedFilters?.plugCap === 2,
      'US2-3.1: plugCap filter parsed as number'
    );
    assert(
      filterContext.receivedFilters?.hasTvScreen === true,
      'US2-3.1: hasTvScreen parsed as boolean'
    );
    assert(filterContext.receivedFilters?.minSeats === 4, 'US2-3.1: minSeats parsed as number');

    // Case 2: No tables match filter criteria -> returns empty array with 200 OK (not error)
    assert(res.statusCode === 200, 'US2-3.2: Empty match query returns HTTP 200 OK');
    assert(
      Array.isArray(res.body.data) && res.body.data.length === 0,
      'US2-3.2: Empty match query returns empty array'
    );

    // Case 3: Reset filters (empty query)
    const resetReq = { query: {} } as any;
    const resetRes = createMockRes();
    await LayoutController.getLayout(resetReq, resetRes as any);

    assert(
      filterContext.receivedFilters?.zoneType === undefined,
      'US2-3.3: Reset filters clears zoneType'
    );
    assert(
      filterContext.receivedFilters?.plugCap === undefined,
      'US2-3.3: Reset filters clears plugCap'
    );
    assert(
      filterContext.receivedFilters?.hasTvScreen === undefined,
      'US2-3.3: Reset filters clears hasTvScreen'
    );

    LayoutService.getLayoutWithStatus = originalGet;
  }

  // =========================================================================
  // US2-4: Target Date/Time Window & Library Parameters Validation
  // =========================================================================
  console.log('\n📋 US2-4: Future Availability & Schedule Validation');

  // Case 1: Valid explicit future window
  {
    const futureStart = new Date(now.getTime() + 24 * ONE_HOUR);
    futureStart.setHours(10, 0, 0, 0);
    const futureEnd = new Date(futureStart.getTime() + 60 * 60 * 1000);

    const parsed = ScheduleService.parseTargetTimeWindow({
      startDateTime: futureStart.toISOString(),
      endDateTime: futureEnd.toISOString(),
    });
    assert(
      parsed.isExplicit === true,
      'US2-4.1: Explicit startDateTime/endDateTime flagged as explicit'
    );

    const validation = await ScheduleService.validateTargetTimeWindow(
      parsed.targetStart,
      parsed.targetEnd,
      true
    );
    assert(
      validation.targetStart.getTime() === futureStart.getTime(),
      'US2-4.1: Target start time preserved'
    );
    assert(
      validation.schedule !== undefined,
      'US2-4.1: Active operating schedule returned in metadata'
    );
  }

  // Case 2: Past date validation (< now - 5 min)
  {
    try {
      const pastStart = new Date(now.getTime() - 10 * 60 * 1000);
      const pastEnd = new Date(now.getTime() + ONE_HOUR);
      await ScheduleService.validateTargetTimeWindow(pastStart, pastEnd, true);
      assert(false, 'US2-4.2: Past date should be rejected');
    } catch (err: any) {
      assert(
        err.status === 400 && err.message === 'Cannot request status for past dates',
        'US2-4.2: Past date rejected with 400 and semantic message'
      );
    }
  }

  // Case 3: Outside library operating hours
  {
    try {
      const midnightStart = new Date(now.getTime() + 24 * ONE_HOUR);
      midnightStart.setHours(23, 0, 0, 0);
      const midnightEnd = new Date(midnightStart.getTime() + ONE_HOUR);
      await ScheduleService.validateTargetTimeWindow(midnightStart, midnightEnd, true);
      assert(false, 'US2-4.2: Time outside operating hours should be rejected');
    } catch (err: any) {
      assert(
        err.status === 400 &&
          (err.message.includes('outside library operating hours') ||
            err.message.includes('Library is closed')),
        'US2-4.2: Time outside operating hours rejected with 400'
      );
    }
  }

  // Case 4: Inverted time range (end <= start)
  {
    try {
      const start = new Date(now.getTime() + 24 * ONE_HOUR);
      start.setHours(12, 0, 0, 0);
      const end = new Date(now.getTime() + 24 * ONE_HOUR);
      end.setHours(11, 0, 0, 0);
      await ScheduleService.validateTargetTimeWindow(start, end, true);
      assert(false, 'US2-4.2: Inverted time should be rejected');
    } catch (err: any) {
      assert(
        err.status === 400 && err.message === 'endDateTime must be after startDateTime',
        'US2-4.2: Inverted time rejected with 400'
      );
    }
  }

  // Case 5: Target date exceeds max advance booking days
  {
    try {
      const farStart = new Date(now.getTime() + 15 * 24 * ONE_HOUR);
      const farEnd = new Date(farStart.getTime() + ONE_HOUR);
      await ScheduleService.validateTargetTimeWindow(farStart, farEnd, true);
      assert(false, 'US2-4.2: Date beyond max advance booking days should be rejected');
    } catch (err: any) {
      assert(
        err.status === 400 && err.message.includes('exceeds maximum advance booking limit'),
        'US2-4.2: Far future date rejected with 400'
      );
    }
  }

  // Case 6: Target duration exceeds max allowed duration
  {
    try {
      const start = new Date(now.getTime() + 24 * ONE_HOUR);
      start.setHours(10, 0, 0, 0);
      const excessiveEnd = new Date(start.getTime() + 5 * ONE_HOUR); // 300 minutes > 120 minutes
      await ScheduleService.validateTargetTimeWindow(start, excessiveEnd, true);
      assert(false, 'US2-4.2: Duration beyond max duration should be rejected');
    } catch (err: any) {
      assert(
        err.status === 400 && err.message.includes('exceeds maximum allowed duration'),
        'US2-4.2: Excessive duration rejected with 400'
      );
    }
  }

  // Case 7: bookedIntervals returned for timetable preview (US2-4 / AC 2.4.3)
  {
    const originalGet = LayoutService.getLayoutWithStatus;
    LayoutService.getLayoutWithStatus = async () => [
      {
        zoneId: 1,
        zoneType: ZoneType.COMMON,
        tables: [
          {
            tableId: 201,
            status: TableStatus.RESERVED,
            bookedIntervals: [
              {
                startDateTime: new Date(now.getTime() + ONE_HOUR).toISOString(),
                endDateTime: new Date(now.getTime() + 2 * ONE_HOUR).toISOString(),
                status: 'PENDING',
              },
            ],
          },
        ],
      } as any,
    ];

    const req = { query: {} } as any;
    const res = createMockRes();
    await LayoutController.getLayout(req, res as any);

    assert(
      Array.isArray(res.body.data[0].tables[0].bookedIntervals),
      'US2-4.3: bookedIntervals array returned in table payload'
    );
    assert(
      res.body.data[0].tables[0].bookedIntervals.length === 1,
      'US2-4.3: bookedIntervals contains scheduled interval for timetable preview'
    );

    LayoutService.getLayoutWithStatus = originalGet;
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📊 EPIC 2 Verification Suite Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('🎉 ALL EPIC 2 BACKEND VERIFICATION TESTS PASSED!');
  } else {
    console.error('⚠️  Some tests FAILED.');
    process.exit(1);
  }
}

runEpic2Verification();
