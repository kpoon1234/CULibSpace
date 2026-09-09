import { classifyEmail } from '../utils/roleMapper.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface UpdateProfileInput {
  firstname?: string;
  lastname?: string;
  phone?: string;
  imageUrl?: string;
}

export interface ProfileResult {
  user: {
    uid: number;
    email: string;
    firstname: string;
    lastname: string;
    phone: string | null;
    imageUrl: string | null;
    isProfileComplete: boolean;
    behaviourScore: number;
    role: string;
    userType: string;
    studentId?: string | null;
  };
}

export class ProfileService {
  static async updateProfile(uid: number, data: UpdateProfileInput): Promise<ProfileResult> {
    const user = await prisma.user.findUnique({
      where: { uid },
      include: { universityUser: true },
    });

    if (!user) {
      throw { status: 404, message: 'User not found' };
    }

    const updateData: UpdateProfileInput = {};

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

    if (typeof data.imageUrl === 'string') {
      const trimmed = data.imageUrl.trim();
      if (trimmed) {
        updateData.imageUrl = trimmed;
      }
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
        imageUrl: updatedUser.imageUrl,
        isProfileComplete: updatedUser.isProfileComplete,
        behaviourScore: Number(updatedUser.behaviourScore),
        role: classification.role,
        userType: updatedUser.userType,
        studentId: updatedUser.universityUser?.studentId,
      },
    };
  }

  static async updateProfileImage(uid: number, imageUrl: string): Promise<ProfileResult> {
    const user = await prisma.user.findUnique({
      where: { uid },
      include: { universityUser: true },
    });

    if (!user) {
      throw { status: 404, message: 'User not found' };
    }

    const trimmed = imageUrl.trim();
    if (!trimmed) {
      throw { status: 400, message: 'Image URL is required' };
    }

    const updatedUser = await prisma.user.update({
      where: { uid },
      data: { imageUrl: trimmed },
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
        imageUrl: updatedUser.imageUrl,
        isProfileComplete: updatedUser.isProfileComplete,
        behaviourScore: Number(updatedUser.behaviourScore),
        role: classification.role,
        userType: updatedUser.userType,
        studentId: updatedUser.universityUser?.studentId,
      },
    };
  }
}
