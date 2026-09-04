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
    if (!payload.uid) {
      throw { status: 401, message: 'Invalid session payload' };
    }

    const user = await prisma.user.findUnique({
      where: { uid: payload.uid },
      include: {
        universityUser: true,
      },
    });

    if (!user) throw { status: 404, message: 'User not found' };

    return {
      uid: user.uid,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
      phone: user.phone,
      isProfileComplete: user.isProfileComplete,
      behaviourScore: Number(user.behaviourScore),
      role: payload.role,
      userType: user.userType,
      studentId: user.universityUser?.studentId,
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
      adminId: entry.adminId,
      adminName: `${entry.admin.firstname} ${entry.admin.lastname}`.trim(),
    }));

    return {
      uid: user.uid,
      behaviourScore: Number(user.behaviourScore),
      history: formattedHistory,
    };
  }
}
