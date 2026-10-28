import assert from 'node:assert/strict';
import test from 'node:test';
import { IssueStatus } from '@prisma/client';

process.env.DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
process.env.JWT_SECRET = 'admin-issue-update-unit-test-secret';
const { IssueService } = await import('../services/issueService.js');
const { IssueController } = await import('../controllers/issueController.js');
const { default: adminRoutes } = await import('../routes/adminRoutes.js');
const { signJwt } = await import('../utils/jwt.js');

const validBody = { status: 'In Progress', blocksTable: true, notes: '  กำลังซ่อมปลั๊กไฟ  ' };
function request(overrides: Record<string, unknown> = {}) {
  return {
    params: { issueId: '42' },
    body: validBody,
    user: { role: 'ADMIN', adminId: 7 },
    ...overrides,
  } as any;
}
function response() {
  return {
    statusCode: 200,
    body: null as any,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    status(value: number) {
      this.statusCode = value;
      return this;
    },
    json(value: unknown) {
      this.body = value;
      return this;
    },
  };
}

test('PATCH route rejects missing/invalid JWTs and every non-admin role before the controller', () => {
  const route = (adminRoutes as any).stack.find(
    (layer: any) => layer.route?.path === '/issues/:issueId'
  ).route;
  assert.equal(route.methods.patch, true);
  assert.equal(route.stack.at(-1).handle, IssueController.updateAdmin);
  const [authenticate, authorize] = route.stack.map((layer: any) => layer.handle);
  for (const authorization of [undefined, 'Bearer invalid']) {
    const res = response();
    authenticate({ headers: { authorization } }, res, () => assert.fail('must reject token'));
    assert.equal(res.statusCode, 401);
  }
  for (const role of ['STUDENT', 'STAFF', 'OUTSIDER', 'ADMIN'] as const) {
    const token = signJwt({
      role,
      adminId: 7,
      email: 'test@example.test',
      firstname: 'Test',
      lastname: 'User',
    });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = response();
    let allowed = false;
    authenticate(req, res, () =>
      authorize(req, res, () => {
        allowed = true;
      })
    );
    assert.equal(allowed, role === 'ADMIN');
    if (!allowed) assert.equal(res.statusCode, 403);
  }
});

test('controller requires a valid admin identity and never trusts body-supplied identity', async () => {
  for (const user of [
    undefined,
    { role: 'STUDENT', adminId: 7 },
    { role: 'ADMIN' },
    ...[0, -1, 1.5, '7', 2147483648].map((adminId) => ({ role: 'ADMIN', adminId })),
  ]) {
    const res = response();
    await IssueController.updateAdmin(request({ user }), res as any);
    assert.equal(res.statusCode, user ? 403 : 401);
  }
});

test('controller validates IDs and the complete editable payload without reaching the service', async () => {
  const original = IssueService.updateAdmin;
  let calls = 0;
  IssueService.updateAdmin = async () => {
    calls++;
    throw new Error('must not write');
  };
  try {
    for (const issueId of [
      '0',
      '-1',
      '1.5',
      '1e2',
      'abc',
      '2147483648',
      '9'.repeat(100),
      undefined,
      ['42'],
    ]) {
      const res = response();
      await IssueController.updateAdmin(request({ params: { issueId } }), res as any);
      assert.equal(res.statusCode, 400, String(issueId));
    }
    for (const body of [
      undefined,
      null,
      [],
      'bad',
      {},
      { ...validBody, status: 'IN_PROGRESS' },
      { ...validBody, status: 'Unknown' },
      { ...validBody, status: 'toString' },
      { ...validBody, status: null },
      { ...validBody, status: undefined },
      { ...validBody, blocksTable: 'false' },
      { ...validBody, blocksTable: undefined },
      { ...validBody, notes: 123 },
      { ...validBody, notes: null },
      { ...validBody, notes: undefined },
      { ...validBody, notes: 'x'.repeat(2001) },
      { ...validBody, adminId: 99 },
      { ...validBody, tableId: 99 },
      { ...validBody, issueInformation: 'replace original report' },
    ]) {
      const res = response();
      await IssueController.updateAdmin(request({ body }), res as any);
      assert.equal(res.statusCode, 400, JSON.stringify(body));
      assert.equal(res.headers['Cache-Control'], 'no-store');
    }
    assert.equal(calls, 0);
  } finally {
    IssueService.updateAdmin = original;
  }
});

