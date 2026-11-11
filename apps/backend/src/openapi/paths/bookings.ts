import {
  R,
  bearer,
  body,
  dataEnvelope,
  error,
  json,
  pathParam,
  publicAccess,
  queryParam,
  ref,
  type JsonObject,
} from '../helpers.js';

const userExample = {
  uid: 12,
  email: '6731234521@student.chula.ac.th',
  firstname: 'Somchai',
  lastname: 'Jaidee',
  phone: '0812345678',
  imageUrl: 'https://cdn.example.com/avatars/12.png',
  isProfileComplete: true,
  behaviourScore: 100,
  role: 'STUDENT',
  userType: 'UNIVERSITY',
  studentId: '6731234521',
};

const profileResult = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    user: ref('User'),
  },
};

const bookingExample = {
  bookingId: 101,
  uid: 12,
  tableId: 5,
  startDateTime: '2026-11-12T06:00:00.000Z',
  endDateTime: '2026-11-12T08:00:00.000Z',
  arriveTime: null,
  status: 'PENDING',
  timestamp: '2026-11-11T04:30:00.000Z',
  createdAt: '2026-11-11T04:30:00.000Z',
  updatedAt: '2026-11-11T04:30:00.000Z',
};

const bookingWithTableExample = {
  ...bookingExample,
  table: {
    tableId: 5,
    zoneId: 1,
    status: 'RESERVED',
    numberOfSeat: 4,
    plugCap: 2,
    hasTvScreen: false,
    lockToken: null,
    lockedUntil: null,
    lockedByUid: null,
    zone: { zoneId: 1, zoneType: 'SILENT' },
  },
};

const bookingIdParam = pathParam('bookingId', 'Booking ID', 101);

export const profilePaths: JsonObject = {
  '/api/profile': {
    patch: {
      tags: ['Profile'],
      operationId: 'updateProfile',
      summary: 'Update my profile',
      description:
        'Partial update. Blank strings are ignored. Non-digit characters are stripped from `phone`, which must then have exactly 10 digits.',
      security: bearer,
      requestBody: body(
        {
          type: 'object',
          properties: {
            firstname: { type: 'string', maxLength: 50 },
            lastname: { type: 'string', maxLength: 50 },
            phone: { type: 'string', example: '081-234-5678' },
            imageUrl: { type: 'string', maxLength: 255 },
          },
        },
        { firstname: 'Somchai', phone: '081-234-5678' }
      ),
      responses: {
        200: json('Profile updated', profileResult, {
          success: true,
          message: 'Profile updated successfully',
          user: userExample,
        }),
        400: error('Invalid phone number', {
          status: 400,
          error: 'Phone number must contain exactly 10 digits',
        }),
        401: R.unauthorized,
        404: error('User no longer exists', { status: 404, error: 'User not found' }),
        409: error('Phone already used', {
          status: 409,
          error: 'This phone number is already registered to another account.',
        }),
        500: R.internal,
      },
    },
  },
  '/api/profile/image': {
    patch: {
      tags: ['Profile'],
      operationId: 'updateProfileImage',
      summary: 'Change my profile picture',
      description:
        'Blocked while the user has a PENDING or ACTIVE booking that has not ended, because staff use the photo to verify the person at the seat.',
      security: bearer,
      requestBody: body(
        {
          type: 'object',
          required: ['imageUrl'],
          properties: { imageUrl: { type: 'string', minLength: 1, maxLength: 255 } },
        },
        { imageUrl: 'https://cdn.example.com/avatars/12.png' }
      ),
      responses: {
        200: json('Image updated', profileResult, {
          success: true,
          message: 'Profile image updated successfully',
          user: userExample,
        }),
        400: error('Active booking exists, or empty URL', {
          error:
            'Cannot update profile image while you have an active booking. Please complete or cancel your current booking first.',
        }),
        401: R.unauthorized,
        404: error('User no longer exists', { error: 'User not found' }),
        500: R.internal,
      },
    },
  },
};

