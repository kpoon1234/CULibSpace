import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import {
  describePurchaseError,
  formatTicketAmount,
  isSafeCheckoutUrl,
  isValidIdempotencyKey,
  parseTicketPurchaseData,
  purchaseVisitorTicket,
} from '../lib/tickets';

const validData = {
  ticketId: 7,
  paymentId: 12,
  checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
  amountSatang: 5000,
  currency: 'THB',
  paymentStatus: 'PENDING',
  ticketStatus: 'UNPAID',
  expiresAt: '2026-10-29T05:00:00.000Z',
  ticketStartDateTime: '2026-10-29T04:00:00.000Z',
  ticketEndDateTime: '2026-10-29T12:00:00.000Z',
  replayed: false,
};
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

beforeEach(() => {
  const values = new Map<string, string>([['culibspace_token', 'visitor-token']]);
  mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected fetch');
  });
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

test('idempotency keys follow the backend pattern', () => {
  assert.ok(isValidIdempotencyKey(crypto.randomUUID()));
  assert.ok(isValidIdempotencyKey('a.b_c:d-1'));
  assert.ok(!isValidIdempotencyKey(''));
  assert.ok(!isValidIdempotencyKey('has space'));
  assert.ok(!isValidIdempotencyKey('x'.repeat(65)));
  assert.ok(!isValidIdempotencyKey(null));
});

test('an invalid key is rejected locally without calling the backend', async () => {
  const result = await purchaseVisitorTicket('bad key!');
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.code, 'INVALID_IDEMPOTENCY_KEY');
});

test('only https checkout URLs are accepted', () => {
  assert.ok(isSafeCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_123'));
  assert.ok(!isSafeCheckoutUrl('http://checkout.stripe.com/x'));
  assert.ok(!isSafeCheckoutUrl('javascript:alert(1)'));
  assert.ok(!isSafeCheckoutUrl('not a url'));
  assert.ok(!isSafeCheckoutUrl(undefined));
});

test('a valid purchase response is parsed and statuses are normalized', () => {
  const parsed = parseTicketPurchaseData({ ...validData, paymentStatus: 'pending' });
  assert.equal(parsed?.paymentStatus, 'PENDING');
  assert.equal(parsed?.checkoutUrl, validData.checkoutUrl);
});

test('a paid response without a checkout URL is still valid', () => {
  const parsed = parseTicketPurchaseData({
    ...validData,
    checkoutUrl: null,
    paymentStatus: 'PAID',
    ticketStatus: 'PAID',
  });
  assert.equal(parsed?.checkoutUrl, null);
});

for (const [name, patch] of [
  ['negative amount', { amountSatang: -1 }],
  ['fractional amount', { amountSatang: 50.5 }],
  ['bad currency', { currency: 'BAHT' }],
  ['unknown payment status', { paymentStatus: 'SOMETHING' }],
  ['unknown ticket status', { ticketStatus: 'ACTIVE' }],
  ['non-string checkout URL', { checkoutUrl: 42 }],
  ['missing ticket id', { ticketId: undefined }],
  ['missing validity date', { ticketEndDateTime: null }],
] as const) {
  test(`a response with ${name} is rejected`, () => {
    assert.equal(parseTicketPurchaseData({ ...validData, ...patch }), null);
  });
}

test('a zero amount from a replayed payment is accepted', () => {
  assert.equal(parseTicketPurchaseData({ ...validData, amountSatang: 0 })?.amountSatang, 0);
});

test('a non-https checkout URL does not reject a paid response', () => {
  const parsed = parseTicketPurchaseData({
    ...validData,
    checkoutUrl: 'http://localhost:4242/pay',
    paymentStatus: 'PAID',
    ticketStatus: 'PAID',
  });
  assert.equal(parsed?.paymentStatus, 'PAID');
  // The page still refuses to open it, because isSafeCheckoutUrl runs before navigating.
  assert.ok(!isSafeCheckoutUrl(parsed?.checkoutUrl));
});

test('a malformed success body becomes INVALID_RESPONSE instead of redirecting', async () => {
  reply(200, { success: true, data: { ...validData, ticketId: 'seven' } });
  const result = await purchaseVisitorTicket(crypto.randomUUID());
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.code, 'INVALID_RESPONSE');
});

test('a valid success body is returned', async () => {
  reply(200, { success: true, data: validData });
  const result = await purchaseVisitorTicket(crypto.randomUUID());
  assert.equal(result.ok, true);
});

test('purchase errors map to visitor-facing messages and next steps', () => {
  const fail = (status: number, code?: string, retryable = false) => ({
    ok: false as const,
    status,
    code,
    message: 'raw backend message',
    retryable,
  });

  assert.equal(describePurchaseError(fail(401)).action, 'login');
  assert.equal(describePurchaseError(fail(403, 'OUTSIDE_PROFILE_INCOMPLETE')).action, 'onboarding');
  assert.equal(describePurchaseError(fail(503, 'INVALID_TICKET_PRICE')).action, 'none');
  assert.equal(describePurchaseError(fail(500, 'GATEWAY_NOT_CONFIGURED')).action, 'none');
  assert.equal(describePurchaseError(fail(502, 'GATEWAY_REJECTED')).action, 'restart');
  assert.equal(describePurchaseError(fail(409, 'PAYMENT_NOT_COMPLETED')).action, 'restart');
  assert.equal(describePurchaseError(fail(504, 'GATEWAY_TIMEOUT', true)).action, 'retry');
  assert.equal(describePurchaseError(fail(0, 'NETWORK_ERROR', true)).action, 'retry');
  assert.equal(describePurchaseError(fail(500)).action, 'retry');
  assert.equal(describePurchaseError(fail(418, 'SOMETHING_NEW')).action, 'retry');
  assert.equal(describePurchaseError(fail(429)).action, 'retry');
  assert.equal(describePurchaseError(fail(409, 'PAYMENT_REFERENCE_MISMATCH')).action, 'retry');
  assert.equal(describePurchaseError(fail(403, 'NOT_AN_OUTSIDE_USER')).action, 'none');
  assert.equal(describePurchaseError(fail(200, 'CHECKOUT_URL_UNSAFE')).action, 'none');
  // retryable from the backend wins over a code that is final by default...
  assert.equal(describePurchaseError(fail(503, 'CONFIG_UNAVAILABLE', true)).action, 'retry');
  assert.match(describePurchaseError(fail(503, 'CONFIG_UNAVAILABLE', true)).message, /try again/);
  assert.equal(describePurchaseError(fail(503, 'CONFIG_UNAVAILABLE')).action, 'none');
  // ...but a restart still gets the new purchase key it needs.
  assert.equal(describePurchaseError(fail(409, 'PAYMENT_NOT_COMPLETED', true)).action, 'restart');
  assert.notEqual(
    describePurchaseError(fail(502, 'GATEWAY_REJECTED')).message,
    'raw backend message'
  );
});

test('amounts are shown in currency units', () => {
  assert.equal(formatTicketAmount(5000, 'THB'), '฿50.00');
});
