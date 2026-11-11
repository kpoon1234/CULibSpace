import { describe, it, expect, jest } from '@jest/globals';
import { ScoreGuard } from '../services/scoreGuard.js';

describe('Unit Test: ScoreGuard.enforceMinScore (US5-3)', () => {
  // TC-01: User score is above minimum threshold (querying user & policy from DB)
  it('TC-01: should allow reservation when fetched user score is above minScoreToBook (75 >= 50)', async () => {
    const mockPrisma = {
      systemConfig: {
        findFirst: jest.fn<() => Promise<{ minScoreToBook: number }>>().mockResolvedValue({
          minScoreToBook: 50,
        }),
      },
      user: {
        findUnique: jest.fn<() => Promise<{ behaviourScore: number }>>().mockResolvedValue({
          behaviourScore: 75,
        }),
      },
    };

    await expect(ScoreGuard.enforceMinScore(101, mockPrisma)).resolves.toBeUndefined();
    expect(mockPrisma.systemConfig.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { uid: 101 },
      select: { behaviourScore: true },
    });
  });

  // TC-02: Boundary Value Analysis - User score is strictly at minimum threshold (50 == 50)
  // Also tests pre-fetched user and pre-fetched policy parameters ( plus default prisma param )
  it('TC-02: should allow reservation when pre-fetched user score is at boundary threshold (50 == 50)', async () => {
    await expect(
      ScoreGuard.enforceMinScore(102, undefined, { behaviourScore: 50 }, { minScoreToBook: 50 })
    ).resolves.toBeUndefined();
  });

  // TC-03: Boundary Value Analysis - User score is below minimum threshold (49 < 50)
  it('TC-03: should throw 403 INSUFFICIENT_BEHAVIOUR_SCORE when user score is below minScoreToBook (49 < 50)', async () => {
    const mockPrisma = {
      systemConfig: {
        findFirst: jest.fn<() => Promise<{ minScoreToBook: number }>>().mockResolvedValue({
          minScoreToBook: 50,
        }),
      },
      user: {
        findUnique: jest.fn<() => Promise<{ behaviourScore: number }>>().mockResolvedValue({
          behaviourScore: 49,
        }),
      },
    };

    await expect(ScoreGuard.enforceMinScore(103, mockPrisma)).rejects.toEqual({
      status: 403,
      code: 'INSUFFICIENT_BEHAVIOUR_SCORE',
      message:
        'Your behavior credit score (49) is below the minimum required (50) to make a reservation',
    });
  });

  // TC-04: Error Handling - User does not exist in database (null returned)
  it('TC-04: should throw 404 USER_NOT_FOUND when user ID does not exist in database', async () => {
    const mockPrisma = {
      systemConfig: {
        findFirst: jest.fn<() => Promise<{ minScoreToBook: number }>>().mockResolvedValue({
          minScoreToBook: 50,
        }),
      },
      user: {
        findUnique: jest.fn<() => Promise<null>>().mockResolvedValue(null),
      },
    };

    await expect(ScoreGuard.enforceMinScore(999, mockPrisma)).rejects.toEqual({
      status: 404,
      code: 'USER_NOT_FOUND',
      message: 'User 999 not found',
    });
  });
});
