import assert from 'node:assert/strict';
import test from 'node:test';
import { PaymentStatus, TicketStatus } from '@prisma/client';
import type { PaymentGatewayErrorCode } from '../services/paymentGateway.js';

// ชุดทดสอบนี้ต้องไม่แตะฐานข้อมูลจริงของ developer
process.env.DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
process.env.JWT_SECRET = 'ticket-purchase-unit-test-secret';
// ใส่ key ปลอมไว้เพื่อให้ factory สร้าง gateway ได้ (ไม่มีการเรียกเครือข่ายจริง)
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_unit_tests';

const { TicketService } = await import('../services/ticketService.js');
const { TicketController } = await import('../controllers/ticketController.js');
const { PaymentGatewayError } = await import('../services/paymentGateway.js');
const { getPaymentGateway } = await import('../services/paymentGatewayFactory.js');
const { default: ticketRoutes } = await import('../routes/ticketRoutes.js');
const { default: ticketWebhookRoutes } = await import('../routes/ticketWebhookRoutes.js');

const PRICE_SATANG = 5000; // 50.00 THB
const VALIDITY_HOURS = 2;

// ---------------------------------------------------------------------------
// Fake gateway
// ---------------------------------------------------------------------------
function fakeGateway(overrides: Record<string, any> = {}) {
  const calls: any[] = [];
  return {
    name: 'stripe',
    calls,
    async createCheckoutSession(input: any) {
      calls.push(input);
      return {
        gatewayRef: `cs_test_${calls.length}`,
        checkoutUrl: `https://checkout.stripe.com/c/pay/cs_test_${calls.length}`,
        expiresAt: input.expiresAt,
      };
    },
    async parseWebhookEvent() {
      return { type: 'payment.unknown', gatewayRef: '', raw: {} };
    },
    ...overrides,
  };
}

