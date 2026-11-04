import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import {
  LayoutRequestError,
  bangkokDateKey,
  closedDateKey,
  fetchLayout,
  findReopenDay,
  formatDayKey,
  isLibraryClosedError,
} from '../lib/floorPlan';
import { isClientLayoutError, layoutRetryDelay } from '../lib/floorPlan/closure';
import { STATUS_POLL_MS, layoutLoadState } from '../lib/floorPlan/useFloorPlan';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ZONES = [
  {
    zoneId: 3,
    zoneType: 'COMMON',
    tables: [
      {
        tableId: 301,
        numberOfSeat: 4,
        plugCap: 2,
        hasTvScreen: false,
        status: 'Available',
        isLocked: true,
        lockedByUid: 9,
        bookedIntervals: [{ startDateTime: 'x', endDateTime: 'y', status: 'PENDING' }],
      },
    ],
  },
];

test('browsing on a closed day keeps the tables but shows them all as Closed', async () => {
  mock.method(globalThis, 'fetch', async () =>
    jsonResponse({
      success: true,
      data: ZONES,
      meta: { libraryClosed: true, closedReason: 'Library is closed on 2026-11-03: Holiday' },
    })
  );
  try {
    const { data } = await fetchLayout();
    assert.equal(data.libraryClosed, true);
    const table = data.status[0]!.tables[0]!;
    assert.equal(table.tableId, 301);
    assert.equal(table.status, 'Closed');
    assert.equal(table.isLocked, false);
    assert.deepEqual(table.bookedIntervals, []);
    assert.equal(data.geometry.zones[0]!.tables[0]!.code, 'C1');
  } finally {
    mock.restoreAll();
  }
});

test('an open day keeps live statuses', async () => {
  mock.method(globalThis, 'fetch', async () =>
    jsonResponse({ success: true, data: ZONES, meta: { libraryClosed: false } })
  );
  try {
    const { data } = await fetchLayout();
    assert.equal(data.libraryClosed, false);
    assert.equal(data.status[0]!.tables[0]!.status, 'Available');
  } finally {
    mock.restoreAll();
  }
});

test('a LIBRARY_CLOSED rejection (explicit window) keeps its code', async () => {
  mock.method(globalThis, 'fetch', async () =>
    jsonResponse(
      {
        success: false,
        code: 'LIBRARY_CLOSED',
        error: 'Library is closed on 2026-11-03: Holiday',
      },
      400
    )
  );
  try {
    await assert.rejects(fetchLayout(), (error) => {
      assert.ok(isLibraryClosedError(error));
      assert.ok(isClientLayoutError(error));
      assert.equal(closedDateKey(error, 'fallback'), '2026-11-03');
      return true;
    });
  } finally {
    mock.restoreAll();
  }
});

test('server failures stay retryable and are not mistaken for a closure', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('Bad gateway', { status: 502 }));
  try {
    await assert.rejects(fetchLayout(), (error) => {
      assert.ok(error instanceof LayoutRequestError);
      assert.equal(isLibraryClosedError(error), false);
      assert.equal(isClientLayoutError(error), false);
      return true;
    });
  } finally {
    mock.restoreAll();
  }
});

test('the reopening day is the first day the backend does not report closed', async () => {
  const windows: string[] = [];
  const fail = (code: string, message = code) => new LayoutRequestError(message, 400, code);

  const reopens = await findReopenDay('2026-11-03', 7, async (window) => {
    windows.push(window.startDateTime);
    // 4 Nov 00:00 +07 is closed; 5 Nov 00:00 is outside hours, so it retries at 08:00.
    if (window.startDateTime.startsWith('2026-11-03T17:00')) throw fail('LIBRARY_CLOSED');
    if (window.startDateTime.startsWith('2026-11-04T17:00'))
      throw fail('OUTSIDE_OPERATING_HOURS', 'outside library operating hours (08:00 - 21:00)');
  });

  assert.equal(reopens, '2026-11-05');
  assert.deepEqual(windows, [
    '2026-11-03T17:00:00.000Z',
    '2026-11-04T17:00:00.000Z',
    '2026-11-05T01:00:00.000Z',
  ]);
});

