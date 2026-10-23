import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { PaymentStatus, TicketStatus } from '@prisma/client';
import type { PaymentGatewayErrorCode } from '../services/paymentGateway.js';

/**
 * สร้างลายเซ็น Stripe แบบเดียวกับที่ Stripe ใช้จริง
 * (t=<timestamp>,v1=HMAC-SHA256(secret, "<timestamp>.<payload>"))
 */
function stripeSignature(payload: string, secret: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');
  return `t=${ts},v1=${v1}`;
}

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
const { signJwt } = await import('../utils/jwt.js');

const PRICE_SATANG = 5000; // 50.00 THB
const VALIDITY_HOURS = 2;

// ---------------------------------------------------------------------------
// Fake gateway
// ---------------------------------------------------------------------------
const GATEWAY_MIN_EXPIRY_MINUTES = 30;
const GATEWAY_MAX_EXPIRY_MINUTES = 24 * 60;

/**
 * Fake gateway ที่จำลองพฤติกรรมของ Stripe:
 * - prepareCheckoutSession จะ "ดัน" expiresAt เข้าไปในช่วงที่ gateway รองรับ
 *   (ค่าที่ได้จะถูกเก็บลง DB แล้วใช้ซ้ำตอน retry)
 * - ถ้ามีการเรียก createCheckoutSession ด้วย idempotency key เดิมแต่พารามิเตอร์ต่างกัน
 *   จะ throw เลียนแบบ Stripe (Stripe ปฏิเสธการใช้ idempotency key ซ้ำด้วยพารามิเตอร์ที่ไม่ตรงกัน)
 */
