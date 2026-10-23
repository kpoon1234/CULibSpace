import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import type { PaymentGateway, GatewayPaymentEvent } from '../services/paymentGateway.js';

// Never inherit the developer DB for a suite that writes payment records.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required.');
const testUrl = new URL(testDatabaseUrl);
if (
  !/^postgres(?:ql)?:$/.test(testUrl.protocol) ||
  !/_test$/i.test(decodeURIComponent(testUrl.pathname.slice(1)))
) {
  throw new Error('TEST_DATABASE_URL must be a PostgreSQL database ending in _test.');
}
if (process.env.DATABASE_URL) {
  const appUrl = new URL(process.env.DATABASE_URL);
  if (appUrl.host === testUrl.host && appUrl.pathname === testUrl.pathname)
    throw new Error('Test and application DB must differ.');
}
process.env.DATABASE_URL = testDatabaseUrl;
const { PrismaClient, PaymentStatus, TicketStatus, UserType } = await import('@prisma/client');
const { PaymentConfirmationService } = await import('../services/paymentConfirmationService.js');
const { TicketService } = await import('../services/ticketService.js');
const prisma = new PrismaClient();
const run = randomUUID();
const users: number[] = [];
const testStartedAt = Date.now();
let configId: number | undefined;
let number = 0;

function gateway(paymentId: number): PaymentGateway {
  return {
    name: 'stripe',
    minCheckoutExpiryMinutes: 30,
    maxCheckoutExpiryMinutes: 1440,
    prepareCheckoutSession: (input) => input,
    createCheckoutSession: async () => {
      throw new Error('Must not create another checkout.');
    },
    retrieveCheckoutStatus: async () => ({
      state: 'paid',
      livemode: false,
      reference: String(paymentId),
      amountSatang: 5000,
      currency: 'THB',
      raw: {},
    }),
    parseWebhookEvent: async () => {
      throw new Error('Not used.');
    },
  };
}

function event(paymentId: number, ref: string, suffix = 'same'): GatewayPaymentEvent {
  return {
    eventId: `evt_${run}_${paymentId}_${suffix}`,
    livemode: false,
    type: 'payment.succeeded',
    paymentState: 'paid',
    reference: String(paymentId),
    gatewayRef: ref,
    amountSatang: 5000,
    currency: 'thb',
    raw: {},
  };
}

async function user() {
  const row = await prisma.user.create({
    data: {
      email: `us63-${run}-${number++}@example.test`,
      firstname: 'Visitor',
      lastname: 'Test',
      isProfileComplete: true,
      userType: UserType.THAI,
      outsideUser: {
        create: {
          thaiUser: {
            create: { citizenId: String(randomInt(1_000_000_000_000, 9_999_999_999_999)) },
          },
        },
      },
    },
  });
  users.push(row.uid);
  return row;
}

async function fixture() {
  const owner = await user();
  const ticket = await prisma.ticket.create({
    data: {
      uid: owner.uid,
      status: TicketStatus.UNPAID,
      startDateTime: new Date(0),
      endDateTime: new Date(1),
    },
  });
  const key = randomUUID();
  const payment = await prisma.payment.create({
    data: {
      ticketId: ticket.ticketId,
      uid: owner.uid,
      gateway: 'stripe',
      gatewayRef: `cs_${key}`,
      amountSatang: 5000,
      currency: 'THB',
      status: PaymentStatus.PENDING,
      clientKey: key,
      idempotencyKey: key,
      openUid: owner.uid,
      ticketValidityHours: 2,
      expiresAt: new Date(Date.now() - 60_000),
    },
  });
  return {
    owner,
    ticket,
    payment,
    gateway: gateway(payment.paymentId),
    event: event(payment.paymentId, payment.gatewayRef!),
  };
}

