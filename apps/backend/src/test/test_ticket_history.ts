import assert from 'node:assert/strict';
import test from 'node:test';
import { TicketStatus, PaymentStatus } from '@prisma/client';

process.env.DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
process.env.JWT_SECRET = 'ticket-history-test-secret';

const { TicketService, formatTicket } = await import('../services/ticketService.js');
const { TicketController } = await import('../controllers/ticketController.js');

function mockTicket(overrides: Record<string, unknown> = {}) {
  const baseStart = new Date('2026-10-23T10:00:00.000Z');
  const baseEnd = new Date('2026-10-23T12:00:00.000Z');
  return {
    ticketId: 101,
    uid: 42,
    status: TicketStatus.PAID,
    startDateTime: baseStart,
    endDateTime: baseEnd,
    createdAt: new Date('2026-10-23T09:50:00.000Z'),
    updatedAt: new Date('2026-10-23T10:00:00.000Z'),
    payments: [
      {
        paymentId: 501,
        ticketId: 101,
        uid: 42,
        amountSatang: 5000,
        currency: 'THB',
        status: PaymentStatus.PAID,
        gateway: 'stripe',
        ticketValidityHours: 2,
        paidAt: new Date('2026-10-23T10:00:00.000Z'),
        createdAt: new Date('2026-10-23T09:50:00.000Z'),
      },
    ],
    ...overrides,
  };
}

// ===========================================================================
// Suite 1: formatTicket Helper & Validity Calculations
// ===========================================================================

test('formatTicket calculates isValidNow and remainingSeconds correctly for paid tickets', () => {
  const ticket = mockTicket();
  // Simulated time: 10:30 (30 mins into the 2-hour window)
  const now = new Date('2026-10-23T10:30:00.000Z');
  const formatted = formatTicket(ticket, now);

  assert.equal(formatted.ticketId, 101);
  assert.equal(formatted.status, TicketStatus.PAID);
  assert.equal(formatted.validTimePeriod.isValidNow, true);
  assert.equal(formatted.validTimePeriod.isExpired, false);
  // Remaining: 12:00 - 10:30 = 90 mins = 5400 seconds
  assert.equal(formatted.validTimePeriod.remainingSeconds, 5400);
  assert.equal(formatted.payments.length, 1);
  assert.equal(formatted.payments[0].amountBaht, 50.0);
  assert.equal(formatted.payments[0].amountSatang, 5000);
});

test('formatTicket dynamically reflects EXPIRED status when current time is past endDateTime', () => {
  const ticket = mockTicket({
    status: TicketStatus.PAID,
    startDateTime: new Date('2026-10-23T08:00:00.000Z'),
    endDateTime: new Date('2026-10-23T10:00:00.000Z'),
  });
  // Simulated time: 11:00 (past endDateTime)
  const now = new Date('2026-10-23T11:00:00.000Z');
  const formatted = formatTicket(ticket, now);

  assert.equal(formatted.status, 'EXPIRED');
  assert.equal(formatted.validTimePeriod.isValidNow, false);
  assert.equal(formatted.validTimePeriod.isExpired, true);
  assert.equal(formatted.validTimePeriod.remainingSeconds, 0);
});

test('formatTicket marks unpaid ticket as isValidNow = false', () => {
  const ticket = mockTicket({
    status: TicketStatus.UNPAID,
  });
  const now = new Date('2026-10-23T10:30:00.000Z');
  const formatted = formatTicket(ticket, now);

  assert.equal(formatted.status, TicketStatus.UNPAID);
  assert.equal(formatted.validTimePeriod.isValidNow, false);
  assert.equal(formatted.validTimePeriod.remainingSeconds, 0);
});

test('formatTicket handles empty payments array safely', () => {
  const ticket = mockTicket({
    payments: [],
  });
  const formatted = formatTicket(ticket);
  assert.deepEqual(formatted.payments, []);
});

// ===========================================================================
// Suite 2: TicketService.getMyTickets
// ===========================================================================

test('getMyTickets queries tickets for the specified user in descending order', async () => {
  let queryArgs: any = null;
  const mockPrisma = {
    ticket: {
      findMany: async (args: any) => {
        queryArgs = args;
        return [mockTicket({ ticketId: 102 }), mockTicket({ ticketId: 101 })];
      },
    },
  };

  const results = await TicketService.getMyTickets(42, mockPrisma);

  assert.equal(queryArgs.where.uid, 42);
  assert.deepEqual(queryArgs.orderBy, { createdAt: 'desc' });
  assert.deepEqual(queryArgs.include.payments.orderBy, { createdAt: 'desc' });
  assert.equal(results.length, 2);
  assert.equal(results[0].ticketId, 102);
  assert.equal(results[1].ticketId, 101);
});

test('getMyTickets returns empty array if user has no tickets', async () => {
  const mockPrisma = {
    ticket: {
      findMany: async () => [],
    },
  };

  const results = await TicketService.getMyTickets(999, mockPrisma);
  assert.deepEqual(results, []);
});

// ===========================================================================
// Suite 3: TicketService.getTicketById (Single Ticket & Access Control)
// ===========================================================================