function fakeGateway(overrides: Record<string, any> = {}) {
  const calls: any[] = [];
  const byKey = new Map<string, any>();

  const gateway: any = {
    name: 'stripe',
    minCheckoutExpiryMinutes: GATEWAY_MIN_EXPIRY_MINUTES,
    maxCheckoutExpiryMinutes: GATEWAY_MAX_EXPIRY_MINUTES,
    calls,
    checkoutState: 'open' as string,
    paidAt: undefined as Date | undefined,

    prepareCheckoutSession(input: any) {
      const min = Date.now() + this.minCheckoutExpiryMinutes * 60 * 1000;
      const max = Date.now() + this.maxCheckoutExpiryMinutes * 60 * 1000;
      const target = new Date(input.expiresAt).getTime();
      return {
        ...input,
        expiresAt: new Date(Math.min(Math.max(target, min), max)),
      };
    },

    async createCheckoutSession(input: any) {
      const previous = byKey.get(input.idempotencyKey);
      if (previous) {
        // Stripe ปฏิเสธเมื่อใช้ idempotency key เดิมด้วยพารามิเตอร์ที่ต่างกัน
        const same =
          previous.amountSatang === input.amountSatang &&
          previous.currency === input.currency &&
          previous.reference === input.reference &&
          previous.description === input.description &&
          previous.expiresAt.getTime() === new Date(input.expiresAt).getTime() &&
          previous.customerEmail === input.customerEmail &&
          previous.successUrl === input.successUrl &&
          previous.cancelUrl === input.cancelUrl;
        if (!same) {
          throw new PaymentGatewayError(
            'GATEWAY_REJECTED',
            'Keys for idempotent requests can only be used with the same parameters they were first used with.',
            { retryable: false, status: 502 }
          );
        }
        calls.push(input);
        return {
          gatewayRef: `cs_existing_${calls.length}`,
          checkoutUrl: `https://checkout.stripe.com/c/pay/cs_existing_${calls.length}`,
          expiresAt: input.expiresAt,
        };
      }

      calls.push(input);
      byKey.set(input.idempotencyKey, input);
      return {
        gatewayRef: `cs_test_${calls.length}`,
        checkoutUrl: `https://checkout.stripe.com/c/pay/cs_test_${calls.length}`,
        expiresAt: input.expiresAt,
      };
    },

    async retrieveCheckoutStatus() {
      return {
        state: gateway.checkoutState,
        amountSatang: PRICE_SATANG,
        currency: 'THB',
        reference: undefined,
        paidAt: gateway.paidAt,
        raw: {},
      };
    },

    async parseWebhookEvent() {
      return {
        type: 'payment.unknown',
        gatewayRef: '',
        paymentState: 'unknown',
        raw: {},
      };
    },
  };

  return Object.assign(gateway, overrides);
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
function mockPrisma(options: { user?: any; config?: any; payments?: any[] } = {}) {
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
    calls: { ticketCreate: 0, paymentCreate: 0 },
    // ใช้จำลองการเขียน payload ล้มเหลว เพื่อทดสอบว่า transaction rollback หมด
    failPayloadWrite: false,
    // ใช้จำลอง unique violation
    throwP2002OnCreate: false,
  };

  const violatesUnique = (data: any) => {
    if (!state.throwP2002OnCreate) return false;
    state.throwP2002OnCreate = false;
    const error: any = new Error('Unique constraint failed');
    error.code = 'P2002';
    error.meta = { target: ['uid', 'client_key'] };
    return error;
  };

  const client: any = {
    user: {
      findUnique: async () => state.user,
    },
    systemConfig: {
      findFirst: async () => {
        if (state.config === 'THROW') {
          throw new Error('database connection lost');
        }
        return state.config;
      },
    },
    payment: {
      findUnique: async ({ where }: any) => {
        if (where?.paymentId !== undefined) {
          return state.payments.find((p) => p.paymentId === where.paymentId) ?? null;
        }
        if (where?.idempotencyKey !== undefined) {
          return state.payments.find((p) => p.idempotencyKey === where.idempotencyKey) ?? null;
        }
        if (where?.uid !== undefined && where?.clientKey !== undefined) {
          return (
            state.payments.find((p) => p.uid === where.uid && p.clientKey === where.clientKey) ??
            null
          );
        }
        return null;
      },
      findFirst: async ({ where }: any) => {
        const list = state.payments
          .filter((p) => {
            if (where.uid !== undefined && p.uid !== where.uid) return false;
            if (where.clientKey !== undefined && p.clientKey !== where.clientKey) return false;
            if (where.status?.in && !where.status.in.includes(p.status)) return false;
            return true;
          })
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return list[0] ?? null;
      },
      create: async ({ data }: any) => {
        state.calls.paymentCreate++;
        const violation = violatesUnique(data);
        if (violation) throw violation;

        // emulate openUid unique: ไม่มีผู้ใช้คนนี้มีรายการที่เปิดอยู่พร้อมกัน
        const hasOpen = state.payments.some(
          (p) =>
            p.uid === data.uid &&
            (p.status === PaymentStatus.PENDING || p.status === PaymentStatus.UNCONFIRMED)
        );
        if (data.openUid !== null && data.openUid !== undefined && hasOpen) {
          const error: any = new Error('Unique constraint failed');
          error.code = 'P2002';
          error.meta = { target: ['open_uid'] };
          throw error;
        }

        const payment = {
          paymentId: state.nextPaymentId++,
          gatewayRef: null,
          checkoutUrl: null,
          paidAt: null,
          openUid: data.openUid ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.payments.push(payment);
        return payment;
      },
      update: async ({ where, data }: any) => {
        const payment = state.payments.find((p) => p.paymentId === where.paymentId);
        if (!payment) throw new Error('payment not found');
        applyData(payment, data);
        return payment;
      },
      updateMany: async ({ where, data }: any) => {
        const targets = state.payments.filter((p) => {
          if (where.paymentId !== undefined && p.paymentId !== where.paymentId) return false;
          if (where.status !== undefined) {
            if (where.status.in) {
              if (!where.status.in.includes(p.status)) return false;
            } else if (p.status !== where.status) {
              return false;
            }
          }
          if (where.gatewayRef !== undefined && p.gatewayRef !== where.gatewayRef) {
            return false;
          }
          return true;
        });
        targets.forEach((t) => applyData(t, data));
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
    },
    $transaction: async (callback: any) => {
      if (typeof callback !== 'function') {
        return await Promise.all(callback);
      }

      // จำลอง rollback ของ transaction จริง:
      // แต่ละ transaction ย้อนกลับเฉพาะแถวที่ตัวเองสร้าง (ไม่กระทบของ transaction อื่น)
      const createdTickets: any[] = [];
      const createdPayments: any[] = [];

      const tx = {
        ticket: {
          create: async (args: any) => {
            const ticket = await client.ticket.create(args);
            createdTickets.push(ticket);
            return ticket;
          },
          findUnique: (args: any) => client.ticket.findUnique(args),
        },
        payment: {
          create: async (args: any) => {
            const payment = await client.payment.create(args);
            createdPayments.push(payment);
            return payment;
          },
          findFirst: (args: any) => client.payment.findFirst(args),
          findUnique: (args: any) => client.payment.findUnique(args),
          update: async (args: any) => {
            if (state.failPayloadWrite) {
              const error: any = new Error('could not write the checkout payload');
              error.code = 'P2010';
              throw error;
            }
            return client.payment.update(args);
          },
          updateMany: (args: any) => client.payment.updateMany(args),
        },
      };

      try {
        return await callback(tx);
      } catch (error) {
        state.tickets = state.tickets.filter(
          (t) => !createdTickets.some((c) => c.ticketId === t.ticketId)
        );
        state.payments = state.payments.filter(
          (p) => !createdPayments.some((c) => c.paymentId === p.paymentId)
        );
        throw error;
      }
    },
  };

  return { client, state };
}

/**
 * Prisma จะข้าม field ที่ค่าเป็น undefined (แปลว่า "ไม่ได้แก้") -> จำลองพฤติกรรมเดียวกัน
 */
function applyData(target: any, data: Record<string, any>) {
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      target[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Route level test helper
// ---------------------------------------------------------------------------
async function withServer(
  handler: (app: express.Express) => void,
  run: (baseUrl: string) => Promise<void>
) {
  const app = express();
  app.use(express.json());
  handler(app);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

function outsiderToken(uid = 7) {
  return signJwt({
    uid,
    email: 'visitor@example.com',
    firstname: 'Vis',
    lastname: 'Itor',
    role: 'OUTSIDER',
    userType: 'THAI',
    isProfileComplete: true,
  });
}

// ---------------------------------------------------------------------------
// Tests: happy path
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

  assert.equal(state.calls.ticketCreate, 1);
  assert.equal(state.calls.paymentCreate, 1);
  assert.equal(state.tickets[0].status, TicketStatus.UNPAID);
  assert.equal(state.payments[0].status, PaymentStatus.PENDING);
  assert.equal(state.payments[0].gatewayRef, 'cs_test_1');
  // จองช่องรายการที่เปิดอยู่ของผู้ใช้ไว้
  assert.equal(state.payments[0].openUid, 7);
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

  assert.equal(gateway.calls[0].amountSatang, 12345);
  assert.equal(gateway.calls[0].currency, 'THB');
  assert.equal(result.amountSatang, 12345);

  const windowMs =
    new Date(result.ticketEndDateTime).getTime() - new Date(result.ticketStartDateTime).getTime();
  assert.equal(windowMs, 4 * 60 * 60 * 1000);
});

test('the ticket validity window is snapshotted onto the payment at purchase time', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();

  await TicketService.purchase({ uid: 7 }, gateway as any, client);

  // ค่าที่ snapshot ไว้ จะไม่เปลี่ยนแม้ config จะถูกแก้ทีหลัง
  assert.equal(state.payments[0].ticketValidityHours, VALIDITY_HOURS);
});

test('the reference sent to the gateway is the paymentId', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();

  const result = await TicketService.purchase({ uid: 7 }, gateway as any, client);

  assert.equal(gateway.calls[0].reference, String(result.paymentId));
  assert.equal(gateway.calls[0].reference, String(state.payments[0].paymentId));
});

test('the idempotency key sent to the gateway fits the DB column', async () => {
  const { client } = mockPrisma();
  const gateway = fakeGateway();

  await TicketService.purchase({ uid: 7, idempotencyKey: 'a'.repeat(64) }, gateway as any, client);

  const key = gateway.calls[0].idempotencyKey;
  assert.ok(key.length <= 128, `idempotency key too long: ${key.length}`);
  assert.ok(key.endsWith('a'.repeat(64)));
});

test('the client key stored in the DB fits the DB column', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();

  await TicketService.purchase({ uid: 7, idempotencyKey: 'b'.repeat(64) }, gateway as any, client);

  assert.equal(state.payments[0].clientKey.length, 64);
});

// ---------------------------------------------------------------------------
// Tests: authorization & validation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests: config failures must NOT fall back to a default price
// ---------------------------------------------------------------------------

