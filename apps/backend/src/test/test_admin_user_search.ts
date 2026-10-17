import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient, UserType } from '@prisma/client';

// This suite must never reach a developer's application database.
process.env.DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
process.env.JWT_SECRET = 'admin-user-search-unit-test-secret';

const { AdminUserService } = await import('../services/adminUserService.js');
const { AdminUserController } = await import('../controllers/adminUserController.js');
const { authenticateToken, requireRoles } = await import('../middlewares/authMiddleware.js');
const { signJwt } = await import('../utils/jwt.js');
const { default: adminRoutes } = await import('../routes/adminRoutes.js');

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    uid: 4,
    firstname: 'Natthapong',
    lastname: 'Rattanakul',
    email: '6731100321@student.chula.ac.th',
    phone: '0812345604',
    userType: UserType.UNIVERSITY,
    behaviourScore: 45,
    isProfileComplete: true,
    imageUrl: null,
    createdAt: new Date('2026-08-04T00:00:00.000Z'),
    universityUser: { studentId: '6731100321' },
    outsideUser: null,
    ...overrides,
  };
}

function mockPrisma(rows: ReturnType<typeof userRow>[], total = rows.length) {
  const calls: { findMany?: any; count?: any; transactionCount: number } = {
    transactionCount: 0,
  };
  const client = {
    user: {
      findMany: (args: unknown) => {
        calls.findMany = args;
        return Promise.resolve(rows);
      },
      count: (args: unknown) => {
        calls.count = args;
        return Promise.resolve(total);
      },
    },
    $transaction: async (queries: Promise<unknown>[]) => {
      calls.transactionCount++;
      return Promise.all(queries);
    },
  };
  return { client: client as unknown as PrismaClient, calls };
}

function mockResponse() {
  return {
    statusCode: 200,
    body: null as any,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
  };
}

test('admin search builds case-insensitive filters without searching identity numbers', async () => {
  const { client, calls } = mockPrisma([userRow()]);
  const result = await AdminUserService.search(
    { q: '  NaTt  ', userType: UserType.UNIVERSITY, page: 1, pageSize: 20 },
    client
  );

  assert.equal(result.users[0].behaviourScore, 45);
  assert.equal(result.users[0].studentId, '6731100321');
  assert.equal(result.users[0].createdAt, '2026-08-04T00:00:00.000Z');
  assert.equal(calls.transactionCount, 1);
  assert.deepEqual(calls.count.where, calls.findMany.where);
  assert.equal(calls.findMany.where.userType, UserType.UNIVERSITY);
  const filters = calls.findMany.where.OR;
  assert.equal(filters.length, 5);
  assert.deepEqual(filters[0].firstname, { contains: 'NaTt', mode: 'insensitive' });
  assert.deepEqual(filters[1].lastname, { contains: 'NaTt', mode: 'insensitive' });
  assert.deepEqual(filters[2].email, { contains: 'NaTt', mode: 'insensitive' });
  assert.deepEqual(filters[3].phone, { contains: 'NaTt', mode: 'insensitive' });
  assert.deepEqual(filters[4].universityUser.is.studentId, {
    contains: 'NaTt',
    mode: 'insensitive',
  });
  assert.equal(JSON.stringify(calls.findMany.where).includes('citizenId'), false);
  assert.equal(JSON.stringify(calls.findMany.where).includes('passportId'), false);
  assert.equal('password' in calls.findMany.select, false);
  assert.equal('admin' in calls.findMany.select, false);
});

test('behaviour score is returned as a number even for a Decimal-like value', async () => {
  const { client } = mockPrisma([userRow({ behaviourScore: { toString: () => '45' } })]);
  const result = await AdminUserService.search({ q: '', page: 1, pageSize: 20 }, client);
  assert.equal(result.users[0].behaviourScore, 45);
  assert.equal(typeof result.users[0].behaviourScore, 'number');
});

test('full-name search matches first name and remaining last name', async () => {
  const { client, calls } = mockPrisma([userRow()]);
  await AdminUserService.search({ q: ' Natthapong   Ratt ', page: 1, pageSize: 20 }, client);
  assert.deepEqual(calls.findMany.where.OR[5].AND, [
    { firstname: { contains: 'Natthapong', mode: 'insensitive' } },
    { lastname: { contains: 'Ratt', mode: 'insensitive' } },
  ]);
});

test('Thai citizen ID is masked and no full ID or private fields leave the service', async () => {
  const fullCitizenId = '1100000000004';
  const { client } = mockPrisma([
    userRow({
      uid: 5,
      userType: UserType.THAI,
      universityUser: null,
      outsideUser: { thaiUser: { citizenId: fullCitizenId }, foreignUser: null },
      password: 'must-never-leak',
      admin: { adminId: 1 },
    }),
  ]);
  const result = await AdminUserService.search(
    { q: '', userType: UserType.THAI, page: 1, pageSize: 20 },
    client
  );
  assert.equal(result.users[0].citizenId, '1-1000-xxxxx-00-4');
  assert.equal(result.users[0].studentId, null);
  assert.equal(result.users[0].passportId, null);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(fullCitizenId), false);
  assert.equal(serialized.includes('must-never-leak'), false);
  assert.equal(serialized.includes('adminId'), false);
});

test('foreign passport is flattened and malformed citizen IDs are never returned', async () => {
  const { client } = mockPrisma([
    userRow({
      userType: UserType.FOREIGN,
      universityUser: null,
      outsideUser: { thaiUser: null, foreignUser: { passportId: 'P12345678' } },
    }),
    userRow({
      uid: 6,
      userType: UserType.THAI,
      universityUser: null,
      outsideUser: { thaiUser: { citizenId: 'unexpected' }, foreignUser: null },
    }),
  ]);
  const result = await AdminUserService.search({ q: '', page: 1, pageSize: 20 }, client);
  assert.equal(result.users[0].passportId, 'P12345678');
  assert.equal(result.users[1].citizenId, null);
});

