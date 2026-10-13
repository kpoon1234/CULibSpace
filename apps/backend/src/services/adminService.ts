import { PrismaClient } from '@prisma/client';

const defaultPrisma = new PrismaClient();

export class AdminScoreService {
  /**
   * ปรับคะแนนพฤติกรรมผู้ใช้ (Manual Adjustment) และบันทึก Audit Log
   * สำหรับ Sprint 2, US 5-4
   */
  static async adjustUserScore(
    adminId: number,
    targetUid: number,
    scoreChange: number, // ค่าบวก (เพิ่มคะแนน) หรือค่าลบ (ลดคะแนน)
    prisma: any = defaultPrisma
  ) {
    return await prisma.$transaction(async (tx: any) => {
      // 1. ดึงข้อมูลคะแนนปัจจุบันของผู้ใช้
      const user = await tx.user.findUnique({
        where: { uid: targetUid },
        select: { behaviourScore: true },
      });

      if (!user) {
        throw { status: 404, code: 'USER_NOT_FOUND', message: 'User not found' };
      }

      // 2. คำนวณคะแนนใหม่
      const currentScore = Number(user.behaviourScore);
      let newScore = currentScore + scoreChange;

      // ควบคุมไม่ให้คะแนนติดลบหรือเกินขีดจำกัด (สมมติให้ 100 เป็นคะแนนเต็ม)
      if (newScore < 0) newScore = 0;
      if (newScore > 100) newScore = 100;

      // 3. อัปเดตคะแนนใหม่ในตาราง User
      const updatedUser = await tx.user.update({
        where: { uid: targetUid },
        data: { behaviourScore: newScore },
      });

      // 4. บันทึกประวัติการแก้ไขลง Audit Log (ตาราง ManageScore)
      const auditLog = await tx.manageScore.create({
        data: {
          uid: targetUid,
          adminId: adminId,
          scoreChange: scoreChange,
          timestamp: new Date(),
        },
      });

      return {
        success: true,
        newScore: Number(updatedUser.behaviourScore),
        auditLog,
      };
    });
  }
}
