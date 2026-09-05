import type { AuthUser } from './auth';

export type ProfileFieldKey = 'firstname' | 'lastname' | 'userType' | 'phone' | 'email';

export type ProfileField = {
  key: ProfileFieldKey;
  label: string;
  value: string;
  editable: boolean;
};

/**
 * Main profile grid (per Figma "Profile2"): First name/Last name/Phone are
 * editable, User Type/Email stay locked. Matches the team decision that
 * expanded editability beyond phone-only (US1-4 follow-up).
 */
export function getProfileFields(user: AuthUser): ProfileField[] {
  return [
    { key: 'firstname', label: 'First name', value: user.firstname, editable: true },
    { key: 'lastname', label: 'Last name', value: user.lastname, editable: true },
    { key: 'userType', label: 'User Type', value: user.userType || '', editable: false },
    { key: 'phone', label: 'Phone', value: user.phone || '', editable: true },
    { key: 'email', label: 'Email', value: user.email, editable: false },
  ];
}

export type ExtraIdField = { key: string; label: string; value: string };

/**
 * Role-scoped identity fields not shown in the Figma mock (studentId only for
 * STUDENT, citizenId only for OUTSIDER/THAI, passportId only for
 * OUTSIDER/FOREIGN). Kept as locked supplementary details from the original
 * US1-4 role-based lock work.
 */
export function getExtraIdFields(user: AuthUser): ExtraIdField[] {
  const fields: ExtraIdField[] = [];

  if (user.role === 'STUDENT' && user.studentId) {
    fields.push({ key: 'studentId', label: 'Student ID', value: user.studentId });
  }

  if (user.role === 'OUTSIDER' && user.userType === 'THAI' && user.citizenId) {
    fields.push({ key: 'citizenId', label: 'Citizen ID', value: user.citizenId });
  }

  if (user.role === 'OUTSIDER' && user.userType === 'FOREIGN' && user.passportId) {
    fields.push({ key: 'passportId', label: 'Passport ID', value: user.passportId });
  }

  return fields;
}
