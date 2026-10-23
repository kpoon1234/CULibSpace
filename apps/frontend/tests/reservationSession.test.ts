import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createReservationCoordinator,
  type ReservationState,
  type ReservationTransport,
} from '../lib/reservationSession';
import type { CreateBookingInput, CreateBookingResult, LockTableResult } from '../lib/bookings';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const window = {
  startDateTime: '2026-10-23T03:00:00.000Z',
  endDateTime: '2026-10-23T04:00:00.000Z',
};

function fixture(overrides: Partial<ReservationTransport> = {}) {
  let time = 0;
  let nextToken = 0;
  const released: Array<[number, string]> = [];
  const requests: CreateBookingInput[] = [];
  const acquired: number[] = [];
  const states: ReservationState[] = [];
  const api: ReservationTransport = {
    lock: async (id) => {
      acquired.push(id);
      return {
        ok: true,
        lockToken: `token-${++nextToken}`,
        lockedUntil: new Date(time + 300_000).toISOString(),
      };
    },
    unlock: async (id, token) => {
      released.push([id, token]);
    },
    create: async (input) => {
      requests.push(input);
      return { ok: true };
    },
    confirm: async () => false,
    ...overrides,
  };
  const coordinator = createReservationCoordinator(api, () => time);
  return {
    coordinator,
    api,
    states,
    acquired,
    released,
    requests,
    advance: (ms: number) => {
      time += ms;
    },
    open: (id = 301) => coordinator.open(id, (state) => states.push(state)),
  };
}

test('cleanup during a slow booking never unlocks; success consumes the captured token', async () => {
  const reply = deferred<CreateBookingResult>();
  const f = fixture({ create: () => reply.promise });
  const session = f.open();
  await tick();
  const booking = session.submit(window);
  assert.equal(session.submitting, true, 'close/double-submit guard must be synchronous');
  await tick();
  session.dispose();
  session.dispose();
  const notifications = f.states.length;
  await tick();
  assert.deepEqual(f.released, []);
  reply.resolve({ ok: true });
  await booking;
  assert.equal(session.state.phase, 'success');
  assert.equal(f.states.length, notifications, 'unmounted modal must not receive the response');
  assert.deepEqual(f.released, []);
});

test('success followed by cleanup never releases an already-consumed hold', async () => {
  const f = fixture();
  const session = f.open();
  await tick();
  await session.submit(window);
  session.dispose();
  await tick();
  assert.equal(session.state.phase, 'success');
  assert.deepEqual(f.released, []);
});

test('definitive rejection after unmount releases exactly once, after the response', async () => {
  const reply = deferred<CreateBookingResult>();
  const f = fixture({ create: () => reply.promise });
  const session = f.open();
  await tick();
  const booking = session.submit(window);
  await tick();
  session.dispose();
  await tick();
  assert.deepEqual(f.released, []);
  reply.resolve({ ok: false, code: 'INVALID_TIME_WINDOW', reason: 'Invalid time' });
  await booking;
  session.dispose();
  await tick();
  assert.deepEqual(f.released, [[301, 'token-1']]);
});

test('idle Cancel releases the hold and permits switching to another table', async () => {
  const f = fixture();
  const a = f.open();
  await tick();
  a.dispose();
  const b = f.open(302);
  await tick();
  assert.deepEqual(f.released, [[301, 'token-1']]);
  assert.equal(b.state.phase, 'ready');
  assert.deepEqual(f.acquired, [301, 302]);
});

test('Cancel while acquisition is pending releases its eventual token before acquiring B', async () => {
  const reply = deferred<LockTableResult>();
  const events: string[] = [];
  const f = fixture({
    lock: async (id) => {
      events.push(`lock:${id}`);
      return id === 301 ? reply.promise : { ok: true, lockToken: 'B' };
    },
    unlock: async (id, token) => {
      events.push(`unlock:${id}:${token}`);
    },
  });
  const a = f.open();
  await tick();
  a.dispose();
  const count = f.states.length;
  const b = f.coordinator.open(302, () => undefined);
  await tick();
  assert.deepEqual(events, ['lock:301']);
  reply.resolve({ ok: true, lockToken: 'A' });
  await tick();
  assert.deepEqual(events, ['lock:301', 'unlock:301:A', 'lock:302']);
  assert.equal(f.states.length, count, 'stale acquisition must not notify the old modal');
  assert.equal(b.state.phase, 'ready');
});

test('Strict Mode setup/cleanup/setup does not send competing acquisitions', async () => {
  const f = fixture();
  f.open().dispose();
  const live = f.open();
  await tick();
  assert.deepEqual(f.acquired, [301]);
  await live.submit(window);
  assert.equal(f.requests[0]?.lockToken, 'token-1');
});

test('a second modal cannot rotate tokens or release another-table hold during booking', async () => {
  const reply = deferred<CreateBookingResult>();
  const f = fixture({ create: () => reply.promise });
  const a = f.open();
  await tick();
  const booking = a.submit(window);
  a.dispose();
  const b = f.open(302);
  await tick();
  assert.deepEqual(f.acquired, [301], 'B acquisition must wait for A booking to settle');
  reply.resolve({ ok: true });
  await booking;
  await tick();
  assert.deepEqual(f.acquired, [301, 302]);
  assert.equal(b.state.phase, 'ready');
  assert.deepEqual(f.released, []);
});

test('double-submit starts only one booking request', async () => {
  const reply = deferred<CreateBookingResult>();
  let calls = 0;
  const f = fixture({
    create: () => {
      calls++;
      return reply.promise;
    },
  });
  const session = f.open();
  await tick();
  const first = session.submit(window);
  await session.submit(window);
  await tick();
  assert.equal(calls, 1);
  reply.resolve({ ok: true });
  await first;
});

