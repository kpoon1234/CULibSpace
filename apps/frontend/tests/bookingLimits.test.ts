import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_BOOKING_LIMITS, lastBookableDate } from '../lib/systemConfig';

const now = Date.parse('2026-11-03T10:00:00.000Z');

test('the booking date picker reaches exactly as far as the saved policy allows', () => {
  assert.equal(lastBookableDate(now, 14).toISOString(), '2026-11-17T10:00:00.000Z');
  assert.equal(lastBookableDate(now, 2).toISOString(), '2026-11-05T10:00:00.000Z');
  assert.equal(lastBookableDate(now, 1).toISOString(), '2026-11-04T10:00:00.000Z');
});

test('before the policy loads it uses the same default as the backend', () => {
  assert.equal(DEFAULT_BOOKING_LIMITS.maxAdvanceBookingDays, 7);
  assert.equal(
    lastBookableDate(now, DEFAULT_BOOKING_LIMITS.maxAdvanceBookingDays).toISOString(),
    '2026-11-10T10:00:00.000Z'
  );
});
