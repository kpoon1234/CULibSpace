import Link from 'next/link';
import HeroCarousel from './HeroCarousel';

export default function SplitHero() {
  return (
    <section className="grid grid-cols-1 lg:min-h-[560px] lg:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col justify-center gap-4 px-6 py-16 sm:px-10 sm:py-20 lg:px-16 xl:px-24">
        <h1 className="text-4xl font-bold tracking-tight text-balance text-gray-900 sm:text-5xl">
          Book a table, in real time.
        </h1>
        <p className="max-w-[52ch] text-base text-gray-600">
          Real-time availability, advance reservation, and accountable check-in — replacing the
          walk-up line.
        </p>
        <Link
          href="/login"
          className="mt-2 w-fit rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
        >
          Reserve a table now
        </Link>
        <p className="max-w-[52ch] text-xs text-gray-500">
          CU students and staff sign in with a university account.
        </p>
      </div>

      <HeroCarousel />
    </section>
  );
}
