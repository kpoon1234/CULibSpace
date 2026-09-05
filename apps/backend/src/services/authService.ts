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
}
