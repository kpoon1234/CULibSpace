import { PrismaClient } from '@prisma/client';
import { AuthService } from '../services/authService.js';
import assert from 'assert';

const prisma = new PrismaClient();

async function runIntegrationTests() {
  console.log('🧪 Starting DB Integration Tests for Admin Score Audit Logging...\n');

  // เตรียมตัวแปรไว้สำหรับเก็บกวาดตอนท้าย
  let testAdminId: number | null = null;
  let testUserId: number | null = null;
  const adminEmail = 'admin_audit_integration@chula.ac.th';
  const userEmail = 'user_audit_integration@student.chula.ac.th';

  try {
    // เก็บกวาดข้อมูลเก่าที่อาจค้างจากเทสต์รอบก่อน (ลบแบบมีเงื่อนไข)
    await prisma.manageScore.deleteMany({ where: { admin: { email: adminEmail } } });
    await prisma.admin.deleteMany({ where: { email: adminEmail } });
    await prisma.user.deleteMany({ where: { email: userEmail } });

    // สร้างข้อมูลจำลอง
    const admin = await prisma.admin.create({
      data: {
        email: adminEmail,
        password: 'hashedpassword123',
        firstname: 'Audit',
        lastname: 'Admin',
      },
    });
    testAdminId = admin.adminId;

    const user = await prisma.user.create({
      data: {
        email: userEmail,
        firstname: 'Target',
        lastname: 'User',
        userType: 'UNIVERSITY',
        behaviourScore: 100,
      },
    });
    testUserId = user.uid;

    // เคสที่ 1: ปรับคะแนนสำเร็จ
    await AuthService.adjustUserScore(
      admin.adminId,
      user.uid,
      -10,
      'Penalty integration test',
      prisma
    );
    const logs = await prisma.manageScore.findMany({
      where: { uid: user.uid, adminId: admin.adminId },
    });

    assert.strictEqual(logs.length, 1, 'ต้องมี ManageScore 1 รายการ');
    assert.ok(logs[0], 'ต้องพบรายการ Log');
    assert.strictEqual(logs[0].scoreChange, -10, 'ส่วนต่างคะแนนต้องตรงความจริง');
    console.log('✅ Passed: Audit log written successfully to the database.');

    // เคสที่ 2: จำลอง DB ขัดข้อง (Rollback)
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
      assert.strictEqual(
        err.message,
        'Simulated DB Log Failure',
        'จับ Error การเขียนล้มเหลวได้ถูกต้อง'
      );
    }

    const userAfterRollback = await prisma.user.findUnique({ where: { uid: user.uid } });
    assert.strictEqual(
      Number(userAfterRollback?.behaviourScore),
      90,
      'คะแนนต้องถูก Rollback กลับเป็น 90 เท่าเดิม'
    );
    console.log('✅ Passed: Score rolled back successfully on audit failure.');
  } catch (error) {
    console.error('❌ Integration Test Failed:', error);
    process.exitCode = 1;
  } finally {
    // Cleanup ลบข้อมูลเฉพาะที่ Test นี้สร้างขึ้นมาเท่านั้น
    if (testAdminId && testUserId) {
      await prisma.manageScore.deleteMany({ where: { adminId: testAdminId } });
      await prisma.user.deleteMany({ where: { uid: testUserId } });
      await prisma.admin.deleteMany({ where: { adminId: testAdminId } });
      console.log('🧹 Cleanup: Test-specific records deleted safely.');
    }
    await prisma.$disconnect();
  }
}

runIntegrationTests();
