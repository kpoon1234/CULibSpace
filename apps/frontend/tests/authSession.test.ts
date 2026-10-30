import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { verifyStoredSession } from '../lib/auth';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let values: Map<string, string>;

/** An unsigned JWT-shaped token; only the client-side `exp` read matters here. */
function token(exp: number | undefined) {
  const payload = Buffer.from(JSON.stringify({ uid: 5, role: 'OUTSIDER', exp })).toString(
    'base64url'
  );
  return `header.${payload}.signature`;
}

const inOneHour = () => Math.floor(Date.now() / 1000) + 3600;

beforeEach(() => {
  values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
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

test('no stored token is invalid without asking the server', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({}));
  assert.equal(await verifyStoredSession(), 'invalid');
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('an expired token is invalid without asking the server', async () => {
  values.set('culibspace_token', token(Math.floor(Date.now() / 1000) - 60));
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({}));

  assert.equal(await verifyStoredSession(), 'invalid');
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('a malformed token or one without exp is invalid', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({}));

  values.set('culibspace_token', 'not-a-jwt');
  assert.equal(await verifyStoredSession(), 'invalid');
  values.set('culibspace_token', token(undefined));
  assert.equal(await verifyStoredSession(), 'invalid');
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('an unexpired token the server accepts is valid', async () => {
  values.set('culibspace_token', token(inOneHour()));
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    Response.json({ success: true, user: {} })
  );

  assert.equal(await verifyStoredSession(), 'valid');
  const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
  assert.match(url, /\/api\/auth\/me$/);
  assert.match((init.headers as Record<string, string>).Authorization, /^Bearer header\./);
});

test('a token the server rejects is invalid even before its exp', async () => {
  values.set('culibspace_token', token(inOneHour()));
  for (const status of [401, 403, 404]) {
    mock.method(globalThis, 'fetch', async () => Response.json({ success: false }, { status }));
    assert.equal(await verifyStoredSession(), 'invalid', `HTTP ${status}`);
    mock.restoreAll();
  }
});

test('an unreachable or failing server leaves the session alone', async () => {
  values.set('culibspace_token', token(inOneHour()));

  mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 503 }));
  assert.equal(await verifyStoredSession(), 'unknown');
  mock.restoreAll();

  mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('fetch failed');
  });
  assert.equal(await verifyStoredSession(), 'unknown');
});
