import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { JsxEmit, ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import type { TicketPurchaseData, TicketPurchaseResult } from '../lib/tickets';

// Execute the page's actual polling effect with mocked hooks and timers. This
// tests its async orchestration, not browser rendering, without adding a DOM
// test framework, network calls, or Playwright.
const source = readFileSync(new URL('../app/tickets/success/page.tsx', import.meta.url), 'utf8');
const compiled = transpileModule(source, {
  compilerOptions: {
    module: ModuleKind.CommonJS,
    target: ScriptTarget.ES2022,
    jsx: JsxEmit.ReactJSX,
  },
}).outputText;
const NOW = Date.parse('2026-11-04T05:00:00.000Z');
const PURCHASE_KEY = 'same-purchase-key';
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function purchase(overrides: Partial<TicketPurchaseData> = {}): TicketPurchaseResult {
  return {
    ok: true,
    data: {
      ticketId: 1,
      paymentId: 1,
      checkoutUrl: null,
      amountSatang: 5000,
      currency: 'THB',
      paymentStatus: 'PAID',
      ticketStatus: 'PAID',
      expiresAt: new Date(NOW + 1_800_000).toISOString(),
      ticketStartDateTime: new Date(NOW - 1000).toISOString(),
      ticketEndDateTime: new Date(NOW + 3_600_000).toISOString(),
      replayed: true,
      ...overrides,
    },
  };
}

interface Element {
  type: unknown;
  props: { href?: string; children?: unknown };
}

function links(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(links);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as Element;
  return [...(element.type === 'Link' ? [element] : []), ...links(element.props.children)];
}

function fixture(reply: (call: number) => Promise<TicketPurchaseResult>) {
  let time = NOW;
  let nextTimer = 0;
  let status = 'checking';
  let recordingEffects = true;
  const effects: Array<() => (() => void) | undefined> = [];
  const timers = new Map<number, { due: number; callback: () => void }>();
  const keys: string[] = [];
  const writes: string[] = [];
  const schedule = (callback: () => void, delay: number) => {
    timers.set(++nextTimer, { due: time + delay, callback });
    return nextTimer;
  };
  class ClockDate extends Date {
    static now() {
      return time;
    }
  }
  const jsx = (type: unknown, props: Element['props']) => ({ type, props });
  const pageModule = { exports: {} as { default: () => unknown } };
  runInNewContext(compiled, {
    exports: pageModule.exports,
    Date: ClockDate,
    setTimeout: schedule,
    clearTimeout: (id: number) => timers.delete(id),
    sessionStorage: { getItem: () => PURCHASE_KEY },
    require: (id: string) => {
      switch (id) {
        case 'react':
          return {
            useState: () => [
              status,
              (next: string) => {
                status = next;
                writes.push(next);
              },
            ],
            useEffect: (effect: () => (() => void) | undefined) => {
              if (recordingEffects) effects.push(effect);
            },
          };
        case 'react/jsx-runtime':
          return { jsx, jsxs: jsx };
        case 'next/link':
          return { default: 'Link' };
        case 'next/navigation':
          return { useRouter: () => ({ replace() {} }) };
        case '@/lib/auth':
          return {
            getAuthToken: () => 'visitor-token',
            getStoredUser: () => ({ uid: 1, role: 'OUTSIDER' }),
          };
        case '@/lib/tickets':
          return {
            isValidIdempotencyKey: (key: string) => key === PURCHASE_KEY,
            reconcileVisitorTicket: (key: string) => {
              keys.push(key);
              return reply(keys.length);
            },
          };
        default:
          throw new Error(`Unexpected page import: ${id}`);
      }
    },
  });
  pageModule.exports.default();
  recordingEffects = false;
  // Only the polling effect is under test; redirect rendering is not emulated.
  const mount = () => effects[0]()!;
  const dispose = mount();
  return {
    keys,
    writes,
    dispose,
    mount,
    get status() {
      return status;
    },
    get timerCount() {
      return timers.size;
    },
    render: () => pageModule.exports.default(),
    async advance(ms: number) {
      await flush();
      const end = time + ms;
      while (true) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.due <= end)
          .sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        time = next[1].due;
        timers.delete(next[0]);
        next[1].callback();
        await flush();
      }
      time = end;
      await flush();
    },
  };
}

test('a slow paid response is accepted without starting overlapping requests', async () => {
  const response = deferred<TicketPurchaseResult>();
  const f = fixture(() => response.promise);
  await f.advance(5000);
  assert.deepEqual(f.keys, [PURCHASE_KEY]);
  response.resolve(purchase());
  await flush();
  assert.equal(f.status, 'paid-active');
  await f.advance(60_000);
  assert.equal(f.keys.length, 1);
  assert.equal(f.status, 'paid-active');
  assert.equal(f.timerCount, 0);
});

