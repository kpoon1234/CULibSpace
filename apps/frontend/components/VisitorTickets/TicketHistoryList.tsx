'use client';

import { useId, useState } from 'react';
import type { VisitorTicket } from '@/lib/tickets';
import { ChevronDownIcon } from './icons';
import { PaymentStatusLabel, TicketStatusBadge } from './StatusBadge';
import {
  formatAmount,
  formatDateTime,
  formatGateway,
  formatWindow,
  getPaidPayment,
  getTicketPhase,
} from './ticketState';

/**
 * Past and inactive tickets as one ruled list rather than a stack of cards:
 * the visitor scans down dates and statuses, and only opens a row when they
 * need the payment trail behind it.
 */
export default function TicketHistoryList({ tickets }: { tickets: VisitorTicket[] }) {
  return (
    <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-paper">
      {tickets.map((ticket) => (
        <TicketRow key={ticket.ticketId} ticket={ticket} />
      ))}
    </ul>
  );
}

function TicketRow({ ticket }: { ticket: VisitorTicket }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const phase = getTicketPhase(ticket);
  const settled = getPaidPayment(ticket) ?? ticket.payments[0];
  const attempts = ticket.payments.length;

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-4 text-left transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-inset sm:px-6 md:grid-cols-[7rem_minmax(0,1fr)_auto_6rem_1.25rem]"
      >
        <span className="col-start-1 row-start-1 text-sm font-semibold text-gray-900 tabular-nums md:col-start-auto md:row-start-auto">
          Ticket #{ticket.ticketId}
        </span>

        <span className="col-span-2 row-start-2 text-sm text-gray-600 tabular-nums md:col-span-1 md:row-start-auto">
          {formatWindow(ticket.startDateTime, ticket.endDateTime)}
        </span>

        <span className="col-start-2 row-start-1 justify-self-end md:col-start-auto md:row-start-auto md:justify-self-start">
          <TicketStatusBadge phase={phase} />
        </span>

        <span className="hidden text-right text-sm font-medium text-gray-900 tabular-nums md:block">
          {settled ? formatAmount(settled) : '—'}
        </span>

        <ChevronDownIcon
          className={`hidden h-5 w-5 text-gray-500 transition-transform duration-200 ease-out motion-reduce:transition-none md:block ${
            open ? 'rotate-180' : ''
          }`}
        />

        <span className="col-span-2 row-start-3 flex items-center justify-between text-xs text-gray-500 md:hidden">
          <span className="tabular-nums">
            {settled ? formatAmount(settled) : '—'} · {attempts}{' '}
            {attempts === 1 ? 'payment' : 'payments'}
          </span>
          <span className="inline-flex items-center gap-1 font-medium text-gray-700">
            {open ? 'Hide payments' : 'Show payments'}
            <ChevronDownIcon
              className={`h-4 w-4 transition-transform duration-200 ease-out motion-reduce:transition-none ${
                open ? 'rotate-180' : ''
              }`}
            />
          </span>
        </span>
      </button>

      <div id={panelId} hidden={!open} className="bg-gray-50 px-4 pt-1 pb-4 sm:px-6">
        <PaymentTrail ticket={ticket} />
      </div>
    </li>
  );
}

function PaymentTrail({ ticket }: { ticket: VisitorTicket }) {
  if (ticket.payments.length === 0) {
    return <p className="py-3 text-sm text-gray-600">No payment was started for this ticket.</p>;
  }

  return (
    <div>
      <h3 className="pt-3 pb-2 text-xs font-semibold text-gray-700">
        Payment history · purchased {formatDateTime(ticket.createdAt)}
      </h3>
      <ol className="divide-y divide-gray-200 rounded-md border border-gray-200 bg-paper">
        {ticket.payments.map((payment) => (
          <li
            key={payment.paymentId}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto]"
          >
            <PaymentStatusLabel status={payment.status} />
            <span className="text-right text-sm font-medium text-gray-900 tabular-nums sm:order-last">
              {formatAmount(payment)}
            </span>
            <span className="col-span-2 text-xs leading-5 text-gray-600 tabular-nums sm:col-span-1 sm:text-sm">
              {formatGateway(payment.gateway)} · started {formatDateTime(payment.createdAt)}
              {payment.paidAt && <> · paid {formatDateTime(payment.paidAt)}</>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
