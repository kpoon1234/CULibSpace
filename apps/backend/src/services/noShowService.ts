// apps/backend/src/services/noShowService.ts
import { PrismaClient, BookingStatus } from '@prisma/client';
import { lockTableForStatusChange, refreshTableStatus } from './tableStatusService.js';
import { readBookingPolicy } from './bookingPolicyService.js';

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
    const { lateThresholdMinutes } = await readBookingPolicy(prisma, ['lateThresholdMinutes']);
    const cutoffTime = new Date(now.getTime() - lateThresholdMinutes * 60 * 1000);

    return await prisma.booking.findMany({
      where: {
        status: BookingStatus.PENDING,
        startDateTime: { lt: cutoffTime },
      },
      include: { table: true },
    });
  }

  /**
   * [Subtask 3 - Hill, Kaopoon]: ประมวลผลคืนโต๊ะ ปรับสถานะเป็น NO_SHOW และตัดคะแนนพฤติกรรม
   * ฟังก์ชัน Transaction สำหรับปรับปรุงสถานะและตัดคะแนน
   */
  static async processNoShowBooking(
    booking: { bookingId: number; uid: number; tableId: number },
    prisma: any = defaultPrisma,
    now: Date = new Date()
  ): Promise<boolean> {
    const executeInTx = async (tx: any) => {
      await lockTableForStatusChange(tx, booking.tableId);

      // The policy may have changed since the scan. Never penalize a stale candidate.
      const { lateThresholdMinutes } = await readBookingPolicy(tx, ['lateThresholdMinutes']);
      const cutoffTime = new Date(now.getTime() - lateThresholdMinutes * 60_000);

      // 1. Guard: Atomic conditional update เป็น NO_SHOW เฉพาะเมื่อสถานะยังเป็น PENDING
      // ป้องกัน Race Condition กรณีที่ user เพิ่ง check-in (ACTIVE) หรือ cancel ก่อน Worker ประมวลผล
      const updatedBooking = await tx.booking.updateMany({
        where: {
          bookingId: booking.bookingId,
          status: BookingStatus.PENDING, // <-- CRITICAL: Blocks the check-in race condition
          startDateTime: { lt: cutoffTime },
        },
        data: { status: BookingStatus.NO_SHOW },
      });

      // หาก count === 0 แสดงว่า booking ถูก check-in หรือ cancel ไปก่อนแล้ว
      // Abort penalty ทั้งหมดอย่างปลอดภัย ไม่ตัดคะแนน ไม่คืนโต๊ะ
      if (updatedBooking.count === 0) {
        console.log(
          `[NoShowWorker] Booking #${booking.bookingId} is no longer pending or late. Skipping penalty.`
        );
        return false;
      }

      // 2. Reconcile the table after this transition; another checked-in booking may use it.
      await refreshTableStatus(tx, booking.tableId, now, true);

      // 3. ตัดคะแนนพฤติกรรมผู้ใช้
      const user = await tx.user.findUnique({
        where: { uid: booking.uid },
        select: { behaviourScore: true },
      });

      if (user) {
        const currentScore = Number(user.behaviourScore);
        const penaltyAmount = 10;
        const newScore = Math.max(0, currentScore - penaltyAmount);

        // คำนวณส่วนต่างที่แท้จริง (เช่น 5 - 10 = ติดลบแค่ 5)
        const actualScoreChange = newScore - currentScore;

        const userUpdate = await tx.user.updateMany({
          where: { uid: booking.uid, behaviourScore: user.behaviourScore },
          data: { behaviourScore: newScore },
        });

        if (userUpdate.count === 0) {
          throw new Error(
            'CONCURRENT_MODIFICATION: The user score was modified by another process.'
          );
        }

        // 4. บันทึก Audit log ลงใน ManageScore
        const admin = await tx.admin.findFirst({ select: { adminId: true } });

        if (admin) {
          await tx.manageScore.create({
            data: {
              uid: booking.uid,
              adminId: admin.adminId,
              scoreChange: actualScoreChange, // <-- ใช้ค่าส่วนต่างที่คำนวณได้จริง
              reason: `Automated penalty for No-show on Booking #${booking.bookingId}`,
              timestamp: new Date(),
            },
          });
        } else {
          // Graceful fallback: ตัดคะแนนสำเร็จแต่ไม่มี Admin ใน DB -> ข้าม ManageScore insert
          console.warn(
            `[NoShowWorker] No admin found in DB. Skipping ManageScore record for uid=${booking.uid}. Score deducted successfully.`
          );
        }
      }

      return true;
    };

    if (prisma.$transaction) {
      return await prisma.$transaction(executeInTx);
    } else {
      return await executeInTx(prisma);
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
        try {
          const success = await this.processNoShowBooking(booking, prisma, now);
          if (success) processedCount++;
        } catch (err: any) {
          console.warn(`[NoShowWorker] Skipped booking #${booking.bookingId}: ${err.message}`);
        }
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
