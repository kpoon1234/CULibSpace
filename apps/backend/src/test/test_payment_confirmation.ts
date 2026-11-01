import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import Stripe from 'stripe';
import { PaymentStatus, TicketStatus, type PrismaClient } from '@prisma/client';
import {
  PaymentConfirmationService,
  PaymentConfirmationError,
} from '../services/paymentConfirmationService.js';
import { StripePaymentGateway } from '../services/stripePaymentGateway.js';
import { getPaymentGateway } from '../services/paymentGatewayFactory.js';
import { createPaymentWebhookRouter } from '../routes/paymentWebhookRoutes.js';
import type { GatewayPaymentEvent, GatewayCheckoutStatus } from '../services/paymentGateway.js';

const confirmedAt = new Date('2026-10-23T10:00:00Z');
const secret = 'whsec_unit_test_only';
const stripe = new Stripe('sk_test_fixture');

function event(overrides: Partial<GatewayPaymentEvent> = {}): GatewayPaymentEvent {
  return {
    eventId: 'evt_1',
    livemode: false,
    type: 'payment.succeeded',
    paymentState: 'paid',
    gatewayRef: 'cs_test_1',
    reference: '101',
    amountSatang: 5000,
    currency: 'thb',
    raw: {},
    ...overrides,
  };
}

/** Stateful mock checks orchestration/error propagation, NOT real DB isolation.
 * Real rollback and simultaneous deliveries are tested in the integration suite. */
function fixture() {
  const state = {
    payment: {
      paymentId: 101,
      ticketId: 201,
      uid: 7,
      gateway: 'stripe',
      gatewayRef: 'cs_test_1' as string | null,
      status: PaymentStatus.PENDING as PaymentStatus,
      amountSatang: 5000,
      currency: 'THB',
      openUid: 7 as number | null,
      ticketValidityHours: 2,
      paidAt: null as Date | null,
    },
    ticket: {
      ticketId: 201,
      uid: 7,
      status: TicketStatus.UNPAID as TicketStatus,
      startDateTime: new Date(0),
      endDateTime: new Date(1),
    },
    receipts: [] as { gateway: string; eventId: string; paymentId: number; gatewayRef: string }[],
    failReceipt: false,
    failPayment: false,
    retrievals: 0,
    locks: [] as string[],
  };
  const checkout: GatewayCheckoutStatus = {
    state: 'paid',
    livemode: false,
    reference: '101',
    amountSatang: 5000,
    currency: 'thb',
    raw: {},
  };
  const findReceipt = ({ where }: any) =>
    state.receipts.find(
      (r) =>
        r.gateway === where.gateway_eventId.gateway && r.eventId === where.gateway_eventId.eventId
    ) ?? null;
  const db: any = {
    $queryRaw: async (sql: TemplateStringsArray) => {
      state.locks.push(sql.join('?'));
      return [];
    },
    payment: {
      findUnique: async ({ where }: any) =>
        where.paymentId === state.payment.paymentId ? state.payment : null,
      findFirst: async ({ where }: any) => {
        if (where?.paymentId && where.paymentId === state.payment.paymentId) return state.payment;
        if (where?.gatewayRef && where.gatewayRef === state.payment.gatewayRef) {
          // Also check gateway filter if present
          if (where.gateway && where.gateway !== state.payment.gateway) return null;
          return state.payment;
        }
        if (where?.OR) {
          for (const cond of where.OR) {
            if (cond.paymentId && cond.paymentId === state.payment.paymentId) return state.payment;
            if (cond.gatewayRef && cond.gatewayRef === state.payment.gatewayRef)
              return state.payment;
          }
        }
        return null;
      },
      update: async ({ data }: any) => {
        if (state.failPayment) throw new Error('payment write failed');
        Object.assign(state.payment, data);
        return state.payment;
      },
      updateMany: async ({ where, data }: any) => {
        if (state.failPayment) throw new Error('payment write failed');
        if (where?.paymentId && where.paymentId !== state.payment.paymentId) return { count: 0 };
        if (where?.status?.in && !where.status.in.includes(state.payment.status))
          return { count: 0 };
        Object.assign(state.payment, data);
        return { count: 1 };
      },
    },
    ticket: {
      findUnique: async () => state.ticket,
      update: async ({ data }: any) => {
        Object.assign(state.ticket, data);
        return state.ticket;
      },
    },
    paymentWebhookEvent: {
      findUnique: async (args: any) => findReceipt(args),
      findUniqueOrThrow: async (args: any) => {
        const r = findReceipt(args);
        if (!r) throw new Error('missing receipt');
        return r;
      },
      createMany: async ({ data }: any) => {
        if (state.failReceipt) throw new Error('receipt write failed');
        if (state.receipts.some((r) => r.gateway === data.gateway && r.eventId === data.eventId))
          return { count: 0 };
        state.receipts.push(data);
        return { count: 1 };
      },
    },
    $transaction: async (fn: any) => {
      const before = structuredClone(state);
      try {
        return await fn(db);
      } catch (error) {
        Object.assign(state, before);
        throw error;
      }
    },
  };
  const gateway = new StripePaymentGateway({
    secretKey: 'sk_test_fixture',
    webhookSecret: secret,
    client: {
      checkout: {
        sessions: {
          create: async () => {
            throw new Error('not used');
          },
          retrieve: async (_id, params) => {
            state.retrievals++;
            assert.equal(params, undefined, 'confirmation does not need expanded charges');
            // Simulate Stripe's behaviour: PaymentIntent IDs (pi_…) are not valid
            // Checkout Session IDs and Stripe returns 404 for them.
            if (typeof _id === 'string' && _id.startsWith('pi_')) {
              throw Object.assign(new Error('No such checkout.session'), {
                statusCode: 404,
                code: 'resource_missing',
              });
            }
            return {
              ...(checkout.raw as Record<string, unknown>),
              id: _id ?? 'cs_test_1',
              livemode: checkout.livemode,
              status:
                (checkout.raw as any)?.status ??
                (checkout.state === 'expired'
                  ? 'expired'
                  : checkout.state === 'open'
                    ? 'open'
                    : 'complete'),
              payment_status: checkout.state === 'paid' ? 'paid' : 'unpaid',
              amount_total: checkout.amountSatang,
              currency: checkout.currency,
              metadata: { reference: checkout.reference },
            };
          },
        },
      },
      webhooks: {
        constructEvent: (body, signature, signingSecret) =>
          stripe.webhooks.constructEvent(body, signature, signingSecret),
      },
    },
  });
  return { state, checkout, gateway, db: db as PrismaClient };
}

