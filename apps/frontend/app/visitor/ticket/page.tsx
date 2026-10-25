'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAuthSnapshot, getAuthToken, subscribeToAuth } from '@/lib/auth';
import { purchaseVisitorTicket } from '@/lib/tickets';

type VisitorUser = {
  uid?: number;
  firstname?: string;
  lastname?: string;
  email?: string;
  role?: string;
};

const PURCHASE_KEY_PREFIX = 'culibspace:ticket-purchase:';

export default function VisitorTicketPage() {
  const router = useRouter();
  const authSnapshot = useSyncExternalStore(subscribeToAuth, getAuthSnapshot, () => null);
  const authToken = useSyncExternalStore(subscribeToAuth, getAuthToken, () => null);

  const requestEpoch = useRef(0);
  const idempotencyKey = useRef<{ uid: number; value: string } | null>(null);

  const [submittingRequest, setSubmittingRequest] = useState<{
    requestId: number;
    token: string;
  } | null>(null);

  const isSubmitting =
    submittingRequest?.requestId === requestEpoch.current && submittingRequest.token === authToken;
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [ticketActive, setTicketActive] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);

  useEffect(() => {
    // Invalidate in-flight requests when the account changes or page unmounts.
    return () => {
      requestEpoch.current += 1;
    };
  }, [authToken]);

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
      // Use an in-memory key if sessionStorage is unavailable.
    }

    if (!key) {
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
      // Use an in-memory key if sessionStorage is unavailable.
    }

    idempotencyKey.current = { uid, value: key };
    return key;
  }

  async function startPurchase(startAnother = false) {
    setError('');
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

    const uid = user.uid;
    const requestId = ++requestEpoch.current;

    const isCurrentRequest = () =>
      requestEpoch.current === requestId && getAuthToken() === tokenAtStart;

    let purchaseKey: string;

    if (startAnother) {
      purchaseKey = rotatePurchaseKey(uid);
      setPaymentConfirmed(false);
      setTicketActive(false);
    } else {
      purchaseKey = getPurchaseKey(uid);
    }

    setSubmittingRequest({ requestId, token: tokenAtStart });

    try {
      const result = await purchaseVisitorTicket(purchaseKey);

      // Ignore a response from an old request, account, or unmounted page.
      if (!isCurrentRequest()) return;

      if (!result.ok) {
        if (result.status === 401) {
          router.push('/login');
          return;
        }

        if (result.code === 'PROFILE_INCOMPLETE' || result.code === 'OUTSIDE_PROFILE_INCOMPLETE') {
          router.push('/onboarding');
          return;
        }

        if (result.code === 'PAYMENT_AWAITING_CONFIRMATION') {
          setPaymentPending(true);
          setNotice(
            'Your existing payment is still being checked. Retry to recover the same checkout.'
          );
          return;
        }

        if (result.code === 'PAYMENT_NOT_COMPLETED' || result.code === 'GATEWAY_REJECTED') {
          // Backend says this attempt is terminal; the next attempt needs a new key.
          rotatePurchaseKey(uid);
        }

        setError(result.message);
        return;
      }

      const paymentStatus = result.data.paymentStatus.toUpperCase();
      const ticketStatus = result.data.ticketStatus.toUpperCase();

      // A paid response is final for this purchase, even when checkoutUrl is null.
      if (paymentStatus === 'PAID') {
        const isActive = ticketStatus === 'PAID';

        setPaymentConfirmed(true);
        setTicketActive(isActive);
        setNotice(
          isActive
            ? 'Payment confirmed. Your visitor ticket is active.'
            : 'Payment confirmed. Your ticket is waiting for activation.'
        );
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
      }
    } finally {
      if (isCurrentRequest()) {
        setSubmittingRequest(null);
      }
    }
  }

  const displayName = [user?.firstname, user?.lastname].filter(Boolean).join(' ');

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

          {paymentConfirmed && ticketActive ? (
            <button
              type="button"
              onClick={() => startPurchase(true)}
              disabled={isSubmitting}
              className="mt-6 w-full rounded-md bg-cta-primary px-5 py-3 text-sm font-semibold text-white hover:bg-cta-primary-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {isSubmitting ? 'Connecting to checkout…' : 'Purchase another ticket'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => startPurchase()}
              disabled={isSubmitting || user?.role !== 'OUTSIDER'}
              className="mt-6 w-full rounded-md bg-cta-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-cta-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {isSubmitting
                ? 'Connecting to checkout…'
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
            <p className="mt-1 text-sm leading-6 text-gray-600">
              The current price and validity period will be provided by the ticket service.
            </p>
          </div>

          <p className="mt-4 text-xs leading-5 text-gray-600">
            You will review the amount on the secure payment page before completing checkout.
          </p>
        </aside>
      </div>
    </section>
  );
}
