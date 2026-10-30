'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { formatHms, useCountdown } from '@/lib/useCountdown';
import type { VisitorTicket } from '@/lib/tickets';
import { ChevronDownIcon } from './icons';
import { TicketStatusBadge } from './StatusBadge';
import { PaymentTrail } from './TicketHistoryList';
import {
  crossedBoundary,
  formatAmount,
  formatDateTime,
  formatTime,
  formatWindow,
  getBoundaryKey,
  getCurrentTicketCopy,
  getLivePhase,
  getPaidPayment,
  type BoundaryKey,
} from './ticketState';

interface CurrentTicketCardProps {
  ticket: VisitorTicket;
  /** Called when the ticket crosses its start or end, so the page refetches the
   *  server's verdict instead of waiting for the next poll. */
  onBoundary: () => void;
}

function parseOrNull(iso: string) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The ticket a visitor is holding right now. Whoever lands here with a ticket
 * in hand is asking "can I still get in, and for how long?", so the remaining
 * time is the card's centre of gravity and the validity window sits right
 * beside it in words.
 */
export default function CurrentTicketCard({ ticket, onBoundary }: CurrentTicketCardProps) {
  const isPaid = ticket.status === 'PAID';
  const startMs = parseOrNull(ticket.startDateTime);
  const endMs = parseOrNull(ticket.endDateTime);

  // Both boundaries tick independently, so a late timer still knows which one
  // it skipped (see getBoundaryKey) rather than dropping the countdown.
  const startDiff = useCountdown(isPaid ? startMs : null);
  const endDiff = useCountdown(isPaid ? endMs : null);
  const key = getBoundaryKey(startDiff, endDiff);

  const prevKeyRef = useRef<BoundaryKey | null>(null);
  useEffect(() => {
    const prev = prevKeyRef.current;
    prevKeyRef.current = key;
    if (crossedBoundary(prev, key)) onBoundary();
  }, [key, onBoundary]);

  const phase = getLivePhase(ticket, key);
  const { heading, lede } = getCurrentTicketCopy(phase, ticket);
  const remainingMs = phase === 'upcoming' ? startDiff : phase === 'active' ? endDiff : null;
  const showTimer = isPaid && phase !== 'expired';

  const paid = getPaidPayment(ticket);
  const latest = ticket.payments[0];

  const totalMs = startMs !== null && endMs !== null ? endMs - startMs : 0;
  const elapsedFraction =
    phase === 'active' && endDiff !== null && totalMs > 0
      ? Math.min(1, Math.max(0, 1 - endDiff / totalMs))
      : null;

  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const paymentsId = useId();
  const paymentCount = ticket.payments.length;

  return (
    <article
      aria-labelledby="current-ticket-heading"
      className="overflow-hidden rounded-xl border border-hairline bg-paper shadow-sm"
    >
      {/* The brand's one accent stripe on this page. */}
      <div className="h-1 bg-chula-pink" aria-hidden="true" />

      <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-10">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <TicketStatusBadge phase={phase} />
            <span className="text-xs font-medium text-gray-500 tabular-nums">
              Ticket #{ticket.ticketId}
            </span>
          </div>

          <h2
            id="current-ticket-heading"
            className="mt-3 text-2xl font-semibold tracking-tight text-balance text-gray-900 sm:text-[1.75rem]"
          >
            {heading}
          </h2>
          <p className="mt-1.5 max-w-[60ch] text-sm leading-6 text-gray-600">{lede}</p>

          <dl className="mt-5 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-gray-500">Validity</dt>
              <dd className="mt-0.5 font-medium text-gray-900 tabular-nums">
                {formatWindow(ticket.startDateTime, ticket.endDateTime)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">{paid ? 'Paid' : 'Amount'}</dt>
              <dd className="mt-0.5 font-medium text-gray-900 tabular-nums">
                {paid
                  ? `${formatAmount(paid)} · ${formatDateTime(paid.paidAt)}`
                  : latest
                    ? formatAmount(latest)
                    : '—'}
              </dd>
            </div>
          </dl>
        </div>

        {showTimer && (
          <div
            role="timer"
            className="flex flex-col items-start gap-1 border-t border-hairline pt-5 md:items-end md:border-t-0 md:border-l md:pt-0 md:pl-10"
          >
            <span
              className={`font-mono text-4xl font-bold tracking-tight tabular-nums sm:text-5xl ${
                phase === 'active' ? 'text-spruce' : 'text-gray-900'
              }`}
            >
              {/* Withheld until hydration (useCountdown returns null on the
                  server) so the digits never mismatch the prerendered markup. */}
              {remainingMs === null
                ? '--:--:--'
                : formatHms(Math.ceil(Math.max(0, remainingMs) / 1000))}
            </span>
            <span
              aria-live="polite"
              className="text-xs font-semibold tracking-wide text-gray-500 uppercase"
            >
              {phase === 'active' ? 'Time remaining' : 'Starts in'}
            </span>
          </div>
        )}
      </div>

      {elapsedFraction !== null && (
        <div className="border-t border-hairline px-5 py-4 sm:px-7">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-gray-200"
            role="progressbar"
            aria-label="Ticket time used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(elapsedFraction * 100)}
          >
            <div
              className="h-full rounded-full bg-spruce transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
              style={{ width: `${elapsedFraction * 100}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-gray-500 tabular-nums">
            <span>{formatTime(ticket.startDateTime)}</span>
            <span>{formatTime(ticket.endDateTime)}</span>
          </div>
        </div>
      )}

      {/* The current ticket is left out of the history list below, so its
          payment trail has to be reachable from here. */}
      <div className="border-t border-hairline">
        <button
          type="button"
          aria-expanded={paymentsOpen}
          aria-controls={paymentsId}
          onClick={() => setPaymentsOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none focus-visible:ring-inset sm:px-7"
        >
          <span>
            {paymentsOpen ? 'Hide payment history' : 'Show payment history'}
            <span className="ml-2 text-xs font-normal text-gray-500 tabular-nums">
              {paymentCount} {paymentCount === 1 ? 'payment' : 'payments'}
            </span>
          </span>
          <ChevronDownIcon
            className={`h-5 w-5 text-gray-500 transition-transform duration-200 ease-out motion-reduce:transition-none ${
              paymentsOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
        <div id={paymentsId} hidden={!paymentsOpen} className="bg-gray-50 px-5 pt-1 pb-4 sm:px-7">
          <PaymentTrail ticket={ticket} />
        </div>
      </div>
    </article>
  );
}
