import { API_URL, getAuthToken } from './auth';
import { createReservationCoordinator } from './reservationSession';
import type { ReservationState } from './reservationSession';

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

export interface CreateBookingInput extends ValidateBookingInput {
  /** Hold-lock token from lockTable(); the backend rejects creation without one. */
  lockToken: string;
}

export interface CreateBookingResult extends ValidateBookingResult {
  code?: string;
  /** A timeout/network failure is not evidence that the transaction rolled back. */
  uncertain?: boolean;
}

/** POST /api/bookings — runs the same rules as validateBooking, then persists
 *  the Booking row (status PENDING) once they all pass. Requires a lockToken
 *  from lockTable() acquired for this table. */
export async function createBooking(
  input: CreateBookingInput,
  token = getAuthToken()
): Promise<CreateBookingResult> {
  try {
    const res = await fetch(`${API_URL}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(20_000),
    });

    const body = await res.json().catch(() => null);
    if (res.ok && body?.success === true) return { ok: true };
    return {
      ok: false,
      reason: body?.error || `Request failed (${res.status})`,
      code: typeof body?.code === 'string' ? body.code : undefined,
      // A gateway/proxy error or a backend validation timeout can arrive while
      // the underlying operation is still running. Only explicit 4xx rejection
      // responses (other than timeouts) are safe to treat as definitive.
      uncertain: res.status >= 500 || res.status === 408 || body?.success !== false,
    };
  } catch {
    return { ok: false, uncertain: true, reason: 'Unable to confirm the reservation result.' };
  }
}

export interface LockTableInput {
  tableId: number;
  startDateTime?: string;
  endDateTime?: string;
}

export interface LockTableResult {
  ok: boolean;
  lockToken?: string;
  lockedUntil?: string;
  reason?: string;
}

/** POST /api/bookings/lock — acquires a 5-minute hold on a table so the
 *  reservation modal can be filled out without another user grabbing it. */
export async function lockTable(
  input: LockTableInput,
  token = getAuthToken()
): Promise<LockTableResult> {
  const res = await fetch(`${API_URL}/api/bookings/lock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(15_000),
  });

  const body = await res.json().catch(() => null);
  if (res.ok && body?.success) {
    return { ok: true, lockToken: body.data?.lockToken, lockedUntil: body.data?.lockedUntil };
  }
  return { ok: false, reason: body?.error || `Request failed (${res.status})` };
}

export interface UnlockTableInput {
  tableId: number;
  lockToken: string;
}

/** POST /api/bookings/unlock — releases a hold early (modal closed/cancelled
 *  before submitting). Best-effort: failures are ignored since the lock
 *  expires on its own after 5 minutes regardless. */
export async function unlockTable(input: UnlockTableInput, token = getAuthToken()): Promise<void> {
  try {
    await fetch(`${API_URL}/api/bookings/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
      keepalive: true,
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // best-effort
  }
}

/** Read-only reconciliation. my-active may return a different booking (or
 * nothing), so only an exact match is confirmation; false is inconclusive. */
export async function confirmBooking(
  input: ValidateBookingInput,
  token = getAuthToken()
): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/bookings/my-active`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return false;
    const body = await res.json();
    const booking = body?.data;
    return (
      body?.success === true &&
      booking?.tableId === input.tableId &&
      ['PENDING', 'ACTIVE'].includes(booking?.status) &&
      Date.parse(booking.startDateTime) === Date.parse(input.startDateTime) &&
      Date.parse(booking.endDateTime) === Date.parse(input.endDateTime)
    );
  } catch {
    return false;
  }
}

// Bind credentials when the modal opens. A queued request from a previous
// login must never execute using the next user's token.
let reservationOwner: string | null | undefined;
let reservationCoordinator: ReturnType<typeof createReservationCoordinator> | undefined;

export function openReservationSession(
  tableId: number,
  onChange: (state: ReservationState) => void
) {
  const token = getAuthToken();
  if (!reservationCoordinator || reservationOwner !== token) {
    reservationOwner = token;
    reservationCoordinator = createReservationCoordinator({
      lock: (id) => lockTable({ tableId: id }, token),
      unlock: (id, lockToken) => unlockTable({ tableId: id, lockToken }, token),
      create: (input) => createBooking(input, token),
      confirm: (input) => confirmBooking(input, token),
    });
  }
  return reservationCoordinator.open(tableId, onChange);
}

export interface ActiveBookingData {
  bookingId: number;
  uid: number;
  tableId: number;
  startDateTime: string;
  endDateTime: string;
  arriveTime: string | null;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  createdAt: string;
  /** Check-in limits from SystemConfig, supplied by GET /api/bookings/my-active. */
  checkInWindow?: { earlyMinutes: number; lateMinutes: number };
  table: {
    tableId: number;
    zoneId: number;
    status: string;
    numberOfSeat: number;
    plugCap: number | null;
    hasTvScreen: boolean;
    zone: {
      zoneId: number;
      zoneType: 'SILENT' | 'GROUP' | 'COMMON';
    };
  };
}

/** GET /api/bookings/my-active — retrieves current active/pending reservation for the user. */
export async function fetchActiveBooking(): Promise<ActiveBookingData | null> {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/api/bookings/my-active`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) return null;
    const body = await res.json();
    return (body?.data as ActiveBookingData) ?? null;
  } catch {
    return null;
  }
}

/** POST /api/bookings/:id/check-in — check-in on-site (US4-1). */
export async function checkInBooking(
  bookingId: number
): Promise<{ ok: boolean; reason?: string; code?: string }> {
  const token = getAuthToken();
  try {
    const res = await fetch(`${API_URL}/api/bookings/${bookingId}/check-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    const body = await res.json().catch(() => null);
    if (res.ok && body?.success) return { ok: true };
    return {
      ok: false,
      reason: body?.error || `Check-in failed (${res.status})`,
      // e.g. CHECK_IN_TOO_LATE — lets the card react to the server's verdict.
      code: typeof body?.code === 'string' ? body.code : undefined,
    };
  } catch {
    return { ok: false, reason: 'Unable to connect to server' };
  }
}