async function rejectsCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(
    promise,
    (error: unknown) => error instanceof PaymentConfirmationError && error.code === code
  );
}

test('verified success without charge details starts full validity at first confirmation', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: confirmedAt });
  const f = fixture();
  const result = await PaymentConfirmationService.handleWebhook(event(), f.gateway, f.db);
  assert.equal(result.activated, true);
  assert.equal(f.state.payment.status, PaymentStatus.PAID);
  assert.equal(f.state.payment.openUid, null);
  assert.equal(f.state.ticket.status, TicketStatus.PAID);
  assert.equal(f.state.payment.paidAt?.getTime(), confirmedAt.getTime());
  assert.equal(f.state.ticket.startDateTime.getTime(), confirmedAt.getTime());
  assert.equal(f.state.ticket.endDateTime.getTime(), confirmedAt.getTime() + 2 * 3_600_000);
  assert.equal(f.state.receipts.length, 1);
  assert.match(f.state.locks[0], /payment.*FOR UPDATE/);
  assert.match(f.state.locks[1], /ticket.*FOR UPDATE/);
});

test('delayed payment ignores old Session, PaymentIntent and Charge creation times', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: confirmedAt });
  const f = fixture();
  const old = Math.floor(confirmedAt.getTime() / 1000) - 3 * 3600;
  f.checkout.raw = {
    created: old,
    payment_intent: { created: old, status: 'succeeded', latest_charge: { created: old } },
  };
  await PaymentConfirmationService.handleWebhook(event(), f.gateway, f.db);
  assert.equal(f.state.ticket.startDateTime.getTime(), confirmedAt.getTime());
  assert.equal(f.state.ticket.endDateTime.getTime(), confirmedAt.getTime() + 2 * 3_600_000);
});

test('same event and different success cannot extend validity even after the ticket expires', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: confirmedAt });
  const f = fixture();
  await PaymentConfirmationService.handleWebhook(event(), f.gateway, f.db);
  const expiry = f.state.ticket.endDateTime.getTime();
  assert.equal(
    (await PaymentConfirmationService.handleWebhook(event(), f.gateway, f.db)).duplicate,
    true
  );
  assert.equal(f.state.retrievals, 1);
  t.mock.timers.tick(3 * 3_600_000);
  await PaymentConfirmationService.handleWebhook(event({ eventId: 'evt_2' }), f.gateway, f.db);
  assert.equal(f.state.ticket.endDateTime.getTime(), expiry);
  assert.equal(f.state.payment.paidAt?.getTime(), confirmedAt.getTime());
  assert.equal(f.state.receipts.length, 2);
});

