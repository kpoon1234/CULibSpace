import { PrismaClient } from '@prisma/client';

const defaultPrisma = new PrismaClient();

export class AdminScoreService {
  static async adjustUserScore(
    adminId: number,
    targetUid: number,
    scoreChange: number,
    reason: string, // เพิ่ม reason ตามที่ทีมตกลงกัน
    prisma: any = defaultPrisma
  ) {
    // 1. Validation: ต้องเป็นจำนวนเต็ม
    if (!Number.isInteger(scoreChange)) {
      throw {
        status: 400,
        code: 'INVALID_SCORE_CHANGE',
        message: 'Score change must be an integer',
      };
    }

    return await prisma.$transaction(async (tx: any) => {
      // ดึงข้อมูลผู้ใช้
      const user = await tx.user.findUnique({
        where: { uid: targetUid },
        select: { behaviourScore: true },
      });

      if (!user) {
        throw { status: 404, code: 'USER_NOT_FOUND', message: 'User not found' };
      }

      const currentScore = Number(user.behaviourScore);
      let newScore = currentScore + scoreChange;

      // Clamp คะแนน (0 - 100)
      if (newScore < 0) newScore = 0;
      if (newScore > 100) newScore = 100;

      // 2. Audit Log Fix: คำนวณ "ส่วนต่างที่เกิดขึ้นจริง"
      const actualChange = newScore - currentScore;

      // หากคะแนนชนเพดาน/พื้น แล้วไม่มีการเปลี่ยนแปลงเลย ให้ Return กลับได้เลยโดยไม่ต้องสร้าง Log
      if (actualChange === 0) {
        return {
          success: true,
          newScore: currentScore,
          message: 'Score unchanged. No log created.',
        };
      }

      // 3. Concurrency Guard: ป้องกันเขียนทับกับ NoShowWorker (Optimistic Concurrency)
      // อัปเดตโดยมีเงื่อนไขว่าคะแนนใน DB ต้องเท่ากับ `currentScore` ที่เราเพิ่งดึงมา
      const updatedUser = await tx.user.updateMany({
        where: {
          uid: targetUid,
          behaviourScore: currentScore, // หาก NoShowWorker หักคะแนนไปก่อนหน้านี้ บรรทัดนี้จะไม่ match
        },
        data: { behaviourScore: newScore },
      });

      // ถ้า count เป็น 0 แปลว่าโดน Process อื่นแก้คะแนนตัดหน้าไปแล้ว ให้โยน Error ไปให้ฝั่ง Frontend กดลองใหม่
      if (updatedUser.count === 0) {
        throw {
          status: 409,
          code: 'CONCURRENCY_ERROR',
          message: 'The user score was modified by another process. Please try again.',
        };
      }

      // 4. สร้าง Audit Log ด้วยค่าที่เปลี่ยนจริงและระบุเหตุผล
      const auditLog = await tx.manageScore.create({
        data: {
          uid: targetUid,
          adminId: adminId,
          scoreChange: actualChange, // +5 ไม่ใช่ +10 (ถ้าเดิม 95 แล้วสั่ง +10)
          reason: reason,
        },
      });

      return {
        success: true,
        newScore: newScore,
        auditLog,
      };
    });
  }
}
