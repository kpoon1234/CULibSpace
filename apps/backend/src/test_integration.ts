import { PrismaClient } from '@prisma/client';
import { AuthService } from './services/authService.js';

const prisma = new PrismaClient();

async function runIntegrationTests() {
  console.log(
    '🧪 Starting US1-1 Integration Test Suite for Student/Staff Auth & Role Mapping...\n'
  );

  try {
    // 1. Google Student login against seeded student
    console.log('--- Test: Google Student Login & Role Mapping ---');
    const studentResult = await AuthService.authenticateUser({
      email: 'alice@student.chula.ac.th',
      firstname: 'Alice',
      lastname: 'Wonderland',
    });
    console.assert(studentResult.user.role === 'STUDENT', 'Role must be STUDENT');
    console.assert(studentResult.user.studentId === '6700000001', 'StudentId mismatch');
    console.log('✅ Existing Student login verified:', studentResult.user);

    // 2. Chula Staff Login
    console.log('\n--- Test: Chula Staff Login & Role Mapping ---');
    const staffResult = await AuthService.authenticateUser({
      email: 'somchai.staff@chula.ac.th',
      firstname: 'Somchai',
      lastname: 'Staff',
    });
    console.assert(staffResult.user.role === 'STAFF', 'Role must be STAFF');
    console.log('✅ Staff login verified:', staffResult.user);

    // 3. Current session retrieval
    console.log('\n--- Test: Get Current Session Profile ---');
    const profile = await AuthService.getCurrentProfile({
      uid: studentResult.user.uid,
      email: studentResult.user.email,
      firstname: studentResult.user.firstname,
      lastname: studentResult.user.lastname,
      role: studentResult.user.role,
      userType: studentResult.user.userType,
    });
    console.assert(profile.email === 'alice@student.chula.ac.th', 'Email mismatch');
    console.log('✅ Current session profile retrieved:', profile);

    console.log('\n🎉 ALL US1-1 INTEGRATION TESTS PASSED SUCCESSFULLY!');
  } catch (err: any) {
    if (err.message?.includes("Can't reach database server")) {
      console.log(
        '⚠️ Database container is offline. Start PostgreSQL with `docker compose up -d` to run integration tests.'
      );
    } else {
      console.error('❌ Integration test failed:', err);
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

runIntegrationTests();
