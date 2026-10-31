import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for booking policy integration tests.');
}

const testUrl = new URL(testDatabaseUrl);
const testDatabaseName = decodeURIComponent(testUrl.pathname.slice(1));
if (!/^postgres(?:ql)?:$/.test(testUrl.protocol) || !/_test$/i.test(testDatabaseName)) {
  throw new Error('TEST_DATABASE_URL must point to a PostgreSQL database ending in _test.');
}

if (process.env.DATABASE_URL) {
  const appUrl = new URL(process.env.DATABASE_URL);
  if (appUrl.host === testUrl.host && appUrl.pathname === testUrl.pathname) {
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL.');
  }
}

process.env.DATABASE_URL = testDatabaseUrl;
const { PrismaClient } = await import('@prisma/client');
const { SystemConfigService, DEFAULT_SYSTEM_CONFIG } =
  await import('../services/systemConfigService.js');

const prisma = new PrismaClient();
const runId = randomUUID();
let createdAdminId: number | null = null;
let originalConfigs: any[] = [];

try {
  // Backup existing system_config rows in the test DB so we can restore them cleanly
  originalConfigs = await prisma.systemConfig.findMany({ orderBy: { configId: 'asc' } });

  const admin = await prisma.admin.create({
    data: {
      email: `policy-admin-${runId}@example.test`,
      password: 'test-only-password-hash',
      firstname: 'Policy',
      lastname: 'Admin',
    },
  });
  createdAdminId = admin.adminId;

  // 1. ทดสอบกรณีตาราง system_config ว่างเปล่า และมี 2 คำขอวิ่งเข้าพร้อมกันบน PostgreSQL จริง
  await prisma.systemConfig.deleteMany();

  const [initA, initB] = await Promise.all([
    SystemConfigService.updatePolicy(
      admin.adminId,
      { maxBookingDurationMinutes: 180, minScoreToBook: 65 },
      prisma
    ),
    SystemConfigService.updatePolicy(
      admin.adminId,
      { maxAdvanceBookingDays: 14, ticketPriceSatang: 6000 },
      prisma
    ),
  ]);

  assert.equal(initA.configId, DEFAULT_SYSTEM_CONFIG.configId);
  assert.equal(initB.configId, DEFAULT_SYSTEM_CONFIG.configId);

  const countAfterConcurrentInit = await prisma.systemConfig.count();
  assert.equal(countAfterConcurrentInit, 1, 'must only create a single system_config row');

  const mergedPolicy = await SystemConfigService.getPolicy(prisma);
  assert.equal(
    mergedPolicy.maxBookingDurationMinutes,
    180,
    'preserves change from first concurrent request'
  );
  assert.equal(mergedPolicy.minScoreToBook, 65, 'preserves change from first concurrent request');
  assert.equal(
    mergedPolicy.maxAdvanceBookingDays,
    14,
    'preserves change from second concurrent request'
  );
  assert.equal(
    mergedPolicy.ticketPriceSatang,
    6000,
    'preserves change from second concurrent request'
  );
  console.log(
    'PASS: concurrent initialization on empty system_config succeeds and merges both updates.'
  );

  // 2. ทดสอบการอัปเดตเมื่อมีแถวอยู่แล้วบน PostgreSQL จริง (ยืนยันว่าไม่เกิด P2010 void deserialization)
  const updatedExisting = await SystemConfigService.updatePolicy(
    admin.adminId,
    { earlyCheckInMinutes: 25, lateThresholdMinutes: 20 },
    prisma
  );
  assert.equal(updatedExisting.earlyCheckInMinutes, 25);
  assert.equal(updatedExisting.lateThresholdMinutes, 20);
  assert.equal(updatedExisting.maxBookingDurationMinutes, 180);
  console.log('PASS: updating existing system_config row succeeds with ::text advisory lock.');
} finally {
  try {
    await prisma.systemConfig.deleteMany();
    for (const row of originalConfigs) {
      await prisma.systemConfig.create({ data: row });
    }
    if (createdAdminId !== null) {
      await prisma.admin.delete({ where: { adminId: createdAdminId } });
    }
  } finally {
    await prisma.$disconnect();
  }
}
