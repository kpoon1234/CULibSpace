import { PrismaClient } from '@prisma/client';

const defaultPrisma = new PrismaClient();

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
}

export default PenaltyService;
