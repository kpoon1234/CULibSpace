// apps/backend/src/test/test_booking_policy_config.ts
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/invalid';
process.env.JWT_SECRET = 'booking-policy-unit-test-secret';

const { SystemConfigService, DEFAULT_SYSTEM_CONFIG } =
  await import('../services/systemConfigService.js');
const { SystemConfigController } = await import('../controllers/systemConfigController.js');

function createMockPrisma(initialConfig: any = { ...DEFAULT_SYSTEM_CONFIG }) {
  const state = {
    config: initialConfig ? { ...initialConfig } : null,
    admin: { adminId: 1 } as { adminId: number } | null,
    locks: 0,
    updates: 0,
    creates: 0,
  };

  const client: any = {
    $queryRaw: async () => {
      state.locks++;
      return [];
    },
    admin: {
      findUnique: async ({ where }: any) =>
        state.admin && state.admin.adminId === where.adminId ? state.admin : null,
    },
    systemConfig: {
      findFirst: async () => state.config,
      update: async ({ data }: any) => {
        state.updates++;
        state.config = { ...state.config, ...data };
        return state.config;
      },
      create: async ({ data }: any) => {
        state.creates++;
        state.config = { ...data };
        return state.config;
      },
    },
    $transaction: async (cb: any) => cb(client),
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
    },
    client
  );

  assert.equal(state.locks, 1, 'must acquire row lock before updating');
  assert.equal(state.updates, 1);
  assert.equal(updated.maxBookingDurationMinutes, 180);
  assert.equal(updated.maxAdvanceBookingDays, 14);
  assert.equal(updated.minScoreToBook, 60);
  assert.equal(updated.earlyCheckInMinutes, 20);
  assert.equal(updated.lateThresholdMinutes, 10);
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

test('creates config row if table is initially empty', async () => {
  const { client, state } = createMockPrisma(null);

  const created = await SystemConfigService.updatePolicy(1, { minScoreToBook: 55 }, client);

  assert.equal(state.creates, 1);
  assert.equal(created.minScoreToBook, 55);
  assert.equal(created.maxBookingDurationMinutes, DEFAULT_SYSTEM_CONFIG.maxBookingDurationMinutes);
});