test('controller maps all statuses, trims notes, supports clearing notes, and uses the token admin', async () => {
  const original = IssueService.updateAdmin;
  const calls: any[] = [];
  const result = {
    issueId: 42,
    tableId: 101,
    status: 'In Progress' as const,
    blocksTable: true,
    closed: true,
    notes: 'กำลังซ่อมปลั๊กไฟ',
    updatedBy: 7,
    updatedAt: '2026-10-26T15:20:00.000Z',
  };
  IssueService.updateAdmin = async (input) => {
    calls.push(input);
    return result;
  };
  try {
    for (const [label, status] of [
      ['Pending', IssueStatus.PENDING],
      ['In Progress', IssueStatus.IN_PROGRESS],
      ['Completed', IssueStatus.COMPLETED],
    ] as const) {
      const res = response();
      await IssueController.updateAdmin(
        request({ body: { ...validBody, status: label } }),
        res as any
      );
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.deepEqual(res.body.data, result);
      assert.deepEqual(calls.at(-1), {
        issueId: 42,
        adminId: 7,
        status,
        blocksTable: true,
        notes: 'กำลังซ่อมปลั๊กไฟ',
      });
    }
    for (const notes of ['', '   ', 'x'.repeat(2000)]) {
      const res = response();
      await IssueController.updateAdmin(request({ body: { ...validBody, notes } }), res as any);
      assert.equal(res.statusCode, 200);
      assert.equal(calls.at(-1).notes, notes.trim());
    }
  } finally {
    IssueService.updateAdmin = original;
  }
});

test('controller returns safe errors for missing issues, deleted admins, and transaction failures', async () => {
  const original = IssueService.updateAdmin;
  const originalError = console.error;
  console.error = () => {};
  try {
    for (const [error, expected] of [
      [{ status: 404, code: 'ISSUE_NOT_FOUND', message: 'Issue report not found.' }, 404],
      [{ status: 403, code: 'ADMIN_NOT_FOUND', message: 'Invalid admin account.' }, 403],
      [new Error('private SQL failure'), 500],
    ] as const) {
      IssueService.updateAdmin = async () => {
        throw error;
      };
      const res = response();
      await IssueController.updateAdmin(request(), res as any);
      assert.equal(res.statusCode, expected);
      assert.equal(res.body.success, false);
      if (expected === 500) assert.equal(res.body.error, 'Internal server error');
      else assert.equal(res.body.code, (error as any).code);
    }
  } finally {
    IssueService.updateAdmin = original;
    console.error = originalError;
  }
});

test('admin list reads the latest saved notes, including an intentional empty note', async () => {
  let selection: any;
  const client = {
    issueReport: {
      findMany: async (args: any) => {
        selection = args.select;
        return ['ซ่อมแล้ว', ''].map((info, index) => ({
          issueId: index + 1,
          time: new Date(),
          issueInformation: 'Original report',
          status: IssueStatus.COMPLETED,
          blocksTable: false,
          manageIssues: [{ info }],
          user: {},
          table: { tableId: 101, zone: { zoneId: 1, zoneType: 'COMMON' } },
        }));
      },
      count: async () => 2,
    },
    $transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
  };
  const result = await IssueService.listAdmin({ q: '', page: 1, pageSize: 20 }, client as any);
  assert.deepEqual(
    result.issues.map((issue) => issue.notes),
    ['ซ่อมแล้ว', '']
  );
  assert.deepEqual(selection.manageIssues, {
    select: { info: true },
    orderBy: { timestamp: 'desc' },
    take: 1,
  });
});
