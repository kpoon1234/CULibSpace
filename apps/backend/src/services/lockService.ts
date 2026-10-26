// apps/backend/src/services/lockService.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class LockService {
  /** Release expired holds only; booking/manual status is never changed. */
  static async releaseExpiredLocks(
    now: Date = new Date(),
    prismaClient: Pick<PrismaClient, '$transaction'> = prisma
  ): Promise<number> {
    const result = await prismaClient.$transaction(async (tx) => {
      // Same ascending table order as acquireLock. Never wait while holding
      // another table: a busy row is retried by the next worker tick instead.
      const expired = await tx.$queryRaw<{ tableid: number }[]>`
        SELECT tableid FROM "table"
        WHERE locked_until < ${now} AND lock_token IS NOT NULL
        ORDER BY tableid FOR UPDATE SKIP LOCKED`;
      if (expired.length === 0) return { count: 0 };

      return tx.table.updateMany({
        where: {
          tableId: { in: expired.map(({ tableid }) => tableid) },
          lockedUntil: { lt: now },
          lockToken: { not: null },
        },
        data: {
          lockToken: null,
          lockedUntil: null,
          lockedByUid: null,
        },
      });
    });

    if (result.count > 0) {
      console.log(`[LockService] Released ${result.count} expired table locks.`);
    }
    return result.count;
  }

  /**
   * เริ่ม Worker ให้ทำงานเป็นลูปทุกๆ 30 วินาที
   */
  static startExpirationWorker(intervalMs: number = 30 * 1000): NodeJS.Timeout {
    console.log(`[LockService] Started lock expiration worker (Interval: ${intervalMs}ms)`);
    return setInterval(async () => {
      try {
        await this.releaseExpiredLocks();
      } catch (error) {
        // A failed tick must be visible without killing the scheduled worker.
        console.error('[LockService] Error releasing expired locks:', error);
      }
    }, intervalMs);
  }
}
