import { adminRequest } from './http';

// US7-4: the SystemConfig booking policy behind GET/PUT /api/system-config/policy.
// Ranges mirror SystemConfigService.validatePolicyInput on the backend, which
// stays the authority; these only stop obvious mistakes before a request.

const POLICY_PATH = '/api/system-config/policy';

export interface BookingPolicy {
  maxBookingDurationMinutes: number;
  maxAdvanceBookingDays: number;
  minScoreToBook: number;
  earlyCheckInMinutes: number;
  lateThresholdMinutes: number;
  ticketPriceSatang: number;
  ticketValidityHours: number;
  paymentCheckoutExpiryMinutes: number;
}

export type PolicyField = keyof BookingPolicy;

export interface PolicyFieldSpec {
  field: PolicyField;
  label: string;
  unit: string;
  help: string;
  min: number;
  max: number;
  /** Ticket price is stored in satang but edited in baht. */
  inBaht?: boolean;
}

export interface PolicyGroup {
  title: string;
  fields: PolicyFieldSpec[];
}

const MAX_PRISMA_INT = 2_147_483_647;

export const POLICY_GROUPS: PolicyGroup[] = [
  {
    title: 'Reservations',
    fields: [
      {
        field: 'maxBookingDurationMinutes',
        label: 'Longest booking',
        unit: 'minutes',
        help: 'How long a single reservation may last.',
        min: 15,
        max: 1440,
      },
      {
        field: 'maxAdvanceBookingDays',
        label: 'Book ahead up to',
        unit: 'days',
        help: 'How far in advance users can reserve.',
        min: 1,
        max: 365,
      },
      {
        field: 'minScoreToBook',
        label: 'Minimum behaviour score',
        unit: 'points',
        help: 'Users below this score cannot reserve.',
        min: 0,
        max: 100,
      },
    ],
  },
  {
    title: 'Check-in',
    fields: [
      {
        field: 'earlyCheckInMinutes',
        label: 'Early check-in',
        unit: 'minutes',
        help: 'How early before the start time users may check in.',
        min: 1,
        max: 180,
      },
      {
        field: 'lateThresholdMinutes',
        label: 'No-show after',
        unit: 'minutes',
        help: 'Late by this much and the booking is released as a no-show.',
        min: 1,
        max: 180,
      },
    ],
  },
  {
    title: 'Visitor tickets',
    fields: [
      {
        field: 'ticketPriceSatang',
        label: 'Ticket price',
        unit: 'THB',
        help: 'At least 10.00 THB, the minimum card payment.',
        min: 1000,
        max: MAX_PRISMA_INT,
        inBaht: true,
      },
      {
        field: 'ticketValidityHours',
        label: 'Ticket valid for',
        unit: 'hours',
        help: 'How long a paid ticket can be used.',
        min: 1,
        max: 720,
      },
      {
        field: 'paymentCheckoutExpiryMinutes',
        label: 'Payment window',
        unit: 'minutes',
        help: 'How long a visitor has to finish paying.',
        min: 30,
        max: 1440,
      },
    ],
  },
];

export const POLICY_FIELDS: PolicyFieldSpec[] = POLICY_GROUPS.flatMap((g) => g.fields);

export type PolicyDraft = Record<PolicyField, string>;
export type PolicyDraftErrors = Partial<Record<PolicyField, string>>;

export async function fetchPolicy(signal?: AbortSignal): Promise<BookingPolicy> {
  const { data } = await adminRequest<BookingPolicy>(POLICY_PATH, 'booking policy', { signal });
  if (!data) throw new Error('booking policy: empty response');
  return data;
}

/** Saves only the given fields; the backend validates them against the stored row. */
export async function updatePolicy(changes: Partial<BookingPolicy>): Promise<BookingPolicy> {
  const { data } = await adminRequest<BookingPolicy>(POLICY_PATH, 'save booking policy', {
    method: 'PUT',
    body: changes,
  });
  if (!data) throw new Error('save booking policy: empty response');
  return data;
}

function formatBaht(satang: number): string {
  return (satang / 100).toFixed(2);
}

export function draftFromPolicy(policy: BookingPolicy): PolicyDraft {
  const draft = {} as PolicyDraft;
  for (const spec of POLICY_FIELDS) {
    const value = policy[spec.field];
    draft[spec.field] = spec.inBaht ? formatBaht(value) : String(value);
  }
  return draft;
}

function parseField(spec: PolicyFieldSpec, raw: string): number | string {
  const text = raw.trim();
  if (!text) return 'Enter a value.';
  if (spec.inBaht) {
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return 'Enter an amount like 50 or 50.00.';
    const satang = Math.round(Number(text) * 100);
    if (satang < spec.min || satang > spec.max) {
      return `Enter between ${formatBaht(spec.min)} and ${formatBaht(spec.max)} THB.`;
    }
    return satang;
  }
  if (!/^\d+$/.test(text)) return 'Enter a whole number.';
  const value = Number(text);
  if (value < spec.min || value > spec.max) return `Enter between ${spec.min} and ${spec.max}.`;
  return value;
}

/**
 * Parses the form against the saved policy. Returns the changed fields only,
 * or per-field errors (including the late-vs-duration rule the backend enforces).
 */
export function diffPolicyDraft(
  draft: PolicyDraft,
  saved: BookingPolicy
): { changes: Partial<BookingPolicy>; errors: PolicyDraftErrors } {
  const changes: Partial<BookingPolicy> = {};
  const errors: PolicyDraftErrors = {};
  const next = { ...saved };

  for (const spec of POLICY_FIELDS) {
    const parsed = parseField(spec, draft[spec.field]);
    if (typeof parsed === 'string') {
      errors[spec.field] = parsed;
      continue;
    }
    next[spec.field] = parsed;
    if (parsed !== saved[spec.field]) changes[spec.field] = parsed;
  }

  if (
    !errors.lateThresholdMinutes &&
    !errors.maxBookingDurationMinutes &&
    next.lateThresholdMinutes >= next.maxBookingDurationMinutes
  ) {
    errors.lateThresholdMinutes = 'Must be shorter than the longest booking.';
  }

  return { changes: Object.keys(errors).length ? {} : changes, errors };
}