for (const status of [
  PaymentStatus.UNCONFIRMED,
  PaymentStatus.PAID,
  PaymentStatus.EXPIRED,
  PaymentStatus.FAILED,
]) {
  test(`${status} payment with unpaid ticket can be repaired only after gateway verification`, async () => {
    const f = fixture();
    f.state.payment.status = status;
    await PaymentConfirmationService.handleWebhook(event(), f.gateway, f.db);
    assert.equal(f.state.ticket.status, TicketStatus.PAID);
  });
}

test('legacy PAID payment with UNPAID ticket gets full validity when first activated', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: confirmedAt });
  const f = fixture();
  f.state.payment.status = PaymentStatus.PAID;
  f.state.payment.paidAt = new Date(confirmedAt.getTime() - 3 * 3_600_000);
  await PaymentConfirmationService.handleWebhook(event(), f.gateway, f.db);
  assert.equal(f.state.payment.paidAt.getTime(), confirmedAt.getTime());
  assert.equal(f.state.ticket.startDateTime.getTime(), confirmedAt.getTime());
  assert.equal(f.state.ticket.endDateTime.getTime(), confirmedAt.getTime() + 2 * 3_600_000);
});

test('an already PAID ticket with missing payment timestamp keeps its original validity', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: confirmedAt });
  const f = fixture();
  const start = new Date(confirmedAt.getTime() - 3 * 3_600_000);
  const end = new Date(start.getTime() + 2 * 3_600_000);
  Object.assign(f.state.ticket, {
    status: TicketStatus.PAID,
    startDateTime: start,
    endDateTime: end,
  });
  const result = await PaymentConfirmationService.handleWebhook(event(), f.gateway, f.db);
  assert.equal(result.activated, false);
  assert.equal(f.state.payment.paidAt?.getTime(), start.getTime());
  assert.equal(f.state.ticket.startDateTime.getTime(), start.getTime());
  assert.equal(f.state.ticket.endDateTime.getTime(), end.getTime());
});

test('webhook can bind a missing gatewayRef by the verified metadata payment ID', async () => {
  const f = fixture();
  f.state.payment.gatewayRef = null;
  await PaymentConfirmationService.handleWebhook(event(), f.gateway, f.db);
  assert.equal(f.state.payment.gatewayRef, 'cs_test_1');
});

test('event identity cannot be reused for another checkout or payment', async () => {
  const f = fixture();
  await PaymentConfirmationService.handleWebhook(event(), f.gateway, f.db);
  await rejectsCode(
    PaymentConfirmationService.handleWebhook(event({ gatewayRef: 'cs_other' }), f.gateway, f.db),
    'PAYMENT_EVENT_ID_CONFLICT'
  );
  await rejectsCode(
    PaymentConfirmationService.handleWebhook(event({ reference: '102' }), f.gateway, f.db),
    'PAYMENT_EVENT_ID_CONFLICT'
  );
});

test('missing event ID and no-payment-required cannot activate a positive-price ticket', async () => {
  const f = fixture();
  await rejectsCode(
    PaymentConfirmationService.handleWebhook(event({ eventId: undefined }), f.gateway, f.db),
    'INVALID_PAYMENT_EVENT'
  );
  await rejectsCode(
    PaymentConfirmationService.handleWebhook(
      event({ paymentState: 'no_payment_required' }),
      f.gateway,
      f.db
    ),
    'PAYMENT_NOT_PAID'
  );
  assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
});

for (const reference of [undefined, '', '0', '-1', '101x', '2147483648']) {
  test(`invalid payment reference ${reference} never activates`, async () => {
    const f = fixture();
    await rejectsCode(
      PaymentConfirmationService.handleWebhook(event({ reference }), f.gateway, f.db),
      'INVALID_PAYMENT_REFERENCE'
    );
    assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
  });
}

test('event fields must match the independently retrieved checkout', async () => {
  for (const change of [{ amountSatang: 1 }, { currency: 'USD' }, { reference: '102' }]) {
    const f = fixture();
    await rejectsCode(
      PaymentConfirmationService.handleWebhook(event(change), f.gateway, f.db),
      'PAYMENT_EVENT_MISMATCH'
    );
    assert.equal(f.state.receipts.length, 0);
  }
});

