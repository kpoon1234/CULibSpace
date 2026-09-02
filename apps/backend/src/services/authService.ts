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

/**
 * Generate a safe unique provisional phone number if not provided during first login
 */
function generateProvisionalPhone(): string {
  const randomSuffix = Math.floor(100000000 + Math.random() * 900000000).toString();
  return `0${randomSuffix.substring(0, 9)}`;
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
      // First-time user creation
      const phone = input.phone?.trim() || generateProvisionalPhone();

      if (classification.isUniversityMember) {
        studentId = input.studentId || classification.studentId;
        user = await prisma.user.create({
          data: {
            email,
            firstname: input.firstname,
            lastname: input.lastname,
            phone,
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
