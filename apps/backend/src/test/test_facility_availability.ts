import assert from 'node:assert/strict';
import { IssueStatus, TableStatus, UserType } from '@prisma/client';
import {
  applyIssueAvailabilityChange,
  BLOCKING_ISSUE_WHERE,
  hasBlockingIssue,
} from '../services/facilityAvailabilityService.js';
import { LayoutService } from '../services/layoutService.js';
import { BookingService } from '../services/bookingService.js';
import { ScheduleService } from '../services/scheduleService.js';
import { refreshTableStatus } from '../services/tableStatusService.js';

const now = new Date();
const window = { targetStart: now, targetEnd: new Date(now.getTime() + 60_000) };
type Issue = { issueId: number; tableId: number; status: IssueStatus; blocksTable: boolean };
const issue = (
  status: IssueStatus = IssueStatus.PENDING,
  blocksTable = false,
  issueId = 1
): Issue => ({
  issueId,
  tableId: 1,
  status,
  blocksTable,
});

function fixture(issues: Issue[] = [issue()], status: TableStatus = TableStatus.AVAILABLE) {
  const table = {
    tableId: 1,
    zoneId: 1,
    status,
    numberOfSeat: 4,
    plugCap: 2,
    hasTvScreen: false,
    lockToken: 'old-hold' as string | null,
    lockedUntil: new Date(now.getTime() + 300_000) as Date | null,
    lockedByUid: 42 as number | null,
  };
  const events: string[] = [];
  const blockingReads: boolean[] = [];
  const client: any = {
    $queryRaw: async () => {
      events.push('lock');
      return [];
    },
    user: {
      findUnique: async () => ({
        uid: 42,
        firstname: 'Test',
        lastname: 'User',
        userType: UserType.UNIVERSITY,
        isProfileComplete: true,
        behaviourScore: 100,
      }),
    },
    systemConfig: { findFirst: async () => ({ minScoreToBook: 50 }) },
    issueReport: {
      findUnique: async ({ where }: any) => issues.find((i) => i.issueId === where.issueId) ?? null,
      findFirst: async ({ where }: any) => {
        blockingReads.push(events.includes('issue-update'));
        assert.deepEqual(where, { tableId: 1, ...BLOCKING_ISSUE_WHERE });
        return (
          issues.find(
            (i) =>
              i.tableId === where.tableId &&
              i.status === where.status &&
              i.blocksTable === where.blocksTable
          ) ?? null
        );
      },
      update: async ({ where, data }: any) => {
        assert(events.includes('lock'), 'issue changes must lock the table first');
        events.push('issue-update');
        const row = issues.find((i) => i.issueId === where.issueId)!;
        Object.assign(row, data);
        return { ...row };
      },
    },
    table: {
      findUnique: async () => table,
      findUniqueOrThrow: async () => table,
      update: async ({ data }: any) => {
        events.push('table-update');
        Object.assign(table, data);
        return table;
      },
      updateMany: async ({ where, data }: any) => {
        if (where.tableId?.not === table.tableId) return { count: 0 };
        events.push('hold-write');
        Object.assign(table, data);
        return { count: 1 };
      },
    },
    booking: {
      findFirst: async () => null,
      updateMany: async () => ({ count: 1 }),
      create: async () => {
        events.push('booking-write');
        return { bookingId: 1 };
      },
    },
    zone: {
      findMany: async (args: any) => {
        const selection = args.include.tables.select.issueReports;
        assert.deepEqual(selection.where, BLOCKING_ISSUE_WHERE);
        assert.equal(selection.take, 1);
        return [
          {
            zoneId: 1,
            tables: [
              {
                ...table,
                bookings: [],
                issueReports: issues
                  .filter((i) => i.status === IssueStatus.IN_PROGRESS && i.blocksTable)
                  .slice(0, 1),
              },
            ],
          },
        ];
      },
    },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback(client),
  };
  async function layout() {
    return (await LayoutService.getLayoutWithStatus(window, client))[0]!.tables[0]!;
  }
  return { table, issues, client, events, blockingReads, layout };
}

let passed = 0;
async function test(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log(`PASS: ${name}`);
}

for (const row of [issue(), issue(IssueStatus.IN_PROGRESS), issue(IssueStatus.COMPLETED)]) {
  await test(`${row.status} without blocking leaves the table usable`, async () => {
    const f = fixture([row]);
    assert.equal(await hasBlockingIssue(f.client, 1), false);
    assert.notEqual((await f.layout()).status, TableStatus.CLOSED);
    await BookingService.acquireLock(1, 42, undefined, undefined, f.client);
    assert(f.events.includes('hold-write'));
  });
}

