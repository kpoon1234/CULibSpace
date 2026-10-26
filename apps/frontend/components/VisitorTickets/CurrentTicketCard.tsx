'use client';

import { useEffect, useRef } from 'react';
import { formatHms, useCountdown } from '@/lib/useCountdown';
import type { VisitorTicket } from '@/lib/tickets';
import { TicketStatusBadge } from './StatusBadge';
import {
  formatAmount,
  formatDateTime,
  formatTime,
  formatWindow,
  getPaidPayment,
  getTicketPhase,
} from './ticketState';

interface CurrentTicketCardProps {
  ticket: VisitorTicket;
  /** Called once when the countdown reaches zero, so the page refetches the
   *  server's verdict instead of waiting for the next poll. */
  onBoundary: () => void;
}

/**
 * The ticket a visitor is holding right now. Whoever lands here with a ticket
 * in hand is asking "can I still get in, and for how long?", so the remaining
 * time is the card's centre of gravity and the validity window sits right
 * beside it in words.
 */
export default function CurrentTicketCard({ ticket, onBoundary }: CurrentTicketCardProps) {
  const phase = getTicketPhase(ticket);
  const startMs = Date.parse(ticket.startDateTime);
  const endMs = Date.parse(ticket.endDateTime);
  const targetMs = phase === 'active' ? endMs : phase === 'upcoming' ? startMs : null;

  const diff = useCountdown(targetMs !== null && Number.isFinite(targetMs) ? targetMs : null);

  // Fire on the edge into zero, not on every render, so an unmemoised parent
  // callback cannot become a refetch loop (same guard as CountdownTimer).
  const firedRef = useRef(false);
  const reachedBoundary = diff !== null && diff <= 0;
  useEffect(() => {
    if (!reachedBoundary) {
      firedRef.current = false;
      return;
    }
    if (firedRef.current) return;
    firedRef.current = true;
    onBoundary();
  }, [reachedBoundary, onBoundary]);

  const paid = getPaidPayment(ticket);
  const latest = ticket.payments[0];

  const heading =
    phase === 'active'
      ? `Valid until ${formatTime(ticket.endDateTime)}`
      : phase === 'upcoming'
        ? `Starts at ${formatTime(ticket.startDateTime)}`
        : 'Confirming your payment';

  const lede =
    phase === 'awaiting'
      ? 'Your ticket activates as soon as the payment is confirmed. This page checks again on its own.'
      : 'Show this page at the library entrance if staff ask for your ticket.';

  const totalMs = endMs - startMs;
  const elapsedFraction =
    phase === 'active' && diff !== null && totalMs > 0
      ? Math.min(1, Math.max(0, 1 - diff / totalMs))
      : null;

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

        {targetMs !== null && (
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
              {diff === null ? '--:--:--' : formatHms(Math.ceil(Math.max(0, diff) / 1000))}
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
    </article>
  );
}
