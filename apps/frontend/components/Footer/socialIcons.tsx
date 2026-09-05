interface IconProps {
  className?: string;
}

export function FacebookIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M14.8 7.6h2.1V4.9h-2.4c-2.2 0-3.5 1.4-3.5 3.6v2h-2.3v2.8h2.3v6.8h3v-6.8h2.4l.4-2.8h-2.8V9c0-1 .3-1.4.8-1.4z" />
    </svg>
  );
}

export function InstagramIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <circle cx="12" cy="12" r="3.6" />
      <circle cx="16.7" cy="7.3" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LineIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 10.4c0-3.6-3.6-6.5-8-6.5s-8 2.9-8 6.5c0 3.2 2.8 5.9 6.7 6.4.9.2.8.6.6 1.9-.1.2-.3 1 .9.5s5-2.9 6.8-5c1.3-1.4 1.9-2.9 1.9-4.4z" />
    </svg>
  );
}
