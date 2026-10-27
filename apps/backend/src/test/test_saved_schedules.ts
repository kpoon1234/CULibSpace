import assert from 'node:assert/strict';
import test from 'node:test';
import { ScheduleService } from '../services/scheduleService.js';
import { createBookingLimitsHandler } from '../controllers/systemConfigController.js';
import { BookingController } from '../controllers/bookingController.js';
import { BookingService, getActiveBooking } from '../services/bookingService.js';
import { NoShowService } from '../services/noShowService.js';
import { LayoutController } from '../controllers/layoutController.js';
import { LayoutService } from '../services/layoutService.js';

const now = new Date('2026-11-01T00:00:00Z');
const policy = {
  maxBookingDurationMinutes: 120,
  maxAdvanceBookingDays: 7,
  minScoreToBook: 65,
  earlyCheckInMinutes: 10,
  lateThresholdMinutes: 7,
};
const date = (day: string) => new Date(`${day}T00:00:00Z`);
function schedule(overrides = {}) {
  return {
    scheduleId: 1,
    name: 'Regular',
    startDate: date('2026-01-01'),
    endDate: date('2026-12-31'),
    openTime: '08:00',
    closeTime: '21:00',
    is24Hours: false,
    isClosed: false,
    priority: 1,
    ...overrides,
  };
}
function fixture(rows = [schedule()], saved: unknown = policy) {
  const calls: any[] = [];
  const client: any = {
    systemConfig: { findFirst: async () => saved },
    operatingSchedule: {
      findMany: async (args: any) => {
        calls.push(args);
        return rows.filter(
          (row) =>
            row.startDate <= args.where.startDate.lte && row.endDate >= args.where.endDate.gte
        );
      },
    },
  };
  const validate = (start = '2026-11-02T10:00:00+07:00', end = '2026-11-02T11:00:00+07:00') =>
    ScheduleService.validateTargetTimeWindow(new Date(start), new Date(end), true, client, { now });
  return { client, calls, validate };
}

test('uses saved opening hours and the same saved policy in the validation result', async () => {
  const f = fixture([schedule({ openTime: '10:00', closeTime: '11:00' })]);
  const result = await f.validate();
  assert.equal(result.schedule.openTime, '10:00');
  assert.deepEqual(result.policy, policy);
  assert.deepEqual(result.config, { maxBookingDurationMinutes: 120, maxAdvanceBookingDays: 7 });
  assert.equal(f.calls[0].where.startDate.lte.toISOString(), '2026-11-02T00:00:00.000Z');
  assert.equal(f.calls[0].where.endDate.gte.toISOString(), '2026-11-02T00:00:00.000Z');
});

test('a date-specific exam overrides regular hours only on its own dates', async () => {
  const f = fixture([
    schedule(),
    schedule({
      scheduleId: 2,
      priority: 2,
      is24Hours: true,
      startDate: date('2026-11-02'),
      endDate: date('2026-11-02'),
    }),
  ]);
  assert.equal(
    (await f.validate('2026-11-02T22:00:00+07:00', '2026-11-02T23:00:00+07:00')).schedule.is24Hours,
    true
  );
  await assert.rejects(() => f.validate('2026-11-03T22:00:00+07:00', '2026-11-03T23:00:00+07:00'), {
    code: 'OUTSIDE_OPERATING_HOURS',
  });
});

test('a higher-priority holiday overrides a 24-hour exam schedule', async () => {
  const f = fixture([
    schedule({ is24Hours: true, priority: 2 }),
    schedule({ scheduleId: 3, priority: 3, isClosed: true }),
  ]);
  await assert.rejects(() => f.validate(), { code: 'LIBRARY_CLOSED', status: 400 });
});

test('checks each Bangkok date in a cross-midnight booking', async () => {
  const f = fixture([
    schedule({ is24Hours: true, priority: 2 }),
    schedule({
      scheduleId: 3,
      priority: 3,
      isClosed: true,
      startDate: date('2026-11-03'),
      endDate: date('2026-11-03'),
    }),
  ]);
  await assert.rejects(() => f.validate('2026-11-02T23:30:00+07:00', '2026-11-03T00:30:00+07:00'), {
    code: 'LIBRARY_CLOSED',
  });
  const endingAtMidnight = await f.validate(
    '2026-11-02T23:30:00+07:00',
    '2026-11-03T00:00:00+07:00'
  );
  assert.equal(endingAtMidnight.scheduleSegments!.length, 1, 'the end instant is exclusive');
});

