import Image from 'next/image';
import Link from 'next/link';
import { FacebookIcon, InstagramIcon, LineIcon } from './socialIcons';

// Navigation only — no marketing or value-proposition copy lives down here; that belongs in the
// white body above (see DESIGN.md, Home page layout).
const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'Log In', href: '/login' },
  { label: 'Sign Up', href: '/login?intent=signup' },
];

// PLACEHOLDER contact details. Deliberately generic — do not substitute real Chulalongkorn
// University address, phone, or email here until the library supplies approved contact data.
const contact = {
  address: '000 Example Road, Example District, Bangkok 10000',
  email: 'contact@culibspace.example',
  phone: '+66 (0)2 000 0000',
};

// PLACEHOLDER destinations — swap the `href`s when real accounts exist.
const socialLinks = [
  { label: 'CULibSpace on Facebook', href: '#', Icon: FacebookIcon },
  { label: 'CULibSpace on Instagram', href: '#', Icon: InstagramIcon },
  { label: 'CULibSpace on LINE', href: '#', Icon: LineIcon },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 px-6 py-12 sm:px-10 lg:px-16 xl:px-24">
      <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-3">
          <Link
            href="/"
            className="flex w-fit items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
          >
            <span className="relative h-9 w-9 flex-none">
              <Image src="/img/Logo.jpg" alt="" fill sizes="36px" className="object-contain" />
            </span>
            <span className="text-lg font-semibold text-gray-900">CULibSpace</span>
          </Link>
          <p className="max-w-[42ch] text-sm text-gray-600">
            Real-time table booking for the Chulalongkorn University library.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-gray-900">Navigation</h2>
          <ul className="flex flex-col gap-2">
            {navLinks.map(({ label, href }) => (
              <li key={label}>
                <Link
                  href={href}
                  className="rounded-md text-sm text-gray-600 underline-offset-4 transition-colors hover:text-rose-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-gray-900">Contact</h2>
          <address className="flex flex-col gap-2 text-sm not-italic text-gray-600">
            <span className="max-w-[36ch]">{contact.address}</span>
            <a
              href={`mailto:${contact.email}`}
              className="w-fit rounded-md underline-offset-4 transition-colors hover:text-rose-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
            >
              {contact.email}
            </a>
            <a
              href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`}
              className="w-fit rounded-md tabular-nums underline-offset-4 transition-colors hover:text-rose-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
            >
              {contact.phone}
            </a>
          </address>
        </div>
      </div>

      <div className="mt-10 flex flex-col-reverse items-start gap-4 border-t border-gray-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500">© 2026 CULibSpace</p>

        <ul className="flex items-center gap-1">
          {socialLinks.map(({ label, href, Icon }) => (
            <li key={label}>
              <a
                href={href}
                aria-label={label}
                className="flex h-10 w-10 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              >
                <Icon className="h-5 w-5" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
