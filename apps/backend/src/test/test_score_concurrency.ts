import assert from 'node:assert/strict';
import test from 'node:test';
import { BookingStatus, TableStatus } from '@prisma/client';

// Unit tests must never fall back to the application database if an injected
// client is accidentally ignored by a service.
process.env.DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
const { AuthService } = await import('../services/authService.js');
const { NoShowService } = await import('../services/noShowService.js');

const adminId = 1;
const uid = 42;
const bookingId = 101;
const tableId = 7;
const adminReason = 'Concurrent test adjustment';
const workerReason = `Automated penalty for No-show on Booking #${bookingId}`;
const booking = { bookingId, uid, tableId };

type Actor = 'admin' | 'worker';
type Audit = { uid: number; adminId: number; scoreChange: number; reason: string };
type State = {
  score: number;
  bookingStatus: BookingStatus;
  tableStatus: TableStatus;
  audits: Audit[];
};

function initialState(): State {
  return {
    score: 80,
    bookingStatus: BookingStatus.PENDING,
    tableStatus: TableStatus.RESERVED,
    audits: [],
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function readGate() {
  const bothRead = deferred();
  const release = { admin: deferred(), worker: deferred() };
  const seen = new Set<Actor>();
  return {
    bothRead: bothRead.promise,
    release,
    async afterRead(actor: Actor) {
      seen.add(actor);
      if (seen.size === 2) bothRead.resolve();
      await release[actor].promise;
    },
  };
}

// This mock stages transaction writes and commits only when the callback
// succeeds. It tests service control flow, not PostgreSQL isolation itself.
function clientFor(state: State, actor: Actor, afterRead?: (actor: Actor) => Promise<void>) {
  return {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const staged: Partial<Pick<State, 'score' | 'bookingStatus' | 'tableStatus'>> = {};
      const audits: Audit[] = [];
      const tx = {
        $queryRaw: async () => [],
        systemConfig: { findFirst: async () => ({ lateThresholdMinutes: 15 }) },
        admin: {
          findUnique: async () => ({ adminId }),
          findFirst: async () => ({ adminId }),
        },
        booking: {
          findFirst: async () => null,
          updateMany: async ({ where, data }: any) => {
            if (where.bookingId !== bookingId || state.bookingStatus !== where.status) {
              return { count: 0 };
            }
            staged.bookingStatus = data.status;
            return { count: 1 };
          },
        },
        table: {
          findUnique: async () => ({ status: state.tableStatus }),
          update: async ({ data }: any) => {
            staged.tableStatus = data.status;
            return data;
          },
        },
        user: {
          findUnique: async () => {
            const behaviourScore = state.score;
            await afterRead?.(actor);
            return { uid, behaviourScore };
          },
          updateMany: async ({ where, data }: any) => {
            if (where.uid !== uid || state.score !== where.behaviourScore) {
              return { count: 0 };
            }
            staged.score = data.behaviourScore;
            return { count: 1 };
          },
        },
        manageScore: {
          create: async ({ data }: any) => {
            audits.push(data);
            return data;
          },
        },
      };

      const result = await callback(tx);
      if (staged.score !== undefined) state.score = staged.score;
      if (staged.bookingStatus !== undefined) state.bookingStatus = staged.bookingStatus;
      if (staged.tableStatus !== undefined) state.tableStatus = staged.tableStatus;
      state.audits.push(...audits);
      return result;
    },
  };
}

function runActor(state: State, actor: Actor, afterRead?: (actor: Actor) => Promise<void>) {
  const client = clientFor(state, actor, afterRead);
  if (actor === 'admin') {
    return AuthService.adjustUserScore(adminId, uid, 5, adminReason, client);
  }
  return NoShowService.processNoShowBooking(booking, client);
}

function assertFinalState(state: State, order: number[]) {
  assert.equal(state.score, 75);
  assert.equal(state.bookingStatus, BookingStatus.NO_SHOW);
  assert.equal(state.tableStatus, TableStatus.AVAILABLE);
  assert.deepEqual(
    state.audits.map(({ scoreChange }) => scoreChange),
    order
  );
  assert.deepEqual(
    new Set(state.audits.map(({ reason }) => reason)),
    new Set([adminReason, workerReason])
  );
  assert(state.audits.every((audit) => audit.uid === uid && audit.adminId === adminId));
}

for (const first of ['admin', 'worker'] as const) {
  test(
    `serial execution: ${first} first lets both operations commit`,
    { timeout: 5000 },
    async () => {
      const state = initialState();
      const second: Actor = first === 'admin' ? 'worker' : 'admin';

      await runActor(state, first);
      await runActor(state, second);

      assertFinalState(state, first === 'admin' ? [5, -10] : [-10, 5]);
    }
  );

  test(
    `stale-read race: ${first} wins, loser retries without lost update`,
    { timeout: 5000 },
    async () => {
      const state = initialState();
      const gate = readGate();
      const second: Actor = first === 'admin' ? 'worker' : 'admin';
      const outcomes = {
        admin: Promise.resolve().then(() => runActor(state, 'admin', gate.afterRead)),
        worker: Promise.resolve().then(() => runActor(state, 'worker', gate.afterRead)),
      };

      // Both actors have read the same score (80) before either may update it.
      await gate.bothRead;
      gate.release[first].resolve();
      await outcomes[first];
      gate.release[second].resolve();

      if (second === 'admin') {
        await assert.rejects(outcomes.admin, (error: any) => {
          return error.status === 409 && error.code === 'CONCURRENT_MODIFICATION';
        });
      } else {
        await assert.rejects(outcomes.worker, /CONCURRENT_MODIFICATION/);
      }

      assert.equal(state.score, first === 'admin' ? 85 : 70);
      assert.equal(state.audits.length, 1);
      assert.equal(state.audits[0].scoreChange, first === 'admin' ? 5 : -10);
      assert.equal(
        state.bookingStatus,
        first === 'admin' ? BookingStatus.PENDING : BookingStatus.NO_SHOW
      );

      await runActor(state, second);
      assertFinalState(state, first === 'admin' ? [5, -10] : [-10, 5]);
    }
  );
}
