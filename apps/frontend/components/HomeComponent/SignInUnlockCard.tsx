import Link from 'next/link';
import { CheckIcon } from './icons';

const checklist = ['15-minute grace period', 'Real-time sensor telemetry', 'Instant QR check-in'];

export default function SignInUnlockCard() {
  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold text-gray-900">Sign in to unlock live reservation</h3>
        <p className="text-sm text-gray-600">
          A university or visitor account turns this sample view into real seats you can hold.
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {checklist.map((item) => (
          <li key={item} className="flex items-center gap-2.5 text-sm text-gray-700">
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-spruce/10 text-spruce">
              <CheckIcon className="h-3 w-3" />
            </span>
            {item}
          </li>
        ))}
      </ul>

      <Link
        href="/login"
        className="mt-auto flex w-full items-center justify-center rounded-md bg-cta-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-cta-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta-primary focus-visible:ring-offset-2"
      >
        Reserve a table now
      </Link>
    </div>
  );
}
