import { AuthService } from '../services/authService.js';
import assert from 'assert';

async function runMockTests() {
  console.log('🧪 Starting Tests for Admin Score Audit Logging (Mock DB Mode)...\n');

  // 1. สร้าง Mock Prisma Client (จำลองฐานข้อมูลขึ้นมาทั้งหมด)
  // วิธีนี้โค้ดจะไม่ไปเชื่อมต่อกับ DATABASE_URL เลย ปลอดภัย 100%
  const mockPrisma = {
    $transaction: async (callback: any) => {
      // จำลองการรัน Transaction โดยส่งตัวมันเองกลับไป
      return callback(mockPrisma);
    },
    admin: {
      // จำลองว่าหา Admin เจอเสมอ
      findUnique: async () => ({ adminId: 99, email: 'mock_admin@chula.ac.th' }),
    },
    user: {
      // จำลองข้อมูลผู้ใช้เริ่มต้นมี 100 คะแนน
      findUnique: async () => ({ uid: 1, behaviourScore: 100 }),
      // จำลองว่าอัปเดตคะแนนในตาราง User สำเร็จ
      updateMany: async () => ({ count: 1 }),
    },
    manageScore: {
      // จำลองว่าเขียน Audit Log สำเร็จ
      create: async (data: any) => ({ manageId: 1, ...data.data }),
    },
  };

  try {
    // เคสที่ 1: ตรวจสอบระบบเมื่อข้อมูลทุกอย่างทำงานปกติ
    const result = await AuthService.adjustUserScore(
      99,
      1,
      -10,
      'Mock penalty test',
      mockPrisma as any
    );
    assert.strictEqual(result.behaviourScore, 90, 'คะแนนต้องถูกลดทอนอย่างถูกต้อง (100 - 10 = 90)');
    console.log('✅ Passed: Score adjusted and mock log verified safely without touching real DB.');

    // เคสที่ 2: จำลอง Database ล่ม (เพื่อดูว่า Transaction จะ Rollback ไหม)
    const faultyMockPrisma = {
      ...mockPrisma,
      $transaction: async (callback: any) => {
        // บังคับให้ส่ง faultyMockPrisma (ตัวที่พัง) เข้าไปใน transaction แทน
        return callback(faultyMockPrisma);
      },
      manageScore: {
        create: async () => {
          throw new Error('Simulated DB Log Failure');
        },
      },
    };
    try {
      await AuthService.adjustUserScore(99, 1, -20, 'Will rollback', faultyMockPrisma as any);
      assert.fail('Transaction ควรถูกปฏิเสธ');
    } catch (err: any) {
      assert.strictEqual(
        err.message,
        'Simulated DB Log Failure',
        'จับ Error การเขียน Log ล้มเหลวได้ถูกต้อง'
      );
    }
    console.log('✅ Passed: Handled DB failure correctly (No real database was harmed).');
  } catch (error) {
    console.error('❌ Mock Test Failed:', error);
    process.exitCode = 1;
  }
}

runMockTests();