test('pagination returns the page and count from the same filter transaction', async () => {
  const rows = Array.from({ length: 5 }, (_, index) => userRow({ uid: index + 41 }));
  const { client, calls } = mockPrisma(rows, 45);
  const result = await AdminUserService.search({ q: '', page: 3, pageSize: 20 }, client);
  assert.equal(result.users.length, 5);
  assert.deepEqual(
    { total: result.total, page: result.page, pageSize: result.pageSize },
    { total: 45, page: 3, pageSize: 20 }
  );
  assert.equal(calls.findMany.skip, 40);
  assert.equal(calls.findMany.take, 20);
  assert.deepEqual(calls.findMany.orderBy, [{ firstname: 'asc' }, { lastname: 'asc' }]);
  assert.deepEqual(calls.count.where, calls.findMany.where);
});

test('no matches return an empty list with total zero', async () => {
  const { client } = mockPrisma([], 0);
  const result = await AdminUserService.search({ q: 'absent', page: 1, pageSize: 20 }, client);
  assert.deepEqual(result, { users: [], total: 0, page: 1, pageSize: 20 });
});

test('controller validates filters and paging before calling the service', async () => {
  const originalSearch = AdminUserService.search;
  const calls: unknown[] = [];
  AdminUserService.search = (async (params) => {
    calls.push(params);
    return { users: [], total: 0, page: params.page, pageSize: params.pageSize };
  }) as typeof AdminUserService.search;

  try {
    for (const query of [
      { userType: 'ADMIN' },
      { userType: '' },
      { page: '0' },
      { page: '2.5' },
      { page: '999999999999999999999' },
      { pageSize: '0' },
      { pageSize: '500' },
      { pageSize: 'abc' },
      { q: { nested: 'natt' } },
    ]) {
      const response = mockResponse();
      await AdminUserController.search({ query } as any, response as any);
      assert.equal(response.statusCode, 400, JSON.stringify(query));
      assert.equal(response.body.success, false);
      assert.equal(calls.length, 0);
    }

    const response = mockResponse();
    await AdminUserController.search({ query: {} } as any, response as any);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.data, { users: [], total: 0, page: 1, pageSize: 20 });
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.deepEqual(calls[0], { q: '', userType: undefined, page: 1, pageSize: 20 });

    const filteredResponse = mockResponse();
    await AdminUserController.search(
      { query: { q: '  natt  ', userType: UserType.UNIVERSITY, page: '2', pageSize: '10' } } as any,
      filteredResponse as any
    );
    assert.equal(filteredResponse.statusCode, 200);
    assert.deepEqual(calls[1], {
      q: 'natt',
      userType: UserType.UNIVERSITY,
      page: 2,
      pageSize: 10,
    });
  } finally {
    AdminUserService.search = originalSearch;
  }
});

test('controller returns a generic 500 without exposing database errors', async () => {
  const originalSearch = AdminUserService.search;
  const originalError = console.error;
  AdminUserService.search = (async () => {
    throw new Error('private database detail');
  }) as typeof AdminUserService.search;
  console.error = () => {};
  try {
    const response = mockResponse();
    await AdminUserController.search({ query: {} } as any, response as any);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { success: false, error: 'Internal server error' });
  } finally {
    AdminUserService.search = originalSearch;
    console.error = originalError;
  }
});

test('route is registered and authentication rejects missing and non-admin tokens', () => {
  const usersRoute = (adminRoutes as any).stack.find(
    (layer: any) => layer.route?.path === '/users'
  );
  assert.ok(usersRoute);
  assert.equal(usersRoute.route.methods.get, true);
  assert.equal(usersRoute.route.stack.length, 3);

  const missingResponse = mockResponse();
  let nextCalled = false;
  authenticateToken({ headers: {} } as any, missingResponse as any, () => {
    nextCalled = true;
  });
  assert.equal(missingResponse.statusCode, 401);
  assert.equal(nextCalled, false);

  const invalidResponse = mockResponse();
  authenticateToken(
    { headers: { authorization: 'Bearer invalid.token.here' } } as any,
    invalidResponse as any,
    () => {
      nextCalled = true;
    }
  );
  assert.equal(invalidResponse.statusCode, 401);
  assert.equal(nextCalled, false);

  const studentToken = signJwt({
    uid: 4,
    email: 'student@chula.ac.th',
    firstname: 'Student',
    lastname: 'User',
    role: 'STUDENT',
  });
  const studentRequest = { headers: { authorization: `Bearer ${studentToken}` } } as any;
  const studentResponse = mockResponse();
  authenticateToken(studentRequest, studentResponse as any, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  let authorized = false;
  requireRoles('ADMIN')(studentRequest, studentResponse as any, () => {
    authorized = true;
  });
  assert.equal(studentResponse.statusCode, 403);
  assert.equal(authorized, false);

  const adminToken = signJwt({
    adminId: 1,
    email: 'admin@example.com',
    firstname: 'Admin',
    lastname: 'User',
    role: 'ADMIN',
  });
  const adminRequest = { headers: { authorization: `Bearer ${adminToken}` } } as any;
  const adminResponse = mockResponse();
  authenticateToken(adminRequest, adminResponse as any, () => {});
  requireRoles('ADMIN')(adminRequest, adminResponse as any, () => {
    authorized = true;
  });
  assert.equal(authorized, true);
});