test('fails with 503 CONFIG_UNAVAILABLE when the config query errors (no fallback price)', async () => {
  const { client, state } = mockPrisma({ config: 'THROW' as any });
  const gateway = fakeGateway();

  await assert.rejects(
    () => TicketService.purchase({ uid: 7 }, gateway as any, client),
    (err: any) => {
      assert.equal(err.status, 503);
      assert.equal(err.code, 'CONFIG_UNAVAILABLE');
      return true;
    }
  );

  // ไม่มีการสร้าง ticket / payment / เรียก gateway เลย
  assert.equal(state.calls.ticketCreate, 0);
  assert.equal(state.calls.paymentCreate, 0);
  assert.equal(gateway.calls.length, 0);
});

test('fails with 503 CONFIG_UNAVAILABLE when no config row exists (no fallback price)', async () => {
  const { client, state } = mockPrisma({ config: null });
  const gateway = fakeGateway();

  await assert.rejects(
    () => TicketService.purchase({ uid: 7 }, gateway as any, client),
    (err: any) => {
      assert.equal(err.status, 503);
      assert.equal(err.code, 'CONFIG_UNAVAILABLE');
      return true;
    }
  );

  assert.equal(state.calls.paymentCreate, 0);
  assert.equal(gateway.calls.length, 0);
});

test('fails with 503 INVALID_TICKET_PRICE when the configured price is invalid', async () => {
  const { client } = mockPrisma({
    config: {
      ticketPriceSatang: 0,
      ticketValidityHours: VALIDITY_HOURS,
      paymentCheckoutExpiryMinutes: 30,
    },
  });
  const gateway = fakeGateway();

  await assert.rejects(
    () => TicketService.purchase({ uid: 7 }, gateway as any, client),
    (err: any) => {
      assert.equal(err.status, 503);
      assert.equal(err.code, 'INVALID_TICKET_PRICE');
      return true;
    }
  );

  assert.equal(gateway.calls.length, 0);
});

// ---------------------------------------------------------------------------
// Tests: duplicate prevention
// ---------------------------------------------------------------------------

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
  assert.equal(state.calls.ticketCreate, 1);
  assert.equal(state.calls.paymentCreate, 1);
  assert.equal(gateway.calls.length, 1);
});

test('double click without idempotency key replays the open payment', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();

  const first = await TicketService.purchase({ uid: 7 }, gateway as any, client);
  const second = await TicketService.purchase({ uid: 7 }, gateway as any, client);

  assert.equal(first.paymentId, second.paymentId);
  assert.equal(second.replayed, true);
  assert.equal(state.calls.ticketCreate, 1);
  assert.equal(gateway.calls.length, 1);
});

test('a second purchase is blocked while the first one is still open', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();

  await TicketService.purchase({ uid: 7 }, gateway as any, client);
  // คนละ key แต่ผู้ใช้ยังมีรายการที่เปิดอยู่ -> ต้องได้รายการเดิม
  const second = await TicketService.purchase(
    { uid: 7, idempotencyKey: 'different-key' },
    gateway as any,
    client
  );

  assert.equal(second.replayed, true);
  assert.equal(state.calls.paymentCreate, 1);
  assert.equal(gateway.calls.length, 1);
});

test('P2002 from a concurrent insert is handled and replays the winning record', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();

  // จำลองว่า request อีกตัวชน unique constraint ตอน insert
  state.throwP2002OnCreate = true;
  // ...แต่มีรายการที่ชนะอยู่แล้วใน DB (สร้างไว้ล่วงหน้า)
  state.payments.push({
    paymentId: 999,
    uid: 7,
    clientKey: 'raced-key',
    idempotencyKey: 'user_7_raced-key',
    ticketId: 501,
    amountSatang: PRICE_SATANG,
    currency: 'THB',
    status: PaymentStatus.PENDING,
    gateway: 'stripe',
    gatewayRef: 'cs_existing',
    checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_existing',
    openUid: 7,
    ticketValidityHours: VALIDITY_HOURS,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    paidAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const result = await TicketService.purchase(
    { uid: 7, idempotencyKey: 'raced-key' },
    gateway as any,
    client
  );

  assert.equal(result.paymentId, 999);
  assert.equal(result.replayed, true);
  assert.equal(result.checkoutUrl, 'https://checkout.stripe.com/c/pay/cs_existing');
});

test('concurrent purchases with the same key only create one payment', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();

  const results = await Promise.allSettled([
    TicketService.purchase({ uid: 7, idempotencyKey: 'same-key' }, gateway as any, client),
    TicketService.purchase({ uid: 7, idempotencyKey: 'same-key' }, gateway as any, client),
  ]);

  // คำขอแรกได้รายการ คำขอที่สองอาจได้ replay หรือได้ 409 ตอนรายการเดิมยังอยู่ระหว่างเรียก gateway
  // (ทั้งสองกรณีต้องชี้ไปที่ payment เดียวกัน)
  const paymentIds = results.map((r) =>
    r.status === 'fulfilled' ? r.value.paymentId : (r.reason as any)?.paymentId
  );
  assert.ok(paymentIds[0], 'the first request must return a payment id');
  assert.equal(paymentIds[0], paymentIds[1], 'both requests must point at the same payment');

  // เทสต์นี้ผ่านแล้ว ต้องมี payment และ ticket เพียงอันเดียว
  assert.equal(state.payments.length, 1);
  assert.equal(state.tickets.length, 1);
});

// ---------------------------------------------------------------------------
// Tests: gateway failure handling
// ---------------------------------------------------------------------------

test('a definitive gateway rejection marks the payment FAILED and frees the open slot', async () => {
  const { client, state } = mockPrisma();
  const gateway = failingGateway('GATEWAY_REJECTED', false);

  await assert.rejects(
    () => TicketService.purchase({ uid: 7 }, gateway as any, client),
    (err: any) => {
      assert.equal(err.status, 502);
      assert.equal(err.code, 'GATEWAY_REJECTED');
      return true;
    }
  );

  assert.equal(state.payments[0].status, PaymentStatus.FAILED);
  // ไม่มี checkout ค้าง -> ปล่อยช่องให้ซื้อใหม่ได้
  assert.equal(state.payments[0].openUid, null);
  assert.equal(state.tickets[0].status, TicketStatus.UNPAID);
});

