import Link from 'next/link';
import HeroCarousel from './HeroCarousel';

export default function SplitHero() {
  return (
    <section className="grid grid-cols-1 lg:min-h-[560px] lg:grid-cols-[1.15fr_1fr]">
      <div className="flex flex-col justify-center gap-4 px-6 py-16 sm:px-10 sm:py-20 lg:px-16">
        <h1 className="text-4xl font-bold tracking-tight text-balance text-gray-900 sm:text-5xl">
          Book a seat, in real time.
        </h1>
        <p className="max-w-[38ch] text-base text-gray-600">
          Real-time availability, advance reservation, and accountable check-in — replacing the
          walk-up line.
        </p>
        <Link
          href="/login"
          className="mt-2 w-fit text-sm text-rose-600 underline-offset-4 transition-colors hover:text-rose-700 hover:underline focus-visible:underline focus-visible:outline-none"
        >
          Log in above to see today&apos;s availability.
        </Link>
      </div>

      <HeroCarousel />
    </section>
  );
}
