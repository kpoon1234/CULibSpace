import { API_URL, getAuthToken } from './auth';

export interface ValidateBookingInput {
  tableId: number;
  startDateTime: string; // ISO
  endDateTime: string; // ISO
}

export interface ValidateBookingResult {
  ok: boolean;
  reason?: string;
}

/** POST /api/bookings/validate — checks the reservation against real DB rules
 *  (schedule, behaviour score, overlap, table status, outside-visitor ticket). */
export async function validateBooking(input: ValidateBookingInput): Promise<ValidateBookingResult> {
  const token = getAuthToken();
  const res = await fetch(`${API_URL}/api/bookings/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });

  const body = await res.json().catch(() => null);
  if (res.ok && body?.success) return { ok: true };
  return { ok: false, reason: body?.error || `Request failed (${res.status})` };
}

/** POST /api/bookings — runs the same rules as validateBooking, then persists
 *  the Booking row (status PENDING) once they all pass. */
export async function createBooking(input: ValidateBookingInput): Promise<ValidateBookingResult> {
  const token = getAuthToken();
  const res = await fetch(`${API_URL}/api/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });

  const body = await res.json().catch(() => null);
  if (res.ok && body?.success) return { ok: true };
  return { ok: false, reason: body?.error || `Request failed (${res.status})` };
}