test('a gateway timeout keeps the payment UNCONFIRMED (never FAILED)', async () => {
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

  // gateway อาจสร้าง checkout สำเร็จแล้ว -> ห้ามตัดเป็น FAILED
  assert.equal(state.payments[0].status, PaymentStatus.UNCONFIRMED);
  // ยังค้องช่องไว้ ห้ามให้ซื้อใหม่จนกว่าจะ reconcile
  assert.equal(state.payments[0].openUid, 7);
  assert.equal(state.tickets[0].status, TicketStatus.UNPAID);
});

test('a retry after timeout reconciles the original payment instead of creating a new one', async () => {
  const { client, state } = mockPrisma();

  // ครั้งแรก timeout -> เก็บเป็น UNCONFIRMED
  const failing = failingGateway('GATEWAY_TIMEOUT', true);
  await assert.rejects(() =>
    TicketService.purchase({ uid: 7, idempotencyKey: 'retry-key' }, failing as any, client)
  );
  assert.equal(state.payments[0].status, PaymentStatus.UNCONFIRMED);

  // ครั้งที่สอง gateway ทำงานได้ -> ต้องกู้รายการเดิม ไม่ใช่สร้างใหม่
  const working = fakeGateway();
  const result = await TicketService.purchase(
    { uid: 7, idempotencyKey: 'retry-key' },
    working as any,
    client
  );

  assert.equal(result.paymentId, state.payments[0].paymentId);
  assert.equal(state.payments.length, 1);
  assert.equal(state.tickets.length, 1);
  assert.equal(state.payments[0].status, PaymentStatus.PENDING);
  // เรียก gateway ด้วย idempotency key เดิม เพื่อให้ gateway คืน session เดิม
  assert.equal(working.calls[0].idempotencyKey, state.payments[0].idempotencyKey);
  assert.ok(result.checkoutUrl);
});

test('a checkout the gateway reports as expired is closed and a new purchase is allowed', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();
  gateway.checkoutState = 'expired';

  const past = new Date(Date.now() - 60 * 1000);
  state.payments.push({
    paymentId: 800,
    uid: 7,
    clientKey: 'old-key',
    idempotencyKey: 'user_7_old-key',
    ticketId: 502,
    amountSatang: PRICE_SATANG,
    currency: 'THB',
    status: PaymentStatus.PENDING,
    gateway: 'stripe',
    gatewayRef: 'cs_old',
    checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_old',
    checkoutPayload: null,
    openUid: 7,
    ticketValidityHours: VALIDITY_HOURS,
    expiresAt: past,
    paidAt: null,
    createdAt: past,
    updatedAt: past,
  });

  const result = await TicketService.purchase(
    { uid: 7, idempotencyKey: 'fresh-key' },
    gateway as any,
    client
  );

  assert.notEqual(result.paymentId, 800);
  assert.equal(result.replayed, false);
  assert.equal(state.payments[0].status, PaymentStatus.EXPIRED);
  assert.equal(state.payments[0].openUid, null);
});

test('an unconfirmed payment blocks a new purchase with 409 PAYMENT_AWAITING_CONFIRMATION', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();

  // สร้างรายการ UNCONFIRMED ที่ยังกู้ไม่ได้
  state.payments.push({
    paymentId: 801,
    uid: 7,
    clientKey: 'stuck',
    idempotencyKey: 'user_7_stuck',
    ticketId: 503,
    amountSatang: PRICE_SATANG,
    currency: 'THB',
    status: PaymentStatus.UNCONFIRMED,
    gateway: 'stripe',
    gatewayRef: null,
    checkoutUrl: null,
    openUid: 7,
    ticketValidityHours: VALIDITY_HOURS,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    paidAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // gateway ล้มเหลวตอนพยายามกู้ -> ยังกู้ไม่ได้
  const broken = failingGateway('GATEWAY_UNAVAILABLE', true);

  await assert.rejects(
    () => TicketService.purchase({ uid: 7, idempotencyKey: 'another-key' }, broken as any, client),
    (err: any) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'PAYMENT_AWAITING_CONFIRMATION');
      return true;
    }
  );

  assert.equal(state.payments.length, 1);
  assert.equal(state.tickets.length, 0);
});

// ---------------------------------------------------------------------------
// Regression: [1] recovery must reuse the exact same checkout payload
// ---------------------------------------------------------------------------

test('recovery after a timeout reuses the identical payload and the identical key', async () => {
  const { client, state } = mockPrisma();

  // ครั้งแรก: gateway สร้าง session สำเร็จ แต่ response ของเรา timeout
  const timingOut = fakeGateway();
  timingOut.createCheckoutSession = async (input: any) => {
    timingOut.calls.push(input);
    throw new PaymentGatewayError('GATEWAY_TIMEOUT', 'timed out after creating session', {
      retryable: true,
      status: 504,
    });
  };

  await assert.rejects(() =>
    TicketService.purchase({ uid: 7, idempotencyKey: 'payload-key' }, timingOut as any, client)
  );

  assert.equal(state.payments[0].status, PaymentStatus.UNCONFIRMED);
  // payload ต้องถูกเก็บไว้ก่อนเรียก gateway
  assert.ok(state.payments[0].checkoutPayload, 'checkout payload must be stored on the record');

  const storedPayload = JSON.parse(state.payments[0].checkoutPayload);

  // ครั้งที่สอง: gateway ทำงานได้ -> ต้องกู้รายการเดิมด้วย payload ชุดเดิม
  const working = fakeGateway();
  const result = await TicketService.purchase(
    { uid: 7, idempotencyKey: 'payload-key' },
    working as any,
    client
  );

  assert.equal(result.paymentId, state.payments[0].paymentId);
  assert.equal(state.payments.length, 1);
  assert.equal(state.tickets.length, 1);

  // พารามิเตอร์ที่ส่งในการกู้ต้องตรงกับที่เก็บไว้ทุกค่า
  assert.equal(working.calls.length, 1);
  const recoveryCall = working.calls[0];

  assert.equal(recoveryCall.idempotencyKey, storedPayload.idempotencyKey);
  assert.equal(recoveryCall.amountSatang, storedPayload.amountSatang);
  assert.equal(recoveryCall.currency, storedPayload.currency);
  assert.equal(recoveryCall.reference, storedPayload.reference);
  assert.equal(recoveryCall.description, storedPayload.description);
  assert.equal(recoveryCall.expiresAt.getTime(), new Date(storedPayload.expiresAt).getTime());
  assert.equal(recoveryCall.customerEmail, storedPayload.customerEmail);
  assert.equal(recoveryCall.successUrl, storedPayload.successUrl);
  assert.equal(recoveryCall.cancelUrl, storedPayload.cancelUrl);

  // reference ต้องเป็น paymentId จริง
  assert.equal(recoveryCall.reference, String(state.payments[0].paymentId));
});

