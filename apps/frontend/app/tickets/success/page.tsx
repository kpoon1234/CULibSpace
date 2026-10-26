import Link from 'next/link';

export default function TicketPaymentReturnPage() {
  return (
    <section className="mx-auto max-w-2xl px-5 py-16 text-center sm:px-8">
      <p className="text-sm font-semibold text-rose-600">PAYMENT UPDATE</p>
      <h1 className="mt-2 text-3xl font-bold text-gray-900">We are checking your payment</h1>
      <p className="mt-4 leading-7 text-gray-600">
        Stripe returned you to CULibSpace. Your ticket becomes active after the payment is confirmed
        by the system. Please check your ticket status again shortly.
      </p>
      <Link
        href="/"
        className="mt-7 inline-flex rounded-md bg-cta-primary px-5 py-3 text-sm font-semibold text-white hover:bg-cta-primary-hover"
      >
        Return to home
      </Link>
    </section>
  );
}
