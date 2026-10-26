'use client';

import { useCallback, useSyncExternalStore } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { getAuthSnapshot, getAuthToken, subscribeToAuth, type AuthUser } from '@/lib/auth';
import { fetchMyTickets, TicketRequestError } from '@/lib/tickets';
import CurrentTicketCard from './CurrentTicketCard';
import TicketHistoryList from './TicketHistoryList';
import { RefreshIcon, TicketIcon } from './icons';
import { getTicketPhase, pickCurrentTicket } from './ticketState';

const noopSubscribe = () => () => {};

const buttonPrimary =
  'inline-flex items-center justify-center rounded-md bg-cta-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cta-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2';
const buttonSecondary =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-paper px-4 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

/** US6-2: a visitor's tickets, when each is valid, and the payments behind them. */
export default function VisitorTicketsView() {
  // False during the server render and hydration pass, so the page never
  // flashes "log in" at a visitor whose session lives in localStorage.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  const authSnapshot = useSyncExternalStore(subscribeToAuth, getAuthSnapshot, () => null);
  const token = useSyncExternalStore(subscribeToAuth, getAuthToken, () => null);

  let user: AuthUser | null = null;
  try {
    user = authSnapshot ? (JSON.parse(authSnapshot) as AuthUser) : null;
  } catch {
    user = null;
  }
  const isVisitor = user?.role === 'OUTSIDER';

  const { data, error, isValidating, mutate } = useSWR(
    token && isVisitor ? ['myTickets', token] : null,
    () => fetchMyTickets(),
    {
      // A purchase being confirmed is worth checking often; otherwise a ticket
      // only changes when its window opens or closes, which the card's own
      // countdown already catches.
      refreshInterval: (latest) =>
        latest?.some((ticket) => getTicketPhase(ticket) === 'awaiting') ? 10_000 : 60_000,
      revalidateOnFocus: true,
    }
  );

  const refresh = useCallback(() => {
    void mutate();
  }, [mutate]);

  const current = data ? pickCurrentTicket(data) : null;
  const history = data ? data.filter((ticket) => ticket !== current) : [];

  return (
    <section className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            My tickets
          </h1>
          <p className="mt-3 text-base leading-7 text-gray-600">
            When each visitor ticket is valid, and every payment made for it.
          </p>
        </div>

        {isVisitor && data && data.length > 0 && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={isValidating}
              className={buttonSecondary}
            >
              <RefreshIcon
                className={`h-4 w-4 ${isValidating ? 'animate-spin motion-reduce:animate-none' : ''}`}
              />
              {isValidating ? 'Checking…' : 'Refresh'}
            </button>
            <Link href="/visitor/ticket" className={buttonSecondary}>
              Buy a ticket
            </Link>
          </div>
        )}
      </header>

      {!hydrated ? (
        <LoadingState />
      ) : !user ? (
        <Notice
          title="Log in to see your tickets"
          body="Your tickets and payments are tied to your visitor account."
          action={
            <Link href="/login" className={buttonPrimary}>
              Log in
            </Link>
          }
        />
      ) : !isVisitor ? (
        <Notice
          title="Visitor tickets are for outside visitor accounts"
          body="CU students and staff book tables for free and don't need a ticket."
          action={
            <Link href="/" className={buttonSecondary}>
              Back to home
            </Link>
          }
        />
      ) : error && !data ? (
        <Notice
          tone="error"
          title="We couldn't load your tickets"
          body={
            error instanceof TicketRequestError && error.status === 401
              ? 'Your session has ended. Log in again to continue.'
              : `${error instanceof Error ? error.message : 'Something went wrong.'} Your tickets are safe; try again in a moment.`
          }
          action={
            error instanceof TicketRequestError && error.status === 401 ? (
              <Link href="/login" className={buttonPrimary}>
                Log in again
              </Link>
            ) : (
              <button type="button" onClick={refresh} className={buttonSecondary}>
                <RefreshIcon className="h-4 w-4" />
                Try again
              </button>
            )
          }
        />
      ) : !data ? (
        <LoadingState />
      ) : data.length === 0 ? (
        <Notice
          icon
          title="No tickets yet"
          body="Buy a visitor ticket to use the library's tables. It shows up here with its validity time as soon as payment is confirmed."
          action={
            <Link href="/visitor/ticket" className={buttonPrimary}>
              Buy a visitor ticket
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-10">
          {current && <CurrentTicketCard ticket={current} onBoundary={refresh} />}

          <section aria-labelledby="ticket-history-heading">
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <h2 id="ticket-history-heading" className="text-lg font-semibold text-gray-900">
                {current ? 'Earlier tickets' : 'Ticket history'}
              </h2>
              <span className="text-xs text-gray-500 tabular-nums">
                {history.length} {history.length === 1 ? 'ticket' : 'tickets'}
              </span>
            </div>

            {history.length > 0 ? (
              <TicketHistoryList tickets={history} />
            ) : (
              <p className="rounded-xl border border-dashed border-gray-300 px-5 py-6 text-sm text-gray-600">
                No earlier tickets. Past tickets and their payments will be listed here.
              </p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function Notice({
  title,
  body,
  action,
  tone = 'neutral',
  icon = false,
}: {
  title: string;
  body: string;
  action: React.ReactNode;
  tone?: 'neutral' | 'error';
  icon?: boolean;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={`flex flex-col items-start gap-4 rounded-xl border px-6 py-8 sm:px-8 ${
        tone === 'error' ? 'border-red-200 bg-red-50' : 'border-hairline bg-paper'
      }`}
    >
      {icon && (
        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-600">
          <TicketIcon className="h-6 w-6" />
        </span>
      )}
      <div>
        <h2
          className={`text-lg font-semibold ${tone === 'error' ? 'text-red-800' : 'text-gray-900'}`}
        >
          {title}
        </h2>
        <p
          className={`mt-1 max-w-[60ch] text-sm leading-6 ${
            tone === 'error' ? 'text-red-700' : 'text-gray-600'
          }`}
        >
          {body}
        </p>
      </div>
      {action}
    </div>
  );
}

function LoadingState() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-10">
      <span className="sr-only">Loading your tickets…</span>
      <div className="h-48 animate-pulse rounded-xl border border-hairline bg-paper motion-reduce:animate-none" />
      <div className="flex flex-col gap-3">
        <div className="h-5 w-40 animate-pulse rounded bg-gray-200 motion-reduce:animate-none" />
        <div className="h-40 animate-pulse rounded-xl border border-hairline bg-paper motion-reduce:animate-none" />
      </div>
    </div>
  );
}
