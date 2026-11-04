import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import {
  diffPolicyDraft,
  draftFromPolicy,
  fetchPolicy,
  updatePolicy,
  type BookingPolicy,
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

const SAVED: BookingPolicy = {
  maxBookingDurationMinutes: 120,
  maxAdvanceBookingDays: 7,
  minScoreToBook: 50,
  earlyCheckInMinutes: 15,
  lateThresholdMinutes: 15,
  ticketPriceSatang: 5000,
  ticketValidityHours: 2,
  paymentCheckoutExpiryMinutes: 30,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('the ticket price is edited in baht and saved in satang', () => {
  const draft = draftFromPolicy(SAVED);
  assert.equal(draft.ticketPriceSatang, '50.00');

  const { changes, errors } = diffPolicyDraft({ ...draft, ticketPriceSatang: '75.5' }, SAVED);
  assert.deepEqual(errors, {});
  assert.deepEqual(changes, { ticketPriceSatang: 7550 });

  assert.ok(
    diffPolicyDraft({ ...draft, ticketPriceSatang: '9.99' }, SAVED).errors.ticketPriceSatang
  );
  assert.ok(
    diffPolicyDraft({ ...draft, ticketPriceSatang: '50.123' }, SAVED).errors.ticketPriceSatang
  );
});

test('only changed fields are sent, and an unchanged form sends nothing', () => {
  const draft = draftFromPolicy(SAVED);
  assert.deepEqual(diffPolicyDraft(draft, SAVED), { changes: {}, errors: {} });
  assert.deepEqual(
    diffPolicyDraft({ ...draft, maxAdvanceBookingDays: '14', minScoreToBook: ' 60 ' }, SAVED)
      .changes,
    { maxAdvanceBookingDays: 14, minScoreToBook: 60 }
  );
});

test('ranges and the late-vs-duration rule match the backend', () => {
  const draft = draftFromPolicy(SAVED);
  const cases: [keyof BookingPolicy, string][] = [
    ['maxBookingDurationMinutes', '14'],
    ['maxBookingDurationMinutes', '1441'],
    ['maxAdvanceBookingDays', '0'],
    ['minScoreToBook', '101'],
    ['earlyCheckInMinutes', '181'],
    ['ticketValidityHours', '721'],
    ['paymentCheckoutExpiryMinutes', '29'],
    ['minScoreToBook', '5.5'],
    ['minScoreToBook', ''],
  ];
  for (const [field, value] of cases) {
    const result = diffPolicyDraft({ ...draft, [field]: value }, SAVED);
    assert.ok(result.errors[field], `${field}=${value} should be rejected`);
    assert.deepEqual(result.changes, {});
  }

  const late = diffPolicyDraft(
    { ...draft, maxBookingDurationMinutes: '30', lateThresholdMinutes: '30' },
    SAVED
  );
  assert.ok(late.errors.lateThresholdMinutes);
});

test('fetch and save use the admin policy endpoint with the admin token', async () => {
  const calls: { url: string; method?: string; body?: unknown; auth: string | null }[] = [];
  mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => {
    calls.push({
      url: input,
      method: init?.method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: new Headers(init?.headers).get('Authorization'),
    });
    return jsonResponse({ success: true, data: { configId: 1, ...SAVED, minScoreToBook: 60 } });
  });

  try {
    await fetchPolicy();
    const saved = await updatePolicy({ minScoreToBook: 60 });
    assert.equal(saved.minScoreToBook, 60);
    assert.deepEqual(
      calls.map((c) => [c.method, new URL(c.url).pathname, c.auth]),
      [
        ['GET', '/api/system-config/policy', 'Bearer admin-token'],
        ['PUT', '/api/system-config/policy', 'Bearer admin-token'],
      ]
    );
    assert.deepEqual(calls[1]!.body, { minScoreToBook: 60 });
  } finally {
    mock.restoreAll();
  }
});

test('backend field errors are kept for the form', async () => {
  const message = 'lateThresholdMinutes must be strictly less than maxBookingDurationMinutes.';
  mock.method(globalThis, 'fetch', async () =>
    jsonResponse(
      {
        success: false,
        code: 'INVALID_BOOKING_POLICY',
        error: message,
        errors: [{ field: 'lateThresholdMinutes', message }],
      },
      400
    )
  );
  try {
    await assert.rejects(
      updatePolicy({ lateThresholdMinutes: 200 }),
      (err: { code?: string; fieldErrors?: { field: string }[] }) =>
        err.code === 'INVALID_BOOKING_POLICY' &&
        err.fieldErrors?.[0]?.field === 'lateThresholdMinutes'
    );
  } finally {
    mock.restoreAll();
  }
});
