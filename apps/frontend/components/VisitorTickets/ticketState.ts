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
