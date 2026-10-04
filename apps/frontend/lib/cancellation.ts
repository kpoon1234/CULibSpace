import { API_URL, getAuthToken } from './auth';
import type { ActiveBookingData } from './bookings';

export type BookingStatus = ActiveBookingData['status'];
export type CancellableBooking = ActiveBookingData & {
  // Optional metadata supplied by the backend; never invent a cutoff in the UI.
  cancellation?: { allowed: boolean; deadline?: string; reason?: string };
};

export type CancelResult =
  | { ok: true }
  | {
      ok: false;
      kind:
        'deadline' | 'checked-in' | 'terminal' | 'auth' | 'unavailable' | 'retryable' | 'unknown';
      message: string;
    };

export type StatusResult = { ok: true; status: BookingStatus } | { ok: false; message: string };

export interface CancellationClient {
  cancel: (bookingId: number) => Promise<CancelResult>;
  getStatus: (bookingId: number) => Promise<StatusResult>;
}

type Envelope = {
  success?: boolean;
  code?: string;
  error?: string;
  data?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readStatus(value: unknown, bookingId: number): BookingStatus | undefined {
  if (!isRecord(value) || value.bookingId !== bookingId) return undefined;
  const status = value.status;
  if (
    status === 'PENDING' ||
    status === 'ACTIVE' ||
    status === 'CANCELLED' ||
    status === 'COMPLETED' ||
    status === 'NO_SHOW'
  )
    return status;
  return undefined;
}

async function readEnvelope(response: Response): Promise<Envelope | null> {
  const body: unknown = await response.json().catch(() => null);
  return isRecord(body) ? (body as Envelope) : null;
}

export async function cancelReservation(bookingId: number): Promise<CancelResult> {
  const token = getAuthToken();
  if (!token) return { ok: false, kind: 'auth', message: 'Please sign in again to continue.' };

  try {
    const response = await fetch(`${API_URL}/api/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await readEnvelope(response);
    // Cancellation API must only report success after committing the change.
    if (response.ok && body?.success === true) return { ok: true };

    switch (body?.code) {
      case 'CANCELLATION_DEADLINE_PASSED':
        return {
          ok: false,
          kind: 'deadline',
          message:
            'The cancellation deadline has passed. This reservation can no longer be cancelled.',
        };
      case 'BOOKING_ALREADY_CHECKED_IN':
        return {
          ok: false,
          kind: 'checked-in',
          message: 'You’ve already checked in. This reservation can no longer be cancelled.',
        };
      case 'BOOKING_NOT_PENDING':
        return {
          ok: false,
          kind: 'terminal',
          message: 'This reservation is no longer pending and cannot be cancelled.',
        };
      case 'CANCELLATION_FAILED':
        // Backend must guarantee that this code means no cancellation was committed.
        return {
          ok: false,
          kind: 'retryable',
          message: 'We couldn’t cancel your reservation. Please try again.',
        };
    }
    if (response.status === 401)
      return {
        ok: false,
        kind: 'auth',
        message: 'Your session has expired. Please sign in again.',
      };
    if (response.status === 403)
      return {
        ok: false,
        kind: 'terminal',
        message: 'You do not have permission to cancel this reservation.',
      };
    if (response.status === 404)
      return {
        ok: false,
        kind: 'unavailable',
        message:
          'The reservation or cancellation service is unavailable. Please return home and refresh.',
      };
    if (response.status === 409)
      return {
        ok: false,
        kind: 'terminal',
        message:
          body?.error ||
          'This reservation has changed. Please return home to view its latest status.',
      };
    return {
      ok: false,
      kind: 'unknown',
      message:
        'We couldn’t confirm whether your reservation was cancelled. Please refresh to check its status.',
    };
  } catch {
    // A timeout can happen after the server commits. Never assert that it failed.
    return {
      ok: false,
      kind: 'unknown',
      message:
        'We couldn’t confirm whether your reservation was cancelled. Please refresh to check its status.',
    };
  }
}

export async function getCancellationStatus(bookingId: number): Promise<StatusResult> {
  const token = getAuthToken();
  if (!token) return { ok: false, message: 'Please sign in again to check your reservation.' };
  try {
    // Use existing APIs. Absence from my-active alone does NOT prove cancellation.
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    const historyResponse = await fetch(`${API_URL}/api/bookings/my-history`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const history = await readEnvelope(historyResponse);
    if (!historyResponse.ok || history?.success !== true || !Array.isArray(history.data)) {
      return {
        ok: false,
        message: 'Unable to check the latest reservation status. Please try refreshing again.',
      };
    }
    for (const entry of history.data) {
      const status = readStatus(entry, bookingId);
      if (status) return { ok: true, status };
    }
    const activeResponse = await fetch(`${API_URL}/api/bookings/my-active`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const active = await readEnvelope(activeResponse);
    const status = readStatus(active?.data, bookingId);
    if (activeResponse.ok && active?.success === true && status) return { ok: true, status };
    return {
      ok: false,
      message: 'This booking’s status could not be confirmed. Please return home and refresh.',
    };
  } catch {
    return {
      ok: false,
      message:
        'Unable to check the latest reservation status. Please check your connection and try again.',
    };
  }
}

export const cancellationClient: CancellationClient = {
  cancel: cancelReservation,
  getStatus: getCancellationStatus,
};
