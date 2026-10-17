import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// This suite writes to the database. Refuse to start unless it has a dedicated test DB.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for the admin score integration test.');
}

const testUrl = new URL(testDatabaseUrl);
const testDatabaseName = decodeURIComponent(testUrl.pathname.slice(1));
if (!/^postgres(?:ql)?:$/.test(testUrl.protocol) || !/_test$/i.test(testDatabaseName)) {
  throw new Error('TEST_DATABASE_URL must point to a PostgreSQL database ending in _test.');
}

if (process.env.DATABASE_URL) {
  const applicationUrl = new URL(process.env.DATABASE_URL);
  if (applicationUrl.host === testUrl.host && applicationUrl.pathname === testUrl.pathname) {
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL.');
  }
}

process.env.DATABASE_URL = testDatabaseUrl;
const { PrismaClient } = await import('@prisma/client');
const { AuthService } = await import('../services/authService.js');
const prisma = new PrismaClient();

async function runIntegrationTests() {
  const runId = randomUUID().replaceAll('-', '');
  let adminId: number | null = null;
  let userId: number | null = null;

  try {
    const admin = await prisma.admin.create({
      data: {
        email: `audit-admin-${runId}@example.test`,
        password: 'test-only-not-a-login',
        firstname: 'Audit',
        lastname: 'Test',
      },
    });
    adminId = admin.adminId;

    const user = await prisma.user.create({
      data: {
        email: `audit-user-${runId}@example.test`,
        firstname: 'Target',
        lastname: 'Test',
        userType: 'UNIVERSITY',
        behaviourScore: 100,
      },
    });
    userId = user.uid;

    // A successful adjustment writes the effective score change and reason to the real DB.
    const result = await AuthService.adjustUserScore(
      admin.adminId,
      user.uid,
      -10,
      'Integration test penalty',
      prisma
    );
    assert.equal(result.behaviourScore, 90);
    const userAfterSuccess = await prisma.user.findUniqueOrThrow({ where: { uid: user.uid } });
    assert.equal(userAfterSuccess.behaviourScore, 90);

    const logsAfterSuccess = await prisma.manageScore.findMany({
      where: { uid: user.uid, adminId: admin.adminId },
    });
    assert.equal(logsAfterSuccess.length, 1);
    assert.equal(logsAfterSuccess[0].scoreChange, -10);
    assert.equal(logsAfterSuccess[0].reason, 'Integration test penalty');
    assert.ok(logsAfterSuccess[0].timestamp instanceof Date);

    // Let a real transaction update the user, then make the audit write fail.
    const auditFailure = new Error('Simulated DB Log Failure');
    let updateReached = false;
    const failingAuditClient = {
      $transaction: (callback: (tx: any) => Promise<unknown>) =>
        prisma.$transaction(async (tx) =>
          callback({
            admin: { findUnique: (args: any) => tx.admin.findUnique(args) },
            user: {
              findUnique: (args: any) => tx.user.findUnique(args),
              updateMany: async (args: any) => {
                const update = await tx.user.updateMany(args);
                updateReached = update.count === 1;
                return update;
              },
            },
            manageScore: {
              create: async () => {
                throw auditFailure;
              },
            },
          })
        ),
    };

    await assert.rejects(
      AuthService.adjustUserScore(
        admin.adminId,
        user.uid,
        20,
        'Must roll back',
        failingAuditClient
      ),
      (error: unknown) => error === auditFailure
    );
    assert.equal(updateReached, true, 'The user update must occur before the audit write fails');

    const userAfterFailure = await prisma.user.findUniqueOrThrow({ where: { uid: user.uid } });
    assert.equal(userAfterFailure.behaviourScore, 90, 'The transaction must roll back the score');
    const logsAfterFailure = await prisma.manageScore.count({
      where: { uid: user.uid, adminId: admin.adminId },
    });
    assert.equal(logsAfterFailure, 1, 'The failed transaction must not add an audit log');
  } finally {
    try {
      // Only remove rows created by this run; no table-wide cleanup or fixed fixture IDs.
      if (userId !== null) {
        await prisma.manageScore.deleteMany({ where: { uid: userId } });
        await prisma.user.delete({ where: { uid: userId } });
      }
      if (adminId !== null) {
        await prisma.admin.delete({ where: { adminId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  }
}

try {
  await runIntegrationTests();
  console.log('Admin score audit integration tests passed.');
} catch (error) {
  console.error('Admin score audit integration tests failed:', error);
  process.exitCode = 1;
}