test('the checkout payload keeps the customer email and the redirect urls', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();

  process.env.TICKET_CHECKOUT_SUCCESS_URL = 'http://localhost:3000/tickets/success';
  process.env.TICKET_CHECKOUT_CANCEL_URL = 'http://localhost:3000/tickets/cancel';

  try {
    await TicketService.purchase({ uid: 7 }, gateway as any, client);

    const stored = JSON.parse(state.payments[0].checkoutPayload);
    assert.equal(stored.customerEmail, 'visitor@example.com');
    assert.equal(stored.successUrl, 'http://localhost:3000/tickets/success');
    assert.equal(stored.cancelUrl, 'http://localhost:3000/tickets/cancel');
  } finally {
    delete process.env.TICKET_CHECKOUT_SUCCESS_URL;
    delete process.env.TICKET_CHECKOUT_CANCEL_URL;
  }
});

// ---------------------------------------------------------------------------
// Regression: [2] the gateway decides when a record may be closed
// ---------------------------------------------------------------------------

test('a checkout expiry outside the range supported by the gateway is rejected', async () => {
  const { client, state } = mockPrisma({
    config: {
      ticketPriceSatang: PRICE_SATANG,
      ticketValidityHours: VALIDITY_HOURS,
      // Stripe บังคับขั้นต่ำ 30 นาที -> ค่านี้อยู่นอกช่วง
      paymentCheckoutExpiryMinutes: 1,
    },
  });
  const gateway = fakeGateway();

  await assert.rejects(
    () => TicketService.purchase({ uid: 7 }, gateway as any, client),
    (err: any) => {
      assert.equal(err.status, 503);
      assert.equal(err.code, 'INVALID_CHECKOUT_EXPIRY');
      return true;
    }
  );

  assert.equal(state.calls.paymentCreate, 0);
  assert.equal(gateway.calls.length, 0);
});

test('a checkout expiry above the range supported by the gateway is rejected', async () => {
  const { client, state } = mockPrisma({
    config: {
      ticketPriceSatang: PRICE_SATANG,
      ticketValidityHours: VALIDITY_HOURS,
      paymentCheckoutExpiryMinutes: GATEWAY_MAX_EXPIRY_MINUTES + 1,
    },
  });
  const gateway = fakeGateway();

  await assert.rejects(
    () => TicketService.purchase({ uid: 7 }, gateway as any, client),
    (err: any) => {
      assert.equal(err.status, 503);
      assert.equal(err.code, 'INVALID_CHECKOUT_EXPIRY');
      return true;
    }
  );

  assert.equal(state.calls.paymentCreate, 0);
});

test('a checkout the gateway still reports as open is never closed by the database clock', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();
  gateway.checkoutState = 'open';

  // เวลาฝั่ง DB ผ่านไปแล้ว แต่ checkout ที่ gateway สร้างยังเปิดอยู่
  const past = new Date(Date.now() - 60 * 1000);
  state.payments.push({
    paymentId: 810,
    uid: 7,
    clientKey: 'still-open',
    idempotencyKey: 'user_7_still-open',
    ticketId: 510,
    amountSatang: PRICE_SATANG,
    currency: 'THB',
    status: PaymentStatus.PENDING,
    gateway: 'stripe',
    gatewayRef: 'cs_still_open',
    checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_still_open',
    checkoutPayload: null,
    openUid: 7,
    ticketValidityHours: VALIDITY_HOURS,
    expiresAt: past,
    paidAt: null,
    createdAt: past,
    updatedAt: past,
  });

  const result = await TicketService.purchase(
    { uid: 7, idempotencyKey: 'another-key' },
    gateway as any,
    client
  );

  // ต้องคืนรายการเดิม ไม่ใช่สร้าง checkout ใหม่
  assert.equal(result.paymentId, 810);
  assert.equal(result.replayed, true);
  assert.equal(state.payments.length, 1);
  assert.equal(state.tickets.length, 0);
  assert.equal(state.payments[0].status, PaymentStatus.PENDING);
  assert.equal(state.payments[0].openUid, 7);
});

test('a checkout the gateway cannot confirm keeps the record open', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();
  gateway.checkoutState = 'unknown';

  const past = new Date(Date.now() - 60 * 1000);
  state.payments.push({
    paymentId: 811,
    uid: 7,
    clientKey: 'cannot-confirm',
    idempotencyKey: 'user_7_cannot-confirm',
    ticketId: 511,
    amountSatang: PRICE_SATANG,
    currency: 'THB',
    status: PaymentStatus.UNCONFIRMED,
    gateway: 'stripe',
    gatewayRef: 'cs_unknown',
    checkoutUrl: null,
    checkoutPayload: null,
    openUid: 7,
    ticketValidityHours: VALIDITY_HOURS,
    expiresAt: past,
    paidAt: null,
    createdAt: past,
    updatedAt: past,
  });

  await assert.rejects(
    () =>
      TicketService.purchase({ uid: 7, idempotencyKey: 'yet-another-key' }, gateway as any, client),
    (err: any) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'PAYMENT_AWAITING_CONFIRMATION');
      return true;
    }
  );

  // ต้องไม่มีการสร้างรายการใหม่
  assert.equal(state.payments.length, 1);
  assert.equal(state.tickets.length, 0);
  assert.equal(state.payments[0].status, PaymentStatus.UNCONFIRMED);
  assert.equal(state.payments[0].openUid, 7);
});

