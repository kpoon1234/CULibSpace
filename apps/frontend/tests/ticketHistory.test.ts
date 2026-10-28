import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { fetchMyTickets, TicketRequestError, type VisitorTicket } from '../lib/tickets';
import {
  formatAmount,
  formatWindow,
  getTicketPhase,
  pickCurrentTicket,
} from '../components/VisitorTickets/ticketState';

const NOW = Date.parse('2026-10-26T09:00:00.000Z');
const HOUR = 3_600_000;

function iso(offsetMs: number) {
  return new Date(NOW + offsetMs).toISOString();
}

function payment(status: VisitorTicket['payments'][number]['status'], paymentId = 1) {
  return {
    paymentId,
    amountSatang: 5000,
    amountBaht: 50,
    currency: 'THB',
    status,
    gateway: 'stripe',
    ticketValidityHours: 4,
    paidAt: status === 'PAID' ? iso(-HOUR) : null,
    createdAt: iso(-HOUR),
  };
}

function ticket(
  overrides: Partial<VisitorTicket> & Pick<VisitorTicket, 'ticketId'>
): VisitorTicket {
  const startDateTime = overrides.startDateTime ?? iso(-HOUR);
  const endDateTime = overrides.endDateTime ?? iso(3 * HOUR);
  return {
    uid: 5,
    status: 'PAID',
    createdAt: iso(-HOUR),
    payments: [payment('PAID')],
    ...overrides,
    startDateTime,
    endDateTime,
    validTimePeriod: {
      startDateTime,
      endDateTime,
      isValidNow: false,
      isExpired: false,
      remainingSeconds: 0,
    },
  };
}

test('a paid ticket inside its window is active', () => {
  assert.equal(getTicketPhase(ticket({ ticketId: 1 }), NOW), 'active');
});

test('a paid ticket before its window is upcoming', () => {
  const upcoming = ticket({ ticketId: 1, startDateTime: iso(HOUR), endDateTime: iso(5 * HOUR) });
  assert.equal(getTicketPhase(upcoming, NOW), 'upcoming');
});

test('a paid ticket past its window is expired even before the server says so', () => {
  const lapsed = ticket({ ticketId: 1, startDateTime: iso(-5 * HOUR), endDateTime: iso(-HOUR) });
  assert.equal(getTicketPhase(lapsed, NOW), 'expired');
  assert.equal(getTicketPhase({ ...lapsed, status: 'EXPIRED' }, NOW), 'expired');
});

test('an unpaid ticket follows its latest payment', () => {
  const unpaid = (status: VisitorTicket['payments'][number]['status']) =>
    getTicketPhase(ticket({ ticketId: 1, status: 'UNPAID', payments: [payment(status)] }), NOW);

  assert.equal(unpaid('PENDING'), 'awaiting');
  assert.equal(unpaid('UNCONFIRMED'), 'awaiting');
  assert.equal(unpaid('FAILED'), 'unpaid');
  assert.equal(unpaid('EXPIRED'), 'unpaid');
  assert.equal(unpaid('REFUNDED'), 'refunded');
  assert.equal(
    getTicketPhase(ticket({ ticketId: 1, status: 'UNPAID', payments: [] }), NOW),
    'unpaid'
  );
});

test('only the newest payment decides an unpaid ticket', () => {
  // Payments arrive newest first: a retry still pending after an earlier failure.
  const retried = ticket({
    ticketId: 1,
    status: 'UNPAID',
    payments: [payment('PENDING', 2), payment('FAILED', 1)],
  });
  assert.equal(getTicketPhase(retried, NOW), 'awaiting');
});

test('the current ticket prefers active, then upcoming, then a payment being confirmed', () => {
  const expired = ticket({ ticketId: 1, status: 'EXPIRED' });
  const awaiting = ticket({ ticketId: 2, status: 'UNPAID', payments: [payment('PENDING')] });
  const upcoming = ticket({ ticketId: 3, startDateTime: iso(HOUR), endDateTime: iso(5 * HOUR) });
  const active = ticket({ ticketId: 4 });

  assert.equal(pickCurrentTicket([expired, awaiting, upcoming, active], NOW)?.ticketId, 4);
  assert.equal(pickCurrentTicket([expired, awaiting, upcoming], NOW)?.ticketId, 3);
  assert.equal(pickCurrentTicket([expired, awaiting], NOW)?.ticketId, 2);
  assert.equal(pickCurrentTicket([expired], NOW), null);
  assert.equal(pickCurrentTicket([], NOW), null);
});

test('a window within one day names the date once; one crossing midnight names both', () => {
  // Built from local-time parts so the assertion holds in any CI timezone.
  const sameDay = formatWindow(
    new Date(2026, 9, 26, 16, 28).toISOString(),
    new Date(2026, 9, 26, 20, 28).toISOString()
  );
  assert.equal(sameDay, '26 Oct 2026, 16:28 – 20:28');

  const overnight = formatWindow(
    new Date(2026, 9, 19, 20, 10).toISOString(),
    new Date(2026, 9, 20, 0, 10).toISOString()
  );
  assert.match(overnight, /^19 Oct 2026, 20:10 – 20 Oct 2026, 00:10$/);
});

test('an unparseable window says so instead of rendering Invalid Date', () => {
  assert.equal(formatWindow('not-a-date', iso(HOUR)), 'Validity unavailable');
});

test('amounts are formatted from satang, not baht', () => {
  assert.match(formatAmount({ amountSatang: 5000, currency: 'thb' }), /50\.00/);
  assert.match(formatAmount({ amountSatang: 12345, currency: 'THB' }), /123\.45/);
});

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

beforeEach(() => {
  const values = new Map<string, string>([['culibspace_token', 'visitor-token']]);
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    } satisfies Storage,
    configurable: true,
  });
});

afterEach(() => {
  mock.restoreAll();
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

test('fetchMyTickets sends the visitor token and returns the ticket list', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    Response.json({ success: true, data: [ticket({ ticketId: 7 })] })
  );

  const tickets = await fetchMyTickets();

  assert.equal(tickets[0].ticketId, 7);
  const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
  assert.match(url, /\/api\/tickets\/my-tickets$/);
  assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer visitor-token');
});

test('fetchMyTickets surfaces the server error and status', async () => {
  mock.method(globalThis, 'fetch', async () =>
    Response.json({ success: false, error: 'Unauthorized: User session required' }, { status: 401 })
  );

  await assert.rejects(fetchMyTickets(), (error: unknown) => {
    assert.ok(error instanceof TicketRequestError);
    assert.equal(error.status, 401);
    assert.equal(error.message, 'Unauthorized: User session required');
    return true;
  });
});

test('fetchMyTickets reports a network failure as status 0 without throwing a raw error', async () => {
  mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('fetch failed');
  });

  await assert.rejects(fetchMyTickets(), (error: unknown) => {
    assert.ok(error instanceof TicketRequestError);
    assert.equal(error.status, 0);
    return true;
  });
});

test('fetchMyTickets does not call the API without a session', async () => {
  localStorage.clear();
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({}));

  await assert.rejects(fetchMyTickets(), (error: unknown) => {
    assert.ok(error instanceof TicketRequestError);
    assert.equal(error.status, 401);
    return true;
  });
  assert.equal(fetchMock.mock.callCount(), 0);
});