test('getTicketById returns ticket details for the ticket owner', async () => {
  let queryArgs: any = null;
  const mockPrisma = {
    ticket: {
      findUnique: async (args: any) => {
        queryArgs = args;
        return mockTicket({ ticketId: 101, uid: 42 });
      },
    },
  };

  const result = await TicketService.getTicketById(101, { uid: 42, role: 'OUTSIDER' }, mockPrisma);
  assert.deepEqual(queryArgs.where, { ticketId: 101 });
  assert.deepEqual(queryArgs.include.payments.orderBy, { createdAt: 'desc' });
  assert.equal(result.ticketId, 101);
  assert.equal(result.uid, 42);
});

test('getTicketById allows ADMIN to view any user ticket', async () => {
  const mockPrisma = {
    ticket: {
      findUnique: async () => mockTicket({ ticketId: 101, uid: 42 }),
    },
  };

  // Admin uid 999 viewing ticket of uid 42
  const result = await TicketService.getTicketById(101, { uid: 999, role: 'ADMIN' }, mockPrisma);
  assert.equal(result.ticketId, 101);
  assert.equal(result.uid, 42);
});

test('getTicketById throws 403 FORBIDDEN when user tries to view another user ticket', async () => {
  const mockPrisma = {
    ticket: {
      findUnique: async () => mockTicket({ ticketId: 101, uid: 42 }),
    },
  };

  await assert.rejects(
    async () => {
      // User 99 viewing ticket belonging to 42
      await TicketService.getTicketById(101, { uid: 99, role: 'OUTSIDER' }, mockPrisma);
    },
    (err: any) => {
      assert.equal(err.status, 403);
      assert.equal(err.code, 'FORBIDDEN');
      return true;
    }
  );
});

test('getTicketById throws 404 TICKET_NOT_FOUND when ticket does not exist', async () => {
  const mockPrisma = {
    ticket: {
      findUnique: async () => null,
    },
  };

  await assert.rejects(
    async () => {
      await TicketService.getTicketById(999, { uid: 42, role: 'OUTSIDER' }, mockPrisma);
    },
    (err: any) => {
      assert.equal(err.status, 404);
      assert.equal(err.code, 'TICKET_NOT_FOUND');
      return true;
    }
  );
});

// ===========================================================================
// Suite 4: Controller Input Validation & Error Handling
// ===========================================================================

test('getMyTickets controller returns 401 when user session is missing', async () => {
  let statusCode = 0;
  let jsonBody: any = null;
  const req = {} as any;
  const res = {
    status: (code: number) => {
      statusCode = code;
      return {
        json: (body: any) => {
          jsonBody = body;
        },
      };
    },
  } as any;

  await TicketController.getMyTickets(req, res);
  assert.equal(statusCode, 401);
  assert.equal(jsonBody.code, 'UNAUTHORIZED');
});

test('getTicketById controller rejects invalid ticket ID with 400', async () => {
  let statusCode = 0;
  let jsonBody: any = null;
  const req = {
    user: { uid: 42, role: 'OUTSIDER' },
    params: { ticketId: 'abc' },
  } as any;
  const res = {
    status: (code: number) => {
      statusCode = code;
      return {
        json: (body: any) => {
          jsonBody = body;
        },
      };
    },
  } as any;

  await TicketController.getTicketById(req, res);
  assert.equal(statusCode, 400);
  assert.equal(jsonBody.code, 'INVALID_TICKET_ID');
});

test('getTicketById controller rejects negative ticket ID with 400', async () => {
  let statusCode = 0;
  let jsonBody: any = null;
  const req = {
    user: { uid: 42, role: 'OUTSIDER' },
    params: { ticketId: '-5' },
  } as any;
  const res = {
    status: (code: number) => {
      statusCode = code;
      return {
        json: (body: any) => {
          jsonBody = body;
        },
      };
    },
  } as any;

  await TicketController.getTicketById(req, res);
  assert.equal(statusCode, 400);
  assert.equal(jsonBody.code, 'INVALID_TICKET_ID');
});

test('getTicketById controller rejects ticket IDs with trailing characters or decimals', async () => {
  for (const rawId of ['12abc', '1.5']) {
    let statusCode = 0;
    const req = {
      user: { uid: 42, role: 'OUTSIDER' },
      params: { ticketId: rawId },
    } as any;
    const res = {
      status: (code: number) => {
        statusCode = code;
        return { json: () => undefined };
      },
    } as any;

    await TicketController.getTicketById(req, res);
    assert.equal(statusCode, 400, `ticketId ${rawId} should be rejected`);
  }
});

test('getTicketById controller rejects ticket IDs outside the safe integer range', async () => {
  let statusCode = 0;
  const req = {
    user: { uid: 42, role: 'OUTSIDER' },
    params: { ticketId: '9007199254740992' },
  } as any;
  const res = {
    status: (code: number) => {
      statusCode = code;
      return { json: () => undefined };
    },
  } as any;

  await TicketController.getTicketById(req, res);
  assert.equal(statusCode, 400);
});
