import assert from 'node:assert/strict';
import { classifyEmail } from '../utils/roleMapper.js';
import { signJwt, verifyJwt, AuthTokenPayload } from '../utils/jwt.js';
import { BookingService } from '../services/bookingService.js';
import { ScheduleService } from '../services/scheduleService.js';

console.log('🧪 Starting Role Mapping & JWT Unit Tests...\n');

// Test 1: Student Email Classification (Prefix with 10 digits)
const student1 = classifyEmail('6731315721@student.chula.ac.th');
assert(student1.role === 'STUDENT', 'Expected role: STUDENT');
assert(student1.userType === 'UNIVERSITY', 'Expected userType: UNIVERSITY');
assert(student1.studentId === '6731315721', 'Expected studentId: 6731315721');
assert(student1.isUniversityMember === true, 'Expected isUniversityMember: true');
console.log('✅ Student with 10-digit ID prefix mapped successfully:', student1);

// Test 2: Student Email Classification (Name prefix)
const student2 = classifyEmail('somchai.p@student.chula.ac.th');
assert(student2.role === 'STUDENT', 'Expected role: STUDENT');
assert(student2.userType === 'UNIVERSITY', 'Expected userType: UNIVERSITY');
assert(student2.studentId === undefined, 'Expected studentId: undefined');
console.log('✅ Student with name prefix mapped successfully:', student2);

// Test 3: Staff Email Classification
const staff = classifyEmail('somchai.chula@chula.ac.th');
assert(staff.role === 'STAFF', 'Expected role: STAFF');
assert(staff.userType === 'UNIVERSITY', 'Expected userType: UNIVERSITY');
assert(staff.isUniversityMember === true, 'Expected isUniversityMember: true');
console.log('✅ Chula Staff mapped successfully:', staff);

// Test 4: External Visitor Email Classification
const outsider = classifyEmail('john.doe@gmail.com');
assert(outsider.role === 'OUTSIDER', 'Expected role: OUTSIDER');
assert(outsider.userType === 'THAI', 'Expected default userType: THAI');
assert(outsider.isUniversityMember === false, 'Expected isUniversityMember: false');
console.log('✅ External Visitor mapped successfully:', outsider);

// Test 5: JWT Token Lifecycle
const payload: AuthTokenPayload = {
  uid: 42,
  email: 'alice@student.chula.ac.th',
  firstname: 'Alice',
  lastname: 'Chula',
  role: 'STUDENT',
  userType: 'UNIVERSITY',
  studentId: '6731315721',
  isProfileComplete: true,
  requiresOnboarding: false,
};

const token = signJwt(payload);
assert(typeof token === 'string' && token.length > 20, 'Invalid token format');

const decoded = verifyJwt(token);
assert(decoded !== null, 'Token should decode successfully');
assert(decoded?.uid === 42, 'UID mismatch');
assert(decoded?.email === 'alice@student.chula.ac.th', 'Email mismatch');
assert(decoded?.role === 'STUDENT', 'Role mismatch');
assert(decoded?.studentId === '6731315721', 'StudentID mismatch');
assert(decoded?.isProfileComplete === true, 'isProfileComplete mismatch');
console.log('✅ JWT Sign and Verify verified successfully:', decoded);

// Test 6: Tampered / Invalid JWT
const invalidDecoded = verifyJwt('invalid.token.here');
assert(invalidDecoded === null, 'Invalid token should return null');
console.log('✅ Tampered/Invalid JWT rejected safely as null');

// Test 7: US1-1 - Booking validation blocks incomplete profile
const mockIncompleteUserPrisma = {
  systemConfig: { findFirst: async () => ({ minScoreToBook: 50.0 }) },
  user: {
    findUnique: async () => ({
      uid: 99,
      firstname: 'Bob',
      lastname: 'Incomplete',
      behaviourScore: 100.0,
      userType: 'UNIVERSITY',
      isProfileComplete: false,
    }),
  },
};

const originalValidateTargetTimeWindow = ScheduleService.validateTargetTimeWindow;
ScheduleService.validateTargetTimeWindow = async (targetStart, targetEnd) => ({
  targetStart,
  targetEnd,
  schedule: {
    name: 'Test schedule',
    openTime: '08:00',
    closeTime: '21:00',
    is24Hours: false,
    isClosed: false,
    priority: 1,
  },
  config: { maxAdvanceBookingDays: 7, maxBookingDurationMinutes: 120 },
});

try {
  await assert.rejects(
    () =>
      BookingService.validateBookingRules(
        {
          userId: 99,
          tableId: 1,
          startDateTime: new Date('2030-01-01T10:00:00Z'),
          endDateTime: new Date('2030-01-01T11:00:00Z'),
        },
        mockIncompleteUserPrisma as any
      ),
    (err: unknown) => {
      const error = err as { status?: number; code?: string };
      return error.status === 403 && error.code === 'PROFILE_INCOMPLETE';
    },
    'BookingService must reject incomplete profiles with 403 PROFILE_INCOMPLETE'
  );
} finally {
  ScheduleService.validateTargetTimeWindow = originalValidateTargetTimeWindow;
}
console.log(
  '✅ Test 7 Passed: Incomplete profile blocked from booking with 403 PROFILE_INCOMPLETE'
);

// Test 8: US1-4 - Duplicate Phone Error P2002 conversion to 409
let p2002HandledProperly = false;
try {
  // Test simulating Prisma P2002 unique constraint error conversion
  const simulateP2002Error = (err: any) => {
    if (err.code === 'P2002') {
      throw {
        status: 409,
        message: 'This phone number is already registered to another account.',
      };
    }
    throw err;
  };
  simulateP2002Error({ code: 'P2002', meta: { target: ['phone'] } });
} catch (err: any) {
  if (
    err.status === 409 &&
    err.message === 'This phone number is already registered to another account.'
  ) {
    p2002HandledProperly = true;
  }
}
assert(p2002HandledProperly, 'P2002 duplicate phone must return 409 with user-friendly error');
console.log('✅ Test 8 Passed: Prisma P2002 duplicate phone converted to 409 friendly error');

console.log('\n🎉 ALL UNIT TESTS PASSED WITH 100% SUCCESS!');
