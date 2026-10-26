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
const { PrismaClient, IssueStatus, TableStatus, UserType, ZoneType, BookingStatus } =
  await import('@prisma/client');
const { applyIssueAvailabilityChange } = await import('../services/facilityAvailabilityService.js');
const { BookingService } = await import('../services/bookingService.js');
const { LayoutService } = await import('../services/layoutService.js');
const { IssueService } = await import('../services/issueService.js');
const { LockService } = await import('../services/lockService.js');
const { ScheduleService } = await import('../services/scheduleService.js');
const prisma = new PrismaClient();
const runId = randomUUID();
const userIds: number[] = [],
  tableIds: number[] = [],
  zoneIds: number[] = [];
const originalSchedule = ScheduleService.validateTargetTimeWindow;
ScheduleService.validateTargetTimeWindow = async (targetStart, targetEnd) => ({
  targetStart,
  targetEnd,
  schedule: {
    name: 'Integration test',
    openTime: '00:00',
    closeTime: '23:59',
    is24Hours: true,
    isClosed: false,
    priority: 1,
  },
  config: { maxAdvanceBookingDays: 7, maxBookingDurationMinutes: 120 },
});

async function fixture(
  status: (typeof TableStatus)[keyof typeof TableStatus] = TableStatus.AVAILABLE
) {
  const user = await prisma.user.create({
    data: {
      email: `facility-${runId}-${userIds.length}@example.test`,
      firstname: 'Facility',
      lastname: 'Test',
      userType: UserType.UNIVERSITY,
      isProfileComplete: true,
    },
  });
  userIds.push(user.uid);
  const zone = await prisma.zone.create({ data: { zoneType: ZoneType.COMMON } });
  zoneIds.push(zone.zoneId);
  const now = new Date();
  const table = await prisma.table.create({
    data: {
      zoneId: zone.zoneId,
      numberOfSeat: 4,
      status,
      lockToken: randomUUID(),
      lockedUntil: new Date(now.getTime() + 300_000),
      lockedByUid: user.uid,
    },
  });
  tableIds.push(table.tableId);
  const issue = await prisma.issueReport.create({
    data: {
      uid: user.uid,
      tableId: table.tableId,
      issueInformation: 'Temporary integration fixture',
    },
  });
  return { user, table, issue, start: now, end: new Date(now.getTime() + 60_000) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const change = (
  f: Fixture,
  status: (typeof IssueStatus)[keyof typeof IssueStatus],
  blocksTable: boolean,
  client: any = prisma
) =>
  client.$transaction((tx: any) =>
    applyIssueAvailabilityChange(tx, f.issue.issueId, { status, blocksTable })
  );
async function layout(f: Fixture) {
  const zones = await LayoutService.getLayoutWithStatus(
    { targetStart: f.start, targetEnd: f.end },
    prisma
  );
  return zones.flatMap((z) => z.tables).find((t) => t.tableId === f.table.tableId)!;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function waitFor(promise: Promise<void>, label: string) {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 4000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function pausedClient() {
  const attempted = deferred(),
    acquired = deferred(),
    resume = deferred();
  let locked = false;
  const client = {
    user: prisma.user,
    systemConfig: prisma.systemConfig,
    $transaction: (callback: (tx: any) => Promise<unknown>) =>
      prisma.$transaction(
        async (tx) => {
          const proxy = new Proxy(tx, {
            get(target, prop) {
              if (prop !== '$queryRaw') return Reflect.get(target, prop);
              return async (...args: any[]) => {
                attempted.resolve();
                const result = await (tx.$queryRaw as any)(...args);
                locked = true;
                acquired.resolve();
                await resume.promise;
                return result;
              };
            },
          });
          return callback(proxy);
        },
        { timeout: 10_000 }
      ),
  };
  return { client, attempted, acquired, resume, locked: () => locked };
}

let passed = 0;
async function test(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log(`PASS: ${name}`);
}

async function expiredPair() {
  const old = await fixture();
  const target = await fixture();
  await prisma.table.updateMany({
    where: { tableId: { in: [old.table.tableId, target.table.tableId] } },
    data: { lockedUntil: new Date(Date.now() - 60_000) },
  });
  return { old, target };
}

async function assertRenewedHold(tableId: number, uid: number, token: string) {
  const table = await prisma.table.findUniqueOrThrow({ where: { tableId } });
  assert.equal(table.lockToken, token);
  assert.equal(table.lockedByUid, uid);
  assert(table.lockedUntil! > new Date());
}

try {
  await test('expiration skips A while holding B, so a table-switch hold cannot deadlock', async () => {
    const { old, target } = await expiredPair();
    const aLocked = deferred(),
      bLocked = deferred();
    const workerRows: number[] = [];
    // Recreate the adverse legacy ordering deterministically: hold owns A,
    // cleanup owns B, and the real acquireLock query subsequently waits for B.
    const holdClient = {
      user: prisma.user,
      systemConfig: prisma.systemConfig,
      $transaction: (callback: (tx: any) => Promise<unknown>) =>
        prisma.$transaction(
          async (tx) => {
            const proxy = new Proxy(tx, {
              get(client, prop) {
                if (prop !== '$queryRaw') return Reflect.get(client, prop);
                return async (...args: any[]) => {
                  await tx.$queryRaw`SELECT tableid FROM "table" WHERE tableid = ${old.table.tableId} FOR UPDATE`;
                  aLocked.resolve();
                  await bLocked.promise;
                  return (tx.$queryRaw as any)(...args);
                };
              },
            });
            return callback(proxy);
          },
          { timeout: 10_000 }
        ),
    };
    const workerClient = {
      $transaction: (callback: (tx: any) => Promise<unknown>) =>
        prisma.$transaction(
          async (tx) => {
            await aLocked.promise;
            await tx.$queryRaw`SELECT tableid FROM "table" WHERE tableid = ${target.table.tableId} FOR UPDATE`;
            bLocked.resolve();
            return callback(
              new Proxy(tx, {
                get(client, prop) {
                  if (prop !== '$queryRaw') return Reflect.get(client, prop);
                  return async (...args: any[]) => {
                    const rows = await (tx.$queryRaw as any)(...args);
                    workerRows.push(...rows.map(({ tableid }: { tableid: number }) => tableid));
                    return rows;
                  };
                },
              })
            );
          },
          { timeout: 10_000 }
        ),
    };
    const hold = BookingService.acquireLock(
      target.table.tableId,
      old.user.uid,
      undefined,
      undefined,
      holdClient
    ).then(
      (value) => ({ value, error: null as any }),
      (error) => ({ value: null, error })
    );
    let worker: Promise<{ value: unknown; error: any }> | undefined;
    try {
      await waitFor(aLocked.promise, 'hold locks A');
      worker = LockService.releaseExpiredLocks(new Date(), workerClient as any).then(
        (value) => ({ value, error: null }),
        (error) => ({ value: null, error })
      );
      const [held, cleaned] = await Promise.all([hold, worker]);
      assert.ifError(held.error);
      assert.ifError(cleaned.error);
      assert.equal(cleaned.value, 1);
      assert.deepEqual(workerRows, [target.table.tableId]);
      await assertRenewedHold(target.table.tableId, old.user.uid, held.value!.lockToken);
      assert.equal(
        (await prisma.table.findUniqueOrThrow({ where: { tableId: old.table.tableId } })).lockToken,
        null
      );
    } finally {
      aLocked.resolve();
      bLocked.resolve();
      await Promise.allSettled([hold, ...(worker ? [worker] : [])]);
    }
  });

  await test('cleanup skips in-flight hold rows and cannot clear a newly renewed token', async () => {
    const { old, target } = await expiredPair();
    const holder = pausedClient();
    const hold = BookingService.acquireLock(
      target.table.tableId,
      old.user.uid,
      undefined,
      undefined,
      holder.client
    ).then(
      (value) => ({ value, error: null as any }),
      (error) => ({ value: null, error })
    );
    try {
      await waitFor(holder.acquired.promise, 'hold locks both expired rows');
      assert.equal(await LockService.releaseExpiredLocks(new Date(), prisma), 0);
      holder.resume.resolve();
      const result = await hold;
      assert.ifError(result.error);
      assert.equal(await LockService.releaseExpiredLocks(new Date(), prisma), 0);
      await assertRenewedHold(target.table.tableId, old.user.uid, result.value!.lockToken);
    } finally {
      holder.resume.resolve();
      await hold;
    }
  });

  await test('hold waits for cleanup to commit and its fresh token survives the next tick', async () => {
    const { old, target } = await expiredPair();
    const cleaner = pausedClient(),
      holder = pausedClient();
    const cleanup = LockService.releaseExpiredLocks(new Date(), cleaner.client as any).then(
      (value) => ({ value, error: null as any }),
      (error) => ({ value: null, error })
    );
    let hold: Promise<{ value: any; error: any }> | undefined;
    try {
      await waitFor(cleaner.acquired.promise, 'cleanup locks expired rows');
      hold = BookingService.acquireLock(
        target.table.tableId,
        old.user.uid,
        undefined,
        undefined,
        holder.client
      ).then(
        (value) => ({ value, error: null }),
        (error) => ({ value: null, error })
      );
      await waitFor(holder.attempted.promise, 'hold attempts cleanup-owned rows');
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(holder.locked(), false);
      cleaner.resume.resolve();
      const cleaned = await cleanup;
      assert.ifError(cleaned.error);
      assert.equal(cleaned.value, 2);
      await waitFor(holder.acquired.promise, 'hold obtains released rows');
      holder.resume.resolve();
      const held = await hold;
      assert.ifError(held.error);
      assert.equal(await LockService.releaseExpiredLocks(new Date(), prisma), 0);
      await assertRenewedHold(target.table.tableId, old.user.uid, held.value.lockToken);
    } finally {
      cleaner.resume.resolve();
      holder.resume.resolve();
      await Promise.allSettled([cleanup, ...(hold ? [hold] : [])]);
    }
  });

  await test('the blocking composite index exists alongside the existing table index', async () => {
    const indexes = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = current_schema() AND tablename = 'issue_report'
        AND indexname IN ('idx_issue_table', 'idx_issue_table_blocking')`;
    assert.equal(indexes.length, 2);
    assert.match(
      indexes.find(({ indexname }) => indexname === 'idx_issue_table_blocking')!.indexdef,
      /\(tableid, status, blocks_table\)/
    );
  });

  await test('non-blocking updates preserve holds; an already closed table clears partial holds', async () => {
    const f = await fixture();
    await change(f, IssueStatus.IN_PROGRESS, false);
    const table = await prisma.table.findUniqueOrThrow({ where: { tableId: f.table.tableId } });
    assert.equal(table.lockToken, f.table.lockToken);
    assert.equal(table.lockedUntil?.getTime(), f.table.lockedUntil?.getTime());
    assert.equal(table.lockedByUid, f.user.uid);

    await change(f, IssueStatus.IN_PROGRESS, true);
    // Simulate a legacy/partial hold left on an already issue-blocked table.
    await prisma.table.update({
      where: { tableId: f.table.tableId },
      data: { lockToken: null, lockedUntil: f.table.lockedUntil, lockedByUid: f.user.uid },
    });
    await change(f, IssueStatus.IN_PROGRESS, true);
    const closedTable = await prisma.table.findUniqueOrThrow({
      where: { tableId: f.table.tableId },
    });
    assert.equal(closedTable.lockToken, null);
    assert.equal(closedTable.lockedUntil, null);
    assert.equal(closedTable.lockedByUid, null);
    assert.equal((await layout(f)).status, TableStatus.CLOSED);
  });

  await test('the real admin list returns blocksTable for both blocking and non-blocking issues', async () => {
    const f = await fixture();
    await change(f, IssueStatus.IN_PROGRESS, true);
    const other = await prisma.issueReport.create({
      data: { uid: f.user.uid, tableId: f.table.tableId, issueInformation: 'Non-blocking fixture' },
    });
    const result = await IssueService.listAdmin(
      { q: String(f.table.tableId), page: 1, pageSize: 10 },
      prisma
    );
    assert.equal(
      result.issues.find(({ issueId }) => issueId === f.issue.issueId)?.blocksTable,
      true
    );
    assert.equal(
      result.issues.find(({ issueId }) => issueId === other.issueId)?.blocksTable,
      false
    );
  });

  await test('default is non-blocking; the database rejects blocking outside IN_PROGRESS', async () => {
    const f = await fixture();
    assert.equal(f.issue.blocksTable, false);
    await assert.rejects(() =>
      prisma.issueReport.update({
        where: { issueId: f.issue.issueId },
        data: { blocksTable: true },
      })
    );
    assert.equal(
      (await prisma.issueReport.findUniqueOrThrow({ where: { issueId: f.issue.issueId } }))
        .blocksTable,
      false
    );
  });

  await test('actual audit FK failure rolls back the issue change and hold release', async () => {
    const f = await fixture();
    await assert.rejects(
      () =>
        prisma.$transaction(async (tx) => {
          await applyIssueAvailabilityChange(tx, f.issue.issueId, {
            status: IssueStatus.IN_PROGRESS,
            blocksTable: true,
          });
          await tx.manageIssue.create({
            data: {
              issueId: f.issue.issueId,
              adminId: -2147483648,
              info: 'Force FK failure for rollback verification',
            },
          });
        }),
      { code: 'P2003' }
    );
    const [issue, table] = await Promise.all([
      prisma.issueReport.findUniqueOrThrow({ where: { issueId: f.issue.issueId } }),
      prisma.table.findUniqueOrThrow({ where: { tableId: f.table.tableId } }),
    ]);
    assert.equal(issue.status, IssueStatus.PENDING);
    assert.equal(issue.blocksTable, false);
    assert.equal(table.lockToken, f.table.lockToken);
    assert.equal(table.lockedByUid, f.user.uid);
    assert.equal(table.status, TableStatus.AVAILABLE);
  });

  for (const first of ['close', 'hold', 'book'] as const) {
    for (const second of first === 'close' ? (['hold', 'book'] as const) : (['close'] as const)) {
      await test(`${first} before ${second}: the second operation waits for the table lock`, async () => {
        const f = await fixture();
        const a = pausedClient(),
          b = pausedClient();
        const run = (operation: 'close' | 'hold' | 'book', client: any) =>
          operation === 'close'
            ? change(f, IssueStatus.IN_PROGRESS, true, client)
            : operation === 'hold'
              ? BookingService.acquireLock(
                  f.table.tableId,
                  f.user.uid,
                  undefined,
                  undefined,
                  client
                )
              : BookingService.createBooking(
                  {
                    userId: f.user.uid,
                    tableId: f.table.tableId,
                    startDateTime: f.start,
                    endDateTime: f.end,
                    lockToken: f.table.lockToken!,
                  },
                  client
                );
        // Attach rejection handlers immediately; assertions inspect the outcomes later.
        const opA = run(first, a.client).then(
          (value: unknown) => ({ value, error: null as any }),
          (error: unknown) => ({ value: null, error })
        );
        let opB: typeof opA | undefined;
        try {
          await waitFor(a.acquired.promise, 'first operation acquired');
          opB = run(second, b.client).then(
            (value: unknown) => ({ value, error: null as any }),
            (error: unknown) => ({ value: null, error })
          );
          await waitFor(b.attempted.promise, 'second operation attempted');
          await new Promise((resolve) => setTimeout(resolve, 50));
          assert.equal(b.locked(), false);
          a.resume.resolve();
          const firstResult = await opA;
          assert.equal(firstResult.error, null);
          await waitFor(b.acquired.promise, 'second operation acquired');
          b.resume.resolve();
          const secondResult = await opB;
          if (first === 'close') assert.equal(secondResult.error?.code, 'TABLE_CLOSED');
          else assert.equal(secondResult.error, null);
          const table = await prisma.table.findUniqueOrThrow({
            where: { tableId: f.table.tableId },
          });
          assert.equal(table.lockToken, null, 'closing invalidates old/new holds');
          assert.equal((await layout(f)).status, TableStatus.CLOSED);
          const bookings = await prisma.booking.count({ where: { tableId: f.table.tableId } });
          assert.equal(
            bookings,
            first === 'book' ? 1 : 0,
            'a closure never silently cancels a previously committed booking'
          );
        } finally {
          a.resume.resolve();
          b.resume.resolve();
          await Promise.allSettled([opA, ...(opB ? [opB] : [])]);
        }
      });
    }
  }

  await test('concurrent issue changes serialize and completing one cannot reopen another', async () => {
    const f = await fixture();
    const other = await prisma.issueReport.create({
      data: { uid: f.user.uid, tableId: f.table.tableId, issueInformation: 'Second issue' },
    });
    await Promise.all([
      change(f, IssueStatus.IN_PROGRESS, true),
      prisma.$transaction((tx) =>
        applyIssueAvailabilityChange(tx, other.issueId, {
          status: IssueStatus.IN_PROGRESS,
          blocksTable: true,
        })
      ),
    ]);
    await change(f, IssueStatus.COMPLETED, true);
    assert.equal((await layout(f)).status, TableStatus.CLOSED);
    await prisma.$transaction((tx) =>
      applyIssueAvailabilityChange(tx, other.issueId, {
        status: IssueStatus.COMPLETED,
        blocksTable: true,
      })
    );
    assert.equal((await layout(f)).status, TableStatus.AVAILABLE);
  });

  for (const bookingStatus of [BookingStatus.PENDING, BookingStatus.ACTIVE]) {
    await test(`reopening derives ${bookingStatus === BookingStatus.ACTIVE ? 'OCCUPIED' : 'RESERVED'} from the existing booking`, async () => {
      const f = await fixture();
      await prisma.booking.create({
        data: {
          uid: f.user.uid,
          tableId: f.table.tableId,
          startDateTime: f.start,
          endDateTime: f.end,
          status: bookingStatus,
        },
      });
      await change(f, IssueStatus.IN_PROGRESS, true);
      await change(f, IssueStatus.COMPLETED, false);
      assert.equal(
        (await layout(f)).status,
        bookingStatus === BookingStatus.ACTIVE ? TableStatus.OCCUPIED : TableStatus.RESERVED
      );
    });
  }

  await test('completion worker cannot reopen effective issue closure; manual closure survives completion', async () => {
    const f = await fixture(TableStatus.OCCUPIED);
    const booking = await prisma.booking.create({
      data: {
        uid: f.user.uid,
        tableId: f.table.tableId,
        startDateTime: new Date(f.start.getTime() - 120_000),
        endDateTime: new Date(f.start.getTime() - 60_000),
        status: BookingStatus.ACTIVE,
      },
    });
    await change(f, IssueStatus.IN_PROGRESS, true);
    await BookingService.processBookingCompletion(booking, f.start, prisma);
    assert.equal((await layout(f)).status, TableStatus.CLOSED);
    await prisma.table.update({
      where: { tableId: f.table.tableId },
      data: { status: TableStatus.CLOSED },
    });
    await change(f, IssueStatus.COMPLETED, false);
    assert.equal((await layout(f)).status, TableStatus.CLOSED);
  });
  console.log(`Facility availability integration: ${passed} tests passed.`);
} finally {
  ScheduleService.validateTargetTimeWindow = originalSchedule;
  try {
    await prisma.manageIssue.deleteMany({ where: { issueReport: { tableId: { in: tableIds } } } });
    await prisma.issueReport.deleteMany({ where: { tableId: { in: tableIds } } });
    await prisma.booking.deleteMany({ where: { tableId: { in: tableIds } } });
    await prisma.table.deleteMany({ where: { tableId: { in: tableIds } } });
    await prisma.zone.deleteMany({ where: { zoneId: { in: zoneIds } } });
    await prisma.user.deleteMany({ where: { uid: { in: userIds } } });
  } finally {
    await prisma.$disconnect();
  }
}