test('a 24-hour day cannot allow the next regular day before opening time', async () => {
  const f = fixture([
    schedule(),
    schedule({
      scheduleId: 2,
      priority: 2,
      is24Hours: true,
      startDate: date('2026-11-02'),
      endDate: date('2026-11-02'),
    }),
  ]);
  await assert.rejects(() => f.validate('2026-11-02T23:30:00+07:00', '2026-11-03T00:30:00+07:00'), {
    code: 'OUTSIDE_OPERATING_HOURS',
  });
});

test('cross-midnight coverage works when both dates are open 24 hours', async () => {
  const f = fixture([schedule({ is24Hours: true })]);
  const result = await f.validate('2026-11-02T23:30:00+07:00', '2026-11-03T00:30:00+07:00');
  assert.deepEqual(
    result.scheduleSegments!.map((segment) => segment.date),
    ['2026-11-02', '2026-11-03']
  );
});

test('opening/closing boundaries allow an exact end but not crossing closing time', async () => {
  const f = fixture();
  await f.validate('2026-11-02T20:00:00+07:00', '2026-11-02T21:00:00+07:00');
  await assert.rejects(
    () => f.validate('2026-11-02T20:30:00+07:00', '2026-11-02T21:00:00.001+07:00'),
    { code: 'OUTSIDE_OPERATING_HOURS' }
  );
  await assert.rejects(() => f.validate('2026-11-02T07:59:59+07:00', '2026-11-02T09:00:00+07:00'), {
    code: 'OUTSIDE_OPERATING_HOURS',
  });
});

test('rejects conflicting equal-priority schedules instead of picking a random row', async () => {
  const f = fixture([schedule(), schedule({ scheduleId: 2, name: 'Conflicting' })]);
  await assert.rejects(() => f.validate(), { code: 'SCHEDULE_CONFLICT', status: 503 });
});

for (const invalid of [{ openTime: '25:00' }, { closeTime: '07:00' }, { priority: 0 }]) {
  test(`rejects invalid saved schedule ${JSON.stringify(invalid)}`, async () => {
    await assert.rejects(() => fixture([schedule(invalid)]).validate(), {
      code: 'SCHEDULE_CONFIGURATION_INVALID',
    });
  });
}

test('a failed schedule read never falls back to regular hours', async () => {
  const f = fixture();
  f.client.operatingSchedule.findMany = async () => {
    throw new Error('private driver error');
  };
  await assert.rejects(() => f.validate(), { code: 'BOOKING_SETTINGS_UNAVAILABLE', status: 503 });
});

test('saved duration and advance limits apply at their exact boundaries', async () => {
  const f = fixture([schedule({ is24Hours: true })], {
    ...policy,
    maxBookingDurationMinutes: 30,
    maxAdvanceBookingDays: 1,
  });
  await f.validate('2026-11-02T07:00:00+07:00', '2026-11-02T07:30:00+07:00');
  await assert.rejects(
    () => f.validate('2026-11-02T07:00:00+07:00', '2026-11-02T07:30:00.001+07:00'),
    { code: 'BOOKING_DURATION_EXCEEDED' }
  );
  await assert.rejects(
    () => f.validate('2026-11-02T07:00:00.001+07:00', '2026-11-02T07:30:00+07:00'),
    { code: 'BOOKING_TOO_FAR_IN_ADVANCE' }
  );
});