for (const code of ['LOCK_EXPIRED', 'INVALID_LOCK', 'TABLE_LOCKED', 'UNAUTHORIZED_LOCK_OWNER']) {
  test(`${code} clears the stale token and retry acquires a new one`, async () => {
    const f = fixture();
    const original = f.api.create;
    f.api.create = async () => ({ ok: false, code });
    const session = f.open();
    await tick();
    await session.submit(window);
    assert.equal(session.state.phase, 'failed');
    f.api.create = original;
    await session.retry();
    await session.submit(window);
    assert.deepEqual(f.acquired, [301, 301]);
    assert.equal(f.requests[0]?.lockToken, 'token-2');
    assert.deepEqual(f.released, [], 'do not release a stale token after acquiring a new one');
  });
}

test('locally expired hold is not submitted and retry renews it', async () => {
  const f = fixture();
  const session = f.open();
  await tick();
  f.advance(300_001);
  await session.submit(window);
  assert.equal(session.state.phase, 'failed');
  assert.equal(f.requests.length, 0);
  await session.retry();
  await session.submit(window);
  assert.equal(f.requests[0]?.lockToken, 'token-2');
});

test('a known business rejection retains a valid hold for editing/retry', async () => {
  const f = fixture({ create: async () => ({ ok: false, code: 'INVALID_TIME_WINDOW' }) });
  const session = f.open();
  await tick();
  await session.submit(window);
  await session.retry();
  assert.equal(session.state.phase, 'ready');
  assert.deepEqual(f.acquired, [301]);
  session.dispose();
  await tick();
  assert.deepEqual(f.released, [[301, 'token-1']]);
});

test('unknown outcome can be confirmed by a read without releasing or resubmitting', async () => {
  let checks = 0;
  const f = fixture({
    create: async () => {
      throw new Error('response lost after commit');
    },
    confirm: async () => {
      checks++;
      return true;
    },
  });
  const session = f.open();
  await tick();
  await session.submit(window);
  assert.equal(session.state.phase, 'success');
  assert.equal(checks, 1);
  session.dispose();
  await tick();
  assert.deepEqual(f.released, []);
});

test('a lost response after unmount leaves the hold to TTL when the read also fails', async () => {
  const reply = deferred<CreateBookingResult>();
  const f = fixture({
    create: () => reply.promise,
    confirm: async () => {
      throw new Error('read also offline');
    },
  });
  const session = f.open();
  await tick();
  const booking = session.submit(window);
  await tick();
  session.dispose();
  const count = f.states.length;
  reply.reject(new Error('response lost'));
  await booking;
  assert.equal(session.state.phase, 'uncertain');
  assert.equal(f.states.length, count);
  assert.deepEqual(f.released, []);
});

test('an inconclusive read is not rollback: no unlock/retry POST, including after reopening', async () => {
  let creates = 0;
  let checks = 0;
  const f = fixture({
    create: async () => {
      creates++;
      return { ok: false, uncertain: true };
    },
    confirm: async () => {
      checks++;
      return false;
    },
  });
  const session = f.open();
  await tick();
  await session.submit(window);
  assert.equal(session.state.phase, 'uncertain');
  await session.submit(window);
  await session.retry();
  assert.equal(session.state.phase, 'uncertain');
  session.dispose();
  const next = f.open(302);
  await tick();
  assert.equal(next.state.phase, 'failed');
  assert.deepEqual(f.acquired, [301]);
  assert.deepEqual(f.released, []);
  assert.equal(creates, 1);
  assert.equal(checks, 3);
  f.advance(300_001);
  await next.retry();
  assert.equal(next.state.phase, 'ready', 'server hold TTL permits recovery');
});

test('late confirmation after unmount cannot update a new modal', async () => {
  const confirm = deferred<boolean>();
  const f = fixture({
    create: async () => ({ ok: false, uncertain: true }),
    confirm: () => confirm.promise,
  });
  const a = f.open();
  await tick();
  const booking = a.submit(window);
  await tick();
  a.dispose();
  const count = f.states.length;
  const bStates: ReservationState[] = [];
  const b = f.coordinator.open(302, (state) => bStates.push(state));
  confirm.resolve(true);
  await booking;
  await tick();
  assert.equal(f.states.length, count);
  assert.equal(b.state.phase, 'ready');
  assert.ok(!bStates.some((s) => s.phase === 'success'));
  assert.deepEqual(f.released, []);
});

test('status-check retry confirms a delayed commit without another POST or duplicate read', async () => {
  const read = deferred<boolean>();
  let checks = 0;
  let creates = 0;
  const f = fixture({
    create: async () => {
      creates++;
      return { ok: false, uncertain: true };
    },
    confirm: async () => (++checks === 1 ? false : read.promise),
  });
  const session = f.open();
  await tick();
  await session.submit(window);
  assert.equal(session.state.phase, 'uncertain');
  const check = session.retry();
  await session.retry();
  await tick();
  assert.equal(session.state.phase, 'checking');
  assert.equal(checks, 2);
  read.resolve(true);
  await check;
  assert.equal(session.succeeded, true);
  assert.equal(creates, 1);
  session.dispose();
  await tick();
  assert.deepEqual(f.released, []);
});

test('lock network failure is displayed and can be retried', async () => {
  const f = fixture({
    lock: async () => {
      throw new Error('offline');
    },
  });
  const session = f.open();
  await tick();
  assert.equal(session.state.phase, 'failed');
  f.api.lock = async () => ({ ok: true, lockToken: 'retry' });
  await session.retry();
  assert.equal(session.state.phase, 'ready');
});
