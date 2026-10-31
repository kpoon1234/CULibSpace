import type { TicketPayment, VisitorTicket } from '@/lib/tickets';

/**
 * What a visitor needs to know about a ticket, derived from the server's
 * fields. The server already folds "paid but past its window" into EXPIRED;
 * the rest separates the cases it leaves as UNPAID by their latest payment.
 */
export type TicketPhase = 'active' | 'upcoming' | 'awaiting' | 'unpaid' | 'expired' | 'refunded';

export function getTicketPhase(ticket: VisitorTicket, now = Date.now()): TicketPhase {
  if (ticket.status === 'EXPIRED') return 'expired';

  if (ticket.status === 'PAID') {
    const endMs = Date.parse(ticket.endDateTime);
    if (Number.isFinite(endMs) && now > endMs) return 'expired';
    const startMs = Date.parse(ticket.startDateTime);
    return Number.isFinite(startMs) && now < startMs ? 'upcoming' : 'active';
  }

  const latest = ticket.payments[0];
  if (latest?.status === 'PENDING' || latest?.status === 'UNCONFIRMED') return 'awaiting';
  if (latest?.status === 'REFUNDED') return 'refunded';
  return 'unpaid';
}

/** The ticket worth putting at the top: the one in use, then the next one,
 *  then a purchase still being confirmed. Anything else is history. */
export function pickCurrentTicket(tickets: VisitorTicket[], now = Date.now()) {
  for (const phase of ['active', 'upcoming', 'awaiting'] as const) {
    const match = tickets.find((ticket) => getTicketPhase(ticket, now) === phase);
    if (match) return match;
  }
  return null;
}

/**
 * Where a paid ticket's clock stands against its two boundaries, from the
 * countdowns to its start and end (ms remaining; null before hydration).
 * Both boundaries are tracked even after one has passed, so a timer that
 * wakes late — a throttled background tab, a sleeping laptop — still sees
 * which boundary it skipped instead of losing track of the ticket.
 */
export type BoundaryKey = 'pending' | 'started' | 'ended';

export function getBoundaryKey(
  startDiff: number | null,
  endDiff: number | null
): BoundaryKey | null {
  if (startDiff === null || endDiff === null) return null;
  if (endDiff <= 0) return 'ended';
  return startDiff > 0 ? 'pending' : 'started';
}

/**
 * Whether moving from `prev` to `next` crossed a boundary the server should
 * confirm. Opening on an already-started ticket is normal and needs nothing;
 * reaching (or first observing) `ended` always does, however many boundaries
 * a late tick jumped over.
 */
export function crossedBoundary(prev: BoundaryKey | null, next: BoundaryKey | null): boolean {
  if (next === null || next === prev) return false;
  if (next === 'ended') return true;
  return next === 'started' && prev === 'pending';
}

/** The phase to show for the current ticket, preferring the live clock over
 *  the last fetch so the card never lags behind its own countdown. */
export function getLivePhase(ticket: VisitorTicket, key: BoundaryKey | null): TicketPhase {
  if (ticket.status !== 'PAID' || key === null) return getTicketPhase(ticket);
  if (key === 'ended') return 'expired';
  return key === 'pending' ? 'upcoming' : 'active';
}

export function getCurrentTicketCopy(phase: TicketPhase, ticket: VisitorTicket) {
  switch (phase) {
    case 'active':
      return {
        heading: `Valid until ${formatTime(ticket.endDateTime)}`,
        lede: 'Show this page at the library entrance if staff ask for your ticket.',
      };
    case 'upcoming':
      return {
        heading: `Starts at ${formatTime(ticket.startDateTime)}`,
        lede: 'Show this page at the library entrance if staff ask for your ticket.',
      };
    case 'awaiting':
      return {
        heading: 'Confirming your payment',
        lede: 'Your ticket activates as soon as the payment is confirmed. This page checks again on its own.',
      };
    case 'expired':
      return {
        heading: `Ended at ${formatTime(ticket.endDateTime)}`,
        lede: 'This ticket can no longer be used. Buy a new ticket to keep using the library.',
      };
    default:
      return {
        heading: 'This ticket is not active',
        lede: 'Open the payment history below for details.',
      };
  }
}

/** A 401 means the stored session is unusable; anything else may be transient. */
export function isSessionExpired(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 401;
}

/** The payment that settled the ticket, if any. */
export function getPaidPayment(ticket: VisitorTicket): TicketPayment | undefined {
  return ticket.payments.find((payment) => payment.status === 'PAID');
}

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormat.format(date);
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "26 Oct 2026, 15:18 – 18:30", or both full dates when the window crosses midnight. */
export function formatWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Validity unavailable';
  if (isSameDay(start, end)) {
    return `${dayFormat.format(start)}, ${timeFormat.format(start)} – ${timeFormat.format(end)}`;
  }
  return `${dateTimeFormat.format(start)} – ${dateTimeFormat.format(end)}`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : timeFormat.format(date);
}

export function formatAmount(payment: Pick<TicketPayment, 'amountSatang' | 'currency'>): string {
  try {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: payment.currency.toUpperCase(),
    }).format(payment.amountSatang / 100);
  } catch {
    return `${(payment.amountSatang / 100).toFixed(2)} ${payment.currency.toUpperCase()}`;
  }
}

export function formatGateway(gateway: string): string {
  return gateway ? gateway.charAt(0).toUpperCase() + gateway.slice(1).toLowerCase() : 'Gateway';
}
