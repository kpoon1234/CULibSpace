import { API_URL, getAuthToken } from './auth';

export const PAYMENT_STATUSES = [
  'PENDING',
  'UNCONFIRMED',
  'PAID',
  'FAILED',
  'EXPIRED',
  'REFUNDED',
] as const;
export const TICKET_STATUSES = ['PAID', 'UNPAID'] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface TicketPurchaseData {
  ticketId: number;
  paymentId: number;
  checkoutUrl: string | null;
  amountSatang: number;
  currency: string;
  paymentStatus: PaymentStatus;
  ticketStatus: TicketStatus;
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
  data?: unknown;
  code?: string;
  error?: string;
  retryable?: boolean;
}

/** Must match the backend's idempotency key rule in ticketController.ts. */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/;

export function isValidIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && IDEMPOTENCY_KEY_PATTERN.test(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Only a well-formed https URL may be used as the external checkout target. */
export function isSafeCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Checks the purchase response before the UI trusts it. Statuses are normalized to
 * upper case. Returns null when any field the page relies on is missing or malformed.
 */
export function parseTicketPurchaseData(raw: unknown): TicketPurchaseData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;

  if (!isPositiveInteger(data.ticketId) || !isPositiveInteger(data.paymentId)) return null;
  // Only the configured price must be positive; a replayed historical payment may be 0.
  if (!isNonNegativeInteger(data.amountSatang)) return null;
  if (typeof data.currency !== 'string' || !CURRENCY_PATTERN.test(data.currency)) return null;

  if (typeof data.paymentStatus !== 'string' || typeof data.ticketStatus !== 'string') {
    return null;
  }
  const paymentStatus = data.paymentStatus.toUpperCase() as PaymentStatus;
  const ticketStatus = data.ticketStatus.toUpperCase() as TicketStatus;
  if (!PAYMENT_STATUSES.includes(paymentStatus) || !TICKET_STATUSES.includes(ticketStatus)) {
    return null;
  }

  // A checkout URL is optional (e.g. already paid). Its scheme is checked only right
  // before opening checkout, so an unused URL cannot reject an already-paid response.
  if (
    data.checkoutUrl !== null &&
    data.checkoutUrl !== undefined &&
    typeof data.checkoutUrl !== 'string'
  ) {
    return null;
  }

  const dates = [data.expiresAt, data.ticketStartDateTime, data.ticketEndDateTime];
  if (!dates.every((value) => typeof value === 'string')) return null;

  return {
    ticketId: data.ticketId,
    paymentId: data.paymentId,
    checkoutUrl: (data.checkoutUrl as string | null | undefined) ?? null,
    amountSatang: data.amountSatang,
    currency: data.currency.toUpperCase(),
    paymentStatus,
    ticketStatus,
    expiresAt: data.expiresAt as string,
    ticketStartDateTime: data.ticketStartDateTime as string,
    ticketEndDateTime: data.ticketEndDateTime as string,
    replayed: data.replayed === true,
  };
}

