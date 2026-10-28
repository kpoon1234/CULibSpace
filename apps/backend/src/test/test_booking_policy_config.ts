import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
process.env.JWT_SECRET = 'booking-policy-unit-test-secret';

const { SystemConfigService, DEFAULT_SYSTEM_CONFIG, MIN_TICKET_PRICE_SATANG } =
  await import('../services/systemConfigService.js');
const { SystemConfigController } = await import('../controllers/systemConfigController.js');

function createMockPrisma(initialConfig: any = { ...DEFAULT_SYSTEM_CONFIG }) {
  let mutex: Promise<void> = Promise.resolve();
  const state = {
    config: initialConfig ? { ...initialConfig } : null,
    admin: { adminId: 1 } as { adminId: number } | null,
    locks: 0,
    advisoryLocks: 0,
    updates: 0,
    creates: 0,
  };

  const client: any = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      if (sql.includes('pg_advisory_xact_lock')) {
        assert.match(
          sql,
          /pg_advisory_xact_lock\(704001\)::text/,
          'advisory lock must cast void to text for Prisma compatibility'
        );
        state.advisoryLocks++;
      } else {
        state.locks++;
      }
      return [];
    },
    admin: {
      findUnique: async ({ where }: any) =>
        state.admin && state.admin.adminId === where.adminId ? state.admin : null,
    },
    systemConfig: {
      findFirst: async () => (state.config ? { ...state.config } : null),
      update: async ({ data }: any) => {
        state.updates++;
        state.config = { ...state.config, ...data };
        return { ...state.config };
      },
      create: async ({ data }: any) => {
        if (state.config && state.config.configId === data.configId) {
          const err: any = new Error('Unique constraint failed on the fields: (`configid`)');
          err.code = 'P2002';
          throw err;
        }
        state.creates++;
        state.config = { ...data };
        return { ...state.config };
      },
    },
    $transaction: async (cb: any) => {
      // Simulate transaction serialization when advisory lock is used
      let release!: () => void;
      const prev = mutex;
      mutex = new Promise<void>((resolve) => {
        release = resolve;
      });
      await prev;
      try {
        return await cb(client);
      } finally {
        release();
      }
    },
  };

  return { client, state };
}

test('validates and updates booking policy limits inside a locked transaction', async () => {
  const { client, state } = createMockPrisma();

  const updated = await SystemConfigService.updatePolicy(
    1,
    {
      maxBookingDurationMinutes: 180,
      maxAdvanceBookingDays: 14,
      minScoreToBook: 60,
      earlyCheckInMinutes: 20,
      lateThresholdMinutes: 10,
      ticketPriceSatang: 5000,
    },
    client
  );

  assert.equal(state.advisoryLocks, 1, 'must acquire transaction advisory lock');
  assert.equal(state.locks, 1, 'must acquire row lock before updating');
  assert.equal(state.updates, 1);
  assert.equal(updated.maxBookingDurationMinutes, 180);
  assert.equal(updated.maxAdvanceBookingDays, 14);
  assert.equal(updated.minScoreToBook, 60);
  assert.equal(updated.earlyCheckInMinutes, 20);
  assert.equal(updated.lateThresholdMinutes, 10);
  assert.equal(updated.ticketPriceSatang, 5000);
});

test('Regression #1: rejects ticketPriceSatang below Stripe THB minimum (1000 satang)', async () => {
  const { client, state } = createMockPrisma();

  for (const invalidPrice of [0, 1, 99, 500, MIN_TICKET_PRICE_SATANG - 1, -1000]) {
    await assert.rejects(
      () => SystemConfigService.updatePolicy(1, { ticketPriceSatang: invalidPrice }, client),
      (err: any) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'INVALID_BOOKING_POLICY');
        assert.equal(err.errors?.[0]?.field, 'ticketPriceSatang');
        return true;
      }
    );
  }

  assert.equal(state.updates, 0);

  // Boundary minimum (1000 satang = 10.00 THB) succeeds
  const valid = await SystemConfigService.updatePolicy(
    1,
    { ticketPriceSatang: MIN_TICKET_PRICE_SATANG },
    client
  );
  assert.equal(valid.ticketPriceSatang, MIN_TICKET_PRICE_SATANG);
  assert.equal(state.updates, 1);
});