test('pending is polled after the response settles, using the same key, until paid', async () => {
  const first = deferred<TicketPurchaseResult>();
  const f = fixture((call) => (call === 1 ? first.promise : Promise.resolve(purchase())));
  await f.advance(5000);
  assert.equal(f.keys.length, 1);
  first.resolve(purchase({ paymentStatus: 'PENDING', ticketStatus: 'UNPAID' }));
  await f.advance(2999);
  assert.equal(f.status, 'pending');
  assert.equal(f.keys.length, 1);
  await f.advance(1);
  assert.deepEqual(f.keys, [PURCHASE_KEY, PURCHASE_KEY]);
  assert.equal(f.status, 'paid-active');
  assert.equal(f.timerCount, 0);
});

const finalCases: Array<[string, Partial<TicketPurchaseData>]> = [
  [
    'paid-expired',
    {
      ticketStartDateTime: new Date(NOW - 7_200_000).toISOString(),
      ticketEndDateTime: new Date(NOW - 3_600_000).toISOString(),
    },
  ],
  ['paid-not-yet', { ticketStartDateTime: new Date(NOW + 1_800_000).toISOString() }],
  ['unavailable', { ticketEndDateTime: 'invalid' }],
  ['failed', { paymentStatus: 'FAILED', ticketStatus: 'UNPAID' }],
  ['failed', { paymentStatus: 'EXPIRED', ticketStatus: 'UNPAID' }],
  ['refunded', { paymentStatus: 'REFUNDED' }],
];
for (const [expected, data] of finalCases) {
  test(`final ${expected} (${data.paymentStatus ?? 'PAID'}) stops polling and is never overwritten by timeout`, async () => {
    const f = fixture(async () => purchase(data));
    await f.advance(60_000);
    assert.equal(f.status, expected);
    assert.equal(f.keys.length, 1);
    assert.equal(f.timerCount, 0);
  });
}

test('still-pending payment times out at 60 seconds and stops scheduling requests', async () => {
  const f = fixture(async () => purchase({ paymentStatus: 'PENDING', ticketStatus: 'UNPAID' }));
  await f.advance(59_999);
  assert.equal(f.status, 'pending');
  await f.advance(1);
  assert.equal(f.status, 'timeout');
  const calls = f.keys.length;
  await f.advance(60_000);
  assert.equal(f.keys.length, calls);
  assert.equal(f.timerCount, 0);
});

test('a response arriving after the deadline cannot overwrite timeout', async () => {
  const response = deferred<TicketPurchaseResult>();
  const f = fixture(() => response.promise);
  await f.advance(60_000);
  assert.equal(f.status, 'timeout');
  response.resolve(purchase());
  await flush();
  assert.equal(f.status, 'timeout');
  assert.equal(f.keys.length, 1);
  assert.equal(f.timerCount, 0);
});

test('unmount ignores an in-flight response and clears every timer', async () => {
  const response = deferred<TicketPurchaseResult>();
  const f = fixture(() => response.promise);
  f.dispose();
  response.resolve(purchase());
  await f.advance(60_000);
  assert.deepEqual(f.writes, []);
  assert.equal(f.keys.length, 1);
  assert.equal(f.timerCount, 0);
});

test('unmount after a pending response cancels the next poll', async () => {
  const f = fixture(async () => purchase({ paymentStatus: 'PENDING', ticketStatus: 'UNPAID' }));
  await flush();
  f.dispose();
  await f.advance(60_000);
  assert.equal(f.status, 'pending');
  assert.equal(f.keys.length, 1);
  assert.equal(f.timerCount, 0);
});

test('Strict Mode cleanup/setup ignores the old mount response', async () => {
  const old = deferred<TicketPurchaseResult>();
  const current = deferred<TicketPurchaseResult>();
  const f = fixture((call) => (call === 1 ? old.promise : current.promise));
  f.dispose();
  const disposeCurrent = f.mount();
  old.resolve(purchase({ paymentStatus: 'FAILED' }));
  await flush();
  assert.deepEqual(f.writes, []);
  current.resolve(purchase());
  await flush();
  assert.equal(f.status, 'paid-active');
  assert.deepEqual(f.keys, [PURCHASE_KEY, PURCHASE_KEY]);
  disposeCurrent();
  assert.equal(f.timerCount, 0);
});

test('the My Tickets action opens ticket history, not the purchase page', async () => {
  const f = fixture(async () => purchase({ paymentStatus: 'PENDING', ticketStatus: 'UNPAID' }));
  await flush();
  const action = links(f.render()).find((link) => link.props.children === 'ดูตั๋วของฉัน');
  assert.equal(action?.props.href, '/visitor/tickets');
  f.dispose();
});
