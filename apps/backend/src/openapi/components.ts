/**
 * Reusable OpenAPI components: data models (mirroring prisma/schema.prisma),
 * shared error responses, and security schemes.
 *
 * Enum values are the Prisma enum NAMES (e.g. "PENDING"), because that is what
 * Prisma serializes to JSON — not the @map database labels ("Pending").
 * Issue statuses are the exception: the issue API translates them to labels.
 */
import { ref, type JsonObject } from './helpers.js';

const dateTime = (example: string, extra: JsonObject = {}) => ({
  type: 'string',
  format: 'date-time',
  example,
  ...extra,
});

const nullable = (schema: JsonObject) => ({ ...schema, nullable: true });

export const schemas: JsonObject = {
  // ===================== Enums =====================
  UserType: {
    type: 'string',
    enum: ['UNIVERSITY', 'THAI', 'FOREIGN'],
    description: 'UNIVERSITY = Chula student/staff; THAI / FOREIGN = outside visitor.',
    example: 'UNIVERSITY',
  },
  AppRole: {
    type: 'string',
    enum: ['STUDENT', 'STAFF', 'OUTSIDER', 'ADMIN'],
    description:
      'Role carried in the JWT. Derived from the email domain: @student.chula.ac.th → STUDENT, @chula.ac.th → STAFF, others → OUTSIDER. Admins log in separately.',
    example: 'STUDENT',
  },
  TableStatus: {
    type: 'string',
    enum: ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'CLOSED'],
    example: 'AVAILABLE',
  },
  BookingStatus: {
    type: 'string',
    enum: ['PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
    description:
      'PENDING = reserved, not yet checked in; ACTIVE = checked in; NO_SHOW = auto-cancelled by the no-show worker.',
    example: 'PENDING',
  },
  TicketStatus: { type: 'string', enum: ['PAID', 'UNPAID'], example: 'PAID' },
  PaymentStatus: {
    type: 'string',
    enum: ['PENDING', 'UNCONFIRMED', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED'],
    description:
      'UNCONFIRMED = gateway outcome unknown (timeout); must be reconciled with the same idempotency key before a new purchase.',
    example: 'PENDING',
  },
  ZoneType: { type: 'string', enum: ['SILENT', 'GROUP', 'COMMON'], example: 'SILENT' },
  IssueStatusLabel: {
    type: 'string',
    enum: ['Pending', 'In Progress', 'Completed'],
    example: 'Pending',
  },

  // ===================== Common envelopes =====================
  ErrorResponse: {
    type: 'object',
    required: ['success', 'error'],
    properties: {
      success: { type: 'boolean', example: false },
      error: { type: 'string', description: 'Human-readable error message.' },
      code: {
        type: 'string',
        description: 'Machine-readable error code (present on most domain errors).',
        example: 'TABLE_ALREADY_BOOKED',
      },
    },
    additionalProperties: true,
  },
  MessageResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string' },
    },
  },
  PageMeta: {
    type: 'object',
    properties: {
      total: { type: 'integer', example: 42 },
      page: { type: 'integer', example: 1 },
      pageSize: { type: 'integer', example: 20 },
    },
  },

  // ===================== Users & auth =====================
  User: {
    type: 'object',
    description: 'Library user (student, staff, or outside visitor) as returned to clients.',
    properties: {
      uid: { type: 'integer', example: 12 },
      email: { type: 'string', format: 'email', example: '6731234521@student.chula.ac.th' },
      firstname: { type: 'string', maxLength: 50, example: 'Somchai' },
      lastname: { type: 'string', maxLength: 50, example: 'Jaidee' },
      phone: nullable({ type: 'string', pattern: '^\\d{10}$', example: '0812345678' }),
      imageUrl: nullable({
        type: 'string',
        maxLength: 255,
        example: 'https://www.gravatar.com/avatar/0?d=mp&f=y',
      }),
      isProfileComplete: { type: 'boolean', example: true },
      behaviourScore: { type: 'integer', minimum: 0, maximum: 100, example: 100 },
      consentedAt: nullable({
        type: 'string',
        format: 'date-time',
        description:
          'When the user accepted the Terms & PDPA (null = not yet). Returned by login and /me.',
        example: '2026-11-11T07:00:00.000Z',
      }),
      consentVersion: nullable({
        type: 'string',
        maxLength: 20,
        description: 'Terms & PDPA version the user accepted.',
        example: '2026-11',
      }),
      role: ref('AppRole'),
      userType: ref('UserType'),
      studentId: nullable({ type: 'string', pattern: '^\\d{10}$', example: '6731234521' }),
    },
  },
  CurrentUser: {
    description: 'Profile of the logged-in caller — a library user or an admin.',
    oneOf: [
      {
        allOf: [
          ref('User'),
          {
            type: 'object',
            properties: {
              citizenId: nullable({ type: 'string', pattern: '^\\d{13}$', example: null }),
              passportId: nullable({ type: 'string', pattern: '^[A-Za-z0-9]{9}$', example: null }),
            },
          },
        ],
      },
      ref('AdminUser'),
    ],
  },
  AdminUser: {
    type: 'object',
    properties: {
      adminId: { type: 'integer', example: 1 },
      email: { type: 'string', format: 'email', example: 'admin@culibspace.local' },
      firstname: { type: 'string', example: 'Library' },
      lastname: { type: 'string', example: 'Admin' },
      role: { type: 'string', enum: ['ADMIN'], example: 'ADMIN' },
    },
  },
  JwtPayload: {
    type: 'object',
    description: 'Decoded JWT claims attached to the request by `authenticateToken`.',
    properties: {
      uid: { type: 'integer', example: 12 },
      adminId: { type: 'integer', example: 1 },
      email: { type: 'string', example: '6731234521@student.chula.ac.th' },
      firstname: { type: 'string', example: 'Somchai' },
      lastname: { type: 'string', example: 'Jaidee' },
      role: ref('AppRole'),
      userType: ref('UserType'),
      studentId: { type: 'string', example: '6731234521' },
      isProfileComplete: { type: 'boolean', example: true },
      iat: { type: 'integer', example: 1762850000 },
      exp: { type: 'integer', example: 1763454800 },
    },
  },
  AuthResult: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string', example: 'Authentication and role mapping successful' },
      token: {
        type: 'string',
        description: 'JWT to send as `Authorization: Bearer <token>`. Default lifetime 7 days.',
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjEyfQ.sig',
      },
      user: ref('User'),
    },
  },
  ScoreHistoryEntry: {
    type: 'object',
    properties: {
      timestamp: dateTime('2026-11-10T09:15:00.000Z'),
      scoreChange: { type: 'integer', example: -10 },
      adminId: nullable({ type: 'integer', example: 1 }),
      adminName: { type: 'string', example: 'Library Admin' },
      reason: { type: 'string', example: 'No-show penalty' },
    },
  },
  ScoreResult: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      uid: { type: 'integer', example: 12 },
      behaviourScore: { type: 'integer', example: 90 },
      history: { type: 'array', items: ref('ScoreHistoryEntry') },
    },
  },
  AdminUserSearchItem: {
    type: 'object',
    properties: {
      uid: { type: 'integer', example: 12 },
      firstname: { type: 'string', example: 'Somchai' },
      lastname: { type: 'string', example: 'Jaidee' },
      email: { type: 'string', example: '6731234521@student.chula.ac.th' },
      phone: nullable({ type: 'string', example: '0812345678' }),
      userType: ref('UserType'),
      behaviourScore: { type: 'integer', example: 100 },
      isProfileComplete: { type: 'boolean', example: true },
      studentId: nullable({ type: 'string', example: '6731234521' }),
      citizenId: nullable({
        type: 'string',
        description: 'Masked Thai citizen ID (middle digits hidden).',
        example: null,
      }),
      passportId: nullable({ type: 'string', example: null }),
      imageUrl: nullable({ type: 'string' }),
      createdAt: dateTime('2026-08-01T03:00:00.000Z'),
    },
  },
  AuditLog: {
    type: 'object',
    description: 'One manual behaviour-score adjustment (ManageScore row).',
    properties: {
      id: { type: 'integer', example: 7 },
      timestamp: dateTime('2026-11-10T09:15:00.000Z'),
      scoreChange: { type: 'integer', example: -10 },
      reason: { type: 'string', example: 'Left belongings to hold the seat' },
      user: {
        type: 'object',
        properties: {
          uid: { type: 'integer', example: 12 },
          firstname: { type: 'string', example: 'Somchai' },
          lastname: { type: 'string', example: 'Jaidee' },
          email: { type: 'string', example: '6731234521@student.chula.ac.th' },
          studentId: nullable({ type: 'string', example: '6731234521' }),
        },
      },
      admin: {
        type: 'object',
        properties: {
          adminId: { type: 'integer', example: 1 },
          firstname: { type: 'string', example: 'Library' },
          lastname: { type: 'string', example: 'Admin' },
          email: { type: 'string', example: 'admin@culibspace.local' },
        },
      },
    },
  },

  // ===================== Zones, tables, layout =====================
  Zone: {
    type: 'object',
    properties: {
      zoneId: { type: 'integer', example: 1 },
      zoneType: ref('ZoneType'),
      createdAt: dateTime('2026-08-01T00:00:00.000Z'),
      updatedAt: dateTime('2026-08-01T00:00:00.000Z'),
    },
  },
  Table: {
    type: 'object',
    properties: {
      tableId: { type: 'integer', example: 5 },
      zoneId: { type: 'integer', example: 1 },
      status: ref('TableStatus'),
      numberOfSeat: { type: 'integer', example: 4 },
      plugCap: nullable({ type: 'integer', example: 2 }),
      hasTvScreen: { type: 'boolean', example: false },
      lockToken: nullable({ type: 'string', example: null }),
      lockedUntil: nullable(dateTime('2026-11-11T07:05:00.000Z')),
      lockedByUid: nullable({ type: 'integer', example: null }),
      createdAt: dateTime('2026-08-01T00:00:00.000Z'),
      updatedAt: dateTime('2026-11-11T07:00:00.000Z'),
    },
  },
  LayoutTable: {
    type: 'object',
    description: 'Table with status computed for the requested time window.',
    properties: {
      tableId: { type: 'integer', example: 5 },
      numberOfSeat: { type: 'integer', example: 4 },
      plugCap: nullable({ type: 'integer', example: 2 }),
      hasTvScreen: { type: 'boolean', example: false },
      lockedByUid: nullable({ type: 'integer', example: null }),
      status: ref('TableStatus'),
      isLocked: {
        type: 'boolean',
        description: 'A 5-minute booking hold is currently active on this table.',
        example: false,
      },
      bookedIntervals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            startDateTime: dateTime('2026-11-11T06:00:00.000Z'),
            endDateTime: dateTime('2026-11-11T08:00:00.000Z'),
            status: ref('BookingStatus'),
          },
        },
      },
    },
  },
  LayoutZone: {
    allOf: [
      ref('Zone'),
      { type: 'object', properties: { tables: { type: 'array', items: ref('LayoutTable') } } },
    ],
  },
  LayoutMeta: {
    type: 'object',
    properties: {
      targetStart: dateTime('2026-11-11T06:00:00.000Z'),
      targetEnd: dateTime('2026-11-11T08:00:00.000Z'),
      schedule: nullable({ type: 'object', additionalProperties: true }),
      scheduleSegments: { type: 'array', items: { type: 'object', additionalProperties: true } },
      timeZone: { type: 'string', example: 'Asia/Bangkok' },
      libraryClosed: { type: 'boolean', example: false },
      closedReason: { type: 'string', description: 'Present only when libraryClosed is true.' },
    },
  },

  // ===================== Bookings =====================
  Booking: {
    type: 'object',
    properties: {
      bookingId: { type: 'integer', example: 101 },
      uid: { type: 'integer', example: 12 },
      tableId: { type: 'integer', example: 5 },
      startDateTime: dateTime('2026-11-11T06:00:00.000Z'),
      endDateTime: dateTime('2026-11-11T08:00:00.000Z'),
      arriveTime: nullable(dateTime('2026-11-11T05:55:00.000Z')),
      status: ref('BookingStatus'),
      timestamp: dateTime('2026-11-11T04:30:00.000Z'),
      createdAt: dateTime('2026-11-11T04:30:00.000Z'),
      updatedAt: dateTime('2026-11-11T04:30:00.000Z'),
    },
  },
  BookingWithTable: {
    allOf: [
      ref('Booking'),
      {
        type: 'object',
        properties: {
          table: {
            allOf: [ref('Table'), { type: 'object', properties: { zone: ref('Zone') } }],
          },
        },
      },
    ],
  },
  ActiveBooking: {
    allOf: [
      ref('BookingWithTable'),
      {
        type: 'object',
        properties: {
          checkInWindow: {
            type: 'object',
            properties: {
              earlyMinutes: { type: 'integer', example: 15 },
              lateMinutes: { type: 'integer', example: 15 },
            },
          },
          cancellation: {
            type: 'object',
            properties: {
              allowed: { type: 'boolean', example: true },
              deadline: dateTime('2026-11-11T05:45:00.000Z'),
              reason: { type: 'string', example: 'Checked-in reservations cannot be cancelled.' },
            },
          },
        },
      },
    ],
  },
  BookingWindowInput: {
    type: 'object',
    required: ['tableId', 'startDateTime', 'endDateTime'],
    properties: {
      tableId: { type: 'integer', minimum: 1, example: 5 },
      startDateTime: {
        type: 'string',
        format: 'date-time',
        description: 'ISO 8601 with timezone offset.',
        example: '2026-11-12T13:00:00+07:00',
      },
      endDateTime: {
        type: 'string',
        format: 'date-time',
        example: '2026-11-12T15:00:00+07:00',
      },
    },
  },
  LockResult: {
    type: 'object',
    properties: {
      lockToken: {
        type: 'string',
        format: 'uuid',
        example: '3f6c2a1e-8d7b-4c5a-9e0f-1b2c3d4e5f60',
      },
      lockedUntil: dateTime('2026-11-11T07:05:00.000Z'),
    },
  },
  BookingValidationResult: {
    type: 'object',
    properties: {
      valid: { type: 'boolean', example: true },
      user: {
        type: 'object',
        properties: {
          uid: { type: 'integer', example: 12 },
          firstname: { type: 'string', example: 'Somchai' },
          lastname: { type: 'string', example: 'Jaidee' },
          behaviourScore: { type: 'integer', example: 100 },
          userType: ref('UserType'),
        },
      },
      table: {
        type: 'object',
        properties: {
          tableId: { type: 'integer', example: 5 },
          numberOfSeat: { type: 'integer', example: 4 },
          zoneId: { type: 'integer', example: 1 },
          status: ref('TableStatus'),
        },
      },
      timeWindow: {
        type: 'object',
        properties: {
          startDateTime: dateTime('2026-11-12T06:00:00.000Z'),
          endDateTime: dateTime('2026-11-12T08:00:00.000Z'),
          durationMinutes: { type: 'integer', example: 120 },
        },
      },
      schedule: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'Regular hours' },
          openTime: { type: 'string', example: '08:00' },
          closeTime: { type: 'string', example: '21:00' },
          is24Hours: { type: 'boolean', example: false },
        },
      },
    },
  },

  // ===================== Tickets & payments =====================
  TicketPurchaseResult: {
    type: 'object',
    properties: {
      ticketId: { type: 'integer', example: 31 },
      paymentId: { type: 'integer', example: 44 },
      checkoutUrl: nullable({
        type: 'string',
        format: 'uri',
        description: 'Stripe hosted Checkout URL — redirect the visitor here to pay.',
        example: 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3',
      }),
      amountSatang: { type: 'integer', description: '1 THB = 100 satang.', example: 5000 },
      currency: { type: 'string', example: 'THB' },
      paymentStatus: ref('PaymentStatus'),
      ticketStatus: ref('TicketStatus'),
      expiresAt: dateTime('2026-11-11T07:30:00.000Z', {
        description: 'When this checkout attempt expires (not the ticket).',
      }),
      ticketStartDateTime: dateTime('2026-11-11T07:00:00.000Z'),
      ticketEndDateTime: dateTime('2026-11-11T09:00:00.000Z'),
      replayed: {
        type: 'boolean',
        description: 'true = an existing purchase was returned for this idempotency key.',
        example: false,
      },
    },
  },
  TicketPayment: {
    type: 'object',
    properties: {
      paymentId: { type: 'integer', example: 44 },
      amountSatang: { type: 'integer', example: 5000 },
      amountBaht: { type: 'number', example: 50 },
      currency: { type: 'string', example: 'THB' },
      status: ref('PaymentStatus'),
      gateway: { type: 'string', example: 'stripe' },
      ticketValidityHours: { type: 'integer', example: 2 },
      paidAt: nullable(dateTime('2026-11-11T07:02:10.000Z')),
      createdAt: dateTime('2026-11-11T07:00:00.000Z'),
    },
  },
  Ticket: {
    type: 'object',
    properties: {
      ticketId: { type: 'integer', example: 31 },
      uid: { type: 'integer', example: 27 },
      status: {
        type: 'string',
        enum: ['PAID', 'UNPAID', 'EXPIRED'],
        description: 'EXPIRED is computed: a PAID ticket past its endDateTime.',
        example: 'PAID',
      },
      startDateTime: dateTime('2026-11-11T07:02:10.000Z'),
      endDateTime: dateTime('2026-11-11T09:02:10.000Z'),
      createdAt: dateTime('2026-11-11T07:00:00.000Z'),
      validTimePeriod: {
        type: 'object',
        properties: {
          startDateTime: dateTime('2026-11-11T07:02:10.000Z'),
          endDateTime: dateTime('2026-11-11T09:02:10.000Z'),
          isValidNow: { type: 'boolean', example: true },
          isExpired: { type: 'boolean', example: false },
          remainingSeconds: { type: 'integer', example: 5400 },
        },
      },
      payments: { type: 'array', items: ref('TicketPayment') },
    },
  },

  // ===================== Issues =====================
  IssueCreated: {
    type: 'object',
    properties: {
      issueId: { type: 'integer', example: 9 },
      time: dateTime('2026-11-11T07:10:00.000Z'),
      tableId: { type: 'integer', example: 5 },
      issueInformation: { type: 'string', example: 'Power outlet is not working' },
      status: ref('IssueStatusLabel'),
    },
  },
  AdminIssue: {
    type: 'object',
    properties: {
      issueId: { type: 'integer', example: 9 },
      time: dateTime('2026-11-11T07:10:00.000Z'),
      issueInformation: { type: 'string', example: 'Power outlet is not working' },
      status: ref('IssueStatusLabel'),
      blocksTable: {
        type: 'boolean',
        description: 'When true, the table is CLOSED for booking until the issue is resolved.',
        example: false,
      },
      notes: { type: 'string', description: 'Latest admin note.', example: '' },
      user: {
        type: 'object',
        properties: {
          uid: { type: 'integer', example: 12 },
          firstname: { type: 'string', example: 'Somchai' },
          lastname: { type: 'string', example: 'Jaidee' },
          email: { type: 'string', example: '6731234521@student.chula.ac.th' },
        },
      },
      table: {
        type: 'object',
        properties: {
          tableId: { type: 'integer', example: 5 },
          zoneId: { type: 'integer', example: 1 },
          zoneType: ref('ZoneType'),
        },
      },
    },
  },

  // ===================== Schedules & config =====================
  OperatingSchedule: {
    type: 'object',
    properties: {
      scheduleId: { type: 'integer', example: 3 },
      name: { type: 'string', maxLength: 100, example: 'Midterm exam period 2/2569' },
      startDate: dateTime('2026-12-14T00:00:00.000Z', {
        description: 'Calendar date (time is 00:00Z).',
      }),
      endDate: dateTime('2026-12-25T00:00:00.000Z'),
      openTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$', example: '08:00' },
      closeTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$', example: '21:00' },
      is24Hours: { type: 'boolean', example: true },
      isClosed: { type: 'boolean', example: false },
      priority: {
        type: 'integer',
        minimum: 1,
        description:
          '1 = regular, 2 = exam period, 3 = holiday / closure. Highest priority wins on a date.',
        example: 2,
      },
      createdAt: dateTime('2026-11-01T00:00:00.000Z'),
      updatedAt: dateTime('2026-11-01T00:00:00.000Z'),
    },
  },
  OperatingScheduleInput: {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { type: 'string', maxLength: 100, example: 'Midterm exam period 2/2569' },
      startDate: { type: 'string', format: 'date', example: '2026-12-14' },
      endDate: { type: 'string', format: 'date', example: '2026-12-25' },
      openTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$', example: '08:00' },
      closeTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$', example: '21:00' },
      is24Hours: { type: 'boolean', example: true },
      isClosed: { type: 'boolean', example: false },
      priority: { type: 'integer', minimum: 1, example: 2 },
    },
  },
  BookingLimits: {
    type: 'object',
    properties: {
      maxBookingDurationMinutes: { type: 'integer', example: 120 },
      maxAdvanceBookingDays: { type: 'integer', example: 7 },
      minScoreToBook: { type: 'integer', example: 50 },
      earlyCheckInMinutes: { type: 'integer', example: 15 },
      lateThresholdMinutes: { type: 'integer', example: 15 },
    },
  },
  SystemPolicy: {
    allOf: [
      { type: 'object', properties: { configId: { type: 'integer', example: 1 } } },
      ref('BookingLimits'),
      {
        type: 'object',
        properties: {
          ticketPriceSatang: { type: 'integer', minimum: 1000, example: 5000 },
          ticketValidityHours: { type: 'integer', example: 2 },
          paymentCheckoutExpiryMinutes: { type: 'integer', minimum: 30, example: 30 },
        },
      },
    ],
  },
  SystemPolicyInput: {
    type: 'object',
    description: 'Any subset of the policy fields. Unknown fields are rejected.',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      maxBookingDurationMinutes: { type: 'integer', minimum: 15, maximum: 1440, example: 180 },
      maxAdvanceBookingDays: { type: 'integer', minimum: 1, maximum: 365, example: 7 },
      minScoreToBook: { type: 'integer', minimum: 0, maximum: 100, example: 50 },
      earlyCheckInMinutes: { type: 'integer', minimum: 1, maximum: 180, example: 15 },
      lateThresholdMinutes: {
        type: 'integer',
        minimum: 1,
        maximum: 180,
        description: 'Must be strictly less than maxBookingDurationMinutes.',
        example: 15,
      },
      ticketPriceSatang: { type: 'integer', minimum: 1000, maximum: 2147483647, example: 5000 },
      ticketValidityHours: { type: 'integer', minimum: 1, maximum: 720, example: 2 },
      paymentCheckoutExpiryMinutes: { type: 'integer', minimum: 30, maximum: 1440, example: 30 },
    },
  },
};