test('closed beyond the advance-booking reach gives no reopening day', async () => {
  let calls = 0;
  const reopens = await findReopenDay('2026-11-03', 7, async () => {
    calls += 1;
    throw new LayoutRequestError(
      'closed',
      400,
      calls < 3 ? 'LIBRARY_CLOSED' : 'BOOKING_TOO_FAR_IN_ADVANCE'
    );
  });
  assert.equal(reopens, null);
  assert.equal(calls, 3);
});

test('dates are shown as Bangkok calendar days', () => {
  assert.equal(bangkokDateKey(new Date('2026-11-03T18:30:00.000Z')), '2026-11-04');
  assert.equal(formatDayKey('2026-11-06'), '6 November 2026');
  assert.equal(formatDayKey('2026-11-07', true), 'Saturday, 7 November 2026');
  assert.equal(
    closedDateKey(new LayoutRequestError('no date here', 400, 'LIBRARY_CLOSED'), '2026-11-03'),
    '2026-11-03'
  );
});

const closedError = () =>
  new LayoutRequestError('Library is closed on 2026-11-06: Holiday', 400, 'LIBRARY_CLOSED');

test('picking a closed day after a plan loaded shows the closure, not a stale plan', () => {
  // keepPreviousData: the previous window's plan is still in `data`.
  const previous = { data: { libraryClosed: false } };
  const state = layoutLoadState(previous, closedError());
  assert.ok(state.closedError);
  assert.equal(closedDateKey(state.closedError, 'fallback'), '2026-11-06');
  assert.equal(state.isStale, false);

  // A failed refresh of an open day is still reported as stale.
  const failed = layoutLoadState(previous, new LayoutRequestError('layout 502', 502));
  assert.equal(failed.closedError, null);
  assert.equal(failed.isStale, true);
});

test('a closed day is re-checked on the poll cadence; other errors keep their policy', () => {
  assert.equal(layoutRetryDelay(closedError(), 0, STATUS_POLL_MS), STATUS_POLL_MS);
  // No give-up count and no backoff: it keeps checking until it reopens.
  assert.equal(layoutRetryDelay(closedError(), 12, STATUS_POLL_MS), STATUS_POLL_MS);
  // Polling turned off means no re-checks either.
  assert.equal(layoutRetryDelay(closedError(), 0, 0), null);
  assert.equal(
    layoutRetryDelay(
      new LayoutRequestError('too far', 400, 'BOOKING_TOO_FAR_IN_ADVANCE'),
      0,
      STATUS_POLL_MS
    ),
    null
  );
  assert.equal(
    layoutRetryDelay(new LayoutRequestError('layout 502', 502), 1, STATUS_POLL_MS),
    10_000
  );
  assert.equal(
    layoutRetryDelay(new LayoutRequestError('layout 502', 502), 5, STATUS_POLL_MS),
    null
  );
});

test('a day an admin reopens shows up on its own after one poll interval', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  let open = false;
  let calls = 0;
  mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return open
      ? jsonResponse({ success: true, data: ZONES, meta: { libraryClosed: false } })
      : jsonResponse(
          {
            success: false,
            code: 'LIBRARY_CLOSED',
            error: 'Library is closed on 2026-11-06: Holiday',
          },
          400
        );
  });
  const window = {
    startDateTime: '2026-11-06T03:00:00.000Z',
    endDateTime: '2026-11-06T04:00:00.000Z',
  };

  // SWR's error loop: on failure it asks onErrorRetry, which schedules the next fetch.
  let state = layoutLoadState(undefined, undefined);
  const revalidate = async (retryCount: number): Promise<void> => {
    try {
      const result = await fetchLayout(window);
      state = layoutLoadState(result, undefined);
    } catch (error) {
      state = layoutLoadState(undefined, error);
      const delay = layoutRetryDelay(error, retryCount, STATUS_POLL_MS);
      if (delay !== null) setTimeout(() => void revalidate(retryCount + 1), delay);
    }
  };
  const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

  try {
    await revalidate(0);
    assert.ok(state.closedError);
    assert.equal(calls, 1);

    // Not hammered: nothing fires before the interval.
    mock.timers.tick(STATUS_POLL_MS - 1);
    await settle();
    assert.equal(calls, 1);

    open = true;
    mock.timers.tick(1);
    for (let i = 0; i < 5; i++) await settle();
    assert.equal(calls, 2);
    assert.equal(state.closedError, null);
    assert.equal(state.isError, false);
    assert.equal(state.isLoading, false);
  } finally {
    mock.timers.reset();
    mock.restoreAll();
  }
});
