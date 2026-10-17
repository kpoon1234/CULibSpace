// Types for the admin user search (US5-4). Shapes mirror the Prisma `User` model
// plus its subtype rows (UniversityUser / ThaiUser / ForeignUser) — see
// lib/ARCHITECTURE.md for the proposed GET /api/admin/users contract.

/** Prisma `UserType` enum, by member name (how the backend serialises it). */
export type UserType = 'UNIVERSITY' | 'THAI' | 'FOREIGN';

export const USER_TYPES: readonly UserType[] = ['UNIVERSITY', 'THAI', 'FOREIGN'];

/** One row of the search result — what an admin needs to pick the right person. */
export interface AdminUserSummary {
  uid: number;
  firstname: string;
  lastname: string;
  email: string;
  phone: string | null;
  userType: UserType;
  /** Int in the DB (0–100). */
  behaviourScore: number;
  isProfileComplete: boolean;
  /** UniversityUser.studentId — null for staff and outside visitors. */
  studentId: string | null;
  /** ThaiUser.citizenId — the backend should send it masked (e.g. "1-1037-xxxxx-12-3"). */
  citizenId: string | null;
  /** ForeignUser.passportId. */
  passportId: string | null;
  imageUrl: string | null;
  createdAt: string;
}

export interface UserSearchQuery {
  /** Matches first name, last name, email, student ID or phone. Empty lists everyone. */
  q?: string;
  userType?: UserType;
  /** 1-based. */
  page?: number;
  pageSize?: number;
}

export interface UserSearchPage {
  users: AdminUserSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** Envelope the backend's other controllers use. */
export interface UserSearchEnvelope {
  success: boolean;
  data?: UserSearchPage;
  error?: string;
}

export const DEFAULT_PAGE_SIZE = 20;