async function assertActivated(ticketId: number, paymentId: number) {
  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { ticketId } });
  const payment = await prisma.payment.findUniqueOrThrow({ where: { paymentId } });
  assert.equal(payment.status, PaymentStatus.PAID);
  assert.equal(payment.openUid, null);
  assert.equal(ticket.status, TicketStatus.PAID);
  assert.ok(ticket.startDateTime.getTime() >= testStartedAt);
  assert.ok(ticket.startDateTime.getTime() <= Date.now());
  assert.equal(payment.paidAt?.getTime(), ticket.startDateTime.getTime());
  assert.equal(ticket.endDateTime.getTime() - ticket.startDateTime.getTime(), 2 * 3_600_000);
  // The same paid/coverage predicate used by the outside-visitor booking guard.
  assert.equal(
    await prisma.ticket.count({
      where: {
        ticketId,
        status: TicketStatus.PAID,
        startDateTime: { lte: new Date(ticket.startDateTime.getTime() + 60_000) },
        endDateTime: { gte: new Date(ticket.startDateTime.getTime() + 120_000) },
      },
    }),
    1
  );
}

try {
  if (!(await prisma.systemConfig.findFirst())) {
    configId = (
      await prisma.systemConfig.create({
        data: { ticketPriceSatang: 5000, ticketValidityHours: 2, paymentCheckoutExpiryMinutes: 30 },
      })
    ).configId;
  }

  const duplicate = await fixture();
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      PaymentConfirmationService.handleWebhook(duplicate.event, duplicate.gateway, prisma)
    )
  );
  assert.equal(results.filter((r) => r.activated).length, 1);
  assert.equal(
    await prisma.paymentWebhookEvent.count({ where: { paymentId: duplicate.payment.paymentId } }),
    1
  );
  await assertActivated(duplicate.ticket.ticketId, duplicate.payment.paymentId);
  console.log('PASS: 8 simultaneous deliveries activate once with one durable receipt.');

  const independent = await fixture();
  const independentResults = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      PaymentConfirmationService.handleWebhook(
        event(independent.payment.paymentId, independent.payment.gatewayRef!, String(i)),
        independent.gateway,
        prisma
      )
    )
  );
  assert.equal(independentResults.filter((r) => r.activated).length, 1);
  assert.equal(
    await prisma.paymentWebhookEvent.count({ where: { paymentId: independent.payment.paymentId } }),
    8
  );
  await assertActivated(independent.ticket.ticketId, independent.payment.paymentId);
  console.log('PASS: independent success events do not extend ticket validity.');

  const expired = await fixture();
  const originalStart = new Date(Date.now() - 3 * 3_600_000);
  const originalEnd = new Date(originalStart.getTime() + 2 * 3_600_000);
  await prisma.ticket.update({
    where: { ticketId: expired.ticket.ticketId },
    data: { status: TicketStatus.PAID, startDateTime: originalStart, endDateTime: originalEnd },
  });
  await prisma.payment.update({
    where: { paymentId: expired.payment.paymentId },
    data: { status: PaymentStatus.PAID, paidAt: originalStart, openUid: null },
  });
  const late = await PaymentConfirmationService.handleWebhook(
    expired.event,
    expired.gateway,
    prisma
  );
  assert.equal(late.activated, false);
  const unchanged = await prisma.ticket.findUniqueOrThrow({
    where: { ticketId: expired.ticket.ticketId },
  });
  assert.equal(unchanged.startDateTime.getTime(), originalStart.getTime());
  assert.equal(unchanged.endDateTime.getTime(), originalEnd.getTime());
  assert.equal(
    (
      await prisma.payment.findUniqueOrThrow({ where: { paymentId: expired.payment.paymentId } })
    ).paidAt?.getTime(),
    originalStart.getTime()
  );
  console.log('PASS: a late success event cannot restart an already expired PAID ticket.');

  const rollback = await fixture();
  const failing = prisma.$extends({
    query: {
      payment: {
        update: async () => {
          throw new Error('injected final payment write failure');
        },
      },
    },
  });
  await assert.rejects(
    PaymentConfirmationService.handleWebhook(
      rollback.event,
      rollback.gateway,
      failing as unknown as InstanceType<typeof PrismaClient>
    ),
    /injected/
  );
  assert.equal(
    (await prisma.ticket.findUniqueOrThrow({ where: { ticketId: rollback.ticket.ticketId } }))
      .status,
    TicketStatus.UNPAID
  );
  assert.equal(
    (await prisma.payment.findUniqueOrThrow({ where: { paymentId: rollback.payment.paymentId } }))
      .status,
    PaymentStatus.PENDING
  );
  assert.equal(
    await prisma.paymentWebhookEvent.count({ where: { paymentId: rollback.payment.paymentId } }),
    0
  );
  await PaymentConfirmationService.handleWebhook(rollback.event, rollback.gateway, prisma);
  await assertActivated(rollback.ticket.ticketId, rollback.payment.paymentId);
  console.log('PASS: real PostgreSQL rollback restores ticket/payment/receipt; retry succeeds.');

  const recovery = await fixture();
  const [delivery, replay] = await Promise.all([
    PaymentConfirmationService.handleWebhook(recovery.event, recovery.gateway, prisma),
    TicketService.purchase(
      { uid: recovery.owner.uid, idempotencyKey: recovery.payment.clientKey },
      recovery.gateway,
      prisma
    ),
  ]);
  assert.equal(delivery.handled, true);
  assert.equal(replay.ticketStatus, TicketStatus.PAID);
  await assertActivated(recovery.ticket.ticketId, recovery.payment.paymentId);
  console.log('PASS: webhook and purchase recovery can race without losing activation.');

  const legacy = await fixture();
  await prisma.payment.update({
    where: { paymentId: legacy.payment.paymentId },
    data: {
      status: PaymentStatus.PAID,
      paidAt: new Date(Date.now() - 3 * 3_600_000),
      openUid: null,
    },
  });
  await TicketService.purchase(
    { uid: legacy.owner.uid, idempotencyKey: legacy.payment.clientKey },
    legacy.gateway,
    prisma
  );
  await assertActivated(legacy.ticket.ticketId, legacy.payment.paymentId);
  console.log('PASS: legacy PAID/UNPAID repair starts a full validity window at activation.');

  // A webhook can arrive before US6-1 receives the checkout creation response.
  const earlyOwner = await user();
  let entered!: () => void;
  let release!: () => void;
  let createdPaymentId = 0;
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const resume = new Promise<void>((resolve) => {
    release = resolve;
  });
  const earlyGateway: PaymentGateway = {
    ...gateway(0),
    createCheckoutSession: async (input) => {
      createdPaymentId = Number(input.reference);
      entered();
      await resume;
      return {
        gatewayRef: `cs_early_${run}`,
        checkoutUrl: 'https://checkout.example.test/early',
        expiresAt: input.expiresAt,
      };
    },
    retrieveCheckoutStatus: async () => ({
      state: 'paid',
      livemode: false,
      reference: String(createdPaymentId),
      amountSatang: 5000,
      currency: 'THB',
      raw: {},
    }),
  };
  const purchase = TicketService.purchase(
    { uid: earlyOwner.uid, idempotencyKey: randomUUID() },
    earlyGateway,
    prisma
  );
  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => reject(new Error('Checkout fixture timed out')), 5000);
    timer.unref();
  });
  try {
    await Promise.race([reached, purchase, timeout]);
    assert.ok(createdPaymentId > 0);
    const before = await prisma.payment.findUniqueOrThrow({
      where: { paymentId: createdPaymentId },
    });
    assert.equal(before.gatewayRef, null);
    await PaymentConfirmationService.handleWebhook(
      event(createdPaymentId, `cs_early_${run}`),
      earlyGateway,
      prisma
    );
    release();
    const completed = await purchase;
    assert.equal(completed.status, PaymentStatus.PAID);
    assert.equal(completed.ticketStatus, TicketStatus.PAID);
    await assertActivated(completed.ticketId, completed.paymentId);
  } finally {
    release();
    await Promise.allSettled([purchase]);
  }
  console.log(
    'PASS: webhook before checkout response binds the reference; stale response cannot undo activation.'
  );
} finally {
  // Delete ONLY fixtures created by this run, not other test or application rows.
  await prisma.ticket.deleteMany({ where: { uid: { in: users } } });
  await prisma.user.deleteMany({ where: { uid: { in: users } } });
  if (configId) await prisma.systemConfig.delete({ where: { configId } });
  await prisma.$disconnect();
}
