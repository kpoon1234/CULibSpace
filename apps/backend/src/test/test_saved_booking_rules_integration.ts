import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
const testUrl = new URL(databaseUrl);
if (!/^postgres(?:ql)?:$/.test(testUrl.protocol) || !/_test$/i.test(testUrl.pathname.slice(1))) {
  throw new Error('Use a dedicated PostgreSQL database whose name ends in _test.');
}
if (process.env.DATABASE_URL) {
  const app = new URL(process.env.DATABASE_URL);
  if (app.host === testUrl.host && app.pathname === testUrl.pathname) {
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL.');
  }
}
process.env.DATABASE_URL = databaseUrl;
const { PrismaClient } = await import('@prisma/client');
const { BookingService, getActiveBooking } = await import('../services/bookingService.js');
const { ScheduleService } = await import('../services/scheduleService.js');
const { NoShowService } = await import('../services/noShowService.js');
const prisma = new PrismaClient();
const runId = randomUUID();
const users: number[] = [],
  tables: number[] = [],
  zones: number[] = [],
  schedules: number[] = [];
const admins: number[] = [];
const savedPolicy = await prisma.systemConfig.findUnique({ where: { configId: 1 } });
const defaults = {
  maxBookingDurationMinutes: 120,
  maxAdvanceBookingDays: 7,
  minScoreToBook: 50,
  earlyCheckInMinutes: 15,
  lateThresholdMinutes: 15,
};
const dayMs = 86_400_000;
const tomorrow = new Date(Date.now() + dayMs + 7 * 60 * 60_000).toISOString().slice(0, 10);
const start = new Date(`${tomorrow}T10:00:00+07:00`);
const end = new Date(`${tomorrow}T11:00:00+07:00`);
const dateColumn = new Date(`${tomorrow}T00:00:00Z`);
let policyTouched = false;
let passed = 0;

