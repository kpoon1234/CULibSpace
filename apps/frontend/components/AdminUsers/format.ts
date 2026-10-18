import type { AdminUserSummary, UserType } from '@/lib/adminUsers';

export const USER_TYPE_LABEL: Record<UserType, string> = {
  UNIVERSITY: 'CU member',
  THAI: 'Thai visitor',
  FOREIGN: 'Foreign visitor',
};

export function fullName(u: AdminUserSummary): string {
  return `${u.firstname} ${u.lastname}`;
}

export function initials(u: AdminUserSummary): string {
  return `${u.firstname.charAt(0)}${u.lastname.charAt(0)}`.toUpperCase();
}

/** The one ID that identifies this person at the desk, labelled by kind. */
export function identityDoc(u: AdminUserSummary): { label: string; value: string } | null {
  if (u.studentId) return { label: 'Student ID', value: u.studentId };
  if (u.citizenId) return { label: 'Citizen ID', value: u.citizenId };
  if (u.passportId) return { label: 'Passport', value: u.passportId };
  return null;
}

/** Scores are whole numbers in the DB (Int); round defensively in case a stray decimal arrives. */
export function formatScore(score: number): string {
  return String(Math.round(score));
}

export function formatJoined(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
