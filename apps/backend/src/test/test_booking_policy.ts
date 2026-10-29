import assert from 'node:assert/strict';
import test from 'node:test';
import { BOOKING_POLICY_FIELDS, readBookingPolicy } from '../services/bookingPolicyService.js';

const saved = {
  maxBookingDurationMinutes: 90,
  maxAdvanceBookingDays: 3,
  minScoreToBook: 70,
  earlyCheckInMinutes: 10,
  lateThresholdMinutes: 7,
};
function client(config: unknown = saved) {
  const calls: any[] = [];
  return {
    calls,
    prisma: {
      systemConfig: {
        findFirst: async (args: any) => {
          calls.push(args);
          return config;
        },
      },
    } as any,
  };
}

test('reads the canonical saved policy without defaults or unrelated settings', async () => {
  const f = client();
  assert.deepEqual(await readBookingPolicy(f.prisma, BOOKING_POLICY_FIELDS), saved);
  assert.deepEqual(f.calls, [
    {
      where: { configId: 1 },
      select: {
        maxBookingDurationMinutes: true,
        maxAdvanceBookingDays: true,
        minScoreToBook: true,
        earlyCheckInMinutes: true,
        lateThresholdMinutes: true,
      },
    },
  ]);
});

test('a consumer requests only the policy fields it actually enforces', async () => {
  const f = client({ lateThresholdMinutes: 7 });
  assert.deepEqual(await readBookingPolicy(f.prisma, ['lateThresholdMinutes']), {
    lateThresholdMinutes: 7,
  });
  assert.deepEqual(f.calls[0].select, { lateThresholdMinutes: true });
});

test('zero advance/early/late limits and score boundaries are supported', async () => {
  for (const minScoreToBook of [0, 100]) {
    const f = client({
      ...saved,
      maxAdvanceBookingDays: 0,
      earlyCheckInMinutes: 0,
      lateThresholdMinutes: 0,
      minScoreToBook,
    });
    const result = await readBookingPolicy(f.prisma, BOOKING_POLICY_FIELDS);
    assert.equal(result.minScoreToBook, minScoreToBook);
    assert.equal(result.lateThresholdMinutes, 0);
  }
});

test('missing policy fails closed rather than inventing a default', async () => {
  await assert.rejects(() => readBookingPolicy(client(null).prisma, BOOKING_POLICY_FIELDS), {
    status: 503,
    code: 'BOOKING_POLICY_NOT_CONFIGURED',
  });
});

test('a failed DB read returns a safe 503 without exposing the driver error', async () => {
  const prisma: any = {
    systemConfig: {
      findFirst: async () => {
        throw new Error('private database credentials');
      },
    },
  };
  await assert.rejects(
    () => readBookingPolicy(prisma, BOOKING_POLICY_FIELDS),
    (error) => {
      const result = error as { status: number; code: string; message: string };
      assert.equal(result.status, 503);
      assert.equal(result.code, 'BOOKING_SETTINGS_UNAVAILABLE');
      assert.doesNotMatch(result.message, /private|credentials/);
      return true;
    }
  );
});

for (const [field, value] of [
  ['maxBookingDurationMinutes', 0],
  ['maxBookingDurationMinutes', 1.5],
  ['maxAdvanceBookingDays', -1],
  ['maxAdvanceBookingDays', 2_147_483_647],
  ['minScoreToBook', -1],
  ['minScoreToBook', 101],
  ['minScoreToBook', '50'],
  ['earlyCheckInMinutes', null],
  ['lateThresholdMinutes', undefined],
] as const) {
  test(`rejects invalid saved ${field}=${String(value)}`, async () => {
    await assert.rejects(
      () => readBookingPolicy(client({ ...saved, [field]: value }).prisma, BOOKING_POLICY_FIELDS),
      {
        status: 503,
        code: 'BOOKING_POLICY_INVALID',
      }
    );
  });
}
