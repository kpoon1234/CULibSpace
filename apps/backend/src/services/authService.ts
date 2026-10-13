import { PrismaClient, UserType } from '@prisma/client';
import { classifyEmail, AppRole } from '../utils/roleMapper.js';
import { signJwt, AuthTokenPayload } from '../utils/jwt.js';

const prisma = new PrismaClient();

export interface AuthenticateUserInput {
  email: string;
  firstname: string;
  lastname: string;
  phone?: string;
  studentId?: string;
}

export interface CompleteProfileInput {
  uid: number;
  firstname: string;
  lastname: string;
  phone: string;
  identityType?: 'THAI' | 'FOREIGN';
  citizenId?: string;
  passportId?: string;
}

export class AuthService {
  /**
   * Role Mapping & Session/JWT Management for Student/Staff (US1-1 / FR-1.1)
   */
  static async authenticateUser(input: AuthenticateUserInput) {
    const email = input.email.trim().toLowerCase();
    const classification = classifyEmail(email);

    let user = await prisma.user.findUnique({
      where: { email },
      include: {
        universityUser: true,
      },
    });

    let studentId: string | undefined;

    if (!user) {
      // First-time user creation: phone is optional until onboarding completion
      const phone = input.phone?.trim() || null;
      const isProfileComplete = Boolean(phone);

      if (classification.isUniversityMember) {
        studentId = input.studentId || classification.studentId;
        user = await prisma.user.create({
          data: {
            email,
            firstname: input.firstname,
            lastname: input.lastname,
            phone,
            isProfileComplete,
            userType: classification.userType,
            universityUser: studentId
              ? {
                  create: {
                    studentId,
                  },
                }
              : undefined,
          },
          include: {
            universityUser: true,
          },
        });
      } else {
        // Fallback outsider user
        user = await prisma.user.create({
          data: {
            email,
            firstname: input.firstname,
            lastname: input.lastname,
            phone,
            isProfileComplete,
            userType: UserType.THAI,
          },
          include: {
            universityUser: true,
          },
        });
      }
    } else {
      // Existing user
      if (user.userType === UserType.UNIVERSITY) {
        studentId = user.universityUser?.studentId;
      }
    }

    const payload: AuthTokenPayload = {
      uid: user.uid,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
      role: classification.role,
      userType: user.userType,
      studentId: studentId || user.universityUser?.studentId,
      isProfileComplete: user.isProfileComplete,
    };

    const token = signJwt(payload);

    return {
      token,
      user: {
        uid: user.uid,
        email: user.email,
        firstname: user.firstname,
        lastname: user.lastname,
        phone: user.phone,
        imageUrl: user.imageUrl,
        isProfileComplete: user.isProfileComplete,
        behaviourScore: Number(user.behaviourScore),
        role: classification.role,
        userType: user.userType,
        studentId: studentId || user.universityUser?.studentId,
      },
    };
  }

  /**
   * Fetch current session profile (US1-1)
   */
  static async getCurrentProfile(payload: AuthTokenPayload) {
    if (payload.adminId) {
      const admin = await prisma.admin.findUnique({
        where: { adminId: payload.adminId },
      });

      if (!admin) throw { status: 404, message: 'Admin not found' };

      return {
        adminId: admin.adminId,
        email: admin.email,
        firstname: admin.firstname,
        lastname: admin.lastname,
        role: 'ADMIN' as const,
      };
    }

    if (!payload.uid) {
      throw { status: 401, message: 'Invalid session payload' };
    }

    const user = await prisma.user.findUnique({
      where: { uid: payload.uid },
      include: {
        universityUser: true,
        outsideUser: {
          include: {
            thaiUser: true,
            foreignUser: true,
          },
        },
      },
    });

    if (!user) throw { status: 404, message: 'User not found' };

    return {
      uid: user.uid,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
      phone: user.phone,
      imageUrl: user.imageUrl,
      isProfileComplete: user.isProfileComplete,
      behaviourScore: Number(user.behaviourScore),
      role: payload.role,
      userType: user.userType,
      studentId: user.universityUser?.studentId,
      citizenId: user.outsideUser?.thaiUser?.citizenId,
      passportId: user.outsideUser?.foreignUser?.passportId,
    };
  }

  /**
   * Fetch user behavior score and change history log (US1-5 / FR-1.5)
   */
  static async getUserScore(uid: number) {
    if (!uid) {
      throw { status: 401, message: 'Invalid user ID' };
    }

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
      throw { status: 404, message: 'User not found' };
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

    const formattedHistory = history.map((entry) => ({
      timestamp: entry.timestamp,
      scoreChange: entry.scoreChange,
      adminId: entry.adminId ?? null,
      adminName: entry.admin ? `${entry.admin.firstname} ${entry.admin.lastname}`.trim() : 'System',
    }));

    return {
      uid: user.uid,
      behaviourScore: Number(user.behaviourScore),
      history: formattedHistory,
    };
  }

