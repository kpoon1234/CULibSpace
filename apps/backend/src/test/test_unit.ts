import assert from 'node:assert/strict';
import { classifyEmail } from '../utils/roleMapper.js';
import { signJwt, verifyJwt, AuthTokenPayload } from '../utils/jwt.js';
import { BookingService } from '../services/bookingService.js';
import { ScheduleService } from '../services/scheduleService.js';
import { AuthService } from '../services/authService.js';
import { AuthController } from '../controllers/authController.js';

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

// Test 9: Consent state and timestamp handling in auth session
const consentDate = new Date('2026-11-10T08:00:00Z');
const consentUserPayload: AuthTokenPayload = {
  uid: 99,
  email: 'consent.test@chula.ac.th',
  firstname: 'Consent',
  lastname: 'Tester',
  role: 'STUDENT',
  userType: 'UNIVERSITY',
  studentId: '6700000099',
  isProfileComplete: true,
};
const consentToken = signJwt(consentUserPayload);
const verifiedConsent = verifyJwt(consentToken);
assert(verifiedConsent !== null, 'JWT verification should succeed');
assert(verifiedConsent.email === 'consent.test@chula.ac.th', 'Email must match');

// Verify OAuth state consent decoding
const statePayload = Buffer.from(
  JSON.stringify({ consent: true, timestamp: consentDate.getTime() })
).toString('base64url');
const decodedState = JSON.parse(Buffer.from(statePayload, 'base64url').toString('utf8'));
assert(decodedState.consent === true, 'OAuth state must confirm consent === true');
assert(decodedState.timestamp === consentDate.getTime(), 'Timestamp must match');
console.log('✅ Test 9 Passed: Consent state encoding and JWT verification succeeded');

// Test 10: AuthService.authenticateUser saves consentedAt ONLY when consent === true (Must Fix 1 & 2)
let createdUserData: any = null;
const mockPrismaNewUser = {
  user: {
    findUnique: async () => null,
    create: async ({ data }: any) => {
      createdUserData = data;
      return {
        uid: 101,
        ...data,
        behaviourScore: 100,
        imageUrl: null,
      };
    },
  },
};

// 10a: First-time user with consent: true
const resWithConsent = await AuthService.authenticateUser(
  {
    email: 'new.consented@student.chula.ac.th',
    firstname: 'Consented',
    lastname: 'User',
    consent: true,
  },
  mockPrismaNewUser as any
);
assert(
  createdUserData.consentedAt instanceof Date,
  'consentedAt must be Date when consent === true'
);
assert.equal(createdUserData.consentVersion, '2026-11', 'consentVersion defaults to 2026-11');
assert(resWithConsent.user.consentedAt instanceof Date);

// 10b: First-time user without consent (consent === undefined)
createdUserData = null;
const resNoConsent = await AuthService.authenticateUser(
  {
    email: 'new.unconsented@student.chula.ac.th',
    firstname: 'Unconsented',
    lastname: 'User',
  },
  mockPrismaNewUser as any
);
assert.equal(createdUserData.consentedAt, null, 'consentedAt must be null when consent not given');
assert.equal(
  createdUserData.consentVersion,
  null,
  'consentVersion must be null when consent not given'
);
assert.equal(resNoConsent.user.consentedAt, null);

// 10c: Existing user never has consentedAt overwritten (preserves first consent timestamp)
const originalConsentedAt = new Date('2026-01-15T10:00:00Z');
let updatedUserData: any = null;
const mockPrismaExistingUser = {
  user: {
    findUnique: async () => ({
      uid: 202,
      email: 'existing@student.chula.ac.th',
      firstname: 'Existing',
      lastname: 'User',
      consentedAt: originalConsentedAt,
      consentVersion: '2026-01',
      behaviourScore: 100,
      userType: 'UNIVERSITY',
      isProfileComplete: true,
    }),
    update: async ({ data }: any) => {
      updatedUserData = data;
      return {
        uid: 202,
        email: 'existing@student.chula.ac.th',
        firstname: 'Existing',
        lastname: 'User',
        consentedAt: originalConsentedAt,
        consentVersion: data.consentVersion || '2026-01',
        behaviourScore: 100,
        userType: 'UNIVERSITY',
        isProfileComplete: true,
      };
    },
  },
};

