import assert from 'node:assert/strict';
import test from 'node:test';
import { LockService } from '../services/lockService.js';

const now = new Date('2026-10-26T12:00:00Z');
function fixture(rows = [{ tableid: 10 }, { tableid: 20 }]) {
  const calls: { query?: string; cutoff?: unknown; update?: any; transaction: number } = {
    transaction: 0,
  };
  const client: any = {
    $transaction: async (callback: (tx: any) => Promise<unknown>) => {
      calls.transaction++;
      return callback({
        $queryRaw: async (strings: TemplateStringsArray, cutoff: unknown) => {
          calls.query = strings.join('?');
          calls.cutoff = cutoff;
          return rows;
        },
        table: {
          updateMany: async (args: any) => {
            calls.update = args;
            return { count: rows.length };
          },
        },
      });
    },
  };
  return { client, calls };
}

test('expiration locks rows in table order, skips busy rows, and rechecks expiry on update', async () => {
  const { client, calls } = fixture();
  assert.equal(await LockService.releaseExpiredLocks(now, client), 2);
  assert.equal(calls.transaction, 1);
  assert.match(calls.query!, /ORDER BY tableid FOR UPDATE SKIP LOCKED/);
  assert.equal(calls.cutoff, now);
  assert.deepEqual(calls.update, {
    where: { tableId: { in: [10, 20] }, lockedUntil: { lt: now }, lockToken: { not: null } },
    data: { lockToken: null, lockedUntil: null, lockedByUid: null },
  });
});

test('no eligible or unlocked expired rows means no UPDATE', async () => {
  const { client, calls } = fixture([]);
  assert.equal(await LockService.releaseExpiredLocks(now, client), 0);
  assert.equal(calls.update, undefined);
});

test('cleanup propagates a transaction failure instead of hiding a deadlock as success', async () => {
  const failure = new Error('transaction failed');
  await assert.rejects(
    () =>
      LockService.releaseExpiredLocks(now, {
        $transaction: async () => {
          throw failure;
        },
      } as any),
    failure
  );
});

test('scheduled cleanup logs failures and can run the next tick', async (t) => {
  let tick!: () => Promise<void>;
  t.mock.method(globalThis, 'setInterval', (callback: () => Promise<void>) => {
    tick = callback;
    return {} as NodeJS.Timeout;
  });
  const failure = new Error('transient failure');
  let attempts = 0;
  t.mock.method(LockService, 'releaseExpiredLocks', async () => {
    if (++attempts === 1) throw failure;
    return 0;
  });
  const errors = t.mock.method(console, 'error', () => {});
  LockService.startExpirationWorker();
  await tick();
  await tick();
  assert.equal(attempts, 2);
  assert.equal(errors.mock.callCount(), 1);
  assert.equal(errors.mock.calls[0]!.arguments[1], failure);
});
