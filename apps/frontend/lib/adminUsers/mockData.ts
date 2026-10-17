import type { AdminUserSummary, UserSearchPage, UserSearchQuery } from './types';
import { DEFAULT_PAGE_SIZE } from './types';

// Synthetic users for NEXT_PUBLIC_ADMIN_USERS_MOCK=1 only (offline demo, before
// GET /api/admin/users exists). Every name, email and ID here is invented —
// the page shows a "Sample data" badge whenever these are served.

const BASE: Omit<AdminUserSummary, 'imageUrl' | 'createdAt'>[] = [
  {
    uid: 1,
    firstname: 'Pimchanok',
    lastname: 'Srisuk',
    email: '6631000121@student.chula.ac.th',
    phone: '0812345601',
    userType: 'UNIVERSITY',
    behaviourScore: 100,
    isProfileComplete: true,
    studentId: '6631000121',
    citizenId: null,
    passportId: null,
  },
  {
    uid: 2,
    firstname: 'Thanakorn',
    lastname: 'Wongsawat',
    email: '6530200221@student.chula.ac.th',
    phone: '0812345602',
    userType: 'UNIVERSITY',
    behaviourScore: 85,
    isProfileComplete: true,
    studentId: '6530200221',
    citizenId: null,
    passportId: null,
  },
  {
    uid: 3,
    firstname: 'Kanokwan',
    lastname: 'Charoenphol',
    email: 'kanokwan.c@chula.ac.th',
    phone: '0812345603',
    userType: 'UNIVERSITY',
    behaviourScore: 100,
    isProfileComplete: true,
    studentId: null,
    citizenId: null,
    passportId: null,
  },
  {
    uid: 4,
    firstname: 'Natthapong',
    lastname: 'Rattanakul',
    email: '6731100321@student.chula.ac.th',
    phone: '0812345604',
    userType: 'UNIVERSITY',
    behaviourScore: 45,
    isProfileComplete: true,
    studentId: '6731100321',
    citizenId: null,
    passportId: null,
  },
  {
    uid: 5,
    firstname: 'Supansa',
    lastname: 'Kittisak',
    email: 'supansa.k@gmail.com',
    phone: '0812345605',
    userType: 'THAI',
    behaviourScore: 70,
    isProfileComplete: true,
    studentId: null,
    citizenId: '1-1037-xxxxx-12-3',
    passportId: null,
  },
  {
    uid: 6,
    firstname: 'Daniel',
    lastname: 'Okafor',
    email: 'd.okafor@outlook.com',
    phone: '0812345606',
    userType: 'FOREIGN',
    behaviourScore: 92,
    isProfileComplete: true,
    studentId: null,
    citizenId: null,
    passportId: 'A1234xxxx',
  },
  {
    uid: 7,
    firstname: 'Wichai',
    lastname: 'Boonmee',
    email: '6430300421@student.chula.ac.th',
    phone: null,
    userType: 'UNIVERSITY',
    behaviourScore: 100,
    isProfileComplete: false,
    studentId: '6430300421',
    citizenId: null,
    passportId: null,
  },
  {
    uid: 8,
    firstname: 'Mai',
    lastname: 'Nguyen',
    email: 'mai.nguyen.th@gmail.com',
    phone: '0812345608',
    userType: 'FOREIGN',
    behaviourScore: 30,
    isProfileComplete: true,
    studentId: null,
    citizenId: null,
    passportId: 'C9876xxxx',
  },
  {
    uid: 9,
    firstname: 'Arthit',
    lastname: 'Phromma',
    email: 'arthit.p@chula.ac.th',
    phone: '0812345609',
    userType: 'UNIVERSITY',
    behaviourScore: 60,
    isProfileComplete: true,
    studentId: null,
    citizenId: null,
    passportId: null,
  },
  {
    uid: 10,
    firstname: 'Chanida',
    lastname: 'Saetang',
    email: 'chanida.st@hotmail.com',
    phone: '0812345610',
    userType: 'THAI',
    behaviourScore: 50,
    isProfileComplete: true,
    studentId: null,
    citizenId: '3-1002-xxxxx-45-6',
    passportId: null,
  },
  {
    uid: 11,
    firstname: 'Kittipat',
    lastname: 'Anuwong',
    email: '6632100521@student.chula.ac.th',
    phone: '0812345611',
    userType: 'UNIVERSITY',
    behaviourScore: 95,
    isProfileComplete: true,
    studentId: '6632100521',
    citizenId: null,
    passportId: null,
  },
  {
    uid: 12,
    firstname: 'Sirinya',
    lastname: 'Thongdee',
    email: '6533200621@student.chula.ac.th',
    phone: '0812345612',
    userType: 'UNIVERSITY',
    behaviourScore: 0,
    isProfileComplete: true,
    studentId: '6533200621',
    citizenId: null,
    passportId: null,
  },
];

const MOCK_USERS: AdminUserSummary[] = BASE.map((u, i) => ({
  ...u,
  imageUrl: null,
  createdAt: new Date(Date.UTC(2026, 7, 1 + i)).toISOString(),
}));

/** Same matching rules the backend is asked to apply (see lib/ARCHITECTURE.md). */
export function mockSearchUsers(query: UserSearchQuery): UserSearchPage {
  const q = query.q?.trim().toLowerCase() ?? '';
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = Math.max(1, query.page ?? 1);

  const matches = MOCK_USERS.filter((u) => {
    if (query.userType && u.userType !== query.userType) return false;
    if (!q) return true;
    return [u.firstname, u.lastname, `${u.firstname} ${u.lastname}`, u.email, u.studentId, u.phone]
      .filter(Boolean)
      .some((field) => field!.toLowerCase().includes(q));
  }).sort((a, b) => a.firstname.localeCompare(b.firstname));

  return {
    users: matches.slice((page - 1) * pageSize, page * pageSize),
    total: matches.length,
    page,
    pageSize,
  };
}
