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
        isProfileComplete: updatedUser.isProfileComplete,
        behaviourScore: Number(updatedUser.behaviourScore),
        role: classification.role,
        userType: updatedUser.userType,
        studentId: updatedUser.universityUser?.studentId,
      },
    };
  }

  /**
   * Update current user's editable profile fields.
   */
  static async updateProfile(
    uid: number,
    data: { firstname?: string; lastname?: string; phone?: string }
  ) {
    const user = await prisma.user.findUnique({
      where: { uid },
      include: { universityUser: true },
    });

    if (!user) {
      throw { status: 404, message: 'User not found' };
    }

    const updateData: { firstname?: string; lastname?: string; phone?: string } = {};

    if (typeof data.firstname === 'string' && data.firstname.trim()) {
      updateData.firstname = data.firstname.trim();
    }

    if (typeof data.lastname === 'string' && data.lastname.trim()) {
      updateData.lastname = data.lastname.trim();
    }

    if (typeof data.phone === 'string') {
      const digits = data.phone.replace(/\D/g, '');
      if (digits.length !== 10) {
        throw { status: 400, message: 'Phone number must contain exactly 10 digits' };
      }
      updateData.phone = digits;
    }

    const updatedUser = await prisma.user.update({
      where: { uid },
      data: updateData,
      include: { universityUser: true },
    });

    const classification = classifyEmail(updatedUser.email);

    return {
      user: {
        uid: updatedUser.uid,
        email: updatedUser.email,
        firstname: updatedUser.firstname,
        lastname: updatedUser.lastname,
        phone: updatedUser.phone,
        isProfileComplete: updatedUser.isProfileComplete,
        behaviourScore: Number(updatedUser.behaviourScore),
        role: classification.role,
        userType: updatedUser.userType,
        studentId: updatedUser.universityUser?.studentId,
      },
    };
  }
}
