import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Never run this write-heavy suite against the application's database.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required.');

const testUrl = new URL(testDatabaseUrl);
const testDatabaseName = decodeURIComponent(testUrl.pathname.slice(1));
if (!/^postgres(?:ql)?:$/.test(testUrl.protocol) || !/_test$/i.test(testDatabaseName)) {
  throw new Error('TEST_DATABASE_URL must be a PostgreSQL database ending in _test.');
}
if (process.env.DATABASE_URL) {
  const appUrl = new URL(process.env.DATABASE_URL);
  if (appUrl.host === testUrl.host && appUrl.pathname === testUrl.pathname) {
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL.');
  }
}

process.env.DATABASE_URL = testDatabaseUrl;
const { PrismaClient, BookingStatus, TableStatus, UserType, ZoneType } =
  await import('@prisma/client');
const { BookingService } = await import('../services/bookingService.js');
const prisma = new PrismaClient();
const runId = randomUUID().replaceAll('-', '');
const now = new Date('2026-10-20T10:00:00.000Z');

const bookingIds: number[] = [];
const tableIds: number[] = [];
const zoneIds: number[] = [];
const userIds: number[] = [];
let fixtureNumber = 0;
let createdConfig = false;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitFor(promise: Promise<void>, label: string): Promise<void> {
  let timer: NodeJS.Timeout;
  try {
    await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 3000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

async function createFixture(nextStartMinutes: number, oldEndMinutes = 0) {
  const suffix = fixtureNumber++;
  const zone = await prisma.zone.create({ data: { zoneType: ZoneType.COMMON } });
  zoneIds.push(zone.zoneId);
  const table = await prisma.table.create({
    data: { zoneId: zone.zoneId, numberOfSeat: 4, status: TableStatus.OCCUPIED },
  });
  tableIds.push(table.tableId);
  const firstUser = await prisma.user.create({
    data: {
      email: `completion-first-${runId}-${suffix}@example.test`,
      firstname: 'First',
      lastname: 'Test',
      userType: UserType.UNIVERSITY,
      isProfileComplete: true,
    },
  });
  userIds.push(firstUser.uid);
  const secondUser = await prisma.user.create({
    data: {
      email: `completion-second-${runId}-${suffix}@example.test`,
      firstname: 'Second',
      lastname: 'Test',
      userType: UserType.UNIVERSITY,
      isProfileComplete: true,
    },
  });
  userIds.push(secondUser.uid);
  const oldBooking = await prisma.booking.create({
    data: {
      uid: firstUser.uid,
      tableId: table.tableId,
      status: BookingStatus.ACTIVE,
      startDateTime: new Date(now.getTime() - 30 * 60_000),
      endDateTime: new Date(now.getTime() + oldEndMinutes * 60_000),
      arriveTime: new Date(now.getTime() - 30 * 60_000),
    },
  });
  bookingIds.push(oldBooking.bookingId);
  const nextStart = new Date(now.getTime() + nextStartMinutes * 60_000);
  const nextBooking = await prisma.booking.create({
    data: {
      uid: secondUser.uid,
      tableId: table.tableId,
      status: BookingStatus.PENDING,
      startDateTime: nextStart,
      endDateTime: new Date(nextStart.getTime() + 15 * 60_000),
    },
  });
  bookingIds.push(nextBooking.bookingId);
  return {
    tableId: table.tableId,
    oldBookingId: oldBooking.bookingId,
    nextBookingId: nextBooking.bookingId,
    nextUid: secondUser.uid,
  };
}

function pauseAfterTableLock() {
  const attempted = deferred();
  const acquired = deferred();
  const resume = deferred();
  let hasAcquired = false;
  const client = {
    booking: prisma.booking,
    systemConfig: prisma.systemConfig,
    $transaction: (callback: (tx: any) => Promise<unknown>) =>
      prisma.$transaction(async (tx) =>
        callback({
          booking: tx.booking,
          table: tx.table,
          $queryRaw: async (...args: unknown[]) => {
            attempted.resolve();
            const result = await (tx.$queryRaw as any).apply(tx, args);
            hasAcquired = true;
            acquired.resolve();
            await resume.promise;
            return result;
          },
        })
      ),
  };
  return { client, attempted, acquired, resume, hasAcquired: () => hasAcquired };
}

async function assertFinalState(fixture: Awaited<ReturnType<typeof createFixture>>) {
  const [oldBooking, nextBooking, table] = await Promise.all([
    prisma.booking.findUniqueOrThrow({ where: { bookingId: fixture.oldBookingId } }),
    prisma.booking.findUniqueOrThrow({ where: { bookingId: fixture.nextBookingId } }),
    prisma.table.findUniqueOrThrow({ where: { tableId: fixture.tableId } }),
  ]);
  assert.equal(oldBooking.status, BookingStatus.COMPLETED);
  assert.equal(nextBooking.status, BookingStatus.ACTIVE);
  assert.equal(table.status, TableStatus.OCCUPIED);
}

async function runRace(first: 'worker' | 'check-in') {
  const fixture = await createFixture(0);
  const worker = pauseAfterTableLock();
  const checkIn = pauseAfterTableLock();
  const startWorker = () => BookingService.completeEndedBookings(now, worker.client as any);
  const startCheckIn = () =>
    BookingService.checkIn(fixture.nextUid, fixture.nextBookingId, now, checkIn.client as any);
  const firstStage = first === 'worker' ? worker : checkIn;
  const secondStage = first === 'worker' ? checkIn : worker;
  const firstOperation = first === 'worker' ? startWorker() : startCheckIn();
  let secondOperation: Promise<unknown> | undefined;

  try {
    await waitFor(firstStage.acquired.promise, `${first} to acquire the table lock`);
    secondOperation = first === 'worker' ? startCheckIn() : startWorker();
    await waitFor(secondStage.attempted.promise, 'the second transition to attempt the lock');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(
      secondStage.hasAcquired(),
      false,
      'The second transaction must wait for the table lock'
    );
    firstStage.resume.resolve();
    await firstOperation;
    await waitFor(secondStage.acquired.promise, 'the second transition to acquire the lock');
    secondStage.resume.resolve();
    await secondOperation;
    await assertFinalState(fixture);
  } finally {
    firstStage.resume.resolve();
    secondStage.resume.resolve();
    await Promise.allSettled([firstOperation, secondOperation]);
  }
}

try {
  let config = await prisma.systemConfig.findUnique({ where: { configId: 1 } });
  if (!config) {
    config = await prisma.systemConfig.create({ data: { configId: 1 } });
    createdConfig = true;
  }
  const earlyMinutes = config.earlyCheckInMinutes;
  assert.ok(earlyMinutes > 0, 'The integration test needs an early check-in window.');

  // A has ended, but B checked in before its scheduled start.
  const early = await createFixture(Math.min(earlyMinutes, 15), -1);
  await BookingService.checkIn(early.nextUid, early.nextBookingId, now, prisma);
  const earlyResult = await BookingService.completeEndedBookings(now, prisma);
  assert.equal(earlyResult.processed, 1);
  await assertFinalState(early);

  // Both interleavings must leave the newly checked-in booking's table occupied.
  await runRace('worker');
  await runRace('check-in');

  // A stale scan must not complete a booking whose end was extended meanwhile.
  const extended = await createFixture(15, -1);
  await prisma.booking.update({
    where: { bookingId: extended.oldBookingId },
    data: { endDateTime: new Date(now.getTime() + 5 * 60_000) },
  });
  const completed = await BookingService.processBookingCompletion(
    { bookingId: extended.oldBookingId, tableId: extended.tableId },
    now,
    prisma
  );
  assert.equal(completed, false);
  assert.equal(
    (await prisma.booking.findUniqueOrThrow({ where: { bookingId: extended.oldBookingId } }))
      .status,
    BookingStatus.ACTIVE
  );

  // A failed table write rolls back the preceding booking transition.
  const failed = await createFixture(15);
  const failingClient = {
    $transaction: (callback: (tx: any) => Promise<unknown>) =>
      prisma.$transaction(async (tx) =>
        callback({
          booking: tx.booking,
          table: {
            findUnique: (args: any) => tx.table.findUnique(args),
            update: async () => {
              throw new Error('Simulated table update failure');
            },
          },
          $queryRaw: tx.$queryRaw.bind(tx),
        })
      ),
  };
  await assert.rejects(
    BookingService.processBookingCompletion(
      { bookingId: failed.oldBookingId, tableId: failed.tableId },
      now,
      failingClient as any
    ),
    /Simulated table update failure/
  );
  assert.equal(
    (await prisma.booking.findUniqueOrThrow({ where: { bookingId: failed.oldBookingId } })).status,
    BookingStatus.ACTIVE
  );
  assert.equal(
    (await prisma.table.findUniqueOrThrow({ where: { tableId: failed.tableId } })).status,
    TableStatus.OCCUPIED
  );

  console.log('Booking completion integration tests passed.');
} finally {
  try {
    if (bookingIds.length)
      await prisma.booking.deleteMany({ where: { bookingId: { in: bookingIds } } });
    if (tableIds.length) await prisma.table.deleteMany({ where: { tableId: { in: tableIds } } });
    if (zoneIds.length) await prisma.zone.deleteMany({ where: { zoneId: { in: zoneIds } } });
    if (userIds.length) await prisma.user.deleteMany({ where: { uid: { in: userIds } } });
    if (createdConfig) await prisma.systemConfig.delete({ where: { configId: 1 } });
  } finally {
    await prisma.$disconnect();
  }
}
