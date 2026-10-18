import { AuthController } from '../controllers/authController.js';
import { AuthService } from '../services/authService.js';

console.log('===============================================================');
console.log('🧪 US5-4: Admin Score Adjustment API & Concurrency Tests');
console.log('===============================================================\n');

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ` -> \${detail}` : ''}`);
    failed++;
  }
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
}

async function runTests() {
  console.log('--- Suite 1: Authorization & RBAC ---');
  {
    const req = { body: { targetUid: 1, scoreChange: 10, reason: 'test' } } as any;
    const res = createMockRes();
    await AuthController.adjustScore(req, res as any);
    assert(res.statusCode === 401, 'Test 1.1: Missing Admin session returns 401 Unauthorized');
  }

  console.log('\n--- Suite 2: Strict Input Validation ---');
  {
    const originalAdjustUserScore = AuthService.adjustUserScore;
    const calls: Array<{
      adminId: number;
      targetUid: number;
      scoreChange: number;
      reason: string;
    }> = [];
    AuthService.adjustUserScore = async (adminId, targetUid, scoreChange, reason) => {
      calls.push({ adminId, targetUid, scoreChange, reason });
      return { uid: targetUid, behaviourScore: 50 };
    };

    try {
      const validBody = { targetUid: 1, scoreChange: 10, reason: 'valid' };
      const invalidBodies: Array<{ name: string; body: unknown }> = [
        { name: 'missing body', body: undefined },
        { name: 'null body', body: null },
        { name: 'array body', body: [] },
        { name: 'string body', body: 'invalid' },
        { name: 'blank reason', body: { ...validBody, reason: '   ' } },
        { name: 'alphanumeric UID', body: { ...validBody, targetUid: '12abc' } },
        { name: 'negative UID', body: { ...validBody, targetUid: -5 } },
        { name: 'boolean UID', body: { ...validBody, targetUid: true } },
        { name: 'empty UID', body: { ...validBody, targetUid: '' } },
        { name: 'hexadecimal UID', body: { ...validBody, targetUid: '0x10' } },
        { name: 'UID above Prisma Int range', body: { ...validBody, targetUid: 2_147_483_648 } },
        { name: 'missing scoreChange', body: { targetUid: 1, reason: 'valid' } },
        { name: 'null scoreChange', body: { ...validBody, scoreChange: null } },
        { name: 'empty scoreChange', body: { ...validBody, scoreChange: '' } },
        { name: 'whitespace scoreChange', body: { ...validBody, scoreChange: '  ' } },
        { name: 'boolean scoreChange', body: { ...validBody, scoreChange: true } },
        { name: 'array scoreChange', body: { ...validBody, scoreChange: [] } },
        { name: 'object scoreChange', body: { ...validBody, scoreChange: {} } },
        { name: 'decimal scoreChange', body: { ...validBody, scoreChange: 5.5 } },
        { name: 'hexadecimal scoreChange', body: { ...validBody, scoreChange: '0x10' } },
        { name: 'zero scoreChange', body: { ...validBody, scoreChange: 0 } },
        { name: 'infinite scoreChange', body: { ...validBody, scoreChange: Infinity } },
        {
          name: 'unsafe scoreChange',
          body: { ...validBody, scoreChange: Number.MAX_SAFE_INTEGER + 1 },
        },
      ];

      for (const { name, body } of invalidBodies) {
        const res = createMockRes();
        await AuthController.adjustScore(
          { user: { adminId: 1, role: 'ADMIN' }, body } as any,
          res as any
        );
        assert(
          res.statusCode === 400 && calls.length === 0,
          `${name} returns 400 before service call`
        );
      }

      for (const body of [
        { targetUid: 7, scoreChange: -5, reason: '  correction  ' },
        { targetUid: '7', scoreChange: '+5', reason: '  appeal  ' },
      ]) {
        const res = createMockRes();
        await AuthController.adjustScore(
          { user: { adminId: 1, role: 'ADMIN' }, body } as any,
          res as any
        );
        assert(res.statusCode === 200, 'valid numeric input reaches the service');
      }
      assert(
        calls.length === 2 &&
          calls[0].targetUid === 7 &&
          calls[0].scoreChange === -5 &&
          calls[0].reason === 'correction' &&
          calls[1].targetUid === 7 &&
          calls[1].scoreChange === 5 &&
          calls[1].reason === 'appeal',
        'number and decimal string inputs are parsed without changing their values'
      );
    } finally {
      AuthService.adjustUserScore = originalAdjustUserScore;
    }
  }

  console.log('\n--- Suite 2b: Service Score Change Validation ---');
  {
    let transactionCalls = 0;
    const mockPrisma = {
      $transaction: async () => {
        transactionCalls++;
        throw new Error('Invalid input must not start a transaction');
      },
    };

    for (const scoreChange of [0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      try {
        await AuthService.adjustUserScore(1, 2, scoreChange, 'Invalid', mockPrisma);
        assert(false, `service rejects invalid scoreChange ${scoreChange}`);
      } catch (err: any) {
        assert(
          err.status === 400 && err.code === 'INVALID_SCORE_CHANGE',
          `service rejects invalid scoreChange ${scoreChange}`
        );
      }
    }
    assert(transactionCalls === 0, 'invalid scoreChange does not start a transaction');
  }

  console.log('\n--- Suite 3: Clamping, Effective Change, and Audit Log ---');
  {
    let capturedAuditData: any = null;
    let capturedUserUpdate: any = null;

    const mockPrisma = {
      $transaction: async (callback: any) => await callback(mockPrisma),
      admin: { findUnique: async () => ({ adminId: 1 }) },
      user: {
        findUnique: async () => ({ uid: 2, behaviourScore: 90 }), // Current score 90
        updateMany: async ({ data }: any) => {
          capturedUserUpdate = data;
          return { count: 1 };
        },
      },
      manageScore: {
        create: async ({ data }: any) => {
          capturedAuditData = data;
        },
      },
    };

    // Attempt to add +30 (Should clamp at 100, actual change +10)
    await AuthService.adjustUserScore(1, 2, 30, 'Compensation for error', mockPrisma);

    assert(capturedUserUpdate.behaviourScore === 100, 'Test 3.1: Score is clamped to maximum 100');
    assert(
      capturedAuditData.scoreChange === 10,
      'Test 3.2: Audit log records EFFECTIVE change (+10) not input (+30)'
    );
    assert(
      capturedAuditData.reason === 'Compensation for error',
      'Test 3.3: Reason is perfectly recorded in ManageScore audit log'
    );
  }

  console.log('\n--- Suite 4: Score Drop Clamping (0 Minimum) ---');
  {
    let capturedAuditData: any = null;
    let capturedUserUpdate: any = null;

    const mockPrisma = {
      $transaction: async (callback: any) => await callback(mockPrisma),
      admin: { findUnique: async () => ({ adminId: 1 }) },
      user: {
        findUnique: async () => ({ uid: 2, behaviourScore: 5 }), // Current score 5
        updateMany: async ({ data }: any) => {
          capturedUserUpdate = data;
          return { count: 1 };
        },
      },
      manageScore: {
        create: async ({ data }: any) => {
          capturedAuditData = data;
        },
      },
    };

    // Attempt to deduct -20 (Should clamp at 0, actual change -5)
    await AuthService.adjustUserScore(1, 2, -20, 'Severe penalty', mockPrisma);

    assert(capturedUserUpdate.behaviourScore === 0, 'Test 4.1: Score is clamped to minimum 0');
    assert(
      capturedAuditData.scoreChange === -5,
      'Test 4.2: Audit log records EFFECTIVE penalty (-5)'
    );
    assert(capturedAuditData.reason === 'Severe penalty', 'Test 4.3: Audit log records reason');
  }

  console.log('\n--- Suite 5: Audit Failure Propagation ---');
  {
    const mockPrisma = {
      $transaction: async (callback: any) => await callback(mockPrisma),
      admin: { findUnique: async () => ({ adminId: 1 }) },
      user: {
        findUnique: async () => ({ uid: 2, behaviourScore: 80 }),
        updateMany: async () => ({ count: 1 }),
      },
      manageScore: {
        create: async () => {
          throw new Error('DB Crash during audit log');
        },
      },
    };

    try {
      await AuthService.adjustUserScore(1, 2, 10, 'Test rollback', mockPrisma);
      assert(false, 'Test 5.1: Audit write failure should reject the transaction callback');
    } catch (err: any) {
      assert(
        err.message === 'DB Crash during audit log',
        'Test 5.1: Audit write failure propagates; database rollback needs an integration test'
      );
    }
  }

  console.log('\n--- Suite 6: Concurrency vs NoShowWorker (Lost Update Guard) ---');
  {
    const mockPrisma = {
      $transaction: async (callback: any) => await callback(mockPrisma),
      admin: { findUnique: async () => ({ adminId: 1 }) },
      user: {
        findUnique: async () => ({ uid: 2, behaviourScore: 100 }),
        updateMany: async () => ({ count: 0 }), // Simulate NoShowWorker modified the score first!
      },
      manageScore: { create: async () => ({}) },
    };

    try {
      await AuthService.adjustUserScore(1, 2, -5, 'Manual deduct', mockPrisma);
      assert(false, 'Test 6.1: Should reject when concurrent modification detected');
    } catch (err: any) {
      assert(
        err.status === 409 && err.code === 'CONCURRENT_MODIFICATION',
        'Test 6.1: Rejects with 409 CONCURRENT_MODIFICATION if NoShowWorker intercepts the update'
      );
    }
  }

  console.log('\n===============================================================');
  console.log(`📊 Result: ${passed} passed, ${failed} failed`);
  console.log('===============================================================');

  if (failed > 0) process.exit(1);
}

runTests();
