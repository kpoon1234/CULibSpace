import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import {
  createSchedule,
  dateRangeLabel,
  deleteSchedule,
  draftFromSchedule,
  emptyScheduleDraft,
  payloadFromDraft,
  updateSchedule,
  validateScheduleDraft,
  fetchActiveSchedule,
  groupSchedules,
  hoursLabel,
  listAllSchedules,
  priorityLabel,
  schedulePhase,
  todayKeyBangkok,
  type OperatingSchedule,
} from '../lib/adminSettings';
import { AUTH_TOKEN_KEY } from '../lib/auth';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (key: string) => (key === AUTH_TOKEN_KEY ? 'admin-token' : null) },
});
after(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

function schedule(overrides: Partial<OperatingSchedule>): OperatingSchedule {
  return {
    scheduleId: 1,
    name: 'Regular hours',
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-12-31T00:00:00.000Z',
    openTime: '08:00',
    closeTime: '21:00',
    is24Hours: false,
    isClosed: false,
    priority: 1,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('today is taken from Asia/Bangkok, not UTC', () => {
  // 18:30 UTC on 3 Nov is already 01:30 on 4 Nov in Bangkok.
  assert.equal(todayKeyBangkok(new Date('2026-11-03T18:30:00.000Z')), '2026-11-04');
});

test('phase compares inclusive calendar dates', () => {
  const s = schedule({
    startDate: '2026-11-03T00:00:00.000Z',
    endDate: '2026-11-05T00:00:00.000Z',
  });
  assert.equal(schedulePhase(s, '2026-11-02'), 'upcoming');
  assert.equal(schedulePhase(s, '2026-11-03'), 'current');
  assert.equal(schedulePhase(s, '2026-11-05'), 'current');
  assert.equal(schedulePhase(s, '2026-11-06'), 'past');
});

test('labels cover closed, 24-hour, timed hours and priorities', () => {
  assert.equal(hoursLabel(schedule({ isClosed: true })), 'Closed');
  assert.equal(hoursLabel(schedule({ is24Hours: true })), 'Open 24 hours');
  assert.equal(hoursLabel(schedule({ openTime: '09:30', closeTime: '18:00' })), '09:30–18:00');
  assert.equal(priorityLabel(1), 'Regular');
  assert.equal(priorityLabel(2), 'Exam period');
  assert.equal(priorityLabel(3), 'Holiday / closure');
  assert.equal(priorityLabel(5), 'Priority 5');
  assert.equal(
    dateRangeLabel(
      schedule({ startDate: '2026-12-05T00:00:00.000Z', endDate: '2026-12-05T00:00:00.000Z' })
    ),
    '5 Dec 2026'
  );
});

test('groups regular vs exceptions, ordered current → upcoming → past', () => {
  const today = '2026-11-03';
  const rows = [
    schedule({ scheduleId: 1, priority: 1 }),
    schedule({
      scheduleId: 2,
      priority: 3,
      startDate: '2026-10-01T00:00:00.000Z',
      endDate: '2026-10-01T00:00:00.000Z',
    }),
    schedule({
      scheduleId: 3,
      priority: 2,
      startDate: '2026-12-10T00:00:00.000Z',
      endDate: '2026-12-20T00:00:00.000Z',
    }),
    schedule({
      scheduleId: 4,
      priority: 3,
      startDate: '2026-11-03T00:00:00.000Z',
      endDate: '2026-11-03T00:00:00.000Z',
    }),
    schedule({
      scheduleId: 5,
      priority: 2,
      startDate: '2026-11-20T00:00:00.000Z',
      endDate: '2026-11-25T00:00:00.000Z',
    }),
    schedule({
      scheduleId: 6,
      priority: 3,
      startDate: '2026-10-20T00:00:00.000Z',
      endDate: '2026-10-20T00:00:00.000Z',
    }),
  ];

  const { regular, exceptions } = groupSchedules(rows, today);
  assert.deepEqual(
    regular.map((s) => s.scheduleId),
    [1]
  );
  assert.deepEqual(
    exceptions.map((s) => s.scheduleId),
    [4, 5, 3, 6, 2]
  );
});

test('listAllSchedules sends the admin token and reads every page', async () => {
  const urls: string[] = [];
  const auth: (string | null)[] = [];
  const all = Array.from({ length: 150 }, (_, i) => schedule({ scheduleId: i + 1 }));

  mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => {
    urls.push(input);
    auth.push(new Headers(init?.headers).get('Authorization'));
    const page = Number(new URL(input).searchParams.get('page'));
    return jsonResponse({
      success: true,
      data: all.slice((page - 1) * 100, page * 100),
      total: all.length,
    });
  });

  try {
    const result = await listAllSchedules();
    assert.equal(result.length, 150);
    assert.equal(urls.length, 2);
    assert.ok(urls.every((u) => u.includes('/api/admin/schedules?')));
    assert.ok(urls.every((u) => u.includes('pageSize=100')));
    assert.deepEqual(auth, ['Bearer admin-token', 'Bearer admin-token']);
  } finally {
    mock.restoreAll();
  }
});

test('fetchActiveSchedule maps null data to "no schedule" and surfaces 409 errors', async () => {
  mock.method(globalThis, 'fetch', async () => jsonResponse({ success: true, data: null }));
  try {
    assert.equal(await fetchActiveSchedule(), null);
  } finally {
    mock.restoreAll();
  }

  mock.method(globalThis, 'fetch', async () =>
    jsonResponse(
      {
        success: false,
        code: 'SCHEDULE_CONFLICT',
        error: 'Multiple schedules have the same effective priority (2) on 2026-11-03',
      },
      409
    )
  );
  try {
    await assert.rejects(fetchActiveSchedule(), /same effective priority/);
  } finally {
    mock.restoreAll();
  }
});

test('an expired admin session is reported, not shown as an empty list', async () => {
  mock.method(globalThis, 'fetch', async () => jsonResponse({ success: false }, 401));
  try {
    await assert.rejects(listAllSchedules(), /session has expired/);
  } finally {
    mock.restoreAll();
  }
});

test('draft validation mirrors the backend date/time rules', () => {
  const ok = emptyScheduleDraft(1, '2026-11-03');
  assert.deepEqual(validateScheduleDraft({ ...ok, name: 'Regular' }), {});

  const errors = validateScheduleDraft({
    ...ok,
    name: '  ',
    startDate: '2026-11-10',
    endDate: '2026-11-09',
    openTime: '21:00',
    closeTime: '08:00',
  });
  assert.ok(errors.name);
  assert.ok(errors.endDate);
  assert.ok(errors.closeTime);

  // Closed and 24-hour days ignore the opening window, as on the backend.
  assert.deepEqual(
    validateScheduleDraft({
      ...ok,
      name: 'Holiday',
      hoursMode: 'closed',
      openTime: '21:00',
      closeTime: '08:00',
    }),
    {}
  );
  assert.ok(validateScheduleDraft({ ...ok, name: 'x'.repeat(101) }).name);
});

test('payload sends the flags and the placeholder times the backend stores', () => {
  const base = { ...emptyScheduleDraft(2, '2026-12-01'), name: ' Finals ' };
  assert.deepEqual(payloadFromDraft({ ...base, hoursMode: '24h' }), {
    name: 'Finals',
    priority: 2,
    startDate: '2026-12-01',
    endDate: '2026-12-01',
    openTime: '00:00',
    closeTime: '23:59',
    is24Hours: true,
    isClosed: false,
  });
  const closed = payloadFromDraft({ ...base, hoursMode: 'closed' });
  assert.equal(closed.isClosed, true);
  assert.equal(closed.is24Hours, false);

  const roundTrip = draftFromSchedule(
    schedule({ is24Hours: true, openTime: '00:00', closeTime: '23:59' })
  );
  assert.equal(roundTrip.hoursMode, '24h');
  assert.equal(roundTrip.startDate, '2026-01-01');
  assert.equal(roundTrip.openTime, '08:00');
});

test('create / update / delete hit the schedule endpoints with the right methods', async () => {
  const calls: { url: string; method?: string; body?: unknown }[] = [];
  mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => {
    calls.push({
      url: input,
      method: init?.method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return jsonResponse({ success: true, data: schedule({ scheduleId: 7 }) });
  });

  try {
    const payload = payloadFromDraft({ ...emptyScheduleDraft(1, '2026-11-03'), name: 'Regular' });
    await createSchedule(payload);
    await updateSchedule(7, payload);
    await deleteSchedule(7);
    assert.deepEqual(
      calls.map((c) => [c.method, new URL(c.url).pathname]),
      [
        ['POST', '/api/admin/schedules'],
        ['PATCH', '/api/admin/schedules/7'],
        ['DELETE', '/api/admin/schedules/7'],
      ]
    );
    assert.deepEqual(calls[0]!.body, payload);
  } finally {
    mock.restoreAll();
  }
});

test('an overlap rejection keeps the backend code and message', async () => {
  mock.method(globalThis, 'fetch', async () =>
    jsonResponse(
      {
        success: false,
        code: 'SCHEDULE_CONFLICT',
        error: 'Conflicting schedule: "Finals" already exists with the same priority (2)',
      },
      409
    )
  );
  try {
    await assert.rejects(
      createSchedule(payloadFromDraft({ ...emptyScheduleDraft(2, '2026-12-01'), name: 'Exams' })),
      (err: { code?: string; message: string }) =>
        err.code === 'SCHEDULE_CONFLICT' && err.message.includes('Conflicting schedule')
    );
  } finally {
    mock.restoreAll();
  }
});
