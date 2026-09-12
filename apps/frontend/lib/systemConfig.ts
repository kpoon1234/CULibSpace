'use client';

import useSWR from 'swr';
import { API_URL } from '@/lib/auth';

// GET /api/system-config/booking-limits — the subset of the backend's
// SystemConfig row the frontend needs to mirror server-side booking-window
// rules (Table Filter dialog) instead of hardcoding values that can drift out
// of sync with the DB.

export interface BookingLimits {
  /** Longest a startDateTime→endDateTime window can be. Mirrors
   *  SystemConfig.maxBookingDurationMinutes. */
  maxBookingWindowMinutes: number;
  /** Furthest a booking date can be in the future. Mirrors
   *  SystemConfig.maxAdvanceBookingDays. */
  maxAdvanceBookingDays: number;
}

/** Used until the real config loads, and if the endpoint is ever unreachable —
 *  matches ScheduleService's own fallback defaults on the backend. */
export const DEFAULT_BOOKING_LIMITS: BookingLimits = {
  maxBookingWindowMinutes: 120,
  maxAdvanceBookingDays: 7,
};

interface BookingLimitsEnvelope {
  success: boolean;
  data?: { maxBookingDurationMinutes: number; maxAdvanceBookingDays: number };
}

async function fetchBookingLimits(signal?: AbortSignal): Promise<BookingLimits> {
  const res = await fetch(`${API_URL}/api/system-config/booking-limits`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`booking-limits ${res.status}`);

  const body = (await res.json()) as BookingLimitsEnvelope;
  if (!body.success || !body.data) throw new Error('booking-limits: unsuccessful response');

  return {
    maxBookingWindowMinutes: body.data.maxBookingDurationMinutes,
    maxAdvanceBookingDays: body.data.maxAdvanceBookingDays,
  };
}

/**
 * The booking-window limits from the backend's SystemConfig, with
 * DEFAULT_BOOKING_LIMITS as `fallbackData` so callers never have to branch on
 * a loading state — a slow/unreachable config endpoint just means the dialog
 * briefly uses the same defaults the backend itself falls back to.
 */
export function useBookingLimits(): BookingLimits {
  const { data } = useSWR('booking-limits', () => fetchBookingLimits());
  return data ?? DEFAULT_BOOKING_LIMITS;
}