test('Regression #2: concurrent updates when system_config is initially empty both succeed without P2002', async () => {
  const { client, state } = createMockPrisma(null);

  // Both requests start when table is empty
  const [resA, resB] = await Promise.all([
    SystemConfigService.updatePolicy(1, { maxBookingDurationMinutes: 150 }, client),
    SystemConfigService.updatePolicy(1, { maxAdvanceBookingDays: 10 }, client),
  ]);

  assert.equal(resA.configId, 1);
  assert.equal(resB.configId, 1);
  assert.equal(state.creates, 1, 'only one singleton row is created');
  assert.equal(state.updates, 1, 'the second concurrent request updates the created row');
  assert.equal(state.config.maxBookingDurationMinutes, 150);
  assert.equal(state.config.maxAdvanceBookingDays, 10);
});

test('Regression #2b: P2002 fallback during empty-table race recovers and updates without 500', async () => {
  const { client, state } = createMockPrisma(null);

  // Simulate non-blocking read race where both transactions saw findFirst = null
  // before the first transaction committed configId = 1
  let firstFind = true;
  const racingClient: any = {
    ...client,
    $transaction: async (cb: any) => cb(racingClient),
    systemConfig: {
      ...client.systemConfig,
      findFirst: async () => {
        if (firstFind) {
          firstFind = false;
          // Another transaction inserts configId: 1 right after our initial read returns null
          state.config = { ...DEFAULT_SYSTEM_CONFIG, maxBookingDurationMinutes: 180 };
          return null;
        }
        return state.config;
      },
    },
  };

  const result = await SystemConfigService.updatePolicy(
    1,
    { maxAdvanceBookingDays: 14 },
    racingClient
  );

  assert.equal(result.maxBookingDurationMinutes, 180);
  assert.equal(result.maxAdvanceBookingDays, 14);
  assert.equal(state.updates, 1);
});

test('Regression #3: rejects unknown-only and mixed unknown fields with 400 without writing', async () => {
  const { client, state } = createMockPrisma();

  const unknownPayloads = [
    { maxBookingDuration: 60 }, // typo field name only
    { unknownField: 123 },
    { maxBookingDurationMinutes: undefined, foo: 'bar' },
    { maxBookingDurationMinutes: 120, extraUnsupportedField: true },
  ];

  for (const payload of unknownPayloads) {
    await assert.rejects(
      () => SystemConfigService.updatePolicy(1, payload as any, client),
      (err: any) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'INVALID_BOOKING_POLICY');
        return true;
      }
    );
  }

  assert.equal(state.updates, 0);
  assert.equal(state.creates, 0);
});

test('Controller returns 400 for unknown-only payload instead of 200 success', async () => {
  let statusCode = 200;
  let body: any = null;
  const req: any = {
    user: { adminId: 1, role: 'ADMIN' },
    body: { maxBookingDuration: 60 },
  };
  const res: any = {
    setHeader: () => {},
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: any) {
      body = payload;
      return this;
    },
  };

  const { client, state } = createMockPrisma();
  const originalUpdate = SystemConfigService.updatePolicy;
  SystemConfigService.updatePolicy = (adminId, input) =>
    originalUpdate.call(SystemConfigService, adminId, input, client);

  try {
    await SystemConfigController.updateBookingPolicy(req, res);
    assert.equal(statusCode, 400);
    assert.equal(body.success, false);
    assert.equal(body.code, 'INVALID_BOOKING_POLICY');
    assert.equal(state.updates, 0);
  } finally {
    SystemConfigService.updatePolicy = originalUpdate;
  }
});

test('rejects out-of-range, non-integer, and cross-field invalid limits without writing', async () => {
  const { client, state } = createMockPrisma();

  const invalidPayloads = [
    {}, // empty body
    { maxBookingDurationMinutes: 10 }, // < 15
    { maxBookingDurationMinutes: 1500 }, // > 1440
    { maxBookingDurationMinutes: 60.5 }, // float
    { maxAdvanceBookingDays: 0 }, // < 1
    { maxAdvanceBookingDays: 400 }, // > 365
    { minScoreToBook: -1 }, // < 0
    { minScoreToBook: 101 }, // > 100
    { earlyCheckInMinutes: 0 },
    { lateThresholdMinutes: 120, maxBookingDurationMinutes: 120 }, // lateThreshold >= duration
    { paymentCheckoutExpiryMinutes: 15 }, // < 30 (Stripe minimum)
  ];

  for (const payload of invalidPayloads) {
    await assert.rejects(
      () => SystemConfigService.updatePolicy(1, payload, client),
      (err: any) => err.status === 400 && err.code === 'INVALID_BOOKING_POLICY'
    );
  }

  assert.equal(state.updates, 0);
  assert.equal(state.creates, 0);
});
