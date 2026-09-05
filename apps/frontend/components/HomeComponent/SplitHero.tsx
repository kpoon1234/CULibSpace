import Link from 'next/link';
import HeroCarousel from './HeroCarousel';

export default function SplitHero() {
  return (
    <section className="grid grid-cols-1 min-[860px]:min-h-[480px] min-[860px]:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col justify-center gap-5 px-6 py-12 sm:px-10 sm:py-16 lg:px-16 xl:px-24">
        <h1 className="text-5xl leading-[1.05] font-bold tracking-tight text-balance text-gray-900 sm:text-6xl md:text-7xl">
          Book a table, in real time.
        </h1>
        <p className="max-w-[52ch] text-lg text-gray-600">
          Real-time availability, advance reservation, and accountable check-in — replacing the
          walk-up line.
        </p>
        <Link
          href="/login"
          className="mt-2 w-fit rounded-md bg-cta-primary px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-cta-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta-primary focus-visible:ring-offset-2"
        >
          Reserve a table now
        </Link>
      </div>

      <HeroCarousel />
    </section>
  );
}
