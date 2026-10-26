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

export type TicketPaymentStatus =
  'PENDING' | 'UNCONFIRMED' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REFUNDED';

export interface TicketPayment {
  paymentId: number;
  amountSatang: number;
  amountBaht: number;
  currency: string;
  status: TicketPaymentStatus;
  gateway: string;
  ticketValidityHours: number;
  paidAt: string | null;
  createdAt: string;
}

/** A ticket as returned by GET /api/tickets/my-tickets (US6-2). `status` is
 *  already EXPIRED once a paid ticket's window has passed. */
export interface VisitorTicket {
  ticketId: number;
  uid: number;
  status: 'PAID' | 'UNPAID' | 'EXPIRED';
  startDateTime: string;
  endDateTime: string;
  createdAt: string;
  validTimePeriod: {
    startDateTime: string;
    endDateTime: string;
    isValidNow: boolean;
    isExpired: boolean;
    remainingSeconds: number;
  };
  /** Newest first. */
  payments: TicketPayment[];
}

export class TicketRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/** Lists the signed-in visitor's tickets with their payment history, newest first. */
export async function fetchMyTickets(): Promise<VisitorTicket[]> {
  const token = getAuthToken();
  if (!token) throw new TicketRequestError('Log in with your visitor account.', 401);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/tickets/my-tickets`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new TicketRequestError('Unable to connect to the ticket service.', 0);
  }

  const body = (await response.json().catch(() => null)) as {
    success?: boolean;
    data?: VisitorTicket[];
    error?: string;
  } | null;

  if (response.ok && body?.success && Array.isArray(body.data)) return body.data;

  throw new TicketRequestError(
    body?.error ?? `Unable to load your tickets (HTTP ${response.status}).`,
    response.status
  );
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
