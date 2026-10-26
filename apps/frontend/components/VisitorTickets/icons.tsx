// Same stroke vocabulary as components/HomeComponent/icons.tsx (24px box, 1.6 stroke).
interface IconProps {
  className?: string;
}

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
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
      {children}
    </svg>
  );
}

export function HourglassIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M7 3.5h10M7 20.5h10" />
      <path d="M8 3.5c0 4 4 5 4 8.5s-4 4.5-4 8.5M16 3.5c0 4-4 5-4 8.5s4 4.5 4 8.5" />
    </Svg>
  );
}

export function AlertIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5M12 16.4v.1" />
    </Svg>
  );
}

export function CircleCheckIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.2l2.4 2.4 4.6-5" />
    </Svg>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

export function ArchiveIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3.5" y="4.5" width="17" height="4" rx="1" />
      <path d="M5 8.5v10a1 1 0 001 1h12a1 1 0 001-1v-10M10 12.5h4" />
    </Svg>
  );
}

export function RefundIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 14l-4-4 4-4" />
      <path d="M5 10h9a5 5 0 010 10h-3" />
    </Svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

export function TicketIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.5 8a1.5 1.5 0 011.5-1.5h14A1.5 1.5 0 0120.5 8v2a2 2 0 000 4v2a1.5 1.5 0 01-1.5 1.5H5A1.5 1.5 0 013.5 16v-2a2 2 0 000-4z" />
      <path d="M14.5 6.5v11" strokeDasharray="1.5 2" />
    </Svg>
  );
}

export function RefreshIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M19.5 12a7.5 7.5 0 11-2.2-5.3" />
      <path d="M19.5 4.5v4h-4" />
    </Svg>
  );
}