test('checkout amount/currency must ALSO match the stored purchase, not just the event', async () => {
  for (const change of [{ amountSatang: 1 }, { currency: 'USD' }]) {
    const f = fixture();
    Object.assign(f.checkout, change);
    await rejectsCode(
      PaymentConfirmationService.handleWebhook(event(change), f.gateway, f.db),
      'PAYMENT_AMOUNT_MISMATCH'
    );
    assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
  }
});

test('foreign gateway, mismatched stored checkout, ownership and refunded payments are rejected', async () => {
  for (const [change, code] of [
    [{ gateway: 'other' }, 'PAYMENT_REFERENCE_MISMATCH'],
    [{ gatewayRef: 'cs_other' }, 'PAYMENT_REFERENCE_MISMATCH'],
    [{ status: PaymentStatus.REFUNDED }, 'PAYMENT_REFUNDED'],
    [{ uid: 999 }, 'PAYMENT_OWNER_MISMATCH'],
  ] as const) {
    const f = fixture();
    Object.assign(f.state.payment, change);
    await rejectsCode(PaymentConfirmationService.handleWebhook(event(), f.gateway, f.db), code);
    assert.equal(f.state.receipts.length, 0);
    assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
  }
});

test('missing payment, unknown gateway state and live mode do not activate', async () => {
  const missing = fixture();
  missing.state.payment.paymentId = 999;
  await rejectsCode(
    PaymentConfirmationService.handleWebhook(event(), missing.gateway, missing.db),
    'PAYMENT_NOT_FOUND'
  );
  const unknown = fixture();
  unknown.checkout.state = 'unknown';
  await rejectsCode(
    PaymentConfirmationService.handleWebhook(event(), unknown.gateway, unknown.db),
    'PAYMENT_CONFIRMATION_UNAVAILABLE'
  );
  const live = fixture();
  await rejectsCode(
    PaymentConfirmationService.handleWebhook(event({ livemode: true }), live.gateway, live.db),
    'LIVE_PAYMENT_DISABLED'
  );
  live.checkout.livemode = true;
  await rejectsCode(
    PaymentConfirmationService.handleWebhook(event(), live.gateway, live.db),
    'PAYMENT_NOT_PAID'
  );
});

test('failed event updates payment to FAILED and keeps ticket inactive', async () => {
  const f = fixture();
  f.checkout.state = 'expired';
  const result = await PaymentConfirmationService.handleWebhook(
    event({ type: 'payment.failed' }),
    f.gateway,
    f.db
  );
  assert.equal(result.handled, true);
  assert.equal(result.activated, false);
  assert.equal(f.state.payment.status, PaymentStatus.FAILED);
  assert.equal(f.state.payment.openUid, null);
  assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
  assert.equal(f.state.receipts.length, 0);
});

test('expired event updates payment to EXPIRED and keeps ticket inactive', async () => {
  const f = fixture();
  const result = await PaymentConfirmationService.handleWebhook(
    event({ type: 'payment.expired' }),
    f.gateway,
    f.db
  );
  assert.equal(result.handled, true);
  assert.equal(result.activated, false);
  assert.equal(f.state.payment.status, PaymentStatus.EXPIRED);
  assert.equal(f.state.payment.openUid, null);
  assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
  assert.equal(f.state.receipts.length, 0);
});

test('payment attempt failure with open checkout does NOT release openUid or mark FAILED (card declined retryable)', async () => {
  const f = fixture();
  f.checkout.state = 'open';
  const result = await PaymentConfirmationService.handleWebhook(
    event({ type: 'payment.failed' }),
    f.gateway,
    f.db
  );
  assert.equal(result.handled, true);
  assert.equal(result.activated, false);
  // Payment status must NOT be FAILED; open slot must NOT be released!
  assert.equal(f.state.payment.status, PaymentStatus.PENDING);
  assert.equal(f.state.payment.openUid, 7);
  assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
  assert.equal(f.state.receipts.length, 0);

  // Subsequent successful payment on retry activates the ticket
  f.checkout.state = 'paid';
  const successResult = await PaymentConfirmationService.handleWebhook(
    event({ type: 'payment.succeeded' }),
    f.gateway,
    f.db
  );
  assert.equal(successResult.handled, true);
  assert.equal(successResult.activated, true);
  assert.equal(f.state.payment.status, PaymentStatus.PAID);
  assert.equal(f.state.payment.openUid, null);
  assert.equal(f.state.ticket.status, TicketStatus.PAID);
});

