import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import {
  BookingStatus,
  IssueStatus,
  PaymentStatus,
  Prisma,
  PrismaClient,
  TableStatus,
  TicketStatus,
  UserType,
  ZoneType,
} from '@prisma/client';

process.env.DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
process.env.JWT_SECRET = 'prisma-deepmerge-security-test-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_security_tests';

const require = createRequire(import.meta.url);

function parseSemver(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  assert.ok(match, `Invalid semver string: ${version}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

test('deepmerge-ts is upgraded to >= 8.0.2 to remediate SNYK-JS-DEEPMERGETS-18912249 (CVE-2026-40345)', () => {
  const entryPath = require.resolve('deepmerge-ts');
  const pkgPath = path.resolve(path.dirname(entryPath), '../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name: string; version: string };
  assert.equal(pkg.name, 'deepmerge-ts');

  const [major, minor, patch] = parseSemver(pkg.version);
  const isPatched = major > 8 || (major === 8 && (minor > 0 || (minor === 0 && patch >= 2)));
  assert.ok(
    isPatched,
    `Expected deepmerge-ts >= 8.0.2 to fix Uncontrolled Recursion, found ${pkg.version}`
  );
});

test('deepmerge handles direct self-referential objects without uncontrolled recursion', async () => {
  const { deepmerge } = (await import('deepmerge-ts')) as {
    deepmerge: (...objects: Record<string, unknown>[]) => Record<string, unknown>;
  };

  const left: Record<string, unknown> = {
    datasource: { provider: 'postgresql', timeoutMs: 5000 },
    flags: ['strict'],
  };
  left.self = left;

  const right: Record<string, unknown> = {
    datasource: { poolSize: 10 },
    flags: ['audit'],
  };
  right.self = right;

  const merged = deepmerge(left, right) as {
    datasource: { provider: string; timeoutMs: number; poolSize: number };
    flags: string[];
    self: unknown;
  };

  assert.deepEqual(merged.datasource, {
    provider: 'postgresql',
    timeoutMs: 5000,
    poolSize: 10,
  });
  assert.deepEqual(merged.flags, ['strict', 'audit']);
  assert.equal(merged.self, merged);
});

test('deepmerge and deepmergeCustom handle mutual cyclic graphs and cyclic arrays safely', async () => {
  const { deepmerge, deepmergeCustom } = (await import('deepmerge-ts')) as {
    deepmerge: (...objects: unknown[]) => any;
    deepmergeCustom: (options: Record<string, unknown>) => (...objects: unknown[]) => any;
  };

  const nodeA1: Record<string, any> = { name: 'booking', retries: 1 };
  const nodeB1: Record<string, any> = { name: 'payment', currency: 'THB' };
  nodeA1.peer = nodeB1;
  nodeB1.peer = nodeA1;

  const nodeA2: Record<string, any> = { retries: 3, active: true };
  const nodeB2: Record<string, any> = { amountSatang: 5000 };
  nodeA2.peer = nodeB2;
  nodeB2.peer = nodeA2;

  const mergedGraph = deepmerge(nodeA1, nodeA2);
  assert.equal(mergedGraph.name, 'booking');
  assert.equal(mergedGraph.retries, 3);
  assert.equal(mergedGraph.active, true);
  assert.equal(mergedGraph.peer.name, 'payment');
  assert.equal(mergedGraph.peer.currency, 'THB');
  assert.equal(mergedGraph.peer.amountSatang, 5000);
  assert.equal(mergedGraph.peer.peer, mergedGraph);

  const cyclicArr1: unknown[] = ['table-1'];
  cyclicArr1.push(cyclicArr1);
  const cyclicArr2: unknown[] = ['table-2'];
  cyclicArr2.push(cyclicArr2);

  const customMerger = deepmergeCustom({ mergeArrays: true });
  const mergedArr = customMerger({ items: cyclicArr1 }, { items: cyclicArr2 });
  assert.equal(mergedArr.items[0], 'table-1');
  assert.equal(mergedArr.items[2], 'table-2');
});

test('@prisma/config loads package.json and file config seamlessly with deepmerge-ts@8.0.2', async () => {
  const prismaConfigMod: any = await import('@prisma/config');
  assert.equal(typeof prismaConfigMod.defineConfig, 'function');
  assert.equal(typeof prismaConfigMod.loadConfigFromFile, 'function');
  assert.equal(typeof prismaConfigMod.loadConfigFromPackageJson, 'function');

  const backendRoot = path.resolve(import.meta.dirname, '../..');
  const pkgConfig = await prismaConfigMod.loadConfigFromPackageJson(backendRoot);
  assert.ok(pkgConfig);
  assert.equal(pkgConfig.config?.seed, 'tsx prisma/seed.ts');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'culibspace-prisma-cfg-'));
  try {
    const configPath = path.join(tmpDir, 'prisma.config.mjs');
    fs.writeFileSync(configPath, 'export default { schema: "prisma/schema.prisma" };\n', 'utf8');
    const fileResult = await prismaConfigMod.loadConfigFromFile({ configRoot: tmpDir });
    assert.ok(fileResult);
    assert.equal(fileResult.error, undefined);
    assert.ok(fileResult.config);
    assert.equal(fileResult.config.schema, path.resolve(tmpDir, 'prisma/schema.prisma'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Prisma Client DMMF schema and client delegates remain intact for DB, booking, and payment models', () => {
  const modelNames = new Set(Prisma.dmmf.datamodel.models.map((m) => m.name));
  const expectedModels = [
    'User',
    'UniversityUser',
    'OutsideUser',
    'ThaiUser',
    'ForeignUser',
    'Admin',
    'Zone',
    'Table',
    'Booking',
    'Ticket',
    'Payment',
    'PaymentWebhookEvent',
    'IssueReport',
    'ManageIssue',
    'ManageScore',
    'OperatingSchedule',
    'SystemConfig',
  ];
  for (const model of expectedModels) {
    assert.ok(modelNames.has(model), `Missing Prisma model in DMMF: ${model}`);
  }

  assert.equal(BookingStatus.PENDING, 'PENDING');
  assert.equal(BookingStatus.ACTIVE, 'ACTIVE');
  assert.equal(BookingStatus.COMPLETED, 'COMPLETED');
  assert.equal(BookingStatus.CANCELLED, 'CANCELLED');
  assert.equal(BookingStatus.NO_SHOW, 'NO_SHOW');
  assert.equal(TableStatus.AVAILABLE, 'AVAILABLE');
  assert.equal(TicketStatus.PAID, 'PAID');
  assert.equal(TicketStatus.UNPAID, 'UNPAID');
  assert.equal(PaymentStatus.PENDING, 'PENDING');
  assert.equal(PaymentStatus.UNCONFIRMED, 'UNCONFIRMED');
  assert.equal(PaymentStatus.PAID, 'PAID');
  assert.equal(PaymentStatus.FAILED, 'FAILED');
  assert.equal(PaymentStatus.EXPIRED, 'EXPIRED');
  assert.equal(UserType.UNIVERSITY, 'UNIVERSITY');
  assert.equal(ZoneType.SILENT, 'SILENT');
  assert.equal(IssueStatus.PENDING, 'PENDING');

  const prisma = new PrismaClient();
  assert.equal(typeof prisma.user.findUnique, 'function');
  assert.equal(typeof prisma.table.findUnique, 'function');
  assert.equal(typeof prisma.booking.create, 'function');
  assert.equal(typeof prisma.ticket.create, 'function');
  assert.equal(typeof prisma.payment.create, 'function');
  assert.equal(typeof prisma.paymentWebhookEvent.findUnique, 'function');
  assert.equal(typeof prisma.$transaction, 'function');
});

test('Booking and Payment services operate accurately with Prisma Client models', async () => {
  const { BookingService } = await import('../services/bookingService.js');
  const { ScheduleService } = await import('../services/scheduleService.js');
  const { TicketService } = await import('../services/ticketService.js');
  const { PaymentConfirmationService } = await import('../services/paymentConfirmationService.js');

  const now = new Date();
  const startDateTime = new Date(now.getTime() + 60 * 60 * 1000);
  startDateTime.setUTCMinutes(0, 0, 0);
  const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);

  const originalValidateWindow = ScheduleService.validateTargetTimeWindow;
  ScheduleService.validateTargetTimeWindow = async (targetStart, targetEnd) => ({
    targetStart,
    targetEnd,
    schedule: {
      name: 'Regular Hours',
      openTime: '00:00',
      closeTime: '23:59',
      is24Hours: true,
      isClosed: false,
      priority: 1,
    },
    config: { maxAdvanceBookingDays: 7, maxBookingDurationMinutes: 120 },
  });

  try {
    const mockBookingPrisma: any = {
      systemConfig: {
        findFirst: async () => ({
          minScoreToBook: 50,
          maxBookingDurationMinutes: 120,
          maxAdvanceBookingDays: 7,
          lateThresholdMinutes: 15,
          earlyCheckInMinutes: 15,
        }),
      },
      user: {
        findUnique: async () => ({
          uid: 10,
          firstname: 'Nida',
          lastname: 'Student',
          behaviourScore: 95,
          userType: UserType.UNIVERSITY,
          isProfileComplete: true,
        }),
      },
      table: {
        findUnique: async () => ({
          tableId: 5,
          numberOfSeat: 4,
          zoneId: 1,
          status: TableStatus.AVAILABLE,
          lockToken: null,
          lockedUntil: null,
          lockedByUid: null,
        }),
      },
      issueReport: {
        findFirst: async () => null,
      },
      booking: {
        findFirst: async () => null,
      },
    };

    const validation = await BookingService.validateBookingRules(
      {
        userId: 10,
        tableId: 5,
        startDateTime,
        endDateTime,
      },
      mockBookingPrisma
    );
    assert.equal(validation.valid, true);
    assert.equal(validation.user.uid, 10);
    assert.equal(validation.table.tableId, 5);
  } finally {
    ScheduleService.validateTargetTimeWindow = originalValidateWindow;
  }

  let storedTicket: any = null;
  let storedPayment: any = null;
  let storedWebhookReceipt: any = null;

  const mockPaymentPrisma: any = {
    user: {
      findUnique: async () => ({
        uid: 77,
        email: 'visitor@example.com',
        userType: UserType.THAI,
        isProfileComplete: true,
        outsideUser: {
          uid: 77,
          thaiUser: { uid: 77, citizenId: '1234567890123' },
          foreignUser: null,
        },
      }),
    },
    systemConfig: {
      findFirst: async () => ({
        ticketPriceSatang: 5000,
        ticketValidityHours: 2,
        paymentCheckoutExpiryMinutes: 30,
      }),
    },
    payment: {
      findFirst: async ({ where }: any) => {
        if (!storedPayment) return null;
        if (where?.uid && where?.clientKey) {
          if (storedPayment.uid === where.uid && storedPayment.clientKey === where.clientKey) {
            return { ...storedPayment, ticket: storedTicket };
          }
          return null;
        }
        if (where?.openUid && storedPayment.openUid === where.openUid) {
          return { ...storedPayment, ticket: storedTicket };
        }
        return null;
      },
      findUnique: async ({ where }: any) => {
        if (where?.paymentId && storedPayment?.paymentId === where.paymentId) {
          return { ...storedPayment, ticket: storedTicket };
        }
        if (where?.openUid && storedPayment?.openUid === where.openUid) {
          return { ...storedPayment, ticket: storedTicket };
        }
        if (where?.uq_payment_user_client_key && storedPayment) {
          const { uid, clientKey } = where.uq_payment_user_client_key;
          if (storedPayment.uid === uid && storedPayment.clientKey === clientKey) {
            return { ...storedPayment, ticket: storedTicket };
          }
        }
        return null;
      },
      create: async ({ data }: any) => {
        storedPayment = {
          paymentId: 501,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return storedPayment;
      },
      update: async ({ data }: any) => {
        storedPayment = { ...storedPayment, ...data, updatedAt: new Date() };
        return storedPayment;
      },
      updateMany: async ({ data }: any) => {
        storedPayment = { ...storedPayment, ...data, updatedAt: new Date() };
        return { count: 1 };
      },
    },
    ticket: {
      findUnique: async () => storedTicket,
      create: async ({ data }: any) => {
        storedTicket = {
          ticketId: 301,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return storedTicket;
      },
      update: async ({ data }: any) => {
        storedTicket = { ...storedTicket, ...data, updatedAt: new Date() };
        return storedTicket;
      },
    },
    paymentWebhookEvent: {
      findUnique: async () => storedWebhookReceipt,
      findUniqueOrThrow: async () => storedWebhookReceipt,
      create: async ({ data }: any) => {
        storedWebhookReceipt = { ...data, processedAt: new Date() };
        return storedWebhookReceipt;
      },
      createMany: async ({ data }: any) => {
        if (storedWebhookReceipt) return { count: 0 };
        storedWebhookReceipt = { ...data, processedAt: new Date() };
        return { count: 1 };
      },
    },
    $queryRaw: async () => [{ paymentid: 501 }],
    $transaction: async (fn: any) => fn(mockPaymentPrisma),
  };

  const mockGateway: any = {
    name: 'stripe',
    minCheckoutExpiryMinutes: 30,
    maxCheckoutExpiryMinutes: 1440,
    prepareCheckoutSession: (input: any) => input,
    createCheckoutSession: async (input: any) => ({
      gatewayRef: 'cs_test_security_501',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_security_501',
      expiresAt: input.expiresAt,
    }),
    retrieveCheckoutStatus: async () => ({
      state: 'paid',
      gatewayRef: 'cs_test_security_501',
      reference: '501',
      amountSatang: 5000,
      currency: 'THB',
      livemode: false,
    }),
  };

  const purchaseResult = await TicketService.purchase(
    {
      uid: 77,
      idempotencyKey: 'security-test-key-001',
    },
    mockGateway,
    mockPaymentPrisma
  );

  assert.equal(purchaseResult.paymentId, 501);
  assert.equal(purchaseResult.ticketId, 301);
  assert.equal(purchaseResult.status, PaymentStatus.PENDING);
  assert.equal(storedTicket.status, TicketStatus.UNPAID);

  const webhookResult = await PaymentConfirmationService.handleWebhook(
    {
      type: 'payment.succeeded',
      eventId: 'evt_security_501',
      gatewayRef: 'cs_test_security_501',
      reference: '501',
      amountSatang: 5000,
      currency: 'THB',
      paymentState: 'paid',
      livemode: false,
      paidAt: new Date(),
      raw: {},
    },
    mockGateway,
    mockPaymentPrisma
  );

  assert.equal(webhookResult.handled, true);
  assert.equal(webhookResult.activated, true);
  assert.equal(storedPayment.status, PaymentStatus.PAID);
  assert.equal(storedPayment.openUid, null);
  assert.equal(storedTicket.status, TicketStatus.PAID);
});
