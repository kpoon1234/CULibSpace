'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAuthSnapshot, getAuthToken, subscribeToAuth } from '@/lib/auth';
import {
  describePurchaseError,
  formatTicketAmount,
  isValidIdempotencyKey,
  purchaseVisitorTicket,
  type PurchaseErrorAction,
  type TicketPurchaseData,
} from '@/lib/tickets';

type VisitorUser = {
  uid?: number;
  firstname?: string;
  lastname?: string;
  email?: string;
  role?: string;
};

type ActiveRequest = {
  requestId: number;
  token: string;
};

const PURCHASE_KEY_PREFIX = 'culibspace:ticket-purchase:';

export default function VisitorTicketPage() {
  const router = useRouter();
  const authSnapshot = useSyncExternalStore(subscribeToAuth, getAuthSnapshot, () => null);

  const requestEpoch = useRef(0);
  const activeRequest = useRef<ActiveRequest | null>(null);
  const idempotencyKey = useRef<{ uid: number; value: string } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [ticketActive, setTicketActive] = useState(false);
  const [ticketExpired, setTicketExpired] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);
  const [errorAction, setErrorAction] = useState<PurchaseErrorAction | null>(null);
  const [purchase, setPurchase] = useState<TicketPurchaseData | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToAuth(() => {
      // Invalidate any request owned by the previous auth session.
      requestEpoch.current += 1;
      activeRequest.current = null;

      setIsSubmitting(false);
      setError('');
      setErrorAction(null);
      setNotice('');
      setPurchase(null);
      setPaymentPending(false);
      setPaymentConfirmed(false);
      setTicketActive(false);
      setTicketExpired(false);
    });

    return () => {
      unsubscribe();
      requestEpoch.current += 1;
      activeRequest.current = null;
    };
  }, []);

  let user: VisitorUser | null = null;

  try {
    user = authSnapshot ? (JSON.parse(authSnapshot) as VisitorUser) : null;
  } catch {
    user = null;
  }

  function getPurchaseKey(uid: number): string {
    if (idempotencyKey.current?.uid === uid) {
      return idempotencyKey.current.value;
    }

    const storageKey = `${PURCHASE_KEY_PREFIX}${uid}`;
    let key: string | null = null;

    try {
      key = sessionStorage.getItem(storageKey);
    } catch {
      // Fall back to an in-memory key if sessionStorage is unavailable.
    }

    // A corrupted or edited stored key would be rejected by the backend on every retry.
    if (!isValidIdempotencyKey(key)) {
      key = crypto.randomUUID();

      try {
        sessionStorage.setItem(storageKey, key);
      } catch {
        // The request can still proceed for this page lifetime.
      }
    }

    idempotencyKey.current = { uid, value: key };
    return key;
  }

  function rotatePurchaseKey(uid: number): string {
    const key = crypto.randomUUID();

    try {
      sessionStorage.setItem(`${PURCHASE_KEY_PREFIX}${uid}`, key);
    } catch {
      // Fall back to an in-memory key if sessionStorage is unavailable.
    }

    idempotencyKey.current = { uid, value: key };
    return key;
  }

  async function startPurchase(startAnother = false) {
    setError('');
    setErrorAction(null);
    setNotice('');
    setPaymentPending(false);

    if (user?.role !== 'OUTSIDER') {
      setError('Visitor tickets can only be purchased with an outside visitor account.');
      return;
    }

    if (typeof user.uid !== 'number') {
      setError('We could not identify your visitor account. Please log in again.');
      return;
    }

    const tokenAtStart = getAuthToken();

    if (!tokenAtStart) {
      router.push('/login');
      return;
    }

    // Prevent duplicate requests for the same authenticated session.
    if (activeRequest.current?.token === tokenAtStart) {
      return;
    }

    const uid = user.uid;
    const requestId = ++requestEpoch.current;
    activeRequest.current = { requestId, token: tokenAtStart };

    const isCurrentRequest = () =>
      activeRequest.current?.requestId === requestId &&
      activeRequest.current.token === tokenAtStart &&
      getAuthToken() === tokenAtStart;

    let purchaseKey: string;

    if (startAnother) {
      purchaseKey = rotatePurchaseKey(uid);
      setPaymentConfirmed(false);
      setTicketActive(false);
      setTicketExpired(false);
    } else {
      purchaseKey = getPurchaseKey(uid);
    }

    setIsSubmitting(true);

    try {
      const result = await purchaseVisitorTicket(purchaseKey);

      // Ignore results from an old request, account, or unmounted page.
      if (!isCurrentRequest()) return;

      if (!result.ok) {
        if (result.code === 'PAYMENT_AWAITING_CONFIRMATION') {
          setPaymentPending(true);
          setNotice(
            'Your existing payment is still being checked. Retry to recover the same checkout.'
          );
          return;
        }

        const view = describePurchaseError(result);

        if (view.action === 'login') {
          router.push('/login');
          return;
        }

        if (view.action === 'onboarding') {
          router.push('/onboarding');
          return;
        }

        if (view.action === 'restart') {
          // The previous attempt is terminal; the next attempt needs a new key.
          rotatePurchaseKey(uid);
        }

        setError(view.message);
        setErrorAction(view.action);
        return;
      }

      setPurchase(result.data);

      const { paymentStatus, ticketStatus } = result.data;

      // A paid response is final, even when checkoutUrl is null.
      if (paymentStatus === 'PAID') {
        setPaymentConfirmed(true);

        if (ticketStatus !== 'PAID') {
          setTicketActive(false);
          setTicketExpired(false);
          setNotice('Payment confirmed. Your ticket is waiting for activation.');
          return;
        }

        const startMs = Date.parse(result.data.ticketStartDateTime);
        const endMs = Date.parse(result.data.ticketEndDateTime);
        const now = Date.now();

        // Do not claim the ticket is active if its validity window is missing or invalid.
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
          setTicketActive(false);
          setTicketExpired(false);
          setNotice('Payment confirmed, but the ticket validity period could not be verified.');
          return;
        }

        if (now >= endMs) {
          setTicketActive(false);
          setTicketExpired(true);
          setNotice('This visitor ticket has expired. You can purchase a new ticket.');
          return;
        }

        if (now < startMs) {
          setTicketActive(false);
          setTicketExpired(false);
          setNotice(
            `Payment confirmed. Your ticket becomes active at ${new Date(startMs).toLocaleString()}.`
          );
          return;
        }

        setTicketActive(true);
        setTicketExpired(false);
        setNotice('Payment confirmed. Your visitor ticket is active.');
        return;
      }

      const checkoutUrl = result.data.checkoutUrl;

      if (!checkoutUrl) {
        if (paymentStatus === 'FAILED' || paymentStatus === 'EXPIRED') {
          rotatePurchaseKey(uid);
          setNotice('The previous payment attempt ended. You can start a new purchase.');
        } else {
          setPaymentPending(true);
          setNotice(
            'Your purchase is still being processed. Retry to recover the same payment request.'
          );
        }

        return;
      }

      // Check again immediately before navigating to the external checkout.
      if (!isCurrentRequest()) return;

      window.location.assign(checkoutUrl);
    } catch {
      if (isCurrentRequest()) {
        setError('Unable to start checkout. Please try again.');
        setErrorAction('retry');
      }
    } finally {
      if (isCurrentRequest()) {
        activeRequest.current = null;
        setIsSubmitting(false);
      }
    }
  }

  const displayName = [user?.firstname, user?.lastname].filter(Boolean).join(' ');

  const validFrom = purchase ? Date.parse(purchase.ticketStartDateTime) : NaN;
  const validUntil = purchase ? Date.parse(purchase.ticketEndDateTime) : NaN;
  // The backend only sets the real validity period once the ticket is paid.
  const hasValidityPeriod =
    purchase?.ticketStatus === 'PAID' &&
    Number.isFinite(validFrom) &&
    Number.isFinite(validUntil) &&
    validUntil > validFrom;

  return (
    <section className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="mb-8 max-w-2xl">
        <p className="mb-2 text-sm font-semibold text-rose-600">VISITOR TICKETS</p>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Purchase a library ticket
        </h1>

        <p className="mt-3 text-base leading-7 text-gray-600">
          Purchase a visitor ticket using your CULibSpace visitor account. The system will confirm
          the current price and validity before sending you to secure checkout.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-xl border border-hairline bg-white p-5 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold text-gray-900">Visitor account</h2>

          {user ? (
            <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm">
              <p className="font-medium text-gray-900">{displayName || 'Visitor account'}</p>
              {user.email && <p className="mt-1 text-gray-600">{user.email}</p>}
              <p className="mt-2 text-gray-600">Account type: Outside visitor</p>
            </div>
          ) : (
            <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
              Log in with your visitor account to continue.
              <Link className="ml-1 font-semibold text-rose-600 hover:underline" href="/login">
                Log in
              </Link>
            </div>
          )}

          <div className="my-7 border-t border-hairline" />

          <h2 className="text-lg font-semibold text-gray-900">Before you continue</h2>

          <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-6 text-gray-600">
            <li>Your visitor profile must be complete.</li>
            <li>Price and ticket validity are set by the library system.</li>
            <li>Your ticket becomes active after payment is confirmed.</li>
          </ul>

          {error && (
            <p
              role="alert"
              className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {error}
            </p>
          )}

          {notice && (
            <p
              role="status"
              className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              {notice}
            </p>
          )}

          {ticketActive || ticketExpired ? (
            <button
              type="button"
              onClick={() => startPurchase(true)}
              disabled={isSubmitting}
              className="mt-6 w-full rounded-md bg-cta-primary px-5 py-3 text-sm font-semibold text-white hover:bg-cta-primary-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {isSubmitting
                ? 'Connecting to checkout…'
                : ticketExpired
                  ? 'Purchase a new ticket'
                  : 'Purchase another ticket'}
            </button>
          ) : errorAction === 'none' ? null : (
            <button
              type="button"
              onClick={() => startPurchase()}
              disabled={isSubmitting || user?.role !== 'OUTSIDER'}
              className="mt-6 w-full rounded-md bg-cta-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-cta-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {isSubmitting
                ? 'Connecting to checkout…'
                : errorAction === 'retry'
                  ? 'Try again'
                  : errorAction === 'restart'
                    ? 'Start a new purchase'
                    : paymentConfirmed
                      ? 'Check ticket activation'
                      : paymentPending
                        ? 'Retry existing purchase'
                        : 'Continue to payment'}
            </button>
          )}
        </div>

        <aside className="h-fit rounded-xl border border-hairline bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900">Purchase summary</h2>

          <div className="mt-5 border-b border-hairline pb-4">
            <p className="font-medium text-gray-900">Visitor ticket</p>
            {purchase ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-600">Amount</dt>
                  <dd className="font-semibold text-gray-900">
                    {formatTicketAmount(purchase.amountSatang, purchase.currency)}
                  </dd>
                </div>
                {hasValidityPeriod && (
                  <div>
                    <dt className="text-gray-600">Valid</dt>
                    <dd className="mt-1 text-gray-900">
                      {new Date(validFrom).toLocaleString()} –{' '}
                      {new Date(validUntil).toLocaleString()}
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mt-1 text-sm leading-6 text-gray-600">
                The current price and validity period will be provided by the ticket service.
              </p>
            )}
          </div>

          <p className="mt-4 text-xs leading-5 text-gray-600">
            You will review the amount on the secure payment page before completing checkout.
          </p>
        </aside>
      </div>
    </section>
  );
}
