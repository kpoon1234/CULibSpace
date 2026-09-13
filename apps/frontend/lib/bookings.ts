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

export interface CreateBookingInput extends ValidateBookingInput {
  /** Hold-lock token from lockTable(); the backend rejects creation without one. */
  lockToken: string;
}

/** POST /api/bookings — runs the same rules as validateBooking, then persists
 *  the Booking row (status PENDING) once they all pass. Requires a lockToken
 *  from lockTable() acquired for this table. */
export async function createBooking(input: CreateBookingInput): Promise<ValidateBookingResult> {
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
export async function lockTable(input: LockTableInput): Promise<LockTableResult> {
  const token = getAuthToken();
  const res = await fetch(`${API_URL}/api/bookings/lock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
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
export async function unlockTable(input: UnlockTableInput): Promise<void> {
  const token = getAuthToken();
  try {
    await fetch(`${API_URL}/api/bookings/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
    });
  } catch {
    // best-effort
  }
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
export async function checkInBooking(bookingId: number): Promise<{ ok: boolean; reason?: string }> {
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
    return { ok: false, reason: body?.error || `Check-in failed (${res.status})` };
  } catch {
    return { ok: false, reason: 'Unable to connect to server' };
  }
}
