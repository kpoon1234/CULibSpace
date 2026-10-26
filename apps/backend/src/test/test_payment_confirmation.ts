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
      update: async ({ data }: any) => {
        if (state.failPayment) throw new Error('payment write failed');
        Object.assign(state.payment, data);
        return state.payment;
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
          retrieve: async (_id: string, params: any) => {
            state.retrievals++;
            return {
              ...(checkout.raw as Record<string, unknown>),
              id: 'cs_test_1',
              livemode: checkout.livemode,
              status: 'complete',
              payment_status: checkout.state === 'paid' ? 'paid' : 'unpaid',
              amount_total: checkout.amountSatang,
              currency: checkout.currency,
              metadata: { reference: checkout.reference },
            };
          },
        },
      },
      webhooks: {
        constructEvent: (body: any, signature: string, signingSecret: string) =>
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

test('verified success activates ticket and starts full validity at confirmation time', async (t) => {
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
});

test('duplicate event is idempotent', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: confirmedAt });
  const f = fixture();
  await PaymentConfirmationService.handleWebhook(event(), f.gateway, f.db);
  const result = await PaymentConfirmationService.handleWebhook(event(), f.gateway, f.db);
  assert.equal(result.duplicate, true);
  assert.equal(f.state.receipts.length, 1);
});

test('failed/expired events are not handled by success task', async () => {
  for (const type of ['payment.failed', 'payment.expired', 'payment.unknown'] as const) {
    const f = fixture();
    const result = await PaymentConfirmationService.handleWebhook(event({ type }), f.gateway, f.db);
    assert.equal(result.handled, false);
    assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
    assert.equal(f.state.receipts.length, 0);
  }
});

test('event identity cannot be reused for another payment', async () => {
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

test('amount/currency mismatch is rejected', async () => {
  const f = fixture();
  await rejectsCode(
    PaymentConfirmationService.handleWebhook(event({ amountSatang: 9999 }), f.gateway, f.db),
    'PAYMENT_EVENT_MISMATCH'
  );
  assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
  assert.equal(f.state.receipts.length, 0);
});

test('payment amount mismatch with stored record is rejected', async () => {
  const f = fixture();
  f.checkout.amountSatang = 9999;
  await rejectsCode(
    PaymentConfirmationService.handleWebhook(event({ amountSatang: 9999 }), f.gateway, f.db),
    'PAYMENT_AMOUNT_MISMATCH'
  );
  assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
});

test('unpaid payment state is rejected', async () => {
  const f = fixture();
  await rejectsCode(
    PaymentConfirmationService.handleWebhook(event({ paymentState: 'unpaid' }), f.gateway, f.db),
    'PAYMENT_NOT_PAID'
  );
  assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
});

test('missing payment is rejected with 503', async () => {
  const f = fixture();
  f.state.payment.paymentId = 999;
  await rejectsCode(
    PaymentConfirmationService.handleWebhook(event(), f.gateway, f.db),
    'PAYMENT_NOT_FOUND'
  );
});

test('refunded payment cannot activate ticket', async () => {
  const f = fixture();
  f.state.payment.status = PaymentStatus.REFUNDED;
  await rejectsCode(
    PaymentConfirmationService.handleWebhook(event(), f.gateway, f.db),
    'PAYMENT_REFUNDED'
  );
  assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
});

test('live mode payment is rejected', async () => {
  const f = fixture();
  await rejectsCode(
    PaymentConfirmationService.handleWebhook(event({ livemode: true }), f.gateway, f.db),
    'LIVE_PAYMENT_DISABLED'
  );
  assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
});

test('webhook route verifies signature and returns 400 for invalid signature', async () => {
  const f = fixture();
  const app = express();
  app.use(
    '/api/tickets',
    createPaymentWebhookRouter(() => f.gateway, f.db as any)
  );
  app.use(express.json());
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/tickets/payment/webhook`;

  try {
    // Invalid signature -> 400
    const badResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'invalid' },
      body: JSON.stringify({ id: 'evt_test' }),
    });
    assert.equal(badResponse.status, 400);

    // Missing signature -> 400
    const noSigResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'evt_test' }),
    });
    assert.equal(noSigResponse.status, 400);

    // Valid signed request -> 200
    const payload = JSON.stringify({
      id: 'evt_1',
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
    });
    const time = Math.floor(Date.now() / 1000);
    const sig = `t=${time},v1=${createHmac('sha256', secret).update(`${time}.${payload}`).digest('hex')}`;

    const goodResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig },
      body: payload,
    });
    assert.equal(goodResponse.status, 200);
    const body = await goodResponse.json();
    assert.equal(body.received, true);
    assert.equal(body.handled, true);
    assert.equal(body.activated, true);
    assert.equal(f.state.ticket.status, TicketStatus.PAID);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test('write failures propagate without successful receipt', async () => {
  const f = fixture();
  f.state.failReceipt = true;
  await assert.rejects(PaymentConfirmationService.handleWebhook(event(), f.gateway, f.db));
  assert.equal(f.state.receipts.length, 0);
  assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
});

test('payment write failure propagates without successful receipt', async () => {
  const f = fixture();
  f.state.failPayment = true;
  await assert.rejects(PaymentConfirmationService.handleWebhook(event(), f.gateway, f.db));
  assert.equal(f.state.receipts.length, 0);
  assert.equal(f.state.ticket.status, TicketStatus.UNPAID);
});