await test('blocking closes layout without exposing issue details or a stale hold', async () => {
  const f = fixture([issue(IssueStatus.IN_PROGRESS, true)]);
  const table = await f.layout();
  assert.equal(table.status, TableStatus.CLOSED);
  assert.equal(table.isLocked, false);
  assert.equal(table.lockedByUid, null);
  assert.equal('issueReports' in table, false);
  assert.equal(
    f.table.status,
    TableStatus.AVAILABLE,
    'issue closure must not overwrite manual status'
  );
});

await test('blocking rejects hold before any hold mutation', async () => {
  const f = fixture([issue(IssueStatus.IN_PROGRESS, true)]);
  await assert.rejects(() => BookingService.acquireLock(1, 42, undefined, undefined, f.client), {
    code: 'TABLE_CLOSED',
  });
  assert.deepEqual(f.events, ['lock']);
});

await test('closing clears an old hold, completing reopens without restoring it', async () => {
  const f = fixture();
  const closed = await applyIssueAvailabilityChange(f.client, 1, {
    status: IssueStatus.IN_PROGRESS,
    blocksTable: true,
  });
  assert.equal(closed.closed, true);
  assert.equal(f.table.lockToken, null);
  assert.equal(f.table.lockedUntil, null);
  assert.equal(f.table.lockedByUid, null);
  assert.deepEqual(f.blockingReads, [true], 'one blocking query, after updating the issue');
  const opened = await applyIssueAvailabilityChange(f.client, 1, {
    status: IssueStatus.COMPLETED,
    blocksTable: true,
  });
  assert.equal(opened.blocksTable, false);
  assert.equal(opened.closed, false);
  assert.equal((await f.layout()).status, TableStatus.AVAILABLE);
});

await test('non-blocking issue changes preserve a live hold without writing the table', async () => {
  const f = fixture();
  const hold = { token: f.table.lockToken, until: f.table.lockedUntil, uid: f.table.lockedByUid };
  const result = await applyIssueAvailabilityChange(f.client, 1, {
    status: IssueStatus.IN_PROGRESS,
    blocksTable: false,
  });
  assert.equal(result.closed, false);
  assert.equal(f.table.lockToken, hold.token);
  assert.equal(f.table.lockedUntil, hold.until);
  assert.equal(f.table.lockedByUid, hold.uid);
  assert.deepEqual(f.events, ['lock', 'issue-update']);
  assert.deepEqual(f.blockingReads, [true]);
});

await test('an already issue-closed table clears stale holds but skips an empty-hold write', async () => {
  const f = fixture([issue(IssueStatus.IN_PROGRESS, true)]);
  await applyIssueAvailabilityChange(f.client, 1, {
    status: IssueStatus.IN_PROGRESS,
    blocksTable: true,
  });
  assert.equal(f.table.lockToken, null);
  assert.equal(f.table.lockedUntil, null);
  assert.equal(f.table.lockedByUid, null);
  assert.deepEqual(f.blockingReads, [true]);
  assert(f.events.includes('table-update'));

  f.events.length = 0;
  f.blockingReads.length = 0;
  await applyIssueAvailabilityChange(f.client, 1, {
    status: IssueStatus.IN_PROGRESS,
    blocksTable: true,
  });
  assert.deepEqual(f.events, ['lock', 'issue-update']);
  assert.deepEqual(f.blockingReads, [true]);
});

for (const field of ['lockToken', 'lockedUntil', 'lockedByUid'] as const) {
  await test(`closing clears a partial hold containing only ${field}`, async () => {
    const f = fixture();
    const value = f.table[field];
    Object.assign(f.table, {
      lockToken: null,
      lockedUntil: null,
      lockedByUid: null,
      [field]: value,
    });
    await applyIssueAvailabilityChange(f.client, 1, {
      status: IssueStatus.IN_PROGRESS,
      blocksTable: true,
    });
    assert.equal(f.table.lockToken, null);
    assert.equal(f.table.lockedUntil, null);
    assert.equal(f.table.lockedByUid, null);
    assert(f.events.includes('table-update'));
  });
}

await test('completing one of multiple blocking issues keeps the table closed', async () => {
  const f = fixture([
    issue(IssueStatus.IN_PROGRESS, true),
    issue(IssueStatus.IN_PROGRESS, true, 2),
  ]);
  assert.equal(
    (
      await applyIssueAvailabilityChange(f.client, 1, {
        status: IssueStatus.COMPLETED,
        blocksTable: false,
      })
    ).closed,
    true
  );
  assert.equal((await f.layout()).status, TableStatus.CLOSED);
  await applyIssueAvailabilityChange(f.client, 2, {
    status: IssueStatus.COMPLETED,
    blocksTable: false,
  });
  assert.notEqual((await f.layout()).status, TableStatus.CLOSED);
});

