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
const semver = require('semver') as { gte: (v1: string, v2: string) => boolean };

test('deepmerge-ts is upgraded to >= 8.0.2 to remediate SNYK-JS-DEEPMERGETS-18912249 (CVE-2026-40345)', () => {
  const entryPath = require.resolve('deepmerge-ts');
  const pkgPath = path.resolve(path.dirname(entryPath), '../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name: string; version: string };
  assert.equal(pkg.name, 'deepmerge-ts');

  assert.ok(
    semver.gte(pkg.version, '8.0.2'),
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