/** Formats satang (1/100 of the currency unit) for display, e.g. 5000 THB -> "฿50.00". */
export function formatTicketAmount(amountSatang: number, currency: string): string {
  try {
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency }).format(
      amountSatang / 100
    );
  } catch {
    return `${(amountSatang / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * What the visitor can do after a failed purchase:
 * - retry: try again with the same purchase key (the backend recovers the same payment)
 * - restart: the previous attempt is final; the next attempt needs a new purchase key
 * - login / onboarding: fix the account first
 * - none: a final error the visitor cannot fix by trying again (e.g. ticket sales not set up)
 */
export type PurchaseErrorAction = 'retry' | 'restart' | 'login' | 'onboarding' | 'none';

export interface PurchaseErrorView {
  message: string;
  action: PurchaseErrorAction;
}

const PURCHASE_ERRORS: Record<string, PurchaseErrorView> = {
  UNAUTHORIZED: {
    message: 'Your session has ended. Please log in with your visitor account again.',
    action: 'login',
  },
  PROFILE_INCOMPLETE: {
    message: 'Please complete your visitor profile before purchasing a ticket.',
    action: 'onboarding',
  },
  OUTSIDE_PROFILE_INCOMPLETE: {
    message: 'Please complete your visitor profile before purchasing a ticket.',
    action: 'onboarding',
  },
  NOT_AN_OUTSIDE_USER: {
    message: 'Visitor tickets can only be purchased with an outside visitor account.',
    action: 'none',
  },
  USER_NOT_FOUND: {
    message: 'We could not find your visitor account. Please log in again.',
    action: 'login',
  },
  INVALID_IDEMPOTENCY_KEY: {
    message: 'Your purchase request could not be prepared. Please try again.',
    action: 'restart',
  },
  CONFIG_UNAVAILABLE: {
    message: 'Ticket sales are not available right now. Please contact the library.',
    action: 'none',
  },
  CHECKOUT_URL_UNSAFE: {
    message: 'Secure checkout could not be opened. Please contact the library.',
    action: 'none',
  },
  INVALID_TICKET_PRICE: {
    message: 'Ticket sales are not available right now. Please contact the library.',
    action: 'none',
  },
  INVALID_TICKET_VALIDITY: {
    message: 'Ticket sales are not available right now. Please contact the library.',
    action: 'none',
  },
  INVALID_CHECKOUT_EXPIRY: {
    message: 'Ticket sales are not available right now. Please contact the library.',
    action: 'none',
  },
  GATEWAY_NOT_CONFIGURED: {
    message: 'Online payment is not available right now. Please contact the library.',
    action: 'none',
  },
  GATEWAY_REJECTED: {
    message: 'The payment provider could not start checkout. You can start a new purchase.',
    action: 'restart',
  },
  PAYMENT_NOT_COMPLETED: {
    message: 'Your previous payment was not completed. You can start a new purchase.',
    action: 'restart',
  },
  GATEWAY_TIMEOUT: {
    message:
      'The payment provider took too long to respond. Try again — you will not be charged twice.',
    action: 'retry',
  },
  GATEWAY_UNAVAILABLE: {
    message:
      'The payment provider is temporarily unavailable. Try again — you will not be charged twice.',
    action: 'retry',
  },
  NETWORK_ERROR: {
    message:
      'Unable to connect to the ticket service. Check your connection and try again — you will not be charged twice.',
    action: 'retry',
  },
  INVALID_RESPONSE: {
    message:
      'The ticket service returned an unexpected response, so checkout was not opened. Please try again.',
    action: 'retry',
  },
};

const GENERIC_RETRY_MESSAGE = 'Something went wrong while starting checkout. Please try again.';

/** Messages for codes that are final by default but temporary when the backend says so. */
const RETRYABLE_MESSAGES: Record<string, string> = {
  CONFIG_UNAVAILABLE:
    'Ticket sales are temporarily unavailable. Please try again in a moment — you have not been charged.',
};

/** Turns a failed purchase into a visitor-facing message and next step. */
export function describePurchaseError(
  result: Extract<TicketPurchaseResult, { ok: false }>
): PurchaseErrorView {
  if (result.status === 401) return PURCHASE_ERRORS.UNAUTHORIZED;

  const known = result.code ? PURCHASE_ERRORS[result.code] : undefined;

  // A restart already lets the visitor try again, with the new purchase key it needs.
  if (known?.action === 'restart') return known;

  // The backend knows whether this particular failure is temporary (e.g. a database
  // blip behind CONFIG_UNAVAILABLE), so its retryable flag wins over the code mapping.
  if (result.retryable) {
    return known?.action === 'retry'
      ? known
      : {
          message: RETRYABLE_MESSAGES[result.code ?? ''] ?? GENERIC_RETRY_MESSAGE,
          action: 'retry',
        };
  }

  if (known) return known;

  if (result.status >= 500 || result.status === 0) {
    return { message: GENERIC_RETRY_MESSAGE, action: 'retry' };
  }

  // An unmapped 4xx (429, 403, 409, …) is not known to be final, so keep a way forward.
  return {
    message: 'We could not start your ticket purchase. Please try again in a moment.',
    action: 'retry',
  };
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

  // Reject locally what the backend would reject with 400, without a round trip.
  if (!isValidIdempotencyKey(idempotencyKey)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_IDEMPOTENCY_KEY',
      message: 'Invalid purchase key.',
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
    if (response.ok && body?.success) {
      const data = parseTicketPurchaseData(body.data);
      if (data) return { ok: true, data };

      return {
        ok: false,
        status: response.status,
        code: 'INVALID_RESPONSE',
        message: 'The ticket service returned an unexpected response.',
        retryable: true,
      };
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
