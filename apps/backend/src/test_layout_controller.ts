console.log('🧪 Starting LayoutController Logic Tests...\n');

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

function computeTargetTime(startDateTime?: string, endDateTime?: string) {
  const now = new Date();
  let targetStart: Date;
  let targetEnd: Date;

  if (startDateTime && endDateTime) {
    targetStart = new Date(startDateTime);
    targetEnd = new Date(endDateTime);
    if (isNaN(targetStart.getTime()) || isNaN(targetEnd.getTime()))
      return {
        targetStart: now,
        targetEnd: now,
        error: 'Invalid startDateTime or endDateTime format',
      };
    if (targetEnd <= targetStart)
      return { targetStart, targetEnd, error: 'endDateTime must be after startDateTime' };
    if (targetStart.getTime() < now.getTime() - 5 * 60 * 1000)
      return { targetStart, targetEnd, error: 'Cannot request status for past dates' };
  } else {
    targetStart = now;
    targetEnd = new Date(now.getTime() + 60 * 60 * 1000);
  }
  return { targetStart, targetEnd, error: undefined };
}

function parseFilters(query: Record<string, string | undefined>) {
  const { zoneType, plugCap, hasTvScreen, minSeats } = query;
  const validZoneTypes = ['SILENT', 'GROUP', 'COMMON'];
  return {
    zoneType:
      zoneType && validZoneTypes.includes(String(zoneType).toUpperCase())
        ? String(zoneType).toUpperCase()
        : undefined,
    plugCap: plugCap && !isNaN(parseInt(plugCap, 10)) ? parseInt(plugCap, 10) : undefined,
    minSeats: minSeats && !isNaN(parseInt(minSeats, 10)) ? parseInt(minSeats, 10) : undefined,
    hasTvScreen: hasTvScreen === 'true' ? true : hasTvScreen === 'false' ? false : undefined,
  };
}

const HOUR = 60 * 60 * 1000;

console.log('📋 Suite 1: Time Calculation');
const c1 = computeTargetTime();
assert(!c1.error, 'Case 1 (no params) - no error');
assert(
  Math.abs(c1.targetEnd.getTime() - c1.targetStart.getTime() - HOUR) < 1000,
  'Case 1 - window = 1 hour'
);

const c2 = computeTargetTime(new Date(Date.now() + 30 * 60 * 1000).toISOString(), undefined);
assert(!c2.error, 'Case 2 (start only) - fallback, no error');
assert(
  Math.abs(c2.targetEnd.getTime() - c2.targetStart.getTime() - HOUR) < 1000,
  'Case 2 - window = 1 hour (fallback)'
);

const c3 = computeTargetTime(
  new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  new Date(Date.now() + 90 * 60 * 1000).toISOString()
);
assert(!c3.error, 'Case 3 (start+end valid) - no error');
assert(
  Math.abs(c3.targetEnd.getTime() - c3.targetStart.getTime() - 80 * 60 * 1000) < 1000,
  'Case 3 - window = 80 min'
);

const c4 = computeTargetTime(
  new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  new Date(Date.now() + 30 * 60 * 1000).toISOString()
);
assert(
  c4.error === 'endDateTime must be after startDateTime',
  'Case 4 (end < start) - correct error'
);

const c5 = computeTargetTime(
  new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  new Date(Date.now() + 60 * 60 * 1000).toISOString()
);
assert(
  c5.error === 'Cannot request status for past dates',
  'Case 5 (past > 5 min) - correct error'
);

const c6 = computeTargetTime(
  new Date(Date.now() - 3 * 60 * 1000).toISOString(),
  new Date(Date.now() + 90 * 60 * 1000).toISOString()
);
assert(!c6.error, 'Case 6 (past < 5 min tolerance) - no error');

const c7 = computeTargetTime('not-a-date', '2026-09-20T11:30:00Z');
assert(
  c7.error === 'Invalid startDateTime or endDateTime format',
  'Case 7 (invalid format) - correct error'
);

console.log('\n📋 Suite 2: Filter Parsing');
const f8 = parseFilters({});
assert(f8.zoneType === undefined, 'Case 8 (no filters) - zoneType undefined');
assert(f8.plugCap === undefined, 'Case 8 (no filters) - plugCap undefined');
assert(f8.minSeats === undefined, 'Case 8 (no filters) - minSeats undefined');
assert(f8.hasTvScreen === undefined, 'Case 8 (no filters) - hasTvScreen undefined');

assert(parseFilters({ zoneType: 'silent' }).zoneType === 'SILENT', 'Case 9 - silent -> SILENT');
assert(
  parseFilters({ zoneType: 'INVALID' }).zoneType === undefined,
  'Case 10 - invalid zoneType -> undefined'
);

const f11 = parseFilters({ plugCap: '2', minSeats: '4' });
assert(f11.plugCap === 2, 'Case 11 - plugCap = 2');
assert(f11.minSeats === 4, 'Case 11 - minSeats = 4');

assert(parseFilters({ hasTvScreen: 'true' }).hasTvScreen === true, 'Case 12 - "true" -> true');
assert(parseFilters({ hasTvScreen: 'false' }).hasTvScreen === false, 'Case 12 - "false" -> false');
assert(
  parseFilters({ hasTvScreen: 'yes' }).hasTvScreen === undefined,
  'Case 12 - "yes" -> undefined'
);

console.log(`\n${'─'.repeat(50)}`);
console.log(`📊 Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('🎉 ALL TESTS PASSED!');
} else {
  console.error('⚠️  Some tests FAILED.');
  process.exit(1);
}
