import { AdminScoreService } from '../services/adminService.js';

async function testScoreAdjustment() {
  try {
    // สมมติว่า แอดมิน ID 1 ปรับลดคะแนนผู้ใช้ ID 5 ลง 10 คะแนน
    const result = await AdminScoreService.adjustUserScore(1, 5, -10);
    console.log('✅ ปรับคะแนนสำเร็จ:', result);
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
  }
}

testScoreAdjustment();
