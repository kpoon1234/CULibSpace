// apps/backend/src/services/lockService.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class LockService {
  /**
   * ค้นหาโต๊ะที่หมดเวลา Lock (lockedUntil < ปัจจุบัน) และคืนสถานะเป็น AVAILABLE
   */
  static async releaseExpiredLocks(): Promise<void> {
    try {
      const result = await prisma.table.updateMany({
        where: {
          lockedUntil: {
            lt: new Date(), // ตรวจสอบว่าเวลาที่กำหนดไว้น้อยกว่าเวลาปัจจุบันหรือไม่
          },
          lockToken: {
            not: null, // ป้องกันการอัปเดตโต๊ะที่ไม่ได้ถูกล็อกอยู่
          },
        },
        data: {
          lockToken: null,
          lockedUntil: null,
          lockedByUid: null,
          status: 'AVAILABLE', // คืนสถานะโต๊ะให้ว่าง
        },
      });

      if (result.count > 0) {
        console.log(`[LockService] Released ${result.count} expired table locks.`);
      }
    } catch (error) {
      console.error('[LockService] Error releasing expired locks:', error);
    }
  }

  /**
   * เริ่ม Worker ให้ทำงานเป็นลูปทุกๆ 30 วินาที
   */
  static startExpirationWorker(intervalMs: number = 30 * 1000): NodeJS.Timeout {
    console.log(`[LockService] Started lock expiration worker (Interval: ${intervalMs}ms)`);
    return setInterval(async () => {
      await this.releaseExpiredLocks();
    }, intervalMs);
  }
}