export const layoutPaths: JsonObject = {
  '/api/tables/layout': {
    get: {
      tags: ['Layout'],
      operationId: 'getLayout',
      summary: 'Get the floor plan with live table status',
      description:
        'Returns every zone and its tables. Status is computed for a target window: `startDateTime`/`endDateTime` (ISO), or `date` + `timeSlot` (Asia/Bangkok), or "now" if neither is given. ' +
        'Explicit windows are checked against operating hours and booking limits. Without a window on a closed day, tables are still returned with `meta.libraryClosed = true`. ' +
        'Responses are `Cache-Control: no-store` for polling.',
      security: publicAccess,
      parameters: [
        queryParam('zoneType', 'Filter by zone (case-insensitive).', ref('ZoneType'), 'SILENT'),
        queryParam('plugCap', 'Minimum number of power plugs.', { type: 'integer', minimum: 0 }, 1),
        queryParam('hasTvScreen', 'Filter tables with/without a TV screen.', { type: 'boolean' }),
        queryParam('minSeats', 'Minimum number of seats.', { type: 'integer', minimum: 1 }, 2),
        queryParam(
          'startDateTime',
          'Window start, ISO 8601 with offset.',
          { type: 'string', format: 'date-time' },
          '2026-11-12T13:00:00+07:00'
        ),
        queryParam(
          'endDateTime',
          'Window end, ISO 8601 with offset.',
          { type: 'string', format: 'date-time' },
          '2026-11-12T15:00:00+07:00'
        ),
        queryParam('date', 'Calendar date in Asia/Bangkok (use with timeSlot).', {
          type: 'string',
          format: 'date',
        }),
        queryParam('timeSlot', '`HH:MM` or `HH:MM-HH:MM`; requires `date`.', {
          type: 'string',
          pattern: '^\\d{2}:\\d{2}(-\\d{2}:\\d{2})?$',
        }),
      ],
      responses: {
        200: json(
          'Layout with computed status',
          {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'array', items: ref('LayoutZone') },
              meta: ref('LayoutMeta'),
            },
          },
          {
            success: true,
            data: [
              {
                zoneId: 1,
                zoneType: 'SILENT',
                tables: [
                  {
                    tableId: 5,
                    numberOfSeat: 4,
                    plugCap: 2,
                    hasTvScreen: false,
                    status: 'RESERVED',
                    isLocked: false,
                    lockedByUid: null,
                    bookedIntervals: [
                      {
                        startDateTime: '2026-11-12T06:00:00.000Z',
                        endDateTime: '2026-11-12T08:00:00.000Z',
                        status: 'PENDING',
                      },
                    ],
                  },
                ],
              },
            ],
            meta: {
              targetStart: '2026-11-12T06:00:00.000Z',
              targetEnd: '2026-11-12T08:00:00.000Z',
              schedule: null,
              scheduleSegments: [],
              timeZone: 'Asia/Bangkok',
              libraryClosed: false,
            },
          }
        ),
        400: error('Invalid or out-of-policy time window', {
          code: 'INVALID_TIME_WINDOW',
          error: 'Invalid timeSlot. Use HH:MM or HH:MM-HH:MM.',
        }),
        500: json('Unexpected error', ref('ErrorResponse'), {
          success: false,
          error: 'Failed to fetch table layout',
        }),
        503: error('Booking policy unavailable', {
          code: 'BOOKING_SETTINGS_UNAVAILABLE',
          error: 'Booking settings are temporarily unavailable.',
        }),
      },
    },
  },
};

const domainErr = (code: string, msg: string) => ({ code, error: msg });

