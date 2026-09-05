import type { AuthUser } from './auth';

export type ProfileFieldKey =
  | 'email'
  | 'firstname'
  | 'lastname'
  | 'role'
  | 'studentId'
  | 'citizenId'
  | 'passportId'
  | 'behaviourScore'
  | 'phone';

export type ProfileField = {
  key: ProfileFieldKey;
  label: string;
  value: string;
  editable: boolean;
};

/**
 * Fields are role/userType-scoped (US1-4): studentId only exists for STUDENT,
 * citizenId only for OUTSIDER/THAI, passportId only for OUTSIDER/FOREIGN.
 * Everything is read-only except phone (ARCHITECTURE.md FR-1.x).
 */
export function getProfileFields(user: AuthUser): ProfileField[] {
  const fields: ProfileField[] = [
    { key: 'email', label: 'Email', value: user.email, editable: false },
    { key: 'firstname', label: 'First name', value: user.firstname, editable: false },
    { key: 'lastname', label: 'Last name', value: user.lastname, editable: false },
    { key: 'role', label: 'Role', value: user.role, editable: false },
  ];

  if (user.role === 'STUDENT' && user.studentId) {
    fields.push({ key: 'studentId', label: 'Student ID', value: user.studentId, editable: false });
  }

  if (user.role === 'OUTSIDER' && user.userType === 'THAI' && user.citizenId) {
    fields.push({ key: 'citizenId', label: 'Citizen ID', value: user.citizenId, editable: false });
  }

  if (user.role === 'OUTSIDER' && user.userType === 'FOREIGN' && user.passportId) {
    fields.push({
      key: 'passportId',
      label: 'Passport ID',
      value: user.passportId,
      editable: false,
    });
  }

  if (typeof user.behaviourScore === 'number') {
    fields.push({
      key: 'behaviourScore',
      label: 'Behaviour score',
      value: user.behaviourScore.toFixed(1),
      editable: false,
    });
  }

  fields.push({ key: 'phone', label: 'Phone number', value: user.phone || '', editable: true });

  return fields;
}