function failingGateway(code: PaymentGatewayErrorCode, retryable: boolean) {
  // map สถานะให้ตรงกับที่ StripePaymentGateway ทำจริง
  const status = code === 'GATEWAY_TIMEOUT' ? 504 : code === 'GATEWAY_UNAVAILABLE' ? 503 : 502;
  return fakeGateway({
    async createCheckoutSession() {
      throw new PaymentGatewayError(code, `gateway failed: ${code}`, {
        retryable,
        status,
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Mock prisma
// ---------------------------------------------------------------------------
function mockPrisma(
  options: {
    user?: any;
    config?: any;
    payments?: any[];
  } = {}
) {
  const state = {
    user:
      options.user === undefined
        ? {
            uid: 7,
            email: 'visitor@example.com',
            firstname: 'Vis',
            lastname: 'Itor',
            isProfileComplete: true,
            userType: 'THAI',
            outsideUser: { uid: 7, thaiUser: { uid: 7 }, foreignUser: null },
          }
        : options.user,
    config:
      options.config === undefined
        ? {
            ticketPriceSatang: PRICE_SATANG,
            ticketValidityHours: VALIDITY_HOURS,
            paymentCheckoutExpiryMinutes: 30,
          }
        : options.config,
    payments: [...(options.payments ?? [])],
    tickets: [] as any[],
    nextPaymentId: 100,
    nextTicketId: 500,
    calls: {
      ticketCreate: 0,
      paymentCreate: 0,
      paymentUpdate: 0,
    },
  };

  const client: any = {
    user: {
      findUnique: async () => state.user,
    },
    systemConfig: {
      findFirst: async () => state.config,
    },
    payment: {
      findUnique: async ({ where }: any) =>
        state.payments.find((p) => p.idempotencyKey === where.idempotencyKey) ?? null,
      findFirst: async ({ where }: any) => {
        const list = state.payments
          .filter((p) => {
            if (where.uid !== undefined && p.uid !== where.uid) return false;
            if (where.status !== undefined && p.status !== where.status) return false;
            if (where.createdAt?.gte && p.createdAt < where.createdAt.gte) return false;
            return true;
          })
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return list[0] ?? null;
      },
      create: async ({ data }: any) => {
        state.calls.paymentCreate++;
        const payment = {
          paymentId: state.nextPaymentId++,
          gatewayRef: null,
          checkoutUrl: null,
          paidAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.payments.push(payment);
        return payment;
      },
      update: async ({ where, data }: any) => {
        state.calls.paymentUpdate++;
        const payment = state.payments.find((p) => p.paymentId === where.paymentId);
        if (!payment) throw new Error('payment not found');
        Object.assign(payment, data);
        return payment;
      },
      updateMany: async ({ where, data }: any) => {
        const targets = state.payments.filter(
          (p) =>
            (where.paymentId === undefined || p.paymentId === where.paymentId) &&
            (where.status === undefined || p.status === where.status)
        );
        targets.forEach((t) => Object.assign(t, data));
        return { count: targets.length };
      },
    },
    ticket: {
      create: async ({ data }: any) => {
        state.calls.ticketCreate++;
        const ticket = {
          ticketId: state.nextTicketId++,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.tickets.push(ticket);
        return ticket;
      },
      findUnique: async ({ where }: any) =>
        state.tickets.find((t) => t.ticketId === where.ticketId) ?? null,
      update: async ({ where, data }: any) => {
        const ticket = state.tickets.find((t) => t.ticketId === where.ticketId);
        if (!ticket) throw new Error('ticket not found');
        Object.assign(ticket, data);
        return ticket;
      },
      updateMany: async ({ where, data }: any) => {
        const targets = state.tickets.filter(
          (t) =>
            (where.ticketId === undefined || t.ticketId === where.ticketId) &&
            (where.status === undefined || t.status === where.status)
        );
        targets.forEach((t) => Object.assign(t, data));
        return { count: targets.length };
      },
      findMany: async ({ where }: any) =>
        state.tickets
          .filter((t) => t.uid === where.uid)
          .map((t) => ({
            ...t,
            payments: state.payments.filter((p) => p.ticketId === t.ticketId),
          })),
    },
    $transaction: async (callback: any) => {
      if (typeof callback === 'function') return await callback(client);
      return await Promise.all(callback);
    },
  };

  return { client, state };
}

function mockResponse() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('purchase creates an UNPAID ticket + PENDING payment and returns the checkout url', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();

  const result = await TicketService.purchase({ uid: 7 }, gateway as any, client);

  assert.equal(result.ticketStatus, TicketStatus.UNPAID);
  assert.equal(result.status, PaymentStatus.PENDING);
  assert.ok(result.checkoutUrl?.startsWith('https://checkout.stripe.com/'));
  assert.equal(result.amountSatang, PRICE_SATANG);
  assert.equal(result.currency, 'THB');
  assert.equal(result.replayed, false);

  // มี 1 ticket + 1 payment
  assert.equal(state.calls.ticketCreate, 1);
  assert.equal(state.calls.paymentCreate, 1);
  assert.equal(state.tickets[0].status, TicketStatus.UNPAID);
  assert.equal(state.payments[0].status, PaymentStatus.PENDING);
  // gateway reference ถูกบันทึกกลับมา
  assert.equal(state.payments[0].gatewayRef, 'cs_test_1');
});

test('backend decides the price and the ticket window (client cannot override)', async () => {
  const { client } = mockPrisma({
    config: {
      ticketPriceSatang: 12345,
      ticketValidityHours: 4,
      paymentCheckoutExpiryMinutes: 30,
    },
  });
  const gateway = fakeGateway();

  const result = await TicketService.purchase({ uid: 7 }, gateway as any, client);

  // gateway ได้รับราคาจาก SystemConfig ไม่ใช่จาก client
  assert.equal(gateway.calls[0].amountSatang, 12345);
  assert.equal(gateway.calls[0].currency, 'THB');
  assert.equal(result.amountSatang, 12345);

  // อายุตั๋ว = validHours นาที... ชั่วโมง นับจากเวลาซื้อ
  const windowMs =
    new Date(result.ticketEndDateTime).getTime() - new Date(result.ticketStartDateTime).getTime();
  assert.equal(windowMs, 4 * 60 * 60 * 1000);
});

test('rejects non-outside users with 403 NOT_AN_OUTSIDE_USER', async () => {
  const { client } = mockPrisma({
    user: {
      uid: 7,
      email: 'student@chula.ac.th',
      isProfileComplete: true,
      userType: 'UNIVERSITY',
      outsideUser: null,
    },
  });

  await assert.rejects(
    () => TicketService.purchase({ uid: 7 }, fakeGateway() as any, client),
    (err: any) => {
      assert.equal(err.status, 403);
      assert.equal(err.code, 'NOT_AN_OUTSIDE_USER');
      return true;
    }
  );
});

test('rejects incomplete profile with 403 PROFILE_INCOMPLETE', async () => {
  const { client } = mockPrisma({
    user: {
      uid: 7,
      email: 'visitor@example.com',
      isProfileComplete: false,
      userType: 'THAI',
      outsideUser: { uid: 7, thaiUser: { uid: 7 }, foreignUser: null },
    },
  });

  await assert.rejects(
    () => TicketService.purchase({ uid: 7 }, fakeGateway() as any, client),
    (err: any) => {
      assert.equal(err.status, 403);
      assert.equal(err.code, 'PROFILE_INCOMPLETE');
      return true;
    }
  );
});

test('rejects outside user without identity document with 403 OUTSIDE_PROFILE_INCOMPLETE', async () => {
  const { client } = mockPrisma({
    user: {
      uid: 7,
      email: 'visitor@example.com',
      isProfileComplete: true,
      userType: 'THAI',
      outsideUser: { uid: 7, thaiUser: null, foreignUser: null },
    },
  });

  await assert.rejects(
    () => TicketService.purchase({ uid: 7 }, fakeGateway() as any, client),
    (err: any) => {
      assert.equal(err.status, 403);
      assert.equal(err.code, 'OUTSIDE_PROFILE_INCOMPLETE');
      return true;
    }
  );
});

test('same idempotency key replays the existing purchase instead of creating a new one', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();

  const first = await TicketService.purchase(
    { uid: 7, idempotencyKey: 'abc-123' },
    gateway as any,
    client
  );
  const second = await TicketService.purchase(
    { uid: 7, idempotencyKey: 'abc-123' },
    gateway as any,
    client
  );

  assert.equal(first.paymentId, second.paymentId);
  assert.equal(first.ticketId, second.ticketId);
  assert.equal(second.replayed, true);
  // ไม่มีการสร้าง ticket / payment / เรียก gateway เพิ่ม
  assert.equal(state.calls.ticketCreate, 1);
  assert.equal(state.calls.paymentCreate, 1);
  assert.equal(gateway.calls.length, 1);
});

test('double click without idempotency key replays the recent pending payment', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();

  const first = await TicketService.purchase({ uid: 7 }, gateway as any, client);
  const second = await TicketService.purchase({ uid: 7 }, gateway as any, client);

  assert.equal(first.paymentId, second.paymentId);
  assert.equal(second.replayed, true);
  assert.equal(state.calls.ticketCreate, 1);
  assert.equal(gateway.calls.length, 1);
});

test('gateway failure marks the payment FAILED and never activates the ticket', async () => {
  const { client, state } = mockPrisma();
  const gateway = failingGateway('GATEWAY_UNAVAILABLE', true);

  await assert.rejects(
    () => TicketService.purchase({ uid: 7 }, gateway as any, client),
    (err: any) => {
      assert.equal(err.status, 503);
      assert.equal(err.code, 'GATEWAY_UNAVAILABLE');
      assert.equal(err.retryable, true);
      return true;
    }
  );

  // payment ถูกทำเครื่องหมาย FAILED, ticket ยังเป็น UNPAID
  assert.equal(state.payments[0].status, PaymentStatus.FAILED);
  assert.equal(state.tickets[0].status, TicketStatus.UNPAID);
});

test('gateway timeout surfaces 504 GATEWAY_TIMEOUT and is retryable', async () => {
  const { client, state } = mockPrisma();
  const gateway = failingGateway('GATEWAY_TIMEOUT', true);

  await assert.rejects(
    () => TicketService.purchase({ uid: 7 }, gateway as any, client),
    (err: any) => {
      assert.equal(err.status, 504);
      assert.equal(err.code, 'GATEWAY_TIMEOUT');
      assert.equal(err.retryable, true);
      return true;
    }
  );

  assert.equal(state.payments[0].status, PaymentStatus.FAILED);
  assert.equal(state.tickets[0].status, TicketStatus.UNPAID);
});

test('payment webhook activates the ticket and shifts the validity window to the paid time', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();

  const purchase = await TicketService.purchase({ uid: 7 }, gateway as any, client);
  const paidAt = new Date('2026-11-01T10:00:00.000Z');

  const result = await TicketService.confirmPayment(
    'cs_test_1',
    String(purchase.paymentId),
    paidAt,
    'succeeded',
    client
  );

  assert.equal(result.applied, true);
  assert.equal(state.payments[0].status, PaymentStatus.PAID);
  assert.equal(state.payments[0].paidAt?.toISOString(), paidAt.toISOString());
  assert.equal(state.tickets[0].status, TicketStatus.PAID);
  assert.equal(state.tickets[0].startDateTime.toISOString(), paidAt.toISOString());
  assert.equal(
    state.tickets[0].endDateTime.getTime() - state.tickets[0].startDateTime.getTime(),
    VALIDITY_HOURS * 60 * 60 * 1000
  );
  assert.equal(state.tickets[0].paymentDetail, 'cs_test_1');
});

test('duplicate webhook does not apply the payment twice', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();
  const purchase = await TicketService.purchase({ uid: 7 }, gateway as any, client);

  const first = await TicketService.confirmPayment(
    'cs_test_1',
    String(purchase.paymentId),
    new Date(),
    'succeeded',
    client
  );
  const second = await TicketService.confirmPayment(
    'cs_test_1',
    String(purchase.paymentId),
    new Date(),
    'succeeded',
    client
  );

  assert.equal(first.applied, true);
  assert.equal(second.applied, false);
  assert.equal(state.payments[0].status, PaymentStatus.PAID);
});

test('failed / expired webhook keeps the ticket unusable', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();
  const purchase = await TicketService.purchase({ uid: 7 }, gateway as any, client);

  await TicketService.confirmPayment(
    'cs_test_1',
    String(purchase.paymentId),
    undefined,
    'expired',
    client
  );

  assert.equal(state.payments[0].status, PaymentStatus.EXPIRED);
  assert.equal(state.tickets[0].status, TicketStatus.UNPAID);
});

test('controller rejects a malformed idempotency key with 400', async () => {
  const response = mockResponse();
  await TicketController.purchase(
    { user: { uid: 7 }, body: { idempotencyKey: 'bad key with spaces!!' } } as any,
    response as any
  );

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'INVALID_IDEMPOTENCY_KEY');
});

test('controller returns the purchase payload for a valid request', async () => {
  const { client } = mockPrisma();
  const originalService = TicketService.purchase;
  (TicketService as any).purchase = async () => ({
    ticketId: 501,
    paymentId: 101,
    checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
    amountSatang: PRICE_SATANG,
    currency: 'THB',
    status: PaymentStatus.PENDING,
    ticketStatus: TicketStatus.UNPAID,
    expiresAt: '2026-11-01T10:30:00.000Z',
    ticketStartDateTime: '2026-11-01T10:00:00.000Z',
    ticketEndDateTime: '2026-11-01T12:00:00.000Z',
    replayed: false,
  });

  try {
    const response = mockResponse();
    await TicketController.purchase(
      { user: { uid: 7 }, body: { idempotencyKey: 'ok-123' } } as any,
      response as any
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.ticketId, 501);
    assert.equal(response.body.data.paymentId, 101);
    assert.equal(response.body.data.checkoutUrl, 'https://checkout.stripe.com/c/pay/cs_test_1');
    assert.equal(response.body.data.amountSatang, PRICE_SATANG);
  } finally {
    (TicketService as any).purchase = originalService;
  }
});

test('purchase route is restricted to OUTSIDER role and requires a token', () => {
  const purchaseRoute = (ticketRoutes as any).stack.find(
    (layer: any) => layer.route?.path === '/purchase'
  );
  assert.ok(purchaseRoute);
  assert.equal(purchaseRoute.route.methods.post, true);
  // authenticateToken + requireRoles('OUTSIDER') + controller
  assert.equal(purchaseRoute.route.stack.length, 3);

  const myTicketsRoute = (ticketRoutes as any).stack.find(
    (layer: any) => layer.route?.path === '/my-tickets'
  );
  assert.ok(myTicketsRoute);
  assert.equal(myTicketsRoute.route.methods.get, true);

  // webhook router ต้องใช้ raw body
  const webhookRoute = (ticketWebhookRoutes as any).stack.find(
    (layer: any) => layer.route?.path === '/'
  );
  assert.ok(webhookRoute);
  assert.equal(webhookRoute.route.methods.post, true);
});

test('gateway factory fails fast when STRIPE_SECRET_KEY is missing', () => {
  const previous = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  try {
    assert.throws(
      () => getPaymentGateway(),
      (err: any) => {
        assert.equal(err.code, 'GATEWAY_NOT_CONFIGURED');
        return true;
      }
    );
  } finally {
    if (previous !== undefined) process.env.STRIPE_SECRET_KEY = previous;
  }
});
