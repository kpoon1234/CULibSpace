import Image from 'next/image';
import Link from 'next/link';
import { FacebookIcon, InstagramIcon, LineIcon } from './socialIcons';

// Navigation only — no marketing or value-proposition copy lives down here; that belongs in the
// white body above (see DESIGN.md, Home page layout).
const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'Log In', href: '/login' },
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
    <footer className="bg-footer-bg px-6 py-14 sm:px-10 sm:py-16 lg:px-16 xl:px-24">
      <div className="grid grid-cols-2 gap-10 min-[860px]:grid-cols-3">
        <div className="flex flex-col gap-3">
          <Link
            href="/"
            className="flex w-fit items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chula-pink focus-visible:ring-offset-2 focus-visible:ring-offset-footer-bg"
          >
            <span className="relative h-9 w-9 flex-none">
              <Image src="/img/Logo.jpg" alt="" fill sizes="36px" className="object-contain" />
            </span>
            <span className="text-lg font-semibold text-white">CULibSpace</span>
          </Link>
          <p className="max-w-[42ch] text-sm text-white/70">
            Real-time table booking for the Chulalongkorn University library.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-white/50 uppercase">
            Navigation
          </h2>
          <ul className="flex flex-col gap-2">
            {navLinks.map(({ label, href }) => (
              <li key={label}>
                <Link
                  href={href}
                  className="rounded-md text-sm text-white/70 underline-offset-4 transition-colors hover:text-chula-pink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chula-pink focus-visible:ring-offset-2 focus-visible:ring-offset-footer-bg"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-white/50 uppercase">Contact</h2>
          <address className="flex flex-col gap-2 text-sm not-italic text-white/70">
            <span className="max-w-[36ch]">{contact.address}</span>
            <a
              href={`mailto:${contact.email}`}
              className="w-fit rounded-md underline-offset-4 transition-colors hover:text-chula-pink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chula-pink focus-visible:ring-offset-2 focus-visible:ring-offset-footer-bg"
            >
              {contact.email}
            </a>
            <a
              href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`}
              className="w-fit rounded-md tabular-nums underline-offset-4 transition-colors hover:text-chula-pink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chula-pink focus-visible:ring-offset-2 focus-visible:ring-offset-footer-bg"
            >
              {contact.phone}
            </a>
          </address>
        </div>
      </div>

      <div className="mt-10 flex flex-col-reverse items-start gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-white/50">© 2026 CULibSpace</p>

        <ul className="flex items-center gap-1">
          {socialLinks.map(({ label, href, Icon }) => (
            <li key={label}>
              <a
                href={href}
                aria-label={label}
                className="flex h-10 w-10 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-chula-pink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chula-pink"
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