test('failed event does not overwrite a payment that was concurrently marked PAID', async () => {
  const f = fixture();
  f.checkout.state = 'expired';

  // Simulate payment marked PAID concurrently
  f.state.payment.status = PaymentStatus.PAID;
  f.state.payment.openUid = null;
  f.state.ticket.status = TicketStatus.PAID;

  const result = await PaymentConfirmationService.handleWebhook(
    event({ type: 'payment.failed' }),
    f.gateway,
    f.db
  );

  assert.equal(result.handled, true);
  assert.equal(result.activated, false);
  assert.equal(f.state.payment.status, PaymentStatus.PAID);
  assert.equal(f.state.payment.openUid, null);
  assert.equal(f.state.ticket.status, TicketStatus.PAID);
});

test('failed event conditional update does not overwrite PAID if status changed during execution', async () => {
  const f = fixture();
  f.checkout.state = 'expired';

  const origUpdateMany = f.db.payment.updateMany;
  f.db.payment.updateMany = (async (args: any) => {
    // Concurrent thread commits PAID right before updateMany
    f.state.payment.status = PaymentStatus.PAID;
    return origUpdateMany(args);
  }) as any;

  const result = await PaymentConfirmationService.handleWebhook(
    event({ type: 'payment.failed' }),
    f.gateway,
    f.db
  );

  assert.equal(result.handled, true);
  assert.equal(result.activated, false);
  assert.equal(f.state.payment.status, PaymentStatus.PAID);
  assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
});

test('expired event does not overwrite a payment that was concurrently marked PAID', async () => {
  const f = fixture();

  // Simulate payment marked PAID concurrently
  f.state.payment.status = PaymentStatus.PAID;
  f.state.payment.openUid = null;
  f.state.ticket.status = TicketStatus.PAID;

  const result = await PaymentConfirmationService.handleWebhook(
    event({ type: 'payment.expired' }),
    f.gateway,
    f.db
  );

  assert.equal(result.handled, true);
  assert.equal(result.activated, false);
  assert.equal(f.state.payment.status, PaymentStatus.PAID);
  assert.equal(f.state.payment.openUid, null);
  assert.equal(f.state.ticket.status, TicketStatus.PAID);
});

test('expired event conditional update does not overwrite PAID if status changed during execution', async () => {
  const f = fixture();

  const origUpdateMany = f.db.payment.updateMany;
  f.db.payment.updateMany = (async (args: any) => {
    // Concurrent thread commits PAID right before updateMany
    f.state.payment.status = PaymentStatus.PAID;
    return origUpdateMany(args);
  }) as any;

  const result = await PaymentConfirmationService.handleWebhook(
    event({ type: 'payment.expired' }),
    f.gateway,
    f.db
  );

  assert.equal(result.handled, true);
  assert.equal(result.activated, false);
  assert.equal(f.state.payment.status, PaymentStatus.PAID);
});

test('unknown events are not handled', async () => {
  const f = fixture();
  const result = await PaymentConfirmationService.handleWebhook(
    event({ type: 'payment.unknown' }),
    f.gateway,
    f.db
  );
  assert.equal(result.handled, false);
  assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
  assert.equal(f.state.receipts.length, 0);
  assert.equal(f.state.retrievals, 0);
});

test('write failures propagate without a successful receipt (mock orchestration only)', async () => {
  for (const field of ['failReceipt', 'failPayment'] as const) {
    const f = fixture();
    f.state[field] = true;
    await assert.rejects(PaymentConfirmationService.handleWebhook(event(), f.gateway, f.db));
    assert.equal(f.state.receipts.length, 0);
    assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
    assert.equal(f.state.payment.status, PaymentStatus.PENDING);
  }
});

function signature(payload: string) {
  const time = Math.floor(Date.now() / 1000);
  return `t=${time},v1=${createHmac('sha256', secret).update(`${time}.${payload}`).digest('hex')}`;
}

