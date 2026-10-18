import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';

// A unit test must never reach the developer's application database.
process.env.DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
process.env.JWT_SECRET = 'admin-audit-logs-unit-test-secret';

const { AdminAuditService } = await import('../services/adminAuditService.js');
const { AdminAuditController } = await import('../controllers/adminAuditController.js');
const { signJwt } = await import('../utils/jwt.js');
const { default: adminRoutes } = await import('../routes/adminRoutes.js');

function auditRow(overrides: Record<string, unknown> = {}) {
  return {
    manageScoreId: 7,
    timestamp: new Date('2026-10-18T10:30:00.000Z'),
    scoreChange: -10,
    reason: 'Automated penalty for No-show on Booking #12',
    user: {
      uid: 4,
      firstname: 'Alice',
      lastname: 'Wonderland',
      email: 'alice@student.chula.ac.th',
      universityUser: { studentId: '6700000001' },
      password: 'private-user-field',
    },
    admin: {
      adminId: 1,
      firstname: 'Library',
      lastname: 'Master',
      email: 'admin@chula.ac.th',
      password: 'private-admin-field',
    },
    ...overrides,
  };
}

function mockPrisma(rows: ReturnType<typeof auditRow>[], total = rows.length) {
  const calls: { findMany?: any; count?: any; transactionCount: number } = {
    transactionCount: 0,
  };
  const client = {
    manageScore: {
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

test('service combines case-insensitive search, deduction and inclusive date filters', async () => {
  const { client, calls } = mockPrisma([auditRow()], 5);
  const from = new Date('2026-10-01T00:00:00.000Z');
  const to = new Date('2026-10-18T23:59:59.999Z');
  const result = await AdminAuditService.list(
    { q: '  alice  ', direction: 'deduct', from, to, page: 2, pageSize: 3 },
    client
  );

  assert.equal(calls.transactionCount, 1);
  assert.deepEqual(calls.findMany.where, calls.count.where);
  assert.deepEqual(calls.findMany.where.scoreChange, { lt: 0 });
  assert.deepEqual(calls.findMany.where.timestamp, { gte: from, lte: to });
  assert.equal(calls.findMany.where.OR.length, 8);
  assert.deepEqual(calls.findMany.where.OR[0].reason, {
    contains: 'alice',
    mode: 'insensitive',
  });
  assert.deepEqual(calls.findMany.where.OR[4].user.is.universityUser.is.studentId, {
    contains: 'alice',
    mode: 'insensitive',
  });
  assert.deepEqual(calls.findMany.where.OR[7].admin.is.email, {
    contains: 'alice',
    mode: 'insensitive',
  });
  assert.equal(calls.findMany.skip, 3);
  assert.equal(calls.findMany.take, 3);
  assert.deepEqual(calls.findMany.orderBy, [{ timestamp: 'desc' }, { manageScoreId: 'desc' }]);
  assert.deepEqual(result, {
    logs: [
      {
        id: 7,
        timestamp: '2026-10-18T10:30:00.000Z',
        scoreChange: -10,
        reason: 'Automated penalty for No-show on Booking #12',
        user: {
          uid: 4,
          firstname: 'Alice',
          lastname: 'Wonderland',
          email: 'alice@student.chula.ac.th',
          studentId: '6700000001',
        },
        admin: {
          adminId: 1,
          firstname: 'Library',
          lastname: 'Master',
          email: 'admin@chula.ac.th',
        },
      },
    ],
    total: 5,
    page: 2,
    pageSize: 3,
  });
  assert.equal(JSON.stringify(result).includes('private-user-field'), false);
  assert.equal(JSON.stringify(result).includes('private-admin-field'), false);
  assert.equal(JSON.stringify(calls.findMany.select).includes('password'), false);
});

test('service supports additions, unfiltered results, and users without a student ID', async () => {
  const { client, calls } = mockPrisma([
    auditRow({
      user: {
        uid: 5,
        firstname: 'Pat',
        lastname: 'Lee',
        email: 'pat@example.com',
        universityUser: null,
      },
    }),
  ]);
  const result = await AdminAuditService.list(
    { q: '', direction: 'add', page: 1, pageSize: 20 },
    client
  );
  assert.deepEqual(calls.findMany.where, { scoreChange: { gt: 0 } });
  assert.equal(result.logs[0].user.studentId, null);

  await AdminAuditService.list({ q: '', page: 1, pageSize: 20 }, client);
  assert.deepEqual(calls.findMany.where, {});
});

test('service returns an empty page and total zero', async () => {
  const { client } = mockPrisma([], 0);
  const result = await AdminAuditService.list({ q: '', page: 1, pageSize: 20 }, client);
  assert.deepEqual(result, { logs: [], total: 0, page: 1, pageSize: 20 });
});

test('controller rejects invalid query parameters before calling the service', async () => {
  const originalList = AdminAuditService.list;
  let callCount = 0;
  AdminAuditService.list = (async (params) => {
    callCount++;
    return { logs: [], total: 0, page: params.page, pageSize: params.pageSize };
  }) as typeof AdminAuditService.list;

  try {
    for (const query of [
      { q: ['alice', 'bob'] },
      { direction: '' },
      { direction: 'all' },
      { from: 'yesterday' },
      { from: '2026-02-30T00:00:00.000Z' },
      { from: '2026-10-01' },
      { to: { nested: '2026-10-18T00:00:00.000Z' } },
      { from: '2026-10-19T00:00:00.000Z', to: '2026-10-18T00:00:00.000Z' },
      { page: '0' },
      { page: '1.5' },
      { page: '999999999999999999999' },
      { pageSize: '0' },
      { pageSize: '101' },
      { pageSize: 'abc' },
    ]) {
      const response = mockResponse();
      await AdminAuditController.list({ query } as any, response as any);
      assert.equal(response.statusCode, 400, JSON.stringify(query));
      assert.equal(response.body.success, false);
      assert.equal(callCount, 0);
    }

    const defaultResponse = mockResponse();
    await AdminAuditController.list({ query: {} } as any, defaultResponse as any);
    assert.equal(defaultResponse.statusCode, 200);
    assert.equal(defaultResponse.headers['Cache-Control'], 'no-store');
    assert.deepEqual(defaultResponse.body, {
      success: true,
      data: { logs: [], total: 0, page: 1, pageSize: 20 },
    });

    const filteredResponse = mockResponse();
    await AdminAuditController.list(
      {
        query: {
          q: '  Alice  ',
          direction: 'deduct',
          from: '2026-10-01T00:00:00.000Z',
          to: '2026-10-18T23:59:59.999Z',
          page: '2',
          pageSize: '10',
        },
      } as any,
      filteredResponse as any
    );
    assert.equal(filteredResponse.statusCode, 200);
    assert.equal(callCount, 2);
  } finally {
    AdminAuditService.list = originalList;
  }
});

test('controller hides database errors behind a generic 500', async () => {
  const originalList = AdminAuditService.list;
  const originalError = console.error;
  AdminAuditService.list = (async () => {
    throw new Error('private database detail');
  }) as typeof AdminAuditService.list;
  console.error = () => {};
  try {
    const response = mockResponse();
    await AdminAuditController.list({ query: {} } as any, response as any);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { success: false, error: 'Internal server error' });
  } finally {
    AdminAuditService.list = originalList;
    console.error = originalError;
  }
});

test('audit route requires a valid admin token', () => {
  const layer = (adminRoutes as any).stack.find((item: any) => item.route?.path === '/audit-logs');
  assert.ok(layer);
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack.length, 3);
  const [authenticate, authorize] = layer.route.stack.map((item: any) => item.handle);

  const missing = mockResponse();
  let nextCalled = false;
  authenticate({ headers: {} }, missing, () => {
    nextCalled = true;
  });
  assert.equal(missing.statusCode, 401);
  assert.equal(nextCalled, false);

  const invalid = mockResponse();
  authenticate({ headers: { authorization: 'Bearer invalid.token' } }, invalid, () => {
    nextCalled = true;
  });
  assert.equal(invalid.statusCode, 401);
  assert.equal(nextCalled, false);

  const studentToken = signJwt({
    uid: 4,
    email: 'student@chula.ac.th',
    firstname: 'Student',
    lastname: 'User',
    role: 'STUDENT',
  });
  const studentRequest = { headers: { authorization: `Bearer ${studentToken}` } };
  const studentResponse = mockResponse();
  authenticate(studentRequest, studentResponse, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  let authorized = false;
  authorize(studentRequest, studentResponse, () => {
    authorized = true;
  });
  assert.equal(studentResponse.statusCode, 403);
  assert.equal(authorized, false);

  const adminToken = signJwt({
    adminId: 1,
    email: 'admin@chula.ac.th',
    firstname: 'Library',
    lastname: 'Master',
    role: 'ADMIN',
  });
  const adminRequest = { headers: { authorization: `Bearer ${adminToken}` } };
  const adminResponse = mockResponse();
  authenticate(adminRequest, adminResponse, () => {});
  authorize(adminRequest, adminResponse, () => {
    authorized = true;
  });
  assert.equal(authorized, true);
});
