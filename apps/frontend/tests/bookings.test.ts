import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import {
  confirmBooking,
  createBooking,
  openReservationSession,
  unlockTable,
} from '../lib/bookings';

const input = {
  tableId: 301,
  startDateTime: '2026-10-23T03:00:00.000Z',
  endDateTime: '2026-10-23T04:00:00.000Z',
  lockToken: 'held-token',
};
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

beforeEach(() => {
  const values = new Map<string, string>();
  mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected fetch');
  });
  // No browser/server/DB required; tests exercise only the HTTP client contract.
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    } satisfies Storage,
    configurable: true,
  });
});
afterEach(() => {
  mock.restoreAll();
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

function reply(status: number, body: unknown) {
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(body), { status }));
}

test('create sends the captured token and preserves the backend lock error code', async () => {
  mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    assert.ok(String(url).endsWith('/api/bookings'));
    assert.deepEqual(JSON.parse(String(init?.body)), input);
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer original-user');
    assert.ok(init?.signal, 'a hung fetch must eventually resolve as an unknown outcome');
    return new Response(
      JSON.stringify({ success: false, code: 'LOCK_EXPIRED', error: 'Expired' }),
      { status: 409 }
    );
  });
  assert.deepEqual(await createBooking(input, 'original-user'), {
    ok: false,
    code: 'LOCK_EXPIRED',
    reason: 'Expired',
    uncertain: false,
  });
});

test('an explicit success response confirms booking creation', async () => {
  reply(201, { success: true, data: { bookingId: 42 } });
  assert.deepEqual(await createBooking(input, 'test-user'), { ok: true });
});

for (const status of [408, 500, 502, 504]) {
  test(`HTTP ${status} is an unknown outcome, not a safe retry/unlock`, async () => {
    reply(status, { success: false, error: 'Timeout', code: 'DATABASE_TIMEOUT' });
    const result = await createBooking(input, 'test-user');
    assert.equal(result.ok, false);
    assert.equal(result.uncertain, true);
  });
}

test('a lost response is unknown, including a browser timeout', async () => {
  mock.method(globalThis, 'fetch', async () => {
    throw new DOMException('Timed out', 'TimeoutError');
  });
  assert.equal((await createBooking(input, 'test-user')).uncertain, true);
});

test('malformed HTTP 201 response is unknown rather than successful or safely rejected', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('invalid json', { status: 201 }));
  const result = await createBooking(input, 'test-user');
  assert.equal(result.ok, false);
  assert.equal(result.uncertain, true);
});

test('reconciliation accepts only matching table/time and pending/active status', async () => {
  for (const status of ['PENDING', 'ACTIVE']) {
    reply(200, {
      success: true,
      data: { ...input, status, startDateTime: '2026-10-23T10:00:00+07:00' },
    });
    assert.equal(await confirmBooking(input, 'test-user'), true);
  }
  for (const booking of [
    null,
    { ...input, status: 'COMPLETED' },
    { ...input, status: 'CANCELLED' },
    { ...input, status: 'PENDING', tableId: 302 },
    { ...input, status: 'PENDING', endDateTime: '2026-10-23T04:30:00Z' },
  ]) {
    reply(200, { success: true, data: booking });
    assert.equal(await confirmBooking(input, 'test-user'), false);
  }
});

test('read errors and missing data never claim to have confirmed the reservation', async () => {
  for (const status of [401, 500]) {
    reply(status, { success: false });
    assert.equal(await confirmBooking(input, 'test-user'), false);
  }
  mock.method(globalThis, 'fetch', async () => {
    throw new Error('offline');
  });
  assert.equal(await confirmBooking(input, 'test-user'), false);
  await assert.doesNotReject(unlockTable({ tableId: 301, lockToken: 'old' }, 'test-user'));
});

test('a queued old session never uses credentials from a newer login', async () => {
  const authorizations: string[] = [];
  mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit) => {
    authorizations.push((init?.headers as Record<string, string>).Authorization);
    return new Response(JSON.stringify({ success: true, data: { lockToken: 'token' } }), {
      status: 200,
    });
  });
  localStorage.setItem('culibspace_token', 'old-login');
  const old = openReservationSession(301, () => undefined);
  localStorage.setItem('culibspace_token', 'new-login');
  const next = openReservationSession(302, () => undefined);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(authorizations, ['Bearer old-login', 'Bearer new-login']);
  old.dispose();
  next.dispose();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(authorizations.slice(2), ['Bearer old-login', 'Bearer new-login']);
});
