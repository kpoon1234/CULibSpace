import { requireRoles, AuthenticatedRequest } from './middlewares/authMiddleware.js';
import { signJwt, verifyJwt } from './utils/jwt.js';

function runAdminRbacTests() {
  console.log('🧪 Starting US1-3 Test Suite for Admin RBAC Middleware...\n');

  const adminToken = signJwt({
    adminId: 1,
    email: 'admin1@chula.ac.th',
    firstname: 'Library',
    lastname: 'Admin',
    role: 'ADMIN',
  });

  const studentToken = signJwt({
    uid: 1,
    email: 'alice@student.chula.ac.th',
    firstname: 'Alice',
    lastname: 'Wonderland',
    role: 'STUDENT',
  });

  const adminPayload = verifyJwt(adminToken);
  const studentPayload = verifyJwt(studentToken);

  let responseStatusCode = 0;
  let responseJson: any = null;

  const mockRes = () => {
    const res: any = {};
    res.status = (code: number) => {
      responseStatusCode = code;
      return res;
    };
    res.json = (data: any) => {
      responseJson = data;
      return res;
    };
    return res;
  };

  // Test 1: Admin accessing ADMIN-only route
  let adminNextCalled: boolean = false;
  const adminReq: AuthenticatedRequest = {
    user: adminPayload!,
  } as any;

  requireRoles('ADMIN')(adminReq, mockRes(), () => {
    adminNextCalled = true;
  });

  console.assert(adminNextCalled, 'Admin must be granted access');
  console.log('✅ Test 1 Passed: Admin granted access to ADMIN-only route');

  // Test 2: Student attempting to access ADMIN-only route -> 403 Forbidden
  let studentNextCalled: boolean = false;
  responseStatusCode = 0;
  responseJson = null;

  const studentReq: AuthenticatedRequest = {
    user: studentPayload!,
  } as any;

  requireRoles('ADMIN')(studentReq, mockRes(), () => {
    studentNextCalled = true;
  });

  console.assert(!studentNextCalled, 'Student must NOT reach next handler');
  console.assert(responseStatusCode === 403, 'Must return 403 Forbidden');
  console.assert(responseJson?.error?.includes('Forbidden'), 'Response must explain Forbidden');
  console.log('✅ Test 2 Passed: Student blocked with 403 Forbidden from admin route');

  // Test 3: Unauthenticated user attempting to access RBAC route -> 401
  let unauthNextCalled: boolean = false;
  responseStatusCode = 0;
  const unauthReq: AuthenticatedRequest = {} as any;

  requireRoles('ADMIN')(unauthReq, mockRes(), () => {
    unauthNextCalled = true;
  });

  console.assert(!unauthNextCalled, 'Unauthenticated user must be blocked');
  console.assert(responseStatusCode === 401, 'Must return 401 Unauthorized');
  console.log('✅ Test 3 Passed: Unauthenticated request rejected with 401');

  console.log('\n🎉 ALL US1-3 ADMIN RBAC TESTS PASSED SUCCESSFULLY!');
}

runAdminRbacTests();