export const bookingPaths: JsonObject = {
  '/api/bookings/my-history': {
    get: {
      tags: ['Bookings'],
      operationId: 'getMyBookingHistory',
      summary: 'List my past bookings',
      description:
        'COMPLETED, CANCELLED, and NO_SHOW bookings, plus ACTIVE bookings whose end time has passed (shown as COMPLETED). Newest start time first.',
      security: bearer,
      responses: {
        200: json(
          'Booking history',
          dataEnvelope({ type: 'array', items: ref('BookingWithTable') }),
          {
            success: true,
            data: [{ ...bookingWithTableExample, status: 'COMPLETED' }],
          }
        ),
        401: R.unauthorized,
        500: R.internal,
      },
    },
  },
  '/api/bookings/my-active': {
    get: {
      tags: ['Bookings'],
      operationId: 'getMyActiveBooking',
      summary: 'Get my current booking',
      description:
        'The caller’s PENDING or ACTIVE booking that has not ended yet, with the check-in window and cancellation eligibility. `data` is `null` when there is none.',
      security: bearer,
      responses: {
        200: json(
          'Active booking or null',
          dataEnvelope({ ...ref('ActiveBooking'), nullable: true }),
          {
            success: true,
            data: {
              ...bookingWithTableExample,
              checkInWindow: { earlyMinutes: 15, lateMinutes: 15 },
              cancellation: { allowed: true, deadline: '2026-11-12T05:45:00.000Z' },
            },
          }
        ),
        401: R.unauthorized,
        500: R.internal,
      },
    },
  },
  '/api/bookings/lock': {
    post: {
      tags: ['Bookings'],
      operationId: 'lockTable',
      summary: 'Hold a table for 5 minutes',
      description:
        'Step 1 of booking. Puts a temporary hold on a table so nobody else can book it while the user confirms. ' +
        'If a time window is given, it is also checked for overlapping bookings. Keep the returned `lockToken` for `POST /api/bookings`.',
      security: bearer,
      requestBody: body(
        {
          type: 'object',
          required: ['tableId'],
          properties: {
            tableId: { type: 'integer', minimum: 1 },
            startDateTime: { type: 'string', format: 'date-time' },
            endDateTime: { type: 'string', format: 'date-time' },
          },
        },
        {
          tableId: 5,
          startDateTime: '2026-11-12T13:00:00+07:00',
          endDateTime: '2026-11-12T15:00:00+07:00',
        }
      ),
      responses: {
        200: json('Hold acquired', dataEnvelope(ref('LockResult')), {
          success: true,
          data: {
            lockToken: '3f6c2a1e-8d7b-4c5a-9e0f-1b2c3d4e5f60',
            lockedUntil: '2026-11-11T07:05:00.000Z',
          },
        }),
        400: error(
          'Invalid tableId / time window, or table closed',
          domainErr('TABLE_CLOSED', 'This table is currently closed for maintenance.')
        ),
        401: R.unauthorized,
        403: error(
          'Profile incomplete or score too low',
          domainErr(
            'PROFILE_INCOMPLETE',
            'Please complete your profile onboarding before making a reservation'
          )
        ),
        404: error('Table not found', domainErr('TABLE_NOT_FOUND', 'Table not found.')),
        409: error(
          'Already held or booked by someone else',
          domainErr('TABLE_LOCKED', 'Table is currently on hold, closed, or unavailable.')
        ),
        500: R.internal,
      },
    },
  },
  '/api/bookings/unlock': {
    post: {
      tags: ['Bookings'],
      operationId: 'unlockTable',
      summary: 'Release my table hold',
      description:
        'Releases a hold early (e.g. the user backs out). Only the user who owns the hold can release it.',
      security: bearer,
      requestBody: body(
        {
          type: 'object',
          required: ['tableId', 'lockToken'],
          properties: { tableId: { type: 'integer', minimum: 1 }, lockToken: { type: 'string' } },
        },
        { tableId: 5, lockToken: '3f6c2a1e-8d7b-4c5a-9e0f-1b2c3d4e5f60' }
      ),
      responses: {
        200: json('Released', ref('MessageResponse'), {
          success: true,
          message: 'Lock released successfully',
        }),
        400: error(
          'Missing fields, or lock not held by this user',
          domainErr(
            'INVALID_LOCK',
            'Invalid lock token, unauthorized, or the lock has already expired.'
          )
        ),
        401: R.unauthorized,
        500: R.internal,
      },
    },
  },
  '/api/bookings/validate': {
    post: {
      tags: ['Bookings'],
      operationId: 'validateBooking',
      summary: 'Pre-check a booking against all rules',
      description:
        'Dry run of the booking rules without creating anything: operating hours, max duration, advance-booking limit, minimum behaviour score, table status / hold, overlap with other bookings, one-booking-per-user, and (for outside visitors) a paid ticket covering the window.',
      security: bearer,
      requestBody: body(
        {
          allOf: [
            ref('BookingWindowInput'),
            {
              type: 'object',
              properties: {
                lockToken: {
                  type: 'string',
                  description: 'Optional; if given, the hold must belong to the caller.',
                },
              },
            },
          ],
        },
        {
          tableId: 5,
          startDateTime: '2026-11-12T13:00:00+07:00',
          endDateTime: '2026-11-12T15:00:00+07:00',
        }
      ),
      responses: {
        200: json('All rules pass', dataEnvelope(ref('BookingValidationResult')), {
          success: true,
          data: {
            valid: true,
            user: {
              uid: 12,
              firstname: 'Somchai',
              lastname: 'Jaidee',
              behaviourScore: 100,
              userType: 'UNIVERSITY',
            },
            table: { tableId: 5, numberOfSeat: 4, zoneId: 1, status: 'AVAILABLE' },
            timeWindow: {
              startDateTime: '2026-11-12T06:00:00.000Z',
              endDateTime: '2026-11-12T08:00:00.000Z',
              durationMinutes: 120,
            },
            schedule: {
              name: 'Regular hours',
              openTime: '08:00',
              closeTime: '21:00',
              is24Hours: false,
            },
          },
        }),
        400: error(
          'Invalid window, outside hours, too long, or table closed',
          domainErr(
            'BOOKING_DURATION_EXCEEDED',
            'Requested duration exceeds maximum allowed duration of 120 minutes'
          )
        ),
        401: R.unauthorized,
        403: error(
          'Score too low, profile incomplete, no ticket, or hold owned by another user',
          domainErr(
            'TICKET_REQUIRED',
            'External visitors (Thai / Foreign) require an active paid ticket covering the requested reservation time window'
          )
        ),
        404: error(
          'User or table not found',
          domainErr('TABLE_NOT_FOUND', 'Table with ID 5 not found')
        ),
        409: error(
          'Conflicting booking or hold',
          domainErr(
            'USER_BOOKING_OVERLAP',
            'You already have an active or pending reservation during this time window (1-booking-per-user policy)'
          )
        ),
        500: R.internal,
        504: error(
          'Database timed out',
          domainErr(
            'DATABASE_TIMEOUT',
            'Database query timed out after 5000ms during concurrent reservation validation. Please try again.'
          )
        ),
      },
    },
  },
  '/api/bookings': {
    post: {
      tags: ['Bookings'],
      operationId: 'createBooking',
      summary: 'Confirm a booking',
      description:
        'Step 2 of booking. Re-runs every validation rule in one transaction, creates a PENDING booking, and releases the hold. Requires the `lockToken` from `POST /api/bookings/lock`.',
      security: bearer,
      requestBody: body(
        {
          allOf: [
            ref('BookingWindowInput'),
            {
              type: 'object',
              required: ['lockToken'],
              properties: { lockToken: { type: 'string' } },
            },
          ],
        },
        {
          tableId: 5,
          startDateTime: '2026-11-12T13:00:00+07:00',
          endDateTime: '2026-11-12T15:00:00+07:00',
          lockToken: '3f6c2a1e-8d7b-4c5a-9e0f-1b2c3d4e5f60',
        }
      ),
      responses: {
        201: json('Booking created', dataEnvelope(ref('Booking')), {
          success: true,
          data: bookingExample,
        }),
        400: error('Missing fields or a rule violation', {
          error: 'Missing or invalid required fields',
        }),
        401: R.unauthorized,
        403: error(
          'Rule violation tied to the user',
          domainErr(
            'INSUFFICIENT_BEHAVIOUR_SCORE',
            'Your behavior credit score (40) is below the minimum required (50) to make a reservation'
          )
        ),
        404: error('User or table not found', domainErr('TABLE_NOT_FOUND', 'Table not found.')),
        409: error(
          'Hold expired or the slot was taken',
          domainErr(
            'LOCK_EXPIRED',
            'Your hold on this table expired before the booking could be finalized.'
          )
        ),
        500: R.internal,
      },
    },
  },
  '/api/bookings/{bookingId}/check-in': {
    post: {
      tags: ['Bookings'],
      operationId: 'checkIn',
      summary: 'Check in to my booking',
      description:
        'Turns a PENDING booking ACTIVE and records the arrival time. Allowed only between (start − earlyCheckInMinutes) and (start + lateThresholdMinutes). If too early, the error includes `checkInAvailableAt`.',
      security: bearer,
      parameters: [bookingIdParam],
      responses: {
        200: json(
          'Checked in',
          {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              data: ref('BookingWithTable'),
            },
          },
          {
            success: true,
            message: 'Check-in successful',
            data: {
              ...bookingWithTableExample,
              status: 'ACTIVE',
              arriveTime: '2026-11-12T05:55:00.000Z',
            },
          }
        ),
        400: error('Invalid ID, wrong status, or outside the check-in window', {
          code: 'CHECK_IN_TOO_EARLY',
          error: 'It is too early to check in. Check-in opens at 2026-11-12T05:45:00.000Z',
          checkInAvailableAt: '2026-11-12T05:45:00.000Z',
        }),
        401: R.unauthorized,
        403: error(
          'Booking belongs to someone else',
          domainErr('UNAUTHORIZED_CHECKIN', 'Not allowed to check in for this booking')
        ),
        404: error('Booking not found', domainErr('BOOKING_NOT_FOUND', 'Booking not found')),
        409: error(
          'Booking changed concurrently',
          domainErr(
            'BOOKING_STATUS_CHANGED',
            'This booking changed while you were checking in. Please refresh and try again.'
          )
        ),
        500: R.internal,
      },
    },
  },
  '/api/bookings/{bookingId}/cancel': {
    post: {
      tags: ['Bookings'],
      operationId: 'cancelBooking',
      summary: 'Cancel my booking (no penalty)',
      description:
        'Cancels a PENDING booking before the check-in window opens. No behaviour-score penalty. The table status is recalculated and the caller’s hold is cleared.',
      security: bearer,
      parameters: [bookingIdParam],
      responses: {
        200: json(
          'Cancelled',
          {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              data: ref('BookingWithTable'),
            },
          },
          {
            success: true,
            message: 'Reservation cancelled successfully',
            data: { ...bookingWithTableExample, status: 'CANCELLED' },
          }
        ),
        400: error(
          'Invalid ID, not PENDING, or deadline passed',
          domainErr(
            'CANCELLATION_DEADLINE_PASSED',
            'The cancellation deadline has passed. This reservation can no longer be cancelled.'
          )
        ),
        401: R.unauthorized,
        403: error(
          'Booking belongs to someone else',
          domainErr(
            'UNAUTHORIZED_CANCELLATION',
            'You do not have permission to cancel this reservation.'
          )
        ),
        404: error('Booking not found', domainErr('BOOKING_NOT_FOUND', 'Booking not found')),
        500: R.internal,
      },
    },
  },
};
