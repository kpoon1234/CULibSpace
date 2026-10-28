import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required.');
const testUrl = new URL(testDatabaseUrl);
if (
  !/^postgres(?:ql)?:$/.test(testUrl.protocol) ||
  !/_test$/i.test(decodeURIComponent(testUrl.pathname.slice(1)))
) {
  throw new Error('TEST_DATABASE_URL must be a PostgreSQL database ending in _test.');
}
if (process.env.DATABASE_URL) {
  const appUrl = new URL(process.env.DATABASE_URL);
  if (appUrl.host === testUrl.host && appUrl.pathname === testUrl.pathname) {
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL.');
  }
}
process.env.DATABASE_URL = testDatabaseUrl;
const { PrismaClient, IssueStatus, TableStatus, ZoneType, UserType } =
  await import('@prisma/client');
const { IssueService } = await import('../services/issueService.js');
const { hasBlockingIssue } = await import('../services/facilityAvailabilityService.js');
const prisma = new PrismaClient();
const runId = randomUUID();
let adminId: number | undefined;
let userId: number | undefined;
let zoneId: number | undefined;
let tableId: number | undefined;
let passed = 0;

async function test(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`PASS: ${name}`);
}

try {
  const admin = await prisma.admin.create({
    data: {
      email: `issue-admin-${runId}@example.test`,
      password: 'test-only-not-a-login',
      firstname: 'Issue',
      lastname: 'Admin',
    },
  });
  adminId = admin.adminId;
  const user = await prisma.user.create({
    data: {
      email: `issue-user-${runId}@example.test`,
      firstname: 'Issue',
      lastname: 'Reporter',
      userType: UserType.UNIVERSITY,
    },
  });
  userId = user.uid;
  const zone = await prisma.zone.create({ data: { zoneType: ZoneType.COMMON } });
  zoneId = zone.zoneId;
  const hold = {
    lockToken: randomUUID(),
    lockedUntil: new Date(Date.now() + 300_000),
    lockedByUid: user.uid,
  };
  const table = await prisma.table.create({
    data: { zoneId: zone.zoneId, status: TableStatus.AVAILABLE, numberOfSeat: 4, ...hold },
  });
  tableId = table.tableId;
  const issue = await prisma.issueReport.create({
    data: { uid: user.uid, tableId: table.tableId, issueInformation: 'ปลั๊กไฟชำรุด' },
  });
  const input = {
    adminId: admin.adminId,
    issueId: issue.issueId,
    status: IssueStatus.IN_PROGRESS,
    blocksTable: true,
    notes: 'กำลังซ่อมปลั๊กไฟ',
  };
  const readIssue = () =>
    prisma.issueReport.findUniqueOrThrow({ where: { issueId: issue.issueId } });
  const readTable = () => prisma.table.findUniqueOrThrow({ where: { tableId: table.tableId } });
  const readNotes = async () => {
    const list = await IssueService.listAdmin(
      { q: String(table.tableId), page: 1, pageSize: 100 },
      prisma
    );
    return list.issues.find((row) => row.issueId === issue.issueId)!.notes;
  };

  await test('admin update persists status/notes, closes effectively, clears the hold and records the acting admin', async () => {
    const result = await IssueService.updateAdmin(input, prisma);
    assert.equal(result.status, 'In Progress');
    assert.equal(result.blocksTable, true);
    assert.equal(result.closed, true);
    assert.equal(result.notes, input.notes);
    assert.equal(result.updatedBy, admin.adminId);
    const saved = await readIssue();
    assert.equal(saved.status, IssueStatus.IN_PROGRESS);
    assert.equal(saved.issueInformation, issue.issueInformation);
    assert.equal(saved.uid, issue.uid);
    assert.equal(saved.time.toISOString(), issue.time.toISOString());
    const savedTable = await readTable();
    assert.equal(
      savedTable.status,
      TableStatus.AVAILABLE,
      'issue closure must remain independent of stored table status'
    );
    assert.equal(savedTable.lockToken, null);
    assert.equal(savedTable.lockedUntil, null);
    assert.equal(savedTable.lockedByUid, null);
    assert.equal(await hasBlockingIssue(prisma, table.tableId), true);
    const logs = await prisma.manageIssue.findMany({ where: { issueId: issue.issueId } });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].adminId, admin.adminId);
    assert.equal(logs[0].info, input.notes);
    assert.equal(logs[0].timestamp.toISOString(), result.updatedAt);
    assert.equal(await readNotes(), input.notes);
  });

  await test('same-status notes edit appends a log and an empty note clears the latest note', async () => {
    await IssueService.updateAdmin({ ...input, notes: 'รออะไหล่' }, prisma);
    assert.equal(await readNotes(), 'รออะไหล่');
    const result = await IssueService.updateAdmin({ ...input, notes: '' }, prisma);
    assert.equal(result.closed, true);
    assert.equal(await readNotes(), '');
    const logs = await prisma.manageIssue.findMany({
      where: { issueId: issue.issueId },
      orderBy: { timestamp: 'asc' },
    });
    assert.deepEqual(
      logs.map((log) => log.info),
      [input.notes, 'รออะไหล่', '']
    );
    assert.ok(logs[0].timestamp < logs[1].timestamp && logs[1].timestamp < logs[2].timestamp);
  });

  await test('completed and pending normalize blocksTable and release only the issue closure', async () => {
    for (const status of [IssueStatus.COMPLETED, IssueStatus.PENDING]) {
      const result = await IssueService.updateAdmin(
        { ...input, status, notes: 'เปิดใช้ได้' },
        prisma
      );
      assert.equal(result.blocksTable, false);
      assert.equal(result.closed, false);
      assert.equal((await readIssue()).blocksTable, false);
      assert.equal(await hasBlockingIssue(prisma, table.tableId), false);
    }
  });

  await test('completing one issue preserves another issue closure and a manual table closure', async () => {
    const other = await prisma.issueReport.create({
      data: {
        uid: user.uid,
        tableId: table.tableId,
        issueInformation: 'Other repair',
        status: IssueStatus.IN_PROGRESS,
        blocksTable: true,
      },
    });
    const result = await IssueService.updateAdmin(
      { ...input, status: IssueStatus.COMPLETED },
      prisma
    );
    assert.equal(result.closed, true);
    await IssueService.updateAdmin(
      {
        ...input,
        issueId: other.issueId,
        status: IssueStatus.COMPLETED,
        notes: 'Other repair complete',
      },
      prisma
    );
    await prisma.table.update({
      where: { tableId: table.tableId },
      data: { status: TableStatus.CLOSED },
    });
    const manual = await IssueService.updateAdmin(
      { ...input, status: IssueStatus.PENDING },
      prisma
    );
    assert.equal(manual.closed, true);
    assert.equal((await readTable()).status, TableStatus.CLOSED);
    await prisma.table.update({
      where: { tableId: table.tableId },
      data: { status: TableStatus.AVAILABLE },
    });
  });

  await test('audit failure rolls back the issue, notes, timestamp, and hold cleanup together', async () => {
    await prisma.table.update({ where: { tableId: table.tableId }, data: hold });
    const beforeIssue = await readIssue();
    const beforeTable = await readTable();
    const beforeNotes = await readNotes();
    const beforeCount = await prisma.manageIssue.count({ where: { issueId: issue.issueId } });
    const failure = new Error('Simulated audit storage failure');
    let clearedHold = false;
    const failingClient = {
      $transaction: (callback: (tx: any) => Promise<unknown>) =>
        prisma.$transaction(async (tx) =>
          callback(
            new Proxy(tx, {
              get(target, prop) {
                if (prop !== 'manageIssue') return Reflect.get(target, prop);
                return {
                  findFirst: (args: any) => tx.manageIssue.findFirst(args),
                  create: async () => {
                    const tableInside = await tx.table.findUniqueOrThrow({
                      where: { tableId: table.tableId },
                    });
                    clearedHold = tableInside.lockToken === null;
                    assert.equal(
                      (
                        await tx.issueReport.findUniqueOrThrow({
                          where: { issueId: issue.issueId },
                        })
                      ).blocksTable,
                      true
                    );
                    throw failure;
                  },
                };
              },
            })
          )
        ),
    };
    await assert.rejects(
      IssueService.updateAdmin({ ...input, notes: 'Must roll back' }, failingClient as any),
      (error) => error === failure
    );
    assert.equal(clearedHold, true, 'the helper must have run before the audit failed');
    assert.deepEqual(await readIssue(), beforeIssue);
    assert.deepEqual(await readTable(), beforeTable);
    assert.equal(await readNotes(), beforeNotes);
    assert.equal(
      await prisma.manageIssue.count({ where: { issueId: issue.issueId } }),
      beforeCount
    );
  });

  await test('in-progress without the close-table opt-in preserves a live hold', async () => {
    const before = await readTable();
    assert.equal(before.lockToken, hold.lockToken);
    const result = await IssueService.updateAdmin(
      { ...input, blocksTable: false, notes: 'Repair without closure' },
      prisma
    );
    assert.equal(result.status, 'In Progress');
    assert.equal(result.closed, false);
    assert.equal(result.blocksTable, false);
    assert.deepEqual(await readTable(), before);
  });

  await test('deleted admin and missing issue return domain errors without writes', async () => {
    const beforeIssue = await readIssue();
    const beforeCount = await prisma.manageIssue.count({ where: { issueId: issue.issueId } });
    const deleted = await prisma.admin.create({
      data: {
        email: `deleted-${runId}@example.test`,
        password: 'test-only',
        firstname: 'Deleted',
        lastname: 'Admin',
      },
    });
    await prisma.admin.delete({ where: { adminId: deleted.adminId } });
    await assert.rejects(
      IssueService.updateAdmin({ ...input, adminId: deleted.adminId }, prisma),
      (error: any) => error.code === 'ADMIN_NOT_FOUND' && error.status === 403
    );
    const missing = await prisma.issueReport.create({
      data: { uid: user.uid, tableId: table.tableId, issueInformation: 'to delete' },
    });
    await prisma.issueReport.delete({ where: { issueId: missing.issueId } });
    await assert.rejects(
      IssueService.updateAdmin({ ...input, issueId: missing.issueId }, prisma),
      (error: any) => error.code === 'ISSUE_NOT_FOUND' && error.status === 404
    );
    assert.deepEqual(await readIssue(), beforeIssue);
    assert.equal(
      await prisma.manageIssue.count({ where: { issueId: issue.issueId } }),
      beforeCount
    );
  });

  await test('concurrent updates serialize status/notes and retain every audit from the same admin', async () => {
    const beforeCount = await prisma.manageIssue.count({ where: { issueId: issue.issueId } });
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        IssueService.updateAdmin(
          {
            ...input,
            status: index % 2 ? IssueStatus.COMPLETED : IssueStatus.IN_PROGRESS,
            notes: `Concurrent update ${index}`,
          },
          prisma
        )
      )
    );
    assert.equal(
      await prisma.manageIssue.count({ where: { issueId: issue.issueId } }),
      beforeCount + results.length
    );
    assert.equal(new Set(results.map((result) => result.updatedAt)).size, results.length);
    const last = results.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).at(-1)!;
    assert.equal(await readNotes(), last.notes);
    const saved = await readIssue();
    assert.equal(saved.blocksTable, last.blocksTable);
    assert.equal(
      saved.status,
      last.status === 'Completed' ? IssueStatus.COMPLETED : IssueStatus.IN_PROGRESS
    );
    assert.equal(await hasBlockingIssue(prisma, table.tableId), last.closed);
  });

  console.log(`Admin issue update integration tests passed (${passed}).`);
} finally {
  try {
    if (tableId !== undefined) {
      await prisma.manageIssue.deleteMany({ where: { issueReport: { tableId } } });
      await prisma.issueReport.deleteMany({ where: { tableId } });
      await prisma.table.delete({ where: { tableId } });
    }
    if (zoneId !== undefined) await prisma.zone.delete({ where: { zoneId } });
    if (userId !== undefined) await prisma.user.delete({ where: { uid: userId } });
    if (adminId !== undefined) await prisma.admin.delete({ where: { adminId } });
  } finally {
    await prisma.$disconnect();
  }
}
