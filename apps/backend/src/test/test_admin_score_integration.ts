import { PrismaClient } from '@prisma/client';
import { AuthService } from '../services/authService.js';
import assert from 'assert';

const prisma = new PrismaClient();

async function runIntegrationTests() {
  console.log('🧪 Starting DB Integration Tests for Admin Score Audit Logging...\n');

  try {
    // 1. เคลียร์และเตรียมข้อมูลทดสอบ
    await prisma.manageScore.deleteMany();
    await prisma.user.deleteMany({ where: { email: 'user_audit@student.chula.ac.th' } });
    await prisma.admin.deleteMany({ where: { email: 'admin_audit@chula.ac.th' } });

    const admin = await prisma.admin.create({
      data: {
        email: 'admin_audit@chula.ac.th',
        password: 'hashedpassword123',
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

    // 2. เคสที่ 1: ปรับคะแนนสำเร็จ และตรวจสอบการบันทึก Audit Log
    await AuthService.adjustUserScore(
      admin.adminId,
      user.uid,
      -10,
      'Penalty integration test',
      prisma
    );

    const logs = await prisma.manageScore.findMany({ where: { uid: user.uid } });

    assert.strictEqual(logs.length, 1, 'ต้องมี ManageScore 1 รายการ');
    assert.ok(logs[0], 'ต้องพบรายการ Log');
    assert.strictEqual(logs[0].adminId, admin.adminId, 'adminId ต้องถูกต้อง');
    assert.strictEqual(logs[0].scoreChange, -10, 'ส่วนต่างคะแนนต้องตรงความจริง');
    console.log('✅ Passed: Audit log written successfully to the database.');

    // 3. เคสที่ 2: จำลองกรณีบันทึก Log ล้มเหลว -> คะแนนต้อง Rollback กลับค่าเดิม
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
  } finally {
    await prisma.$disconnect();
  }
}

runIntegrationTests();