test('a checkout the gateway never created is closed so a new purchase is possible', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();
  gateway.checkoutState = 'not_found';

  const past = new Date(Date.now() - 60 * 1000);
  state.payments.push({
    paymentId: 812,
    uid: 7,
    clientKey: 'never-created',
    idempotencyKey: 'user_7_never-created',
    ticketId: 512,
    amountSatang: PRICE_SATANG,
    currency: 'THB',
    status: PaymentStatus.UNCONFIRMED,
    gateway: 'stripe',
    gatewayRef: 'cs_missing',
    checkoutUrl: null,
    checkoutPayload: null,
    openUid: 7,
    ticketValidityHours: VALIDITY_HOURS,
    expiresAt: past,
    paidAt: null,
    createdAt: past,
    updatedAt: past,
  });

  const result = await TicketService.purchase(
    { uid: 7, idempotencyKey: 'brand-new-key' },
    gateway as any,
    client
  );

  assert.notEqual(result.paymentId, 812);
  assert.equal(result.replayed, false);
  assert.equal(state.payments[0].status, PaymentStatus.EXPIRED);
  assert.equal(state.payments[0].openUid, null);
});

test('a checkout the gateway reports as paid is recorded as paid for US6-3 to activate', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();
  gateway.checkoutState = 'paid';
  gateway.paidAt = new Date('2026-10-22T10:00:00.000Z');

  const past = new Date(Date.now() - 60 * 1000);
  state.payments.push({
    paymentId: 813,
    uid: 7,
    clientKey: 'already-paid',
    idempotencyKey: 'user_7_already-paid',
    ticketId: 513,
    amountSatang: PRICE_SATANG,
    currency: 'THB',
    status: PaymentStatus.UNCONFIRMED,
    gateway: 'stripe',
    gatewayRef: 'cs_paid',
    checkoutUrl: null,
    checkoutPayload: null,
    openUid: 7,
    ticketValidityHours: VALIDITY_HOURS,
    expiresAt: past,
    paidAt: null,
    createdAt: past,
    updatedAt: past,
  });

  const result = await TicketService.purchase(
    { uid: 7, idempotencyKey: 'paid-key' },
    gateway as any,
    client
  );

  assert.equal(result.paymentId, 813);
  assert.equal(state.payments[0].status, PaymentStatus.PAID);
  assert.equal(state.payments[0].paidAt?.toISOString(), '2026-10-22T10:00:00.000Z');
  assert.equal(state.payments[0].openUid, null);
  // ตั๋วยังไม่ถูกเปิดใช้ -> เป็นหน้าที่ของ US6-3
  assert.equal(state.tickets[0]?.status, undefined);
});

// ---------------------------------------------------------------------------
// Regression: [4] paidAt must never fall back to the session / intent creation time
// ---------------------------------------------------------------------------

test('the adapter does not use payment_intent.created as the paid time', async () => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

  const { StripePaymentGateway } = await import('../services/stripePaymentGateway.js');
  const gateway = new StripePaymentGateway({
    secretKey: 'sk_test_fake',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  });

  const intentCreated = 1_700_000_000;
  const payload = JSON.stringify({
    id: 'evt_test',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test',
        payment_status: 'paid',
        amount_total: PRICE_SATANG,
        currency: 'thb',
        metadata: { reference: '123' },
        // payment intent สำเร็จ แต่ latest_charge มีแค่ id (ยังไม่ได้ expand)
        payment_intent: {
          id: 'pi_test',
          created: intentCreated,
          status: 'succeeded',
          latest_charge: 'ch_test_only_an_id',
        },
      },
    },
  });

  const signature = stripeSignature(payload, process.env.STRIPE_WEBHOOK_SECRET!);
  const event = await gateway.parseWebhookEvent(Buffer.from(payload), signature);

  // ต้องรู้ว่าจ่ายสำเร็จ แต่ห้ามคืนเวลาสร้าง PaymentIntent
  assert.equal(event.type, 'payment.succeeded');
  assert.equal(event.paymentState, 'paid');
  assert.equal(event.paidAt, undefined, 'must not fall back to payment_intent.created');
});

test('the adapter uses the charge timestamp when the charge is expanded', async () => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

  const { StripePaymentGateway } = await import('../services/stripePaymentGateway.js');
  const gateway = new StripePaymentGateway({
    secretKey: 'sk_test_fake',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  });

  const chargeCreated = 1_700_000_500;
  const payload = JSON.stringify({
    id: 'evt_test',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test',
        payment_status: 'paid',
        amount_total: PRICE_SATANG,
        currency: 'thb',
        metadata: { reference: '123' },
        payment_intent: {
          id: 'pi_test',
          created: 1_700_000_000,
          status: 'succeeded',
          latest_charge: { id: 'ch_test', created: chargeCreated },
        },
      },
    },
  });

  const signature = stripeSignature(payload, process.env.STRIPE_WEBHOOK_SECRET!);
  const event = await gateway.parseWebhookEvent(Buffer.from(payload), signature);

  assert.equal(event.type, 'payment.succeeded');
  assert.equal(event.paidAt?.getTime(), chargeCreated * 1000);
});

test('a completed session that is not paid is not reported as a successful payment', async () => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

  const { StripePaymentGateway } = await import('../services/stripePaymentGateway.js');
  const gateway = new StripePaymentGateway({
    secretKey: 'sk_test_fake',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  });

  const payload = JSON.stringify({
    id: 'evt_test',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test',
        payment_status: 'unpaid',
        amount_total: PRICE_SATANG,
        currency: 'thb',
        metadata: { reference: '123' },
      },
    },
  });

  const signature = stripeSignature(payload, process.env.STRIPE_WEBHOOK_SECRET!);
  const event = await gateway.parseWebhookEvent(Buffer.from(payload), signature);

  // session.completed ไม่ได้แปลว่าจ่ายสำเร็จเสมอ
  assert.equal(event.type, 'payment.unknown');
  assert.equal(event.paymentState, 'unpaid');
});

// ---------------------------------------------------------------------------
// Regression: [1] the real Stripe adapter must not re-clamp the expiry
// ---------------------------------------------------------------------------

/**
 * Mock เฉพาะ Stripe SDK (ใช้ StripePaymentGateway ตัวจริง)
 * - จำลอง response timeout ครั้งแรก (สร้าง session ไปแล้วแต่ตอบกลับไม่ถึง)
 * - ครั้งถัดไปคืน session เดิม (เหมือน Stripe ที่เก็บผลลัพธ์ของ idempotency key)
 */