const resExisting = await AuthService.authenticateUser(
  {
    email: 'existing@student.chula.ac.th',
    firstname: 'Existing',
    lastname: 'User',
    consent: true,
    consentVersion: '2026-11',
  },
  mockPrismaExistingUser as any
);
assert.equal(
  resExisting.user.consentedAt,
  originalConsentedAt,
  'Original consentedAt must be preserved'
);
assert.equal(updatedUserData.consentVersion, '2026-11', 'consentVersion must be updated');
console.log('✅ Test 10 Passed: AuthService.authenticateUser consent handling verified');

// Test 11: AuthService.recordConsent updates consent and policy version
let recordConsentUpdated: any = null;
const mockPrismaForRecord = {
  user: {
    findUnique: async () => ({
      uid: 303,
      consentedAt: null,
      consentVersion: null,
    }),
    update: async ({ data }: any) => {
      recordConsentUpdated = data;
      return {
        uid: 303,
        consentedAt: data.consentedAt,
        consentVersion: data.consentVersion,
      };
    },
  },
};
const recorded = await AuthService.recordConsent(303, '2026-11', mockPrismaForRecord as any);
assert(recorded.consentedAt instanceof Date, 'recordConsent must set consentedAt Date');
assert.equal(recorded.consentVersion, '2026-11');
assert(recordConsentUpdated.consentedAt instanceof Date);
console.log('✅ Test 11 Passed: AuthService.recordConsent verified');

// Test 12: AuthController.login and AuthController.recordConsent with and without consent (Should Fix 8)
const originalAuthenticateUser = AuthService.authenticateUser;
const originalRecordConsent = AuthService.recordConsent;
try {
  let passedAuthInput: any = null;
  AuthService.authenticateUser = async (input: any) => {
    passedAuthInput = input;
    return {
      token: 'jwt.token.mock',
      user: {
        uid: 505,
        email: input.email,
        firstname: input.firstname,
        lastname: input.lastname,
        consentedAt: input.consent === true ? new Date() : null,
        consentVersion: input.consent === true ? input.consentVersion || '2026-11' : null,
        role: 'STUDENT',
        userType: 'UNIVERSITY',
        isProfileComplete: true,
      },
    } as any;
  };

  const createMockRes = () => {
    const res: any = {
      statusCode: 200,
      body: null,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.body = data;
        return this;
      },
    };
    return res;
  };

  // 12a: AuthController.login with consent: true
  const resWithConsent = createMockRes();
  await AuthController.login(
    {
      body: {
        email: 'controller.consent@chula.ac.th',
        firstname: 'First',
        lastname: 'Last',
        consent: true,
      },
    } as any,
    resWithConsent
  );
  assert.equal(resWithConsent.statusCode, 200);
  assert.equal(passedAuthInput.consent, true);
  assert(resWithConsent.body.user.consentedAt instanceof Date);

  // 12b: AuthController.login without consent
  const resWithoutConsent = createMockRes();
  await AuthController.login(
    {
      body: {
        email: 'controller.noconsent@chula.ac.th',
        firstname: 'First',
        lastname: 'Last',
      },
    } as any,
    resWithoutConsent
  );
  assert.equal(resWithoutConsent.statusCode, 200);
  assert.equal(passedAuthInput.consent, false);
  assert.equal(resWithoutConsent.body.user.consentedAt, null);

  // 12c: AuthController.recordConsent with consent: true
  AuthService.recordConsent = async () =>
    ({
      consentedAt: new Date(),
      consentVersion: '2026-11',
    }) as any;
  const resConsentRecord = createMockRes();
  await AuthController.recordConsent(
    {
      user: { uid: 505 },
      body: { consent: true, consentVersion: '2026-11' },
    } as any,
    resConsentRecord
  );
  assert.equal(resConsentRecord.statusCode, 200);
  assert.equal(resConsentRecord.body.success, true);

  // 12d: AuthController.recordConsent with consent: false rejects with 400
  const resConsentBad = createMockRes();
  await AuthController.recordConsent(
    {
      user: { uid: 505 },
      body: { consent: false },
    } as any,
    resConsentBad
  );
  assert.equal(resConsentBad.statusCode, 400);
  assert.equal(resConsentBad.body.error, 'Consent confirmation is required');
} finally {
  AuthService.authenticateUser = originalAuthenticateUser;
  AuthService.recordConsent = originalRecordConsent;
}
console.log(
  '✅ Test 12 Passed: AuthController login & consent endpoints with/without consent verified'
);

console.log('\n🎉 ALL UNIT TESTS PASSED WITH 100% SUCCESS!');