test('real HTTP route verifies exact signed bytes before JSON parsing, without user JWT', async () => {
  const f = fixture();
  const app = express();
  app.use(
    '/api/tickets',
    createPaymentWebhookRouter(() => f.gateway, f.db)
  );
  app.use(express.json());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/tickets/payment/webhook`;
  const payload = JSON.stringify(
    {
      id: 'evt_http',
      livemode: false,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          metadata: { reference: '101' },
          payment_status: 'paid',
          amount_total: 5000,
          currency: 'thb',
        },
      },
    },
    null,
    2
  );
  const post = (body: string, sig = signature(body)) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig },
      body,
    });
  try {
    assert.equal((await post(payload, 'invalid')).status, 400);
    assert.equal((await post(payload + ' ', signature(payload))).status, 400);
    assert.equal(f.state.receipts.length, 0);
    f.state.failPayment = true;
    assert.equal((await post(payload)).status, 503, 'transient failure must tell Stripe to retry');
    assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
    assert.equal(f.state.receipts.length, 0);
    f.state.failPayment = false;
    const mismatched = JSON.parse(payload);
    mismatched.id = 'evt_bad_amount';
    mismatched.data.object.amount_total = 1;
    const rejected = await post(JSON.stringify(mismatched));
    assert.equal(
      rejected.status,
      200,
      'permanent signed mismatch is acknowledged without activation'
    );
    assert.equal((await rejected.json()).code, 'PAYMENT_EVENT_MISMATCH');
    assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
    assert.equal((await post(payload)).status, 200);
    assert.equal(f.state.ticket.status, TicketStatus.PAID);
    assert.equal(f.state.receipts.length, 1);
    assert.equal((await (await post(payload)).json()).duplicate, true);
    const live = payload.replace('"livemode": false', '"livemode": true');
    assert.equal((await post(live)).status, 400);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test('gateway factory refuses live keys', () => {
  const previous = process.env.STRIPE_SECRET_KEY;
  try {
    process.env.STRIPE_SECRET_KEY = 'sk_live_fixture';
    assert.throws(() => getPaymentGateway(), /live keys are disabled/);
  } finally {
    if (previous === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previous;
  }
});

test('Stripe SDK authentication messages containing secrets are not exposed to purchase callers', async () => {
  const gateway = new StripePaymentGateway({
    secretKey: 'sk_test_fixture',
    client: {
      checkout: {
        sessions: {
          create: async () => {
            throw Object.assign(new Error('Invalid API Key provided: sk_test_do_not_echo'), {
              statusCode: 401,
            });
          },
          retrieve: async () => {
            throw new Error('not used');
          },
        },
      },
      webhooks: {
        constructEvent: () => {
          throw new Error('not used');
        },
      },
    },
  });
  await assert.rejects(
    gateway.createCheckoutSession({
      amountSatang: 5000,
      currency: 'THB',
      reference: '101',
      description: 'Fixture',
      expiresAt: new Date(),
      idempotencyKey: 'fixture',
    }),
    (error: unknown) =>
      error instanceof Error &&
      !error.message.includes('sk_test_do_not_echo') &&
      /rejected/.test(error.message)
  );
});

// ---------------------------------------------------------------------------
// Regression – payment_intent.payment_failed with open Checkout Session
// ---------------------------------------------------------------------------
// When Stripe fires payment_intent.payment_failed the adapter sets
// event.gatewayRef = pi_… (the PaymentIntent ID, not the Checkout Session ID).
// retrieveCheckoutStatus(pi_…) would normally return 'not_found' because
// checkout.sessions.retrieve only accepts cs_… IDs.
//
// The service must:
//   1. Look up the payment record to get the stored cs_… gatewayRef.
//   2. Call retrieveCheckoutStatus with cs_… → returns 'open'.
//   3. NOT mark the payment FAILED; NOT clear openUid.
//   4. Allow a subsequent successful payment to activate the ticket.
test('payment_intent.payment_failed with pi_… ID does not release openUid when checkout session is still open', async () => {
  const f = fixture();
  // Checkout session is still open (customer can retry with another card)
  f.checkout.state = 'open';

  // Simulate a payment_intent.payment_failed event: gatewayRef is the PaymentIntent ID.
  // The stored payment.gatewayRef remains 'cs_test_1'.
  // The mock retrieve will throw 404 for pi_… and return open session for cs_….
  const piRef = 'pi_test_card_declined_1';
  const result = await PaymentConfirmationService.handleWebhook(
    event({ type: 'payment.failed', gatewayRef: piRef, reference: '101' }),
    f.gateway,
    f.db
  );

  assert.equal(result.handled, true);
  assert.equal(result.activated, false);
  // Payment must remain PENDING; openUid must NOT be cleared
  assert.equal(f.state.payment.status, PaymentStatus.PENDING);
  assert.equal(f.state.payment.openUid, 7);
  assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
  assert.equal(f.state.receipts.length, 0);

  // Verify that a subsequent successful payment activates the ticket normally
  f.checkout.state = 'paid';
  const successResult = await PaymentConfirmationService.handleWebhook(
    event({ type: 'payment.succeeded', gatewayRef: 'cs_test_1', reference: '101' }),
    f.gateway,
    f.db
  );
  assert.equal(successResult.handled, true);
  assert.equal(successResult.activated, true);
  assert.equal(f.state.payment.status, PaymentStatus.PAID);
  assert.equal(f.state.payment.openUid, null);
  assert.equal(f.state.ticket.status, TicketStatus.PAID);
});

test('payment_intent.payment_failed with pi_… ID marks FAILED when checkout session is not_found (Stripe 404 for pi_… falls back to stored cs_… which is expired)', async () => {
  const f = fixture();
  // Checkout session is expired (terminal state)
  f.checkout.state = 'expired';

  const piRef = 'pi_test_card_declined_expired';
  const result = await PaymentConfirmationService.handleWebhook(
    event({ type: 'payment.failed', gatewayRef: piRef, reference: '101' }),
    f.gateway,
    f.db
  );

  assert.equal(result.handled, true);
  assert.equal(result.activated, false);
  assert.equal(f.state.payment.status, PaymentStatus.FAILED);
  assert.equal(f.state.payment.openUid, null);
  assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
});

// ---------------------------------------------------------------------------
// Regression – checkout.session.async_payment_failed (delayed payment failure)
// ---------------------------------------------------------------------------
// When a delayed payment method (e.g. bank transfer) fails asynchronously,
// Stripe fires checkout.session.async_payment_failed. The session status is
// 'complete' with payment_status = 'unpaid'. This is a terminal state: the
// session is closed and can never be paid.
//
// Previously the Stripe adapter mapped complete+unpaid → state='unknown' and
// the service returned early without releasing openUid, leaving the user stuck.
//
// complete+unpaid alone can still be processing. The adapter preserves that
// state; only the matching terminal Checkout failure permits releasing openUid.
test('checkout.session.async_payment_failed releases openUid and marks payment FAILED', async () => {
  const f = fixture();
  // Simulate the Stripe session being complete but payment failed (delayed payment)
  // The session is complete/closed at the gateway (no retry possible).
  // retrieveCheckoutStatus now returns state='open' for complete+unpaid,
  // but handleFailedPayment checks the raw session and still marks FAILED.
  f.checkout.state = 'open';
  f.checkout.raw = { status: 'complete', payment_status: 'unpaid' };

  // The event arrives as 'payment.failed' (adapter mapping for async_payment_failed)
  const result = await PaymentConfirmationService.handleWebhook(
    event({
      type: 'payment.failed',
      terminalFailure: true,
      gatewayRef: 'cs_test_1',
      reference: '101',
    }),
    f.gateway,
    f.db
  );

  assert.equal(result.handled, true);
  assert.equal(result.activated, false);
  // Payment must be marked FAILED and openUid cleared so user can buy again
  assert.equal(f.state.payment.status, PaymentStatus.FAILED);
  assert.equal(f.state.payment.openUid, null);
  assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
});

test('checkout.session.async_payment_failed does not overwrite PAID payment (race protection)', async () => {
  const f = fixture();
  f.checkout.state = 'expired';
  f.checkout.raw = { status: 'complete', payment_status: 'unpaid' };

  // Payment was already confirmed as PAID (concurrent success webhook won)
  f.state.payment.status = PaymentStatus.PAID;
  f.state.payment.openUid = null;
  f.state.ticket.status = TicketStatus.PAID;

  const result = await PaymentConfirmationService.handleWebhook(
    event({
      type: 'payment.failed',
      terminalFailure: true,
      gatewayRef: 'cs_test_1',
      reference: '101',
    }),
    f.gateway,
    f.db
  );

  assert.equal(result.handled, true);
  // Duplicate – the conditional updateMany returns count=0 for PAID status
  assert.equal(f.state.payment.status, PaymentStatus.PAID);
  assert.equal(f.state.payment.openUid, null);
  assert.equal(f.state.ticket.status, TicketStatus.PAID);
});

test('checkout.session.expired with mismatched gatewayRef does NOT expire payment', async () => {
  const f = fixture();
  f.checkout.state = 'expired';
  f.checkout.raw = {};

  // Event claims checkout session 'cs_foreign' expired, but payment is bound to 'cs_test_1'
  const result = await PaymentConfirmationService.handleWebhook(
    event({ type: 'payment.expired', gatewayRef: 'cs_foreign', reference: '101' }),
    f.gateway,
    f.db
  );

  assert.equal(result.handled, false);
  assert.equal(f.state.payment.status, PaymentStatus.PENDING);
  assert.equal(f.state.payment.openUid, 7);
  assert.equal(f.state.payment.gatewayRef, 'cs_test_1');
});

test('checkout.session.expired with mismatched gateway does NOT expire payment', async () => {
  const f = fixture();
  f.checkout.state = 'expired';
  f.checkout.raw = {};

  // Payment belongs to 'other_gateway', not 'stripe'
  f.state.payment.gateway = 'other_gateway';

  const result = await PaymentConfirmationService.handleWebhook(
    event({ type: 'payment.expired', gatewayRef: 'cs_test_1', reference: '101' }),
    f.gateway,
    f.db
  );

  assert.equal(result.handled, false);
  assert.equal(f.state.payment.status, PaymentStatus.PENDING);
  assert.equal(f.state.payment.openUid, 7);
  assert.equal(f.state.payment.gateway, 'other_gateway');
});

async function signedFailure(
  f: ReturnType<typeof fixture>,
  type: 'payment_intent.payment_failed' | 'checkout.session.async_payment_failed',
  checkoutRef = 'cs_test_1'
) {
  const isAttempt = type === 'payment_intent.payment_failed';
  const payload = JSON.stringify({
    id: isAttempt ? 'evt_delayed_attempt_failure' : 'evt_terminal_checkout_failure',
    livemode: false,
    type,
    data: {
      object: {
        id: isAttempt ? 'pi_test_1' : checkoutRef,
        object: isAttempt ? 'payment_intent' : 'checkout.session',
        status: isAttempt ? 'requires_payment_method' : 'complete',
        payment_status: 'unpaid',
        amount_total: 5000,
        currency: 'thb',
        metadata: { reference: '101' },
      },
    },
  });
  return f.gateway.parseWebhookEvent(Buffer.from(payload), signature(payload));
}

test('delayed PaymentIntent failure preserves a retry that is now processing and can later succeed', async () => {
  const f = fixture();
  f.checkout.state = 'open';
  f.checkout.raw = {
    status: 'complete',
    payment_status: 'unpaid',
    payment_intent: { id: 'pi_test_1', status: 'processing' },
  };

  const delayed = await signedFailure(f, 'payment_intent.payment_failed');
  await PaymentConfirmationService.handleWebhook(delayed, f.gateway, f.db);
  assert.equal(f.state.payment.status, PaymentStatus.PENDING);
  assert.equal(f.state.payment.openUid, 7);
  assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
  assert.equal(f.state.receipts.length, 0);

  f.checkout.state = 'paid';
  await PaymentConfirmationService.handleWebhook(
    event({ eventId: 'evt_success_after_delayed_failure' }),
    f.gateway,
    f.db
  );
  assert.equal(f.state.payment.status, PaymentStatus.PAID);
  assert.equal(f.state.ticket.status, TicketStatus.PAID);
});

test('signed terminal Checkout failure closes the matching completed unpaid session', async () => {
  const f = fixture();
  f.checkout.state = 'open';
  f.checkout.raw = { status: 'complete', payment_status: 'unpaid' };

  const terminal = await signedFailure(f, 'checkout.session.async_payment_failed');
  await PaymentConfirmationService.handleWebhook(terminal, f.gateway, f.db);
  assert.equal(f.state.payment.status, PaymentStatus.FAILED);
  assert.equal(f.state.payment.openUid, null);
  assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
});

test('terminal Checkout failure from another session cannot close a processing payment', async () => {
  const f = fixture();
  f.checkout.state = 'open';
  f.checkout.raw = { status: 'complete', payment_status: 'unpaid' };

  const foreign = await signedFailure(f, 'checkout.session.async_payment_failed', 'cs_foreign');
  await PaymentConfirmationService.handleWebhook(foreign, f.gateway, f.db);
  assert.equal(f.state.payment.status, PaymentStatus.PENDING);
  assert.equal(f.state.payment.openUid, 7);
  assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
});
