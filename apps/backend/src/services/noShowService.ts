// apps/backend/src/services/noShowService.ts
import { PrismaClient, BookingStatus, TableStatus } from '@prisma/client';

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
    let config = null;
    try {
      config = await prisma.systemConfig.findFirst();
    } catch {
      // Fallback defaults if SystemConfig query fails
    }
    const lateThresholdMinutes = config?.lateThresholdMinutes ?? 15;
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
    prisma: any = defaultPrisma
  ): Promise<boolean> {
    const executeInTx = async (tx: any) => {
      // 1. อัปเดตสถานะ Booking เป็น NO_SHOW (ACID Guard - Optimistic Concurrency)
      const updatedBooking = await tx.booking.updateMany({
        where: {
          bookingId: booking.bookingId,
          status: BookingStatus.PENDING, // <-- CRITICAL: Blocks the check-in race condition
        },
        data: { status: BookingStatus.NO_SHOW },
      });

      // If count is 0, the user checked-in at the exact same millisecond. Abort penalty safely.
      if (updatedBooking.count === 0) {
        return false;
      }

      // 2. ปล่อยสถานะโต๊ะคืนเป็น AVAILABLE (ยกเว้นกรณีที่โต๊ะถูกปิดซ่อมบำรุง CLOSED)
      const table = await tx.table.findUnique({
        where: { tableId: booking.tableId },
        select: { status: true },
      });

      if (table && table.status !== TableStatus.CLOSED) {
        await tx.table.update({
          where: { tableId: booking.tableId },
          data: {
            status: TableStatus.AVAILABLE,
            lockToken: null,
            lockedUntil: null,
            lockedByUid: null,
          },
        });
      }

      // 3. ตัดคะแนนพฤติกรรมผู้ใช้ (-10 คะแนน) และบันทึกลง ManageScore
      const user = await tx.user.findUnique({
        where: { uid: booking.uid },
        select: { behaviourScore: true },
      });

      if (user) {
        const currentScore = Number(user.behaviourScore);
        const penaltyAmount = 10;
        const newScore = Math.max(0, currentScore - penaltyAmount);

        await tx.user.update({
          where: { uid: booking.uid },
          data: { behaviourScore: newScore },
        });

        // ค้นหา System Admin สำหรับบันทึก Audit log ใน ManageScore
        const admin = await tx.admin.findFirst({ select: { adminId: true } });
        const adminId = admin?.adminId ?? 1;

        await tx.manageScore.create({
          data: {
            uid: booking.uid,
            adminId,
            scoreChange: -penaltyAmount,
            timestamp: new Date(),
          },
        });
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
