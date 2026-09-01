import { UserType } from '@prisma/client';

export type AppRole = 'STUDENT' | 'STAFF' | 'OUTSIDER' | 'ADMIN';

export interface EmailClassification {
  role: AppRole;
  userType: UserType;
  studentId?: string;
  isUniversityMember: boolean;
}

/**
 * Classifies an email address into an internal application role and database UserType.
 *
 * Rules:
 * 1. `@student.chula.ac.th` -> STUDENT (UNIVERSITY), extracts 10-digit student ID if present
 * 2. `@chula.ac.th` -> STAFF (UNIVERSITY)
 * 3. Other domains (e.g., `@gmail.com`) -> OUTSIDER (THAI by default, requires onboarding)
 */
export function classifyEmail(email: string): EmailClassification {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Chula Student
  if (normalizedEmail.endsWith('@student.chula.ac.th')) {
    const studentIdMatch = normalizedEmail.match(/^(\d{10})@/);
    return {
      role: 'STUDENT',
      userType: UserType.UNIVERSITY,
      studentId: studentIdMatch ? studentIdMatch[1] : undefined,
      isUniversityMember: true,
    };
  }

  // 2. Chula Staff / Faculty
  if (normalizedEmail.endsWith('@chula.ac.th')) {
    return {
      role: 'STAFF',
      userType: UserType.UNIVERSITY,
      isUniversityMember: true,
    };
  }

  // 3. External Visitor
  return {
    role: 'OUTSIDER',
    userType: UserType.THAI, // Default to THAI, updated during onboarding if foreign
    isUniversityMember: false,
  };
}
