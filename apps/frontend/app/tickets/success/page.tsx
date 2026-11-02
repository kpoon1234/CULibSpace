'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAuthToken, getStoredUser } from '@/lib/auth';
import { isValidIdempotencyKey, purchaseVisitorTicket } from '@/lib/tickets';

const PURCHASE_KEY_PREFIX = 'culibspace:ticket-purchase:';

export default function TicketPaymentReturnPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'paid' | 'pending' | 'failed'>('checking');

  useEffect(() => {
    let cancelled = false;

    async function checkPayment() {
      const token = getAuthToken();
      if (!token) {
        setStatus('failed');
        return;
      }

      const user = getStoredUser();
      if (!user?.uid || user.role !== 'OUTSIDER') {
        setStatus('failed');
        return;
      }

      const storageKey = `${PURCHASE_KEY_PREFIX}${user.uid}`;
      let storedKey: string | null = null;
      try {
        storedKey = sessionStorage.getItem(storageKey);
      } catch {
        /* sessionStorage unavailable */
      }

      if (!storedKey || !isValidIdempotencyKey(storedKey)) {
        setStatus('failed');
        return;
      }

      try {
        const result = await purchaseVisitorTicket(storedKey);

        if (cancelled) return;

        if (result.ok && result.data.paymentStatus === 'PAID') {
          setStatus('paid');
        } else if (!result.ok && result.code === 'PAYMENT_AWAITING_CONFIRMATION') {
          setStatus('pending');
        } else {
          setStatus('failed');
        }
      } catch {
        if (!cancelled) setStatus('failed');
      }
    }

    checkPayment();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // After a brief pause, navigate to the ticket page so the visitor sees the
    // latest status (auto-reconciled there) instead of staying on this page.
    const timer = setTimeout(() => {
      router.replace('/visitor/ticket');
    }, 2500);

    return () => clearTimeout(timer);
  }, [router, status]);

  if (status === 'checking') {
    return (
      <section className="mx-auto max-w-2xl px-5 py-16 text-center sm:px-8">
        <p className="text-sm font-semibold text-rose-600">PAYMENT UPDATE</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">We are checking your payment</h1>
        <p className="mt-4 leading-7 text-gray-600">
          Stripe returned you to CULibSpace. Please wait while we confirm your payment.
        </p>
      </section>
    );
  }

  if (status === 'paid') {
    return (
      <section className="mx-auto max-w-2xl px-5 py-16 text-center sm:px-8">
        <p className="text-sm font-semibold text-rose-600">PAYMENT CONFIRMED</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">Your payment was successful</h1>
        <p className="mt-4 leading-7 text-gray-600">
          Your visitor ticket is now active. Redirecting to your tickets…
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href="/visitor/ticket"
            className="inline-flex rounded-md bg-cta-primary px-5 py-3 text-sm font-semibold text-white hover:bg-cta-primary-hover"
          >
            View my ticket
          </Link>
          <Link
            href="/"
            className="inline-flex rounded-md border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Return to home
          </Link>
        </div>
      </section>
    );
  }

  if (status === 'pending') {
    return (
      <section className="mx-auto max-w-2xl px-5 py-16 text-center sm:px-8">
        <p className="text-sm font-semibold text-rose-600">PAYMENT UPDATE</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">Payment is still being processed</h1>
        <p className="mt-4 leading-7 text-gray-600">
          Your payment hasn't been confirmed yet. Redirecting to your ticket page so you can retry.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href="/visitor/ticket"
            className="inline-flex rounded-md bg-cta-primary px-5 py-3 text-sm font-semibold text-white hover:bg-cta-primary-hover"
          >
            Go to ticket page
          </Link>
          <Link
            href="/"
            className="inline-flex rounded-md border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Return to home
          </Link>
        </div>
      </section>
    );
  }

  // failed
  return (
    <section className="mx-auto max-w-2xl px-5 py-16 text-center sm:px-8">
      <p className="text-sm font-semibold text-rose-600">PAYMENT UPDATE</p>
      <h1 className="mt-2 text-3xl font-bold text-gray-900">Payment confirmation unavailable</h1>
      <p className="mt-4 leading-7 text-gray-600">
        We couldn't confirm your payment right now. Please go to the ticket page to check or retry.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link
          href="/visitor/ticket"
          className="inline-flex rounded-md bg-cta-primary px-5 py-3 text-sm font-semibold text-white hover:bg-cta-primary-hover"
        >
          Go to ticket page
        </Link>
        <Link
          href="/"
          className="inline-flex rounded-md border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
        >
          Return to home
        </Link>
      </div>
    </section>
  );
}
