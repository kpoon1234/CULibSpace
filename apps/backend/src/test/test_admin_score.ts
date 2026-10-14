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
    const reqBase = { user: { adminId: 1, role: 'ADMIN' }, body: {} } as any;

    // 2.1 Missing Reason
    const res1 = createMockRes();
    reqBase.body = { targetUid: 1, scoreChange: 10, reason: '   ' };
    await AuthController.adjustScore(reqBase, res1 as any);
    assert(
      res1.statusCode === 400 && res1.body.error.includes('reason'),
      'Test 2.1: Empty/Whitespace reason returns 400'
    );

    // 2.2 Invalid UID (String)
    const res2 = createMockRes();
    reqBase.body = { targetUid: '12abc', scoreChange: 10, reason: 'valid' };
    await AuthController.adjustScore(reqBase, res2 as any);
    assert(res2.statusCode === 400, 'Test 2.2: Alphanumeric UID returns 400');

    // 2.3 Negative UID
    const res3 = createMockRes();
    reqBase.body = { targetUid: -5, scoreChange: 10, reason: 'valid' };
    await AuthController.adjustScore(reqBase, res3 as any);
    assert(res3.statusCode === 400, 'Test 2.3: Negative UID returns 400');

    // 2.4 Float scoreChange
    const res4 = createMockRes();
    reqBase.body = { targetUid: 1, scoreChange: 5.5, reason: 'valid' };
    await AuthController.adjustScore(reqBase, res4 as any);
    assert(
      res4.statusCode === 400 && res4.body.error.includes('integer'),
      'Test 2.4: Float scoreChange returns 400'
    );
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