  /**
   * Completes the profile created by the first Google login.
   * University users only provide a phone number. Outside users must provide
   * one identity document and are stored in the appropriate subtype table.
   */
  static async completeProfile(input: CompleteProfileInput) {
    const user = await prisma.user.findUnique({
      where: { uid: input.uid },
      include: { outsideUser: true },
    });

    if (!user) throw { status: 404, message: 'User not found' };
    if (user.isProfileComplete) {
      throw { status: 409, message: 'Profile has already been completed' };
    }

    const commonData = {
      firstname: input.firstname.trim(),
      lastname: input.lastname.trim(),
      phone: input.phone,
      isProfileComplete: true,
    };

    let updatedUser;
    if (user.userType === UserType.UNIVERSITY) {
      updatedUser = await prisma.user.update({
        where: { uid: user.uid },
        data: commonData,
        include: { universityUser: true },
      });
    } else if (input.identityType === 'THAI' && input.citizenId) {
      updatedUser = await prisma.user.update({
        where: { uid: user.uid },
        data: {
          ...commonData,
          userType: UserType.THAI,
          outsideUser: {
            create: {
              thaiUser: { create: { citizenId: input.citizenId } },
            },
          },
        },
        include: { universityUser: true },
      });
    } else if (input.identityType === 'FOREIGN' && input.passportId) {
      updatedUser = await prisma.user.update({
        where: { uid: user.uid },
        data: {
          ...commonData,
          userType: UserType.FOREIGN,
          outsideUser: {
            create: {
              foreignUser: { create: { passportId: input.passportId } },
            },
          },
        },
        include: { universityUser: true },
      });
    } else {
      throw { status: 400, message: 'Outside users must provide one valid identity document' };
    }

    const classification = classifyEmail(updatedUser.email);
    const payload: AuthTokenPayload = {
      uid: updatedUser.uid,
      email: updatedUser.email,
      firstname: updatedUser.firstname,
      lastname: updatedUser.lastname,
      role: classification.role,
      userType: updatedUser.userType,
      studentId: updatedUser.universityUser?.studentId,
      isProfileComplete: updatedUser.isProfileComplete,
    };

    return {
      token: signJwt(payload),
      user: {
        uid: updatedUser.uid,
        email: updatedUser.email,
        firstname: updatedUser.firstname,
        lastname: updatedUser.lastname,
        phone: updatedUser.phone,
        imageUrl: updatedUser.imageUrl,
        isProfileComplete: updatedUser.isProfileComplete,
        behaviourScore: Number(updatedUser.behaviourScore),
        role: classification.role,
        userType: updatedUser.userType,
        studentId: updatedUser.universityUser?.studentId,
      },
    };
  }

  /**
   * [US5-4]: Admin manual score adjustment with [0, 100] integer clamping
   */
  static async adjustUserScore(
    adminId: number,
    targetUid: number,
    scoreChange: number,
    reason: string,
    prismaClient: any = prisma
  ) {
    return await prismaClient.$transaction(async (tx: any) => {
      // 1. Admin FK Safety Guard
      const adminExists = await tx.admin.findUnique({
        where: { adminId: adminId },
      });
      if (!adminExists) {
        throw { status: 403, code: 'ADMIN_NOT_FOUND', message: 'Invalid admin account.' };
      }

      // 2. Fetch Target User
      const user = await tx.user.findUnique({
        where: { uid: targetUid },
        select: { uid: true, behaviourScore: true },
      });

      if (!user) {
        throw { status: 404, code: 'USER_NOT_FOUND', message: 'Target user not found.' };
      }

      // 3. Clamping Logic [0, 100]; the migration rounds legacy decimal scores to integers.
      const currentScore = Number(user.behaviourScore);

      let newScore = currentScore + scoreChange;
      newScore = Math.min(100, Math.max(0, newScore));

      // 4. Calculate EXACT effective change
      const actualScoreChange = newScore - currentScore;

      // ถ้าไม่มีการเปลี่ยนแปลงจริง (เช่น มี 100 แล้วแอดมินบวกเพิ่มอีก) ให้หยุดทำงานและตอบกลับทันที
      if (actualScoreChange === 0) {
        return {
          uid: targetUid,
          behaviourScore: newScore,
          note: 'Score is already at maximum/minimum limits. No changes made.',
        };
      }

      // 5. Update User Score (ACID Guard - Optimistic Concurrency)
      const updateResult = await tx.user.updateMany({
        where: {
          uid: targetUid,
          behaviourScore: user.behaviourScore, // ISOLATION GUARD: ป้องกัน NoShowWorker ตัดแต้มแทรกกลาง
        },
        data: { behaviourScore: newScore },
      });

      if (updateResult.count === 0) {
        throw {
          status: 409,
          code: 'CONCURRENT_MODIFICATION',
          message: 'The user score was modified by another process. Please try again.',
        };
      }

      // TODO (US5-4 - Hill, Kaopoon): Write audit log entry to ManageScore here
      await tx.manageScore.create({
        data: {
          uid: targetUid,
          adminId: adminId,
          scoreChange: actualScoreChange,
          reason: reason,
          timestamp: new Date(),
        },
      });

      return {
        uid: targetUid,
        behaviourScore: newScore,
      };
    });
  }
}
