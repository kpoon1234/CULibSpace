import { PrismaClient, BookingStatus, TableStatus } from '@prisma/client';

const defaultPrisma = new PrismaClient();

export interface NoShowPenaltyInput {
  uid: number;
  tableId: number;
  bookingId: number;
}

export interface ApplyPenaltyInput {
  uid: number;
  amount: number;
  reason: string;
  adminId?: number;
}

export interface PenaltyResult {
  newScore: number;
  deducted: number;
  auditCreated: boolean;
}

export class PenaltyService {
  /**
   * [US5-3]: Enforce minimum behaviour score guard for reservation privileges.
   * Throws 403 INSUFFICIENT_BEHAVIOUR_SCORE if the user's score is below SystemConfig.minScoreToBook.
   *
   * @param uid User ID
   * @param prisma PrismaClient instance
   * @param user Optional pre-fetched user object with behaviourScore to avoid duplicate query
   */
  static async enforceMinScore(
    uid: number,
    prisma: any = defaultPrisma,
    user?: { behaviourScore: any }
  ): Promise<void> {
    let config = null;
    try {
      config = await prisma.systemConfig.findFirst();
    } catch {
      // Fallback if query fails
    }
    const minScoreToBook = Number(config?.minScoreToBook ?? 50.0);

    // Use pre-fetched user if provided, otherwise query
    let userScore: number;
    if (user) {
      userScore = Number(user.behaviourScore);
    } else {
      const fetchedUser = await prisma.user.findUnique({
        where: { uid },
        select: { behaviourScore: true },
      });

      if (!fetchedUser) {
        throw { status: 404, code: 'USER_NOT_FOUND', message: `User ${uid} not found` };
      }
      userScore = Number(fetchedUser.behaviourScore);
    }

    if (userScore < minScoreToBook) {
      throw {
        status: 403,
        code: 'INSUFFICIENT_BEHAVIOUR_SCORE',
        message: `Your behavior credit score (${userScore.toFixed(1)}) is below the minimum required (${minScoreToBook.toFixed(1)}) to make a reservation`,
      };
    }
  }

  /**
   * [US5-2]: Core penalty logic — deduct behaviourScore and record ManageScore audit.
   * Does NOT wrap in a transaction; intended to be called from within an existing transaction.
   *
   * Score is clamped at 0; ManageScore insert is skipped gracefully if no Admin exists.
   *
   * @param input Penalty amount and context
   * @param prisma PrismaClient or transaction client
   * @returns PenaltyResult with new score and audit status
   */
  static async applyPenalty(
    input: ApplyPenaltyInput,
    prisma: any = defaultPrisma
  ): Promise<PenaltyResult> {
    const user = await prisma.user.findUnique({
      where: { uid: input.uid },
      select: { behaviourScore: true },
    });

    if (!user) {
      throw { status: 404, code: 'USER_NOT_FOUND', message: `User ${input.uid} not found` };
    }

    const currentScore = Number(user.behaviourScore);
    const penaltyAmount = Math.max(0, input.amount);
    const newScore = Math.max(0, currentScore - penaltyAmount);

    await prisma.user.update({
      where: { uid: input.uid },
      data: { behaviourScore: newScore },
    });

    let auditCreated = false;

    try {
      const adminId = input.adminId;

      if (adminId) {
        await prisma.manageScore.create({
          data: {
            uid: input.uid,
            adminId,
            scoreChange: -penaltyAmount,
          },
        });
        auditCreated = true;
      } else {
        const admin = await prisma.admin.findFirst({ select: { adminId: true } });
        if (admin) {
          await prisma.manageScore.create({
            data: {
              uid: input.uid,
              adminId: admin.adminId,
              scoreChange: -penaltyAmount,
            },
          });
          auditCreated = true;
        } else {
          console.warn(
            `[PenaltyService] No admin found in DB. Skipping ManageScore record for uid=${input.uid}. Score deducted successfully.`
          );
        }
      }
    } catch (auditError) {
      console.error(
        `[PenaltyService] Failed to create ManageScore audit for uid=${input.uid}:`,
        auditError
      );
    }

    return { newScore, deducted: penaltyAmount, auditCreated };
  }

  /**
   * [US5-2]: Full no-show penalty workflow wrapped in a transaction.
   * Updates booking to NO_SHOW, releases table, and deducts behaviourScore.
   *
   * @param input No-show booking details
   * @param prisma PrismaClient instance
   * @returns true if penalty was applied, false if booking was already transitioned
   */
  static async applyNoShowPenalty(
    input: NoShowPenaltyInput,
    prisma: any = defaultPrisma
  ): Promise<boolean> {
    const executeInTx = async (tx: any) => {
      const updatedBooking = await tx.booking.updateMany({
        where: {
          bookingId: input.bookingId,
          status: BookingStatus.PENDING,
        },
        data: { status: BookingStatus.NO_SHOW },
      });

      if (updatedBooking.count === 0) {
        console.log(
          `[PenaltyService] Booking #${input.bookingId} already transitioned. Skipping penalty.`
        );
        return false;
      }

      const table = await tx.table.findUnique({
        where: { tableId: input.tableId },
        select: { status: true },
      });

      if (table && table.status !== TableStatus.CLOSED) {
        await tx.table.update({
          where: { tableId: input.tableId },
          data: {
            status: TableStatus.AVAILABLE,
            lockToken: null,
            lockedUntil: null,
            lockedByUid: null,
          },
        });
      }

      await this.applyPenalty(
        { uid: input.uid, amount: 10, reason: 'No-show penalty' },
        tx
      );

      return true;
    };

    if (prisma.$transaction) {
      return await prisma.$transaction(executeInTx);
    } else {
      return await executeInTx(prisma);
    }
  }

  /**
   * [US5-2]: Fetch behaviour score and full change history for a user.
   *
   * @param uid User ID
   * @param prisma PrismaClient instance
   * @returns User score with formatted history array
   */
  static async getScoreHistory(
    uid: number,
    prisma: any = defaultPrisma
  ): Promise<{ uid: number; behaviourScore: number; history: any[] }> {
    const user = await prisma.user.findUnique({
      where: { uid },
      select: {
        uid: true,
        firstname: true,
        lastname: true,
        behaviourScore: true,
      },
    });

    if (!user) {
      throw { status: 404, code: 'USER_NOT_FOUND', message: `User ${uid} not found` };
    }

    const history = await prisma.manageScore.findMany({
      where: { uid },
      orderBy: { timestamp: 'desc' },
      include: {
        admin: {
          select: {
            adminId: true,
            firstname: true,
            lastname: true,
            email: true,
          },
        },
      },
    });

    const formattedHistory = history.map((entry: any) => ({
      timestamp: entry.timestamp,
      scoreChange: entry.scoreChange,
      adminId: entry.adminId ?? null,
      adminName: entry.admin
        ? `${entry.admin.firstname} ${entry.admin.lastname}`.trim()
        : 'System',
    }));

    return {
      uid: user.uid,
      behaviourScore: Number(user.behaviourScore),
      history: formattedHistory,
    };
  }
}

export default PenaltyService;
