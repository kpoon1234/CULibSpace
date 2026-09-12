import { ScheduleService } from './services/scheduleService.js';

console.log('🧪 Starting US2-4 Target Date & Operating Schedule Validation Tests...\n');

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

async function runTests() {
  const now = new Date();
  const ONE_HOUR = 60 * 60 * 1000;

  // ==========================================
  // Suite 1: Parameter Parsing (startDateTime/endDateTime vs date/timeSlot)
  // ==========================================
  console.log('📋 Suite 1: Parameter Parsing (US2-4)');

  const p1 = ScheduleService.parseTargetTimeWindow({});
  assert(!p1.isExplicit, 'Case 1: No params defaults to fallback (now -> now + 1h)');
  assert(
    Math.abs(p1.targetEnd.getTime() - p1.targetStart.getTime() - ONE_HOUR) < 1000,
    'Case 1: Fallback window is exactly 1 hour'
  );

  const p2 = ScheduleService.parseTargetTimeWindow({
    startDateTime: '2026-09-15T10:00:00.000Z',
    endDateTime: '2026-09-15T12:00:00.000Z',
  });
  assert(p2.isExplicit, 'Case 2: startDateTime + endDateTime marked explicit');
  assert(
    p2.targetStart.toISOString() === '2026-09-15T10:00:00.000Z',
    'Case 2: Start time correctly parsed'
  );
  assert(
    p2.targetEnd.toISOString() === '2026-09-15T12:00:00.000Z',
    'Case 2: End time correctly parsed'
  );

  // Regression: the frontend's toOffsetDateTime() sends startDateTime/endDateTime
  // with an explicit UTC offset (e.g. "+07:00") rather than a bare local string,
  // specifically so the server parses the same instant the browser picked no
  // matter which timezone this process runs in. Two equivalent offset forms of
  // the same wall-clock instant must resolve to the identical UTC instant.
  const p2b = ScheduleService.parseTargetTimeWindow({
    startDateTime: '2026-09-15T17:00:00+07:00',
    endDateTime: '2026-09-15T19:00:00+07:00',
  });
  assert(
    p2b.targetStart.toISOString() === '2026-09-15T10:00:00.000Z',
    'Case 2b: +07:00-offset startDateTime resolves to the correct UTC instant'
  );
  assert(
    p2b.targetEnd.toISOString() === '2026-09-15T12:00:00.000Z',
    'Case 2b: +07:00-offset endDateTime resolves to the correct UTC instant'
  );
  assert(
    p2b.targetStart.getTime() === p2.targetStart.getTime() &&
      p2b.targetEnd.getTime() === p2.targetEnd.getTime(),
    'Case 2b: offset and Z forms of the same instant parse identically, regardless of server timezone'
  );

  const p3 = ScheduleService.parseTargetTimeWindow({
    date: '2026-09-15',
    timeSlot: '10:00-12:00',
  });
  assert(p3.isExplicit, 'Case 3: date + hyphenated timeSlot parsed');
  assert(
    p3.targetStart.getHours() === 10 && p3.targetEnd.getHours() === 12,
    'Case 3: Hours parsed from hyphen range'
  );

  const p4 = ScheduleService.parseTargetTimeWindow({
    date: '2026-09-15',
    timeSlot: '14:00',
  });
  assert(
    p4.targetStart.getHours() === 14 && p4.targetEnd.getHours() === 15,
    'Case 4: Single timeSlot defaults to 1 hour length'
  );

  // ==========================================
  // Suite 2: Chronological & Past Validation
  // ==========================================
  console.log('\n📋 Suite 2: Chronological & Past Validation');

  try {
    await ScheduleService.validateTargetTimeWindow(
      new Date('invalid'),
      new Date('2026-09-15T12:00:00Z')
    );
    assert(false, 'Case 5: Invalid date format must fail');
  } catch (err: any) {
    assert(
      err.message === 'Invalid startDateTime or endDateTime format',
      'Case 5: Invalid format rejected with 400'
    );
  }

  try {
    await ScheduleService.validateTargetTimeWindow(
      new Date(now.getTime() + 2 * ONE_HOUR),
      new Date(now.getTime() + ONE_HOUR)
    );
    assert(false, 'Case 6: End time <= Start time must fail');
  } catch (err: any) {
    assert(
      err.message === 'endDateTime must be after startDateTime',
      'Case 6: Inverted time window rejected with 400'
    );
  }

  try {
    await ScheduleService.validateTargetTimeWindow(
      new Date(now.getTime() - 10 * 60 * 1000),
      new Date(now.getTime() + ONE_HOUR)
    );
    assert(false, 'Case 7: Past date > 5 min must fail');
  } catch (err: any) {
    assert(
      err.message === 'Cannot request status for past dates',
      'Case 7: Past date rejected with 400'
    );
  }

  // ==========================================
  // Suite 3: SystemConfig Constraints (Advance Days & Duration)
  // ==========================================
  console.log('\n📋 Suite 3: SystemConfig Constraints (Advance Days & Max Duration)');

  // Requesting 15 days in advance (exceeds default 7 days)
  try {
    const farFutureStart = new Date(now.getTime() + 15 * 24 * ONE_HOUR);
    const farFutureEnd = new Date(farFutureStart.getTime() + ONE_HOUR);
    await ScheduleService.validateTargetTimeWindow(farFutureStart, farFutureEnd, true);
    assert(false, 'Case 8: Booking > 7 days advance must fail');
  } catch (err: any) {
    assert(
      err.message.includes('exceeds maximum advance booking limit'),
      'Case 8: Rejected when exceeding max advance booking days'
    );
  }

  // Requesting 5 hours duration (exceeds default 120 minutes)
  try {
    const validFutureStart = new Date(now.getTime() + 2 * 24 * ONE_HOUR);
    validFutureStart.setHours(10, 0, 0, 0);
    const excessiveEnd = new Date(validFutureStart.getTime() + 5 * ONE_HOUR); // 300 minutes
    await ScheduleService.validateTargetTimeWindow(validFutureStart, excessiveEnd, true);
    assert(false, 'Case 9: Duration > 120 mins must fail');
  } catch (err: any) {
    assert(
      err.message.includes('exceeds maximum allowed duration'),
      'Case 9: Rejected when exceeding max booking duration'
    );
  }

  // ==========================================
  // Suite 4: OperatingSchedule & Hours Validation
  // ==========================================
  console.log('\n📋 Suite 4: OperatingSchedule & Hours Validation');

  // Booking outside operating hours (e.g. at 23:00 on a day with 08:00-21:00 hours)
  try {
    const lateNightStart = new Date(now.getTime() + 24 * ONE_HOUR);
    lateNightStart.setHours(23, 0, 0, 0);
    const lateNightEnd = new Date(lateNightStart.getTime() + ONE_HOUR);
    await ScheduleService.validateTargetTimeWindow(lateNightStart, lateNightEnd, true);
    assert(false, 'Case 10: Outside operating hours must fail');
  } catch (err: any) {
    assert(
      err.message.includes('outside library operating hours') ||
        err.message.includes('Library is closed'),
      'Case 10: Rejected when requested outside operating hours'
    );
  }

  // Valid Daytime Booking within Operating Hours (e.g. 10:00 - 11:30 tomorrow)
  try {
    const normalStart = new Date(now.getTime() + 24 * ONE_HOUR);
    normalStart.setHours(10, 0, 0, 0);
    const normalEnd = new Date(normalStart.getTime() + 90 * 60 * 1000); // 90 mins
    const res = await ScheduleService.validateTargetTimeWindow(normalStart, normalEnd, true);
    assert(res.schedule !== undefined, 'Case 11: Valid window returns active schedule metadata');
    assert(res.config !== undefined, 'Case 11: Valid window returns system config');
  } catch (err: any) {
    assert(false, `Case 11: Valid operating hours should PASS, but failed: ${err.message}`);
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📊 Date Validation Test Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('🎉 ALL US2-4 TARGET DATE VALIDATION TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('⚠️  Some tests FAILED.');
    process.exit(1);
  }
}

runTests();
