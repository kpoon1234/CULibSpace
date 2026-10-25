import { API_URL, getAuthToken } from './auth';

export interface TicketPurchaseData {
  ticketId: number;
  paymentId: number;
  checkoutUrl: string | null;
  amountSatang: number;
  currency: string;
  paymentStatus: string;
  ticketStatus: string;
  expiresAt: string;
  ticketStartDateTime: string;
  ticketEndDateTime: string;
  replayed: boolean;
}

export type TicketPurchaseResult =
  | { ok: true; data: TicketPurchaseData }
  | {
      ok: false;
      status: number;
      code?: string;
      message: string;
      retryable: boolean;
    };

interface TicketPurchaseResponse {
  success?: boolean;
  data?: TicketPurchaseData;
  code?: string;
  error?: string;
  retryable?: boolean;
}

/** Starts or recovers an outsider ticket purchase. Keep the same key on retry. */
export async function purchaseVisitorTicket(idempotencyKey: string): Promise<TicketPurchaseResult> {
  const token = getAuthToken();
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Log in with your visitor account to purchase a ticket.',
      retryable: false,
    };
  }

  try {
    const response = await fetch(`${API_URL}/api/tickets/purchase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ idempotencyKey }),
      signal: AbortSignal.timeout(20_000),
    });

    const body = (await response.json().catch(() => null)) as TicketPurchaseResponse | null;
    if (response.ok && body?.success && body.data) {
      return { ok: true, data: body.data };
    }

    return {
      ok: false,
      status: response.status,
      code: body?.code,
      message: body?.error ?? `Unable to start ticket checkout (HTTP ${response.status}).`,
      retryable: body?.retryable === true,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Unable to connect to the ticket service. Please try again.',
      retryable: true,
    };
  }
}
