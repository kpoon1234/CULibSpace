import Image from 'next/image';
import Link from 'next/link';

export default function TopMenu() {
  return (
    <header className="sticky top-0 z-50 flex h-16 w-full items-stretch bg-chula-pink px-3 sm:px-8">
      <nav aria-label="Primary" className="flex w-full items-center">
        <Link
          href="/"
          className="flex h-full items-center gap-2 pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-chula-pink sm:gap-4 sm:pr-4"
        >
          <span className="relative h-12 w-12 flex-none">
            <Image src="/img/Logo.jpg" alt="" fill sizes="48px" className="object-contain" />
          </span>
          <span className="font-sans text-lg font-semibold text-neutral-900">CULibSpace</span>
        </Link>

        <div className="flex flex-1 items-center justify-end gap-2 sm:gap-4">
          <Link
            href="/login"
            className="rounded-md px-2 py-3 text-sm font-medium text-neutral-900 transition-colors hover:bg-chula-pink-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-chula-pink sm:px-3"
          >
            Log In
          </Link>
          <Link
            href="/login?intent=signup"
            className="rounded-md bg-rose-600 px-3 py-3 text-sm font-medium text-white transition-colors hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-chula-pink sm:px-4"
          >
            Sign Up
          </Link>
        </div>
      </nav>
    </header>
  );
}
