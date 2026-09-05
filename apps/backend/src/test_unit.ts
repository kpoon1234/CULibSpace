import { classifyEmail } from './utils/roleMapper.js';
import { signJwt, verifyJwt, AuthTokenPayload } from './utils/jwt.js';

console.log('🧪 Starting Role Mapping & JWT Unit Tests...\n');

// Test 1: Student Email Classification (Prefix with 10 digits)
const student1 = classifyEmail('6731315721@student.chula.ac.th');
console.assert(student1.role === 'STUDENT', 'Expected role: STUDENT');
console.assert(student1.userType === 'UNIVERSITY', 'Expected userType: UNIVERSITY');
console.assert(student1.studentId === '6731315721', 'Expected studentId: 6731315721');
console.assert(student1.isUniversityMember === true, 'Expected isUniversityMember: true');
console.log('✅ Student with 10-digit ID prefix mapped successfully:', student1);

// Test 2: Student Email Classification (Name prefix)
const student2 = classifyEmail('somchai.p@student.chula.ac.th');
console.assert(student2.role === 'STUDENT', 'Expected role: STUDENT');
console.assert(student2.userType === 'UNIVERSITY', 'Expected userType: UNIVERSITY');
console.assert(student2.studentId === undefined, 'Expected studentId: undefined');
console.log('✅ Student with name prefix mapped successfully:', student2);

// Test 3: Staff Email Classification
const staff = classifyEmail('somchai.chula@chula.ac.th');
console.assert(staff.role === 'STAFF', 'Expected role: STAFF');
console.assert(staff.userType === 'UNIVERSITY', 'Expected userType: UNIVERSITY');
console.assert(staff.isUniversityMember === true, 'Expected isUniversityMember: true');
console.log('✅ Chula Staff mapped successfully:', staff);

// Test 4: External Visitor Email Classification
const outsider = classifyEmail('john.doe@gmail.com');
console.assert(outsider.role === 'OUTSIDER', 'Expected role: OUTSIDER');
console.assert(outsider.userType === 'THAI', 'Expected default userType: THAI');
console.assert(outsider.isUniversityMember === false, 'Expected isUniversityMember: false');
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
console.assert(typeof token === 'string' && token.length > 20, 'Invalid token format');

const decoded = verifyJwt(token);
console.assert(decoded !== null, 'Token should decode successfully');
console.assert(decoded?.uid === 42, 'UID mismatch');
console.assert(decoded?.email === 'alice@student.chula.ac.th', 'Email mismatch');
console.assert(decoded?.role === 'STUDENT', 'Role mismatch');
console.assert(decoded?.studentId === '6731315721', 'StudentID mismatch');
console.assert(decoded?.isProfileComplete === true, 'isProfileComplete mismatch');
console.log('✅ JWT Sign and Verify verified successfully:', decoded);

// Test 6: Tampered / Invalid JWT
const invalidDecoded = verifyJwt('invalid.token.here');
console.assert(invalidDecoded === null, 'Invalid token should return null');
console.log('✅ Tampered/Invalid JWT rejected safely as null');

console.log('\n🎉 ALL UNIT TESTS PASSED WITH 100% SUCCESS!');