function mockStripeSdk(options: { timeoutOnFirstCall?: boolean } = {}) {
  const createCalls: any[] = [];
  const sessions = new Map<string, any>();
  let callCount = 0;

  return {
    createCalls,
    client: {
      checkout: {
        sessions: {
          async create(params: any, opts?: any) {
            callCount++;
            createCalls.push({ params, opts });

            const key = opts?.idempotencyKey;
            if (sessions.has(key)) {
              return sessions.get(key);
            }

            const session = {
              id: 'cs_test_1',
              url: 'https://checkout.stripe.com/c/pay/cs_test_1',
              expires_at: params.expires_at,
            };
            sessions.set(key, session);

            if (options.timeoutOnFirstCall && callCount === 1) {
              const error: any = new Error('Request aborted due to timeout being reached');
              error.type = 'StripeTimeoutError';
              throw error;
            }

            return session;
          },
          async retrieve() {
            return { id: 'cs_test_1', status: 'open', payment_status: 'unpaid' };
          },
        },
      },
      webhooks: {
        constructEvent() {
          throw new Error('not used in this test');
        },
      },
    } as any,
  };
}

test('the Stripe adapter sends the same expiry on a retry after a timeout', async () => {
  const { StripePaymentGateway } = await import('../services/stripePaymentGateway.js');
  const sdk = mockStripeSdk({ timeoutOnFirstCall: true });
  const gateway = new StripePaymentGateway({ secretKey: 'sk_test_fake', client: sdk.client });

  const baseInput = {
    amountSatang: PRICE_SATANG,
    currency: 'THB',
    reference: '555',
    description: 'CU LibSpace visitor ticket (7)',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    idempotencyKey: 'user_7_same-key',
    customerEmail: 'visitor@example.com',
    successUrl: 'http://localhost:3000/tickets/success',
    cancelUrl: 'http://localhost:3000/tickets/cancel',
  };

  // ครั้งแรก: prepare แล้วเรียก -> timeout
  const prepared = gateway.prepareCheckoutSession(baseInput);
  await assert.rejects(
    () => gateway.createCheckoutSession(prepared),
    (err: any) => {
      assert.equal(err.code, 'GATEWAY_TIMEOUT');
      return true;
    }
  );

  // เลื่อนเวลาไป 2 วินาที (จำลองเวลาผ่านไประหว่างรอ)
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // ครั้งที่สอง: ใช้ payload ชุดเดิม (ไม่ผ่าน prepare ซ้ำ) -> ต้องได้ session เดิม
  const recovered = await gateway.createCheckoutSession(prepared);

  assert.equal(recovered.gatewayRef, 'cs_test_1');
  assert.equal(sdk.createCalls.length, 2);

  // payload ที่ส่งเข้า SDK ต้องตรงกันทุกค่า
  const first = sdk.createCalls[0];
  const second = sdk.createCalls[1];

  assert.deepEqual(second.params, first.params);
  assert.equal(second.opts.idempotencyKey, first.opts.idempotencyKey);
  assert.equal(second.params.expires_at, first.params.expires_at);
  assert.equal(second.params.customer_email, first.params.customer_email);
  assert.equal(second.params.success_url, first.params.success_url);
  assert.equal(second.params.cancel_url, first.params.cancel_url);
  assert.equal(second.params.metadata.reference, first.params.metadata.reference);
  assert.equal(
    second.params.payment_intent_data.metadata.reference,
    first.params.metadata.reference
  );
});

test('the Stripe adapter only clamps the expiry in prepareCheckoutSession', async () => {
  const { StripePaymentGateway } = await import('../services/stripePaymentGateway.js');
  const sdk = mockStripeSdk();
  const gateway = new StripePaymentGateway({ secretKey: 'sk_test_fake', client: sdk.client });

  const requested = new Date(Date.now() + 5 * 60 * 1000); // ต่ำกว่าขั้นต่ำของ Stripe
  const prepared = gateway.prepareCheckoutSession({
    amountSatang: PRICE_SATANG,
    currency: 'THB',
    reference: '1',
    description: 'test',
    expiresAt: requested,
    idempotencyKey: 'k',
  });

  // prepare จะดันเข้าไปในช่วงที่ Stripe รองรับ
  assert.ok(prepared.expiresAt.getTime() > requested.getTime());

  // create ต้องใช้ค่าที่ prepare ทำไว้เป๊ะ ๆ ไม่ clamp ซ้ำ
  await gateway.createCheckoutSession(prepared);
  const sent = sdk.createCalls[0].params.expires_at;
  assert.equal(sent, Math.floor(prepared.expiresAt.getTime() / 1000));
});

// ---------------------------------------------------------------------------
// Regression: [2] a failed payload write must roll the whole transaction back
// ---------------------------------------------------------------------------

test('a failed payload write rolls back the ticket and the payment', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();

  state.failPayloadWrite = true;

  await assert.rejects(() => TicketService.purchase({ uid: 7 }, gateway as any, client));

  // ต้องไม่เหลือรายการใด ๆ (transaction rollback ทั้ง Ticket / Payment)
  assert.equal(state.tickets.length, 0);
  assert.equal(state.payments.length, 0);
  // และไม่มีการเรียก gateway เลย (เพราะยังไม่ได้ commit)
  assert.equal(gateway.calls.length, 0);
});

test('a request after a rolled back payload write can start a new purchase', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();

  state.failPayloadWrite = true;
  await assert.rejects(() => TicketService.purchase({ uid: 7 }, gateway as any, client));

  state.failPayloadWrite = false;
  const result = await TicketService.purchase({ uid: 7 }, gateway as any, client);

  assert.equal(result.replayed, false);
  assert.equal(state.payments.length, 1);
  assert.equal(state.tickets.length, 1);
  assert.equal(state.payments[0].openUid, 7);
  assert.ok(state.payments[0].checkoutPayload);
});

// ---------------------------------------------------------------------------
// Regression: [3] a stale response must not overwrite a finished payment
// ---------------------------------------------------------------------------

