import type { Prisma } from '@prisma/client';

// Shared with the settings-writing task: update/upsert this row, not a new row.
export const BOOKING_POLICY_CONFIG_ID = 1;
export const BOOKING_POLICY_FIELDS = [
  'maxBookingDurationMinutes',
  'maxAdvanceBookingDays',
  'minScoreToBook',
  'earlyCheckInMinutes',
  'lateThresholdMinutes',
] as const;
export type BookingPolicyField = (typeof BOOKING_POLICY_FIELDS)[number];
export type BookingPolicy = Record<BookingPolicyField, number>;
export type PolicyClient = {
  systemConfig: Pick<Prisma.TransactionClient['systemConfig'], 'findFirst'>;
};

export function bookingRulesError(code: string, message: string, status = 503) {
  return { status, code, message };
}

/** Read the canonical saved settings; neither a DB failure nor bad data grants access. */
export async function readBookingPolicy<K extends BookingPolicyField>(
  client: PolicyClient,
  fields: readonly K[]
): Promise<Pick<BookingPolicy, K>> {
  let config;
  try {
    config = await client.systemConfig.findFirst({
      where: { configId: BOOKING_POLICY_CONFIG_ID },
      select: Object.fromEntries(fields.map((field) => [field, true])),
    });
  } catch {
    throw bookingRulesError(
      'BOOKING_SETTINGS_UNAVAILABLE',
      'Booking settings are temporarily unavailable.'
    );
  }
  if (!config) {
    throw bookingRulesError(
      'BOOKING_POLICY_NOT_CONFIGURED',
      'Booking policy has not been configured.'
    );
  }

  const result: Partial<BookingPolicy> = {};
  for (const field of fields) {
    const value = config[field];
    const minimum = field === 'maxBookingDurationMinutes' ? 1 : 0;
    const unit =
      field === 'minScoreToBook' ? 1 : field === 'maxAdvanceBookingDays' ? 86_400_000 : 60_000;
    if (
      !Number.isSafeInteger(value) ||
      value < minimum ||
      (field === 'minScoreToBook' && value > 100) ||
      !Number.isSafeInteger(value * unit)
    ) {
      throw bookingRulesError('BOOKING_POLICY_INVALID', 'The saved booking policy is invalid.');
    }
    result[field] = value;
  }
  return result as Pick<BookingPolicy, K>;
}
