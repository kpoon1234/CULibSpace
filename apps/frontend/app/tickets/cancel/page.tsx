import Link from 'next/link';

export default function TicketPaymentCancelPage() {
  return (
    <section className="mx-auto max-w-2xl px-5 py-16 text-center sm:px-8">
      <p className="text-sm font-semibold text-gray-600">CHECKOUT CANCELLED</p>
      <h1 className="mt-2 text-3xl font-bold text-gray-900">Payment was not completed</h1>
      <p className="mt-4 leading-7 text-gray-600">
        No successful payment was confirmed. You can return to the visitor ticket page to try again.
      </p>
      <Link
        href="/visitor/ticket"
        className="mt-7 inline-flex rounded-md bg-cta-primary px-5 py-3 text-sm font-semibold text-white hover:bg-cta-primary-hover"
      >
        Return to ticket purchase
      </Link>
    </section>
  );
}
