'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAuthSnapshot, subscribeToAuth } from '@/lib/auth';
import { purchaseVisitorTicket } from '@/lib/tickets';

type VisitorUser = {
  firstname?: string;
  lastname?: string;
  email?: string;
  role?: string;
};

export default function VisitorTicketPage() {
  const router = useRouter();
  const authSnapshot = useSyncExternalStore(subscribeToAuth, getAuthSnapshot, () => null);
  const idempotencyKey = useRef<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  let user: VisitorUser | null = null;
  try {
    user = authSnapshot ? (JSON.parse(authSnapshot) as VisitorUser) : null;
  } catch {
    user = null;
  }

  async function startPurchase() {
    setError('');
    setNotice('');

    if (user?.role !== 'OUTSIDER') {
      setError('Visitor tickets can only be purchased with an outside visitor account.');
      return;
    }

    if (!idempotencyKey.current) {
      idempotencyKey.current = crypto.randomUUID();
    }
    const purchaseKey = idempotencyKey.current;

    setIsSubmitting(true);

    try {
      const result = await purchaseVisitorTicket(purchaseKey);

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
          setNotice(
            'Your payment is still being checked. Retry to recover the same checkout; this will not create a duplicate purchase.'
          );
          return;
        }

        if (result.code === 'PAYMENT_NOT_COMPLETED' || result.code === 'GATEWAY_REJECTED') {
          idempotencyKey.current = null;
        }

        setError(result.message);
        return;
      }

      const checkoutUrl = result.data.checkoutUrl;
      if (!checkoutUrl) {
        setNotice(
          'The purchase was created, but no checkout link was returned. Please try again using the same request or contact library staff.'
        );
        return;
      }

      window.location.assign(checkoutUrl);
    } catch {
      setError('Unable to start checkout. Please try again.');
    } finally {
      setIsSubmitting(false);
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

          <button
            type="button"
            onClick={startPurchase}
            disabled={isSubmitting || user?.role !== 'OUTSIDER'}
            className="mt-6 w-full rounded-md bg-cta-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-cta-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {isSubmitting ? 'Connecting to checkout…' : 'Continue to payment'}
          </button>
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
