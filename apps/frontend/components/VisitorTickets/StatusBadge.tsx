import type { TicketPaymentStatus } from '@/lib/tickets';
import type { TicketPhase } from './ticketState';
import {
  AlertIcon,
  ArchiveIcon,
  CircleCheckIcon,
  ClockIcon,
  HourglassIcon,
  RefundIcon,
} from './icons';

type Tone = {
  label: string;
  className: string;
  Icon: (props: { className?: string }) => React.JSX.Element;
};

/** Every state carries a word and an icon, never colour alone. Spruce is the
 *  app's "available / in use" colour, brass marks "waiting on something",
 *  scarlet is reserved for a payment that did not go through, and everything
 *  finished drops back to the warm neutrals. */
const PHASES: Record<TicketPhase, Tone> = {
  active: {
    label: 'Active',
    className: 'bg-spruce/10 text-spruce ring-spruce/25',
    Icon: CircleCheckIcon,
  },
  upcoming: {
    label: 'Upcoming',
    className: 'bg-gray-100 text-gray-800 ring-gray-300',
    Icon: ClockIcon,
  },
  awaiting: {
    label: 'Confirming payment',
    className: 'bg-brass-50 text-brass-800 ring-brass-200',
    Icon: HourglassIcon,
  },
  unpaid: {
    label: 'Not paid',
    className: 'bg-red-50 text-red-700 ring-red-200',
    Icon: AlertIcon,
  },
  expired: {
    label: 'Expired',
    className: 'bg-gray-100 text-gray-600 ring-gray-200',
    Icon: ArchiveIcon,
  },
  refunded: {
    label: 'Refunded',
    className: 'bg-gray-100 text-gray-700 ring-gray-200',
    Icon: RefundIcon,
  },
};

const PAYMENTS: Record<TicketPaymentStatus, Tone> = {
  PAID: { label: 'Paid', className: 'text-spruce', Icon: CircleCheckIcon },
  PENDING: { label: 'Pending', className: 'text-brass-700', Icon: HourglassIcon },
  UNCONFIRMED: { label: 'Being checked', className: 'text-brass-700', Icon: HourglassIcon },
  FAILED: { label: 'Failed', className: 'text-red-600', Icon: AlertIcon },
  EXPIRED: { label: 'Checkout expired', className: 'text-gray-600', Icon: ArchiveIcon },
  REFUNDED: { label: 'Refunded', className: 'text-gray-700', Icon: RefundIcon },
};

export function TicketStatusBadge({ phase }: { phase: TicketPhase }) {
  const { label, className, Icon } = PHASES[phase];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ${className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

export function PaymentStatusLabel({ status }: { status: TicketPaymentStatus }) {
  const { label, className, Icon } = PAYMENTS[status] ?? PAYMENTS.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${className}`}>
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </span>
  );
}