test('parsing and validation do not depend on the server timezone', async () => {
  const previous = process.env.TZ;
  try {
    for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Bangkok']) {
      process.env.TZ = tz;
      const parsed = ScheduleService.parseTargetTimeWindow(
        { date: '2026-11-02', timeSlot: '10:00-11:00' },
        now
      );
      assert.equal(parsed.targetStart.toISOString(), '2026-11-02T03:00:00.000Z');
      assert.equal(parsed.targetEnd.toISOString(), '2026-11-02T04:00:00.000Z');
      const f = fixture();
      await ScheduleService.validateTargetTimeWindow(
        parsed.targetStart,
        parsed.targetEnd,
        true,
        f.client,
        { now }
      );
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

for (const input of [
  { startDateTime: '2026-11-02T10:00:00Z' },
  { date: '2026-02-30', timeSlot: '10:00' },
  { date: '2026-11-02', timeSlot: '25:00' },
  { timeSlot: '10:00' },
  { startDateTime: '2026-11-02T10:00:00', endDateTime: '2026-11-02T11:00:00' },
  { startDateTime: '2026-11-02T24:00:00Z', endDateTime: '2026-11-03T01:00:00Z' },
]) {
  test(`rejects ambiguous/invalid time-window input ${JSON.stringify(input)}`, () => {
    assert.throws(() => ScheduleService.parseTargetTimeWindow(input), {
      status: 400,
      code: 'INVALID_TIME_WINDOW',
    });
  });
}

test('a single local timeslot adds one hour correctly across midnight', () => {
  const result = ScheduleService.parseTargetTimeWindow({ date: '2026-11-02', timeSlot: '23:30' });
  assert.equal(result.targetEnd.toISOString(), '2026-11-02T17:30:00.000Z');
});

test('local timeslot ranges retain support for spaces around the separator', () => {
  const result = ScheduleService.parseTargetTimeWindow({
    date: '2026-11-02',
    timeSlot: '10:00 - 11:00',
  });
  assert.equal(result.targetStart.toISOString(), '2026-11-02T03:00:00.000Z');
  assert.equal(result.targetEnd.toISOString(), '2026-11-02T04:00:00.000Z');
});

test('the real layout controller exposes resolved daily schedules and propagates settings failures', async () => {
  const originalValidate = ScheduleService.validateTargetTimeWindow;
  const originalLayout = LayoutService.getLayoutWithStatus;
  const f = fixture();
  let layoutQueries = 0;
  try {
    ScheduleService.validateTargetTimeWindow = (start, end, explicit) =>
      originalValidate(start, end, explicit, f.client, { now });
    LayoutService.getLayoutWithStatus = async () => {
      layoutQueries++;
      return [];
    };
    const req: any = { query: { date: '2026-11-02', timeSlot: '10:00-11:00' } };
    const res = response();
    await LayoutController.getLayout(req, res as any);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.meta.timeZone, 'Asia/Bangkok');
    assert.equal(res.body.meta.scheduleSegments[0].date, '2026-11-02');
    assert.equal(res.body.meta.schedule.openTime, '08:00');
    f.client.systemConfig.findFirst = async () => {
      throw new Error('DB unavailable');
    };
    const failure = response();
    await LayoutController.getLayout(req, failure as any);
    assert.equal(failure.statusCode, 503);
    assert.equal(failure.body.code, 'BOOKING_SETTINGS_UNAVAILABLE');
    assert.equal(
      layoutQueries,
      1,
      'failed rules must not query/render a seemingly bookable layout'
    );
  } finally {
    ScheduleService.validateTargetTimeWindow = originalValidate;
    LayoutService.getLayoutWithStatus = originalLayout;
  }
});

test('missing schedule dates preserve the existing regular-hours behavior', async () => {
  const f = fixture([]);
  assert.equal((await f.validate()).schedule.openTime, '08:00');
  await assert.rejects(() => f.validate('2026-11-02T22:00:00+07:00', '2026-11-02T23:00:00+07:00'), {
    code: 'OUTSIDE_OPERATING_HOURS',
  });
});

function pendingBooking() {
  return {
    bookingId: 1,
    uid: 1,
    tableId: 1,
    status: 'PENDING',
    startDateTime: new Date('2026-11-02T10:00:00+07:00'),
    endDateTime: new Date('2026-11-02T11:00:00+07:00'),
  };
}

test('check-in, cancellation metadata and cutoff all use the saved early/late limits', async () => {
  const booking = pendingBooking();
  const client: any = {
    systemConfig: { findFirst: async () => ({ ...policy, earlyCheckInMinutes: 20 }) },
    booking: { findUnique: async () => booking, findFirst: async () => booking },
  };
  const before = new Date('2026-11-02T09:39:59+07:00');
  await assert.rejects(() => BookingService.checkIn(1, 1, before, client), {
    code: 'CHECK_IN_TOO_EARLY',
    checkInAvailableAt: '2026-11-02T02:40:00.000Z',
  });
  await assert.rejects(
    () => BookingService.checkIn(1, 1, new Date('2026-11-02T10:07:00.001+07:00'), client),
    { code: 'CHECK_IN_TOO_LATE' }
  );
  const cutoff = new Date('2026-11-02T09:40:00+07:00');
  await assert.rejects(() => BookingService.cancelBooking(1, 1, cutoff, client), {
    code: 'CANCELLATION_DEADLINE_PASSED',
  });
  const result = await getActiveBooking(1, cutoff, client);
  assert.deepEqual(result!.checkInWindow, { earlyMinutes: 20, lateMinutes: 7 });
  assert.equal(result!.cancellation!.deadline, '2026-11-02T02:40:00.000Z');
  assert.equal(result!.cancellation!.allowed, false);
});

test('timing-policy read failures do not fall back to a different check-in/cancellation rule', async () => {
  const client: any = {
    systemConfig: {
      findFirst: async () => {
        throw new Error('private DB details');
      },
    },
    booking: { findUnique: async () => pendingBooking(), findFirst: async () => pendingBooking() },
  };
  for (const run of [
    () => BookingService.checkIn(1, 1, now, client),
    () => BookingService.cancelBooking(1, 1, now, client),
    () => getActiveBooking(1, now, client),
    () => NoShowService.findLateBookings(now, client),
  ]) {
    await assert.rejects(run, { status: 503, code: 'BOOKING_SETTINGS_UNAVAILABLE' });
  }
});

test('No-show scan uses strict late boundary and rechecks changed policy inside the transaction', async () => {
  let late = 7;
  let query: any;
  let transition: any;
  const at = new Date('2026-11-02T10:08:00+07:00');
  const client: any = {
    systemConfig: { findFirst: async () => ({ lateThresholdMinutes: late }) },
    $queryRaw: async () => [],
    $transaction: async (fn: any) => fn(client),
    booking: {
      findMany: async (args: any) => {
        query = args;
        return [pendingBooking()];
      },
      updateMany: async (args: any) => {
        transition = args;
        assert(pendingBooking().startDateTime >= args.where.startDateTime.lt);
        return { count: 0 };
      },
    },
  };
  await NoShowService.findLateBookings(at, client);
  assert.equal(query.where.startDateTime.lt.toISOString(), '2026-11-02T03:01:00.000Z');
  late = 10;
  assert.equal(await NoShowService.processNoShowBooking(pendingBooking(), client, at), false);
  assert.equal(transition.where.startDateTime.lt.toISOString(), '2026-11-02T02:58:00.000Z');
});

function response() {
  return {
    statusCode: 0,
    body: null as any,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    status(value: number) {
      this.statusCode = value;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}
test('booking-limits exposes the same saved score/time limits without cacheable defaults', async () => {
  const f = fixture();
  const res = response();
  await createBookingLimitsHandler(f.client)({} as any, res as any, () => {});
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(res.body, { success: true, data: policy });
});

test('booking-limits returns 503 rather than a successful default on DB failure', async () => {
  const f = fixture();
  f.client.systemConfig.findFirst = async () => {
    throw new Error('private driver error');
  };
  const res = response();
  await createBookingLimitsHandler(f.client)({} as any, res as any, () => {});
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.success, false);
  assert.equal(res.body.data, undefined);
});

for (const method of ['lockTable', 'create', 'validate'] as const) {
  test(`${method} rejects timezone-less strings before running booking rules`, async () => {
    const res = response();
    await BookingController[method](
      {
        user: { uid: 1 },
        body: {
          tableId: 1,
          lockToken: 'token',
          startDateTime: '2026-11-02T10:00:00',
          endDateTime: '2026-11-02T11:00:00',
        },
      } as any,
      res as any
    );
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'INVALID_TIME_WINDOW');
  });
}