export const responses: JsonObject = {
  Unauthorized: {
    description: 'Missing, invalid, or expired Bearer token.',
    content: {
      'application/json': {
        schema: ref('ErrorResponse'),
        example: { success: false, error: 'Unauthorized: Missing or invalid Bearer token' },
      },
    },
  },
  ForbiddenRole: {
    description: 'Authenticated, but the token role is not allowed on this endpoint.',
    content: {
      'application/json': {
        schema: ref('ErrorResponse'),
        example: { success: false, error: 'Forbidden: Access restricted to roles: [ADMIN]' },
      },
    },
  },
  InternalError: {
    description: 'Unexpected server or database error.',
    content: {
      'application/json': {
        schema: ref('ErrorResponse'),
        example: { success: false, error: 'Internal server error' },
      },
    },
  },
};

export const securitySchemes: JsonObject = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'JWT from `POST /api/auth/login`, `POST /api/auth/admin-login`, or the Google OAuth callback. Paste the token only (no "Bearer " prefix).',
  },
  cookieAuth: {
    type: 'apiKey',
    in: 'cookie',
    name: 'connect.sid',
    description: 'express-session cookie set by the Google OAuth flow (`GET /api/auth/google`).',
  },
  stripeSignature: {
    type: 'apiKey',
    in: 'header',
    name: 'Stripe-Signature',
    description: 'HMAC signature Stripe attaches to webhook deliveries. Not a user credential.',
  },
};
