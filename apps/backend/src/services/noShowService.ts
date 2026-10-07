// apps/backend/src/services/noShowService.ts
import { PrismaClient } from '@prisma/client';

const defaultPrisma = new PrismaClient();

export class NoShowService {
  /**
   * [Subtask 2 - Poom, Punt]: ค้นหาการจองสถานะ PENDING ที่เลยกำหนดเวลา (Cutoff Time)
   * ฟังก์ชันสำหรับ Query ข้อมูลจากฐานข้อมูลตาม SystemConfig.lateThresholdMinutes
   */
  static async findLateBookings(
    now: Date = new Date(),
    prisma: any = defaultPrisma
  ): Promise<any[]> {
    // TODO (Subtask 2 - Poom, Punt): Query late PENDING bookings based on lateThresholdMinutes
    return [];
  }

  /**
   * [Subtask 3 - Hill, Kaopoon]: ประมวลผลคืนโต๊ะ ปรับสถานะเป็น NO_SHOW และตัดคะแนนพฤติกรรม
   * ฟังก์ชัน Transaction สำหรับปรับปรุงสถานะและตัดคะแนน
   */
  static async processNoShowBooking(booking: any, prisma: any = defaultPrisma): Promise<boolean> {
    // TODO (Subtask 3 - Hill, Kaopoon): Update booking status to NO_SHOW, release table to AVAILABLE, deduct behavior score
    try {
      await prisma.$transaction(async (tx: any) => {
        // 1. ปรับสถานะการจองให้เป็น NO_SHOW
        await tx.booking.update({
          where: { bookingId: booking.bookingId },
          data: { status: 'NO_SHOW' },
        });

        // 2. คืนสถานะโต๊ะกลับเป็น AVAILABLE และเคลียร์ข้อมูลการล็อก
        // ดักจับ Edge Case: จะไม่อัปเดตสถานะโต๊ะหากโต๊ะนั้นอยู่ในสถานะปิดซ่อมบำรุง (CLOSED)
        const currentTable = await tx.table.findUnique({
          where: { tableId: booking.tableId },
          select: { status: true },
        });

        if (currentTable && currentTable.status !== 'CLOSED') {
          await tx.table.update({
            where: { tableId: booking.tableId },
            data: {
              status: 'AVAILABLE',
              lockToken: null,
              lockedUntil: null,
              lockedByUid: null,
            },
          });
        }

        // 3. หักคะแนนพฤติกรรม (Behavior Score Penalty)
        const PENALTY_SCORE = 10;
        const user = await tx.user.findUnique({
          where: { uid: booking.uid },
          select: { behaviourScore: true },
        });

        if (user) {
          const currentScore = Number(user.behaviourScore);
          // ป้องกันไม่ให้คะแนนติดลบโดยใช้ Math.max
          const newScore = Math.max(0, currentScore - PENALTY_SCORE);

          await tx.user.update({
            where: { uid: booking.uid },
            data: { behaviourScore: newScore },
          });

          // 4. บันทึกประวัติการหักคะแนนลงในระบบ Audit (ManageScore)
          // ใช้ adminId: 1 เป็นค่า Default Fallback สำหรับระบบอัตโนมัติ (System Bot)
          await tx.manageScore.create({
            data: {
              uid: booking.uid,
              adminId: 1,
              scoreChange: -PENALTY_SCORE,
            },
          });
        }
      });

      return true;
    } catch (error) {
      console.error(
        `[NoShowWorker] Failed to process no-show for booking ${booking?.bookingId}:`,
        error
      );
      return false;
    }
  }

  /**
   * [Subtask 1 - Kaopoon, Andy]: ตัวควบคุมรอบการทำงานของ No-show Worker (Cycle Orchestrator)
   * เรียกทำงานทุก 1 นาที เพื่อเชื่อมต่อ Subtask 2 (Query) และ Subtask 3 (Transaction)
   */
  static async executeNoShowCycle(
    now: Date = new Date(),
    prisma: any = defaultPrisma
  ): Promise<{ processed: number; timestamp: string }> {
    try {
      const timestamp = now.toISOString();
      console.log(`[NoShowWorker] Running scheduled no-show scan at ${timestamp}...`);

      // 1. ค้นหาการจองที่สาย (Subtask 2)
      const lateBookings = await this.findLateBookings(now, prisma);

      // 2. ปล่อยโต๊ะและปรับสถานะทีละรายการ (Subtask 3)
      let processedCount = 0;
      for (const booking of lateBookings) {
        const success = await this.processNoShowBooking(booking, prisma);
        if (success) processedCount++;
      }

      console.log(`[NoShowWorker] Completed scan cycle. Processed ${processedCount} no-shows.`);
      return { processed: processedCount, timestamp };
    } catch (error) {
      console.error('[NoShowWorker] Error during no-show scan execution:', error);
      return { processed: 0, timestamp: now.toISOString() };
    }
  }

  /**
   * Alias method for checkNoShows
   */
  static async checkNoShows(prisma: any = defaultPrisma): Promise<{ processed: number }> {
    const res = await this.executeNoShowCycle(new Date(), prisma);
    return { processed: res.processed };
  }

  /**
   * [Subtask 1 - Kaopoon, Andy]: เริ่มการทำงานของ Background Cron Worker ให้รันทุก 1 นาที
   *
   * @param intervalMs ระยะเวลา interval ในการรันแต่ละรอบ (Default: 60,000 ms หรือ 1 นาที)
   * @param prisma PrismaClient instance สำหรับใช้งาน
   * @returns NodeJS.Timeout timer reference สำหรับจัดการ lifecycle
   */
  static startNoShowWorker(
    intervalMs: number = 60 * 1000,
    prisma: any = defaultPrisma
  ): NodeJS.Timeout {
    console.log(`[NoShowWorker] Started background no-show worker (Interval: ${intervalMs}ms)`);

    return setInterval(async () => {
      try {
        await this.executeNoShowCycle(new Date(), prisma);
      } catch (err) {
        console.error('[NoShowWorker] Unhandled error in worker interval loop:', err);
      }
    }, intervalMs);
  }

  /**
   * [Subtask 1 - Kaopoon, Andy]: หยุดการทำงานของ Worker (สำหรับ Cleanup หรือ Graceful Shutdown)
   */
  static stopNoShowWorker(timer: NodeJS.Timeout): void {
    clearInterval(timer);
    console.log('[NoShowWorker] Stopped background no-show worker.');
  }
}

export default NoShowService;