await test('completing an issue never reopens an independently CLOSED table', async () => {
  const f = fixture([issue(IssueStatus.IN_PROGRESS, true)], TableStatus.CLOSED);
  assert.equal(
    (
      await applyIssueAvailabilityChange(f.client, 1, {
        status: IssueStatus.COMPLETED,
        blocksTable: false,
      })
    ).closed,
    true
  );
  assert.equal(f.table.status, TableStatus.CLOSED);
  assert.equal(f.table.lockToken, null);
  assert.equal(f.table.lockedUntil, null);
  assert.equal(f.table.lockedByUid, null);
  assert.equal((await f.layout()).status, TableStatus.CLOSED);
});

await test('PENDING normalizes blocksTable to false; invalid input/missing issue do not mutate', async () => {
  const f = fixture();
  assert.equal(
    (
      await applyIssueAvailabilityChange(f.client, 1, {
        status: IssueStatus.PENDING,
        blocksTable: true,
      })
    ).blocksTable,
    false
  );
  f.events.length = 0;
  await assert.rejects(
    () =>
      applyIssueAvailabilityChange(f.client, 1, {
        status: 'BAD' as IssueStatus,
        blocksTable: true,
      }),
    { code: 'INVALID_ISSUE_AVAILABILITY' }
  );
  await assert.rejects(
    () =>
      applyIssueAvailabilityChange(f.client, 999, {
        status: IssueStatus.IN_PROGRESS,
        blocksTable: true,
      }),
    { code: 'ISSUE_NOT_FOUND' }
  );
  assert.deepEqual(f.events, []);
});

await test('worker status recalculation cannot make an issue-blocked table bookable', async () => {
  const f = fixture([issue(IssueStatus.IN_PROGRESS, true)], TableStatus.RESERVED);
  await refreshTableStatus(f.client, 1, now, true);
  assert.equal(f.table.status, TableStatus.AVAILABLE);
  assert.equal((await f.layout()).status, TableStatus.CLOSED);
  await assert.rejects(() => BookingService.acquireLock(1, 42, undefined, undefined, f.client), {
    code: 'TABLE_CLOSED',
  });
});

await test('availability query errors propagate instead of granting a hold', async () => {
  const f = fixture();
  const error = new Error('issue database unavailable');
  f.client.issueReport.findFirst = async () => {
    throw error;
  };
  await assert.rejects(
    () => BookingService.acquireLock(1, 42, undefined, undefined, f.client),
    error
  );
  assert.equal(f.events.includes('hold-write'), false);
});

const originalSchedule = ScheduleService.validateTargetTimeWindow;
ScheduleService.validateTargetTimeWindow = async (targetStart, targetEnd) => ({
  targetStart,
  targetEnd,
  schedule: {
    name: 'Test',
    openTime: '00:00',
    closeTime: '23:59',
    is24Hours: true,
    isClosed: false,
    priority: 1,
  },
  config: { maxAdvanceBookingDays: 7, maxBookingDurationMinutes: 120 },
});
try {
  await test('final booking rechecks issue closure under the table lock, rejecting a stale token', async () => {
    const f = fixture([issue(IssueStatus.IN_PROGRESS, true)]);
    await assert.rejects(
      () =>
        BookingService.createBooking(
          {
            userId: 42,
            tableId: 1,
            startDateTime: now,
            endDateTime: window.targetEnd,
            lockToken: 'old-hold',
          },
          f.client
        ),
      { code: 'TABLE_CLOSED' }
    );
    assert.deepEqual(f.events, ['lock']);
  });
  await test('non-blocking issue still permits booking under the table lock', async () => {
    const f = fixture([issue(IssueStatus.IN_PROGRESS)]);
    const result = await BookingService.createBooking(
      {
        userId: 42,
        tableId: 1,
        startDateTime: now,
        endDateTime: window.targetEnd,
        lockToken: 'old-hold',
      },
      f.client
    );
    assert.equal(result.bookingId, 1);
    assert(f.events.indexOf('lock') < f.events.indexOf('booking-write'));
  });
} finally {
  ScheduleService.validateTargetTimeWindow = originalSchedule;
}
console.log(`Facility availability: ${passed} tests passed.`);
