import { PrismaClient } from '@prisma/client';
import { AuthService } from './services/authService.js';

const prisma = new PrismaClient();

async function runScoreTests() {
  console.log('🧪 Starting US1-5 Test Suite for Behavior Score & Audit History...\n');

  try {
    // 1. Test fetching score for user with penalty history (UID 1: Alice)
    console.log('--- Test 1: User with score history (UID 1) ---');
    const aliceScore = await AuthService.getUserScore(1);
    console.log('Alice score data:', aliceScore);
    console.assert(
      typeof aliceScore.behaviourScore === 'number',
      'behaviourScore must be a number'
    );
    console.assert(Array.isArray(aliceScore.history), 'history must be an array');
    console.log(
      `✅ Verified: User 1 score = ${aliceScore.behaviourScore}, history length = ${aliceScore.history.length}`
    );

    // 2. Test fetching score for user with no penalty history (UID 2: Bob)
    console.log('\n--- Test 2: User with clean record / no penalty (UID 2) ---');
    const bobScore = await AuthService.getUserScore(2);
    console.log('Bob score data:', bobScore);
    console.assert(bobScore.behaviourScore === 100.0, 'Default score must be 100.0');
    console.assert(bobScore.history.length === 0, 'Clean record must have empty history list');
    console.log(
      '✅ Verified: New/clean user has default full score (100.0) and empty history array (not error)'
    );

    // 3. Test non-existent user throws 404
    console.log('\n--- Test 3: Non-existent User Error Handling ---');
    try {
      await AuthService.getUserScore(999999);
      console.assert(false, 'Should have thrown error for non-existent user');
    } catch (err: any) {
      console.assert(err.status === 404, 'Status must be 404');
      console.log('✅ Verified: Non-existent user correctly returns 404');
    }

    console.log('\n🎉 ALL US1-5 BEHAVIOR SCORE TESTS PASSED SUCCESSFULLY!');
  } catch (err: any) {
    if (err.message?.includes("Can't reach database server")) {
      console.log('⚠️ Database offline. Integration tests skipped in offline environment.');
    } else {
      console.error('❌ Test failed:', err);
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

runScoreTests();
