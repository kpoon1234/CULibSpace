import assert from 'node:assert/strict';
import test from 'node:test';
import { IssueStatus, PrismaClient } from '@prisma/client';

// The Prisma client is mocked below; this suite must never contact an application database.
process.env.DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
process.env.JWT_SECRET = 'issue-management-unit-test-secret';

const { IssueService } = await import('../services/issueService.js');
const { IssueController } = await import('../controllers/issueController.js');
const { signJwt } = await import('../utils/jwt.js');
const { default: issueRoutes } = await import('../routes/issueRoutes.js');
const { default: adminRoutes } = await import('../routes/adminRoutes.js');

function issueRow(overrides: Record<string, any> = {}) {
  return {
    issueId: 42,
    time: new Date('2026-10-24T10:30:00.000Z'),
    tableId: 101,
    issueInformation: 'ปลั๊กไฟชำรุด',
    status: IssueStatus.PENDING,
    user: {
      uid: 5,
      firstname: 'Somchai',
      lastname: 'Dee',
      email: 'somchai@student.chula.ac.th',
    },
    table: { tableId: 101, zone: { zoneId: 3, zoneType: 'COMMON' } },
    ...overrides,
  };
}

function mockPrisma(rows: ReturnType<typeof issueRow>[] = [], total = rows.length) {
  const calls: { create?: any; findMany?: any; count?: any; transactionCount: number } = {
    transactionCount: 0,
  };
  const client = {
    issueReport: {
      create: async (args: unknown) => {
        calls.create = args;
        return issueRow();
      },
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

function tokenFor(role: 'STUDENT' | 'STAFF' | 'OUTSIDER' | 'ADMIN') {
  return signJwt({
    ...(role === 'ADMIN' ? { adminId: 1 } : { uid: 5 }),
    email: `${role.toLowerCase()}@example.com`,
    firstname: 'Test',
    lastname: 'User',
    role,
  });
}

test('create service persists user/table/details and uses the database timestamp', async () => {
  const { client, calls } = mockPrisma();
  const result = await IssueService.create(
    { uid: 5, tableId: 101, issueInformation: 'ปลั๊กไฟชำรุด' },
    client
  );

  assert.deepEqual(calls.create.data, {
    uid: 5,
    tableId: 101,
    issueInformation: 'ปลั๊กไฟชำรุด',
  });
  assert.equal('time' in calls.create.data, false);
  assert.deepEqual(result, {
    issueId: 42,
    time: '2026-10-24T10:30:00.000Z',
    tableId: 101,
    issueInformation: 'ปลั๊กไฟชำรุด',
    status: 'Pending',
  });
});

test('admin list service filters by status and description and returns user/table details', async () => {
  const row = issueRow({ status: IssueStatus.IN_PROGRESS });
  const { client, calls } = mockPrisma([row], 7);
  const result = await IssueService.listAdmin(
    { q: '  ปลั๊กไฟ  ', status: IssueStatus.IN_PROGRESS, page: 2, pageSize: 5 },
    client
  );

  assert.equal(calls.transactionCount, 1);
  assert.deepEqual(calls.findMany.where, calls.count.where);
  assert.deepEqual(calls.findMany.where.status, IssueStatus.IN_PROGRESS);
  assert.deepEqual(calls.findMany.where.issueInformation, {
    contains: 'ปลั๊กไฟ',
    mode: 'insensitive',
  });
  assert.equal(calls.findMany.skip, 5);
  assert.equal(calls.findMany.take, 5);
  assert.deepEqual(calls.findMany.orderBy, [{ time: 'desc' }, { issueId: 'desc' }]);
  assert.deepEqual(result, {
    issues: [
      {
        issueId: 42,
        time: '2026-10-24T10:30:00.000Z',
        issueInformation: 'ปลั๊กไฟชำรุด',
        status: 'In Progress',
        user: {
          uid: 5,
          firstname: 'Somchai',
          lastname: 'Dee',
          email: 'somchai@student.chula.ac.th',
        },
        table: { tableId: 101, zoneId: 3, zoneType: 'COMMON' },
      },
    ],
    total: 7,
    page: 2,
    pageSize: 5,
  });
});

test('create controller returns 201, success details and normalized input', async () => {
  const originalCreate = IssueService.create;
  const calls: unknown[] = [];
  IssueService.create = (async (input) => {
    calls.push(input);
    return {
      issueId: 42,
      time: '2026-10-24T10:30:00.000Z',
      tableId: 101,
      issueInformation: 'ปลั๊กไฟชำรุด',
      status: 'Pending',
    };
  }) as typeof IssueService.create;

  try {
    const response = mockResponse();
    await IssueController.create(
      {
        body: { tableId: 101, issueInformation: '  ปลั๊กไฟชำรุด  ' },
        user: { uid: 5 },
      } as any,
      response as any
    );

    assert.equal(response.statusCode, 201);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.deepEqual(calls, [{ uid: 5, tableId: 101, issueInformation: 'ปลั๊กไฟชำรุด' }]);
    assert.deepEqual(response.body.data, {
      issueId: 42,
      time: '2026-10-24T10:30:00.000Z',
      tableId: 101,
      issueInformation: 'ปลั๊กไฟชำรุด',
      status: 'Pending',
    });
  } finally {
    IssueService.create = originalCreate;
  }
});

test('create controller rejects missing, non-integer and negative table IDs', async () => {
  const originalCreate = IssueService.create;
  let callCount = 0;
  IssueService.create = (async () => {
    callCount++;
    throw new Error('must not be called');
  }) as typeof IssueService.create;

  try {
    for (const body of [
      { issueInformation: 'details' },
      { tableId: '101', issueInformation: 'details' },
      { tableId: 101.5, issueInformation: 'details' },
      { tableId: -1, issueInformation: 'details' },
    ]) {
      const response = mockResponse();
      await IssueController.create({ body, user: { uid: 5 } } as any, response as any);
      assert.equal(response.statusCode, 400);
      assert.equal(callCount, 0);
    }
  } finally {
    IssueService.create = originalCreate;
  }
});

test('create controller rejects empty, non-string and oversized descriptions', async () => {
  const originalCreate = IssueService.create;
  let callCount = 0;
  IssueService.create = (async () => {
    callCount++;
    throw new Error('must not be called');
  }) as typeof IssueService.create;

  try {
    for (const issueInformation of ['', '   ', 123, 'x'.repeat(2001)]) {
      const response = mockResponse();
      await IssueController.create(
        { body: { tableId: 101, issueInformation }, user: { uid: 5 } } as any,
        response as any
      );
      assert.equal(response.statusCode, 400);
      assert.equal(callCount, 0);
    }
  } finally {
    IssueService.create = originalCreate;
  }
});

test('create controller maps a missing table foreign-key error to 400', async () => {
  const originalCreate = IssueService.create;
  const originalError = console.error;
  IssueService.create = (async () => {
    throw { code: 'P2003' };
  }) as typeof IssueService.create;
  console.error = () => {};
  try {
    const response = mockResponse();
    await IssueController.create(
      { body: { tableId: 999, issueInformation: 'details' }, user: { uid: 5 } } as any,
      response as any
    );
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      success: false,
      error: 'The selected table does not exist',
    });
  } finally {
    IssueService.create = originalCreate;
    console.error = originalError;
  }
});

test('admin list controller applies defaults and forwards each accepted status filter', async () => {
  const originalList = IssueService.listAdmin;
  const calls: any[] = [];
  IssueService.listAdmin = (async (params) => {
    calls.push(params);
    return { issues: [], total: 0, page: params.page, pageSize: params.pageSize };
  }) as typeof IssueService.listAdmin;

  try {
    const defaultResponse = mockResponse();
    await IssueController.listAdmin({ query: {} } as any, defaultResponse as any);
    assert.equal(defaultResponse.statusCode, 200);
    assert.deepEqual(defaultResponse.body, {
      success: true,
      data: { issues: [], total: 0, page: 1, pageSize: 20 },
    });
    assert.deepEqual(calls[0], { q: '', status: undefined, page: 1, pageSize: 20 });

    for (const [status, expected] of [
      ['Pending', IssueStatus.PENDING],
      ['In Progress', IssueStatus.IN_PROGRESS],
      ['Completed', IssueStatus.COMPLETED],
    ] as const) {
      const response = mockResponse();
      await IssueController.listAdmin(
        { query: { q: '  ปลั๊กไฟ ', status, page: '2', pageSize: '10' } } as any,
        response as any
      );
      assert.equal(response.statusCode, 200);
      assert.deepEqual(calls.at(-1), {
        q: 'ปลั๊กไฟ',
        status: expected,
        page: 2,
        pageSize: 10,
      });
    }
  } finally {
    IssueService.listAdmin = originalList;
  }
});

test('admin list controller rejects unknown status, malformed search and invalid pagination', async () => {
  const originalList = IssueService.listAdmin;
  let callCount = 0;
  IssueService.listAdmin = (async () => {
    callCount++;
    return { issues: [], total: 0, page: 1, pageSize: 20 };
  }) as typeof IssueService.listAdmin;

  try {
    for (const query of [
      { q: ['a', 'b'] },
      { status: 'Unknown' },
      { status: '' },
      { page: '0' },
      { page: '-1' },
      { page: '1.5' },
      { page: '999999999999999999999' },
      { pageSize: '0' },
      { pageSize: '101' },
      { pageSize: 'abc' },
    ]) {
      const response = mockResponse();
      await IssueController.listAdmin({ query } as any, response as any);
      assert.equal(response.statusCode, 400, JSON.stringify(query));
      assert.equal(response.body.success, false);
      assert.equal(callCount, 0);
    }
  } finally {
    IssueService.listAdmin = originalList;
  }
});

test('create and admin routes enforce authentication and role boundaries', () => {
  const createLayer = (issueRoutes as any).stack.find((item: any) => item.route?.path === '/');
  const listLayer = (adminRoutes as any).stack.find((item: any) => item.route?.path === '/issues');
  assert.ok(createLayer);
  assert.ok(listLayer);
  assert.equal(createLayer.route.methods.post, true);
  assert.equal(createLayer.route.stack.length, 3);
  assert.equal(listLayer.route.methods.get, true);
  assert.equal(listLayer.route.stack.length, 3);

  const [authenticateCreate, authorizeCreate] = createLayer.route.stack.map(
    (item: any) => item.handle
  );
  const [authenticateList, authorizeList] = listLayer.route.stack.map((item: any) => item.handle);

  const missingToken = mockResponse();
  let nextCalled = false;
  authenticateCreate({ headers: {} }, missingToken, () => {
    nextCalled = true;
  });
  assert.equal(missingToken.statusCode, 401);
  assert.equal(nextCalled, false);

  for (const role of ['STUDENT', 'STAFF', 'OUTSIDER'] as const) {
    const request = { headers: { authorization: `Bearer ${tokenFor(role)}` } };
    const response = mockResponse();
    authenticateCreate(request, response, () => {});
    let authorized = false;
    authorizeCreate(request, response, () => {
      authorized = true;
    });
    assert.equal(authorized, true, role);
  }

  const adminCreateRequest = { headers: { authorization: `Bearer ${tokenFor('ADMIN')}` } };
  const adminCreateResponse = mockResponse();
  authenticateCreate(adminCreateRequest, adminCreateResponse, () => {});
  let adminCanCreate = false;
  authorizeCreate(adminCreateRequest, adminCreateResponse, () => {
    adminCanCreate = true;
  });
  assert.equal(adminCreateResponse.statusCode, 403);
  assert.equal(adminCanCreate, false);

  const listMissingToken = mockResponse();
  nextCalled = false;
  authenticateList({ headers: {} }, listMissingToken, () => {
    nextCalled = true;
  });
  assert.equal(listMissingToken.statusCode, 401);
  assert.equal(nextCalled, false);

  const userListRequest = { headers: { authorization: `Bearer ${tokenFor('STUDENT')}` } };
  const userListResponse = mockResponse();
  authenticateList(userListRequest, userListResponse, () => {});
  let userCanList = false;
  authorizeList(userListRequest, userListResponse, () => {
    userCanList = true;
  });
  assert.equal(userListResponse.statusCode, 403);
  assert.equal(userCanList, false);

  const adminListRequest = { headers: { authorization: `Bearer ${tokenFor('ADMIN')}` } };
  const adminListResponse = mockResponse();
  authenticateList(adminListRequest, adminListResponse, () => {});
  let adminCanList = false;
  authorizeList(adminListRequest, adminListResponse, () => {
    adminCanList = true;
  });
  assert.equal(adminCanList, true);
});