test('a late response does not overwrite a payment that was already paid', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();

  // คำขอแรก: gateway ตอบช้า เราจะปล่อย response หลังจากเขียน PAID เรียบร้อย
  let releaseFirst: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const slowGateway = fakeGateway();
  slowGateway.createCheckoutSession = async (input: any) => {
    slowGateway.calls.push(input);
    await gate;
    return {
      gatewayRef: 'cs_slow',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_slow',
      expiresAt: input.expiresAt,
    };
  };

  const firstRequest = TicketService.purchase(
    { uid: 7, idempotencyKey: 'slow-key' },
    slowGateway as any,
    client
  );

  // รอให้ transaction commit แล้วคำขอแรกค้างอยู่ที่ gateway
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(state.payments.length, 1);
  const paymentId = state.payments[0].paymentId;

  // ระหว่างนั้น webhook ของ US6-3 ยืนยันว่าจ่ายแล้ว (เขียนสถานะ Paid + ปล่อยช่อง)
  await client.payment.update({
    where: { paymentId },
    data: { status: PaymentStatus.PAID, openUid: null, paidAt: new Date() },
  });
  assert.equal(state.payments[0].status, PaymentStatus.PAID);

  // ปล่อย response ช้าของคำขอแรกออกมา
  releaseFirst!();
  await firstRequest;

  // สถานะสุดท้ายต้องยังเป็น PAID ไม่ถูกเขียนย้อนกลับเป็น PENDING
  assert.equal(state.payments[0].status, PaymentStatus.PAID);
  assert.equal(state.payments[0].openUid, null);
});

test('a late response does not wipe a checkout that was recovered meanwhile', async () => {
  const { client, state } = mockPrisma();
  const gateway = fakeGateway();

  let releaseFirst: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const slowGateway = fakeGateway();
  slowGateway.createCheckoutSession = async (input: any) => {
    slowGateway.calls.push(input);
    await gate;
    return {
      gatewayRef: 'cs_slow',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_slow',
      expiresAt: input.expiresAt,
    };
  };

  const firstRequest = TicketService.purchase(
    { uid: 7, idempotencyKey: 'recover-key' },
    slowGateway as any,
    client
  );

  await new Promise((resolve) => setTimeout(resolve, 20));
  const paymentId = state.payments[0].paymentId;

  // อีกคำขอกู้ checkout ไปแล้ว -> ต้องได้ gatewayRef + checkoutUrl
  const recovery = fakeGateway();
  recovery.createCheckoutSession = async (input: any) => ({
    gatewayRef: 'cs_recovered',
    checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_recovered',
    expiresAt: input.expiresAt,
  });

  const recovered = await TicketService.purchase(
    { uid: 7, idempotencyKey: 'recover-key' },
    recovery as any,
    client
  );
  assert.equal(recovered.paymentId, paymentId);
  assert.equal(state.payments[0].gatewayRef, 'cs_recovered');
  assert.equal(state.payments[0].checkoutUrl, 'https://checkout.stripe.com/c/pay/cs_recovered');

  // ปล่อย response ช้าของคำขอแรก -> ต้องไม่เขียนทับข้อมูลที่กู้ได้แล้ว
  releaseFirst!();
  await firstRequest;

  assert.equal(state.payments[0].gatewayRef, 'cs_recovered');
  assert.equal(state.payments[0].checkoutUrl, 'https://checkout.stripe.com/c/pay/cs_recovered');
  assert.equal(state.payments[0].status, PaymentStatus.PENDING);
});

// ---------------------------------------------------------------------------
// Tests: controller + real Express route
// ---------------------------------------------------------------------------

test('the purchase route works end-to-end through Express (no broken this binding)', async () => {
  const original = TicketService.purchase;
  const seen: any[] = [];

  (TicketService as any).purchase = async (input: any) => {
    seen.push(input);
    return {
      ticketId: 501,
      paymentId: 101,
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
      amountSatang: PRICE_SATANG,
      currency: 'THB',
      status: PaymentStatus.PENDING,
      ticketStatus: TicketStatus.UNPAID,
      expiresAt: '2026-10-21T18:00:00.000Z',
      ticketStartDateTime: '2026-10-21T17:30:00.000Z',
      ticketEndDateTime: '2026-10-21T19:30:00.000Z',
      replayed: false,
    };
  };

  try {
    await withServer(
      (app) => {
        app.use('/api/tickets', ticketRoutes);
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/tickets/purchase`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${outsiderToken()}`,
          },
          body: JSON.stringify({ idempotencyKey: 'route-test-1' }),
        });

        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.equal(body.data.ticketId, 501);
        assert.equal(body.data.paymentId, 101);
        assert.equal(body.data.checkoutUrl, 'https://checkout.stripe.com/c/pay/cs_test_1');
        assert.equal(seen.length, 1);
        assert.equal(seen[0].idempotencyKey, 'route-test-1');
      }
    );
  } finally {
    (TicketService as any).purchase = original;
  }
});

test('the purchase route rejects a malformed idempotency key through Express', async () => {
  await withServer(
    (app) => {
      app.use('/api/tickets', ticketRoutes);
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/tickets/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${outsiderToken()}`,
        },
        body: JSON.stringify({ idempotencyKey: 'bad key with spaces!!' }),
      });

      const body = await response.json();

      assert.equal(response.status, 400);
      assert.equal(body.success, false);
      assert.equal(body.code, 'INVALID_IDEMPOTENCY_KEY');
    }
  );
});

test('the purchase route rejects an over-long idempotency key through Express', async () => {
  await withServer(
    (app) => {
      app.use('/api/tickets', ticketRoutes);
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/tickets/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${outsiderToken()}`,
        },
        body: JSON.stringify({ idempotencyKey: 'x'.repeat(65) }),
      });

      const body = await response.json();

      assert.equal(response.status, 400);
      assert.equal(body.code, 'INVALID_IDEMPOTENCY_KEY');
    }
  );
});

test('the purchase route rejects a missing token with 401', async () => {
  await withServer(
    (app) => {
      app.use('/api/tickets', ticketRoutes);
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/tickets/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.equal(response.status, 401);
    }
  );
});

test('the purchase route rejects a non-outsider with 403', async () => {
  const studentToken = signJwt({
    uid: 3,
    email: 'student@chula.ac.th',
    firstname: 'Stu',
    lastname: 'Dent',
    role: 'STUDENT',
    userType: 'UNIVERSITY',
    isProfileComplete: true,
  });

  await withServer(
    (app) => {
      app.use('/api/tickets', ticketRoutes);
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/tickets/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({}),
      });

      assert.equal(response.status, 403);
    }
  );
});

test('ticket routes are properly mounted', () => {
  const paths = (ticketRoutes as any).stack
    .filter((layer: any) => layer.route)
    .map(
      (layer: any) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`
    );

  assert.ok(paths.includes('POST /purchase'));
  assert.ok(paths.includes('GET /my-tickets'));
  assert.ok(paths.includes('GET /:ticketId'));
});

// ---------------------------------------------------------------------------
// Tests: gateway factory
// ---------------------------------------------------------------------------

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
