// apps/backend/src/test/test_admin_score_integration.ts
import { PrismaClient } from '@prisma/client';
import { AuthService } from '../services/authService.js';
import assert from 'assert';

// บังคับให้ใช้ DB จำลองสำหรับเทสต์
const testDbUrl = process.env.TEST_DATABASE_URL;
if (!testDbUrl || !testDbUrl.endsWith('_test')) {
  console.error('❌ กรุณากำหนด TEST_DATABASE_URL ให้ชี้ไปยังฐานข้อมูลทดสอบ (ต้องลงท้ายด้วย _test)');
  process.exit(1);
}
process.env.DATABASE_URL = testDbUrl;

const prisma = new PrismaClient();

async function runIntegrationTests() {
  console.log('🧪 Starting DB Integration Tests for Admin Score Audit Logging...\n');

  // เตรียมข้อมูล
  await prisma.manageScore.deleteMany();
  await prisma.user.deleteMany();
  await prisma.admin.deleteMany();

  const admin = await prisma.admin.create({
    data: {
      email: 'admin_audit@chula.ac.th',
      password: 'hash',
      firstname: 'Audit',
      lastname: 'Admin',
    },
  });

  const user = await prisma.user.create({
    data: {
      email: 'user_audit@student.chula.ac.th',
      firstname: 'Target',
      lastname: 'User',
      userType: 'UNIVERSITY',
      behaviourScore: 100,
    },
  });

  // เคสที่ 1: ยืนยันการปรับคะแนนและบันทึก ManageScore ถูกต้อง
  await AuthService.adjustUserScore(
    admin.adminId,
    user.uid,
    -10,
    'Penalty integration test',
    prisma
  );
  const logs = await prisma.manageScore.findMany({ where: { uid: user.uid } });

  assert.strictEqual(logs.length, 1, 'ต้องมี ManageScore 1 รายการ');
  assert.strictEqual(logs[0].adminId, admin.adminId, 'adminId ต้องถูกต้อง');
  assert.strictEqual(logs[0].scoreChange, -10, 'ส่วนต่างคะแนนต้องตรงความจริง');
  console.log('✅ Passed: Audit log written successfully to the database.');

  // เคสที่ 2: ยืนยันว่าถ้าเขียน log ล้มเหลว คะแนนจะถูก Rollback
  const faultyPrisma = {
    ...prisma,
    $transaction: async (cb: any) => {
      return prisma.$transaction(async (tx) => {
        const faultyTx = {
          ...tx,
          manageScore: {
            create: async () => {
              throw new Error('Simulated DB Log Failure');
            },
          },
        };
        return cb(faultyTx);
      });
    },
  };

  try {
    await AuthService.adjustUserScore(
      admin.adminId,
      user.uid,
      20,
      'Will rollback',
      faultyPrisma as any
    );
    assert.fail('Transaction ควรถูกปฏิเสธ');
  } catch (err: any) {
    assert.strictEqual(err.message, 'Simulated DB Log Failure', 'จับ Error การเขียนล้มเหลวได้');
  }

  const userAfterRollback = await prisma.user.findUnique({ where: { uid: user.uid } });
  assert.strictEqual(userAfterRollback?.behaviourScore, 90, 'คะแนนต้องถูก Rollback กลับเป็น 90');
  console.log('✅ Passed: Score rolled back successfully on audit failure.');

  await prisma.$disconnect();
}

runIntegrationTests().catch(console.error);