async function fixture() {
  const user = await prisma.user.create({
    data: {
      email: `rules-${runId}-${users.length}@example.test`,
      firstname: 'Rules',
      lastname: 'Test',
      userType: 'UNIVERSITY',
      isProfileComplete: true,
      behaviourScore: 60,
    },
  });
  users.push(user.uid);
  const zone = await prisma.zone.create({ data: { zoneType: 'COMMON' } });
  zones.push(zone.zoneId);
  const table = await prisma.table.create({ data: { zoneId: zone.zoneId, numberOfSeat: 4 } });
  tables.push(table.tableId);
  return {
    user,
    table,
    userId: user.uid,
    tableId: table.tableId,
    startDateTime: start,
    endDateTime: end,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function hold(f: Fixture) {
  return BookingService.acquireLock(f.tableId, f.userId, start, end, prisma);
}
async function assertNoBooking(f: Fixture, token: string) {
  assert.equal(await prisma.booking.count({ where: { tableId: f.tableId } }), 0);
  assert.equal(
    (await prisma.table.findUniqueOrThrow({ where: { tableId: f.tableId } })).lockToken,
    token
  );
}
async function pending(f: Fixture, at = start) {
  return prisma.booking.create({
    data: {
      uid: f.userId,
      tableId: f.tableId,
      status: 'PENDING',
      startDateTime: at,
      endDateTime: new Date(at.getTime() + 60 * 60_000),
    },
  });
}
async function test(name: string, run: () => Promise<void>) {
  await prisma.systemConfig.update({ where: { configId: 1 }, data: defaults });
  await prisma.operatingSchedule.deleteMany({ where: { scheduleId: { in: schedules.slice(1) } } });
  await prisma.operatingSchedule.update({
    where: { scheduleId: schedules[0]! },
    data: {
      openTime: '08:00',
      closeTime: '21:00',
      is24Hours: false,
      isClosed: false,
      priority: 1,
    },
  });
  await run();
  passed++;
  console.log(`PASS: ${name}`);
}

try {
  // A schedule is global, so refuse a populated fixture DB instead of replacing somebody else's hours.
  assert.equal(
    await prisma.operatingSchedule.count(),
    0,
    'Use an empty integration-test schedule table.'
  );
  await prisma.systemConfig.upsert({
    where: { configId: 1 },
    create: { configId: 1, ...defaults },
    update: defaults,
  });
  policyTouched = true;
  const regular = await prisma.operatingSchedule.create({
    data: {
      name: `Rules ${runId}`,
      startDate: new Date(dateColumn.getTime() - dayMs),
      endDate: new Date(dateColumn.getTime() + 3 * dayMs),
    },
  });
  schedules.push(regular.scheduleId);

  await test('saved duration changes affect holds immediately without restarting the service', async () => {
    const f = await fixture();
    await prisma.systemConfig.update({
      where: { configId: 1 },
      data: { maxBookingDurationMinutes: 30 },
    });
    await assert.rejects(() => hold(f), { code: 'BOOKING_DURATION_EXCEEDED' });
    assert.equal(
      (await prisma.table.findUniqueOrThrow({ where: { tableId: f.tableId } })).lockToken,
      null
    );
    await prisma.systemConfig.update({
      where: { configId: 1 },
      data: { maxBookingDurationMinutes: 90 },
    });
    assert.ok((await hold(f)).lockToken);
  });

  await test('saved score and advance limits reject a hold before mutating the table', async () => {
    const f = await fixture();
    await prisma.systemConfig.update({ where: { configId: 1 }, data: { minScoreToBook: 70 } });
    await assert.rejects(() => hold(f), { code: 'INSUFFICIENT_BEHAVIOUR_SCORE' });
    await prisma.systemConfig.update({
      where: { configId: 1 },
      data: { minScoreToBook: 50, maxAdvanceBookingDays: 0 },
    });
    await assert.rejects(() => hold(f), { code: 'BOOKING_TOO_FAR_IN_ADVANCE' });
    assert.equal(
      (await prisma.table.findUniqueOrThrow({ where: { tableId: f.tableId } })).lockToken,
      null
    );
  });

  for (const change of [
    {
      name: 'duration',
      data: { maxBookingDurationMinutes: 30 },
      code: 'BOOKING_DURATION_EXCEEDED',
    },
    { name: 'score', data: { minScoreToBook: 70 }, code: 'INSUFFICIENT_BEHAVIOUR_SCORE' },
  ]) {
    await test(`final booking rechecks a ${change.name} change made after a successful hold`, async () => {
      const f = await fixture();
      const { lockToken } = await hold(f);
      await prisma.systemConfig.update({ where: { configId: 1 }, data: change.data });
      await assert.rejects(() => BookingService.createBooking({ ...f, lockToken }, prisma), {
        code: change.code,
      });
      await assertNoBooking(f, lockToken);
    });
  }

  await test('a newly saved closure overrides an old hold; reopening permits the same valid hold', async () => {
    const f = await fixture();
    const { lockToken } = await hold(f);
    await prisma.operatingSchedule.update({
      where: { scheduleId: regular.scheduleId },
      data: { isClosed: true },
    });
    await assert.rejects(() => BookingService.createBooking({ ...f, lockToken }, prisma), {
      code: 'LIBRARY_CLOSED',
    });
    await assertNoBooking(f, lockToken);
    await prisma.operatingSchedule.update({
      where: { scheduleId: regular.scheduleId },
      data: { isClosed: false },
    });
    const booking = await BookingService.createBooking({ ...f, lockToken }, prisma);
    assert.equal(booking.status, 'PENDING');
    assert.equal(
      (await prisma.table.findUniqueOrThrow({ where: { tableId: f.tableId } })).lockToken,
      null
    );
  });

  await test('saved opening hours and equal-priority conflicts are enforced', async () => {
    const f = await fixture();
    await prisma.operatingSchedule.update({
      where: { scheduleId: regular.scheduleId },
      data: { openTime: '10:30' },
    });
    await assert.rejects(() => hold(f), { code: 'OUTSIDE_OPERATING_HOURS' });
    const duplicate = await prisma.operatingSchedule.create({
      data: {
        name: `Conflict ${runId}`,
        startDate: dateColumn,
        endDate: dateColumn,
      },
    });
    schedules.push(duplicate.scheduleId);
    await assert.rejects(() => hold(f), { code: 'SCHEDULE_CONFLICT', status: 503 });
  });

  await test('a Bangkok midnight crossing observes the next day holiday even in a 24h period', async () => {
    const exam = await prisma.operatingSchedule.create({
      data: {
        name: `Exam ${runId}`,
        startDate: dateColumn,
        endDate: new Date(dateColumn.getTime() + dayMs),
        is24Hours: true,
        priority: 2,
      },
    });
    const holiday = await prisma.operatingSchedule.create({
      data: {
        name: `Holiday ${runId}`,
        startDate: new Date(dateColumn.getTime() + dayMs),
        endDate: new Date(dateColumn.getTime() + dayMs),
        isClosed: true,
        priority: 3,
      },
    });
    schedules.push(exam.scheduleId, holiday.scheduleId);
    const late = new Date(`${tomorrow}T23:30:00+07:00`);
    await assert.rejects(
      () =>
        ScheduleService.validateTargetTimeWindow(
          late,
          new Date(late.getTime() + 60 * 60_000),
          true,
          prisma
        ),
      { code: 'LIBRARY_CLOSED' }
    );
    await ScheduleService.validateTargetTimeWindow(
      late,
      new Date(late.getTime() + 30 * 60_000),
      true,
      prisma
    );
  });

  await test('failure after inserting a booking rolls back the booking and preserves its hold', async () => {
    const f = await fixture();
    const { lockToken } = await hold(f);
    const broken = {
      $transaction: (fn: any) =>
        prisma.$transaction((tx) =>
          fn(
            new Proxy(tx, {
              get(target, field) {
                if (field !== 'table') return Reflect.get(target, field);
                return new Proxy(tx.table, {
                  get(delegate, method) {
                    if (method === 'updateMany')
                      return async () => {
                        throw new Error('Injected hold-release failure');
                      };
                    return Reflect.get(delegate, method);
                  },
                });
              },
            })
          )
        ),
    };
    await assert.rejects(
      () => BookingService.createBooking({ ...f, lockToken }, broken),
      /Injected hold-release failure/
    );
    await assertNoBooking(f, lockToken);
  });

  await test('saved early/late limits agree across metadata, check-in and cancellation', async () => {
    await prisma.systemConfig.update({
      where: { configId: 1 },
      data: { earlyCheckInMinutes: 20, lateThresholdMinutes: 7 },
    });
    const f = await fixture();
    const booking = await pending(f);
    const cutoff = new Date(start.getTime() - 20 * 60_000);
    const active = await getActiveBooking(f.userId, cutoff, prisma);
    assert.deepEqual(active!.checkInWindow, { earlyMinutes: 20, lateMinutes: 7 });
    assert.equal(active!.cancellation!.deadline, cutoff.toISOString());
    assert.equal(active!.cancellation!.allowed, false);
    await assert.rejects(
      () => BookingService.cancelBooking(f.userId, booking.bookingId, cutoff, prisma),
      { code: 'CANCELLATION_DEADLINE_PASSED' }
    );
    await assert.rejects(
      () =>
        BookingService.checkIn(
          f.userId,
          booking.bookingId,
          new Date(start.getTime() + 7 * 60_000 + 1),
          prisma
        ),
      { code: 'CHECK_IN_TOO_LATE' }
    );
    const result = await BookingService.checkIn(
      f.userId,
      booking.bookingId,
      new Date(start.getTime() + 7 * 60_000),
      prisma
    );
    assert.equal(result!.status, 'ACTIVE');
  });

  await test('No-show does not penalize a stale candidate after the saved grace period is extended', async () => {
    const f = await fixture();
    const now = new Date();
    const booking = await pending(f, new Date(now.getTime() - 8 * 60_000));
    const admin = await prisma.admin.create({
      data: {
        email: `rules-${runId}@example.test`,
        password: 'unused-test-only-hash',
        firstname: 'Rules',
        lastname: 'Test',
      },
    });
    admins.push(admin.adminId);
    await prisma.systemConfig.update({ where: { configId: 1 }, data: { lateThresholdMinutes: 7 } });
    assert(
      (await NoShowService.findLateBookings(now, prisma)).some(
        (b) => b.bookingId === booking.bookingId
      )
    );
    await prisma.systemConfig.update({
      where: { configId: 1 },
      data: { lateThresholdMinutes: 10 },
    });
    assert.equal(await NoShowService.processNoShowBooking(booking, prisma, now), false);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { uid: f.userId } })).behaviourScore,
      60
    );
    assert.equal(await prisma.manageScore.count({ where: { uid: f.userId } }), 0);
    await prisma.systemConfig.update({ where: { configId: 1 }, data: { lateThresholdMinutes: 7 } });
    assert.equal(
      await NoShowService.processNoShowBooking(
        booking,
        prisma,
        new Date(booking.startDateTime.getTime() + 7 * 60_000)
      ),
      false,
      'the exact late boundary still permits check-in and must not incur a penalty'
    );
    assert.equal(await NoShowService.processNoShowBooking(booking, prisma, now), true);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { uid: f.userId } })).behaviourScore,
      50
    );
    assert.equal(await prisma.manageScore.count({ where: { uid: f.userId } }), 1);
  });

  console.log(`Saved booking rules integration: ${passed} tests passed.`);
} finally {
  try {
    await prisma.manageScore.deleteMany({ where: { uid: { in: users } } });
    await prisma.booking.deleteMany({ where: { tableId: { in: tables } } });
    await prisma.table.deleteMany({ where: { tableId: { in: tables } } });
    await prisma.zone.deleteMany({ where: { zoneId: { in: zones } } });
    await prisma.user.deleteMany({ where: { uid: { in: users } } });
    await prisma.admin.deleteMany({ where: { adminId: { in: admins } } });
    await prisma.operatingSchedule.deleteMany({ where: { scheduleId: { in: schedules } } });
    if (policyTouched) {
      if (savedPolicy) {
        const { configId, ...data } = savedPolicy;
        await prisma.systemConfig.update({ where: { configId }, data });
      } else await prisma.systemConfig.delete({ where: { configId: 1 } });
    }
  } finally {
    await prisma.$disconnect();
  }
}
