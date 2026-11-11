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

const ADMIN = ['ADMIN'];

const pageParams = (defaultSize: number) => [
  queryParam('page', 'Page number (1-based).', { type: 'integer', minimum: 1, default: 1 }, 1),
  queryParam(
    'pageSize',
    'Items per page.',
    { type: 'integer', minimum: 1, maximum: 100, default: defaultSize },
    defaultSize
  ),
];

const scheduleExample = {
  scheduleId: 3,
  name: 'Midterm exam period 2/2569',
  startDate: '2026-12-14T00:00:00.000Z',
  endDate: '2026-12-25T00:00:00.000Z',
  openTime: '00:00',
  closeTime: '23:59',
  is24Hours: true,
  isClosed: false,
  priority: 2,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const scheduleInputExample = {
  name: 'Midterm exam period 2/2569',
  startDate: '2026-12-14',
  endDate: '2026-12-25',
  is24Hours: true,
  priority: 2,
};

const scheduleIdParam = pathParam('scheduleId', 'Operating schedule ID', 3);

const scheduleErrors = {
  400: error('Invalid input (bad date/time, end before start, unknown field…)', {
    code: 'INVALID_SCHEDULE_INPUT',
    error: 'Unknown schedule field(s): color',
  }),
  401: R.unauthorized,
  403: R.forbiddenRole,
  409: error('Overlaps another schedule with the same priority', {
    code: 'SCHEDULE_CONFLICT',
    error:
      'Conflicting schedule: "Regular hours" already exists with the same priority (2) covering this date range',
  }),
  500: R.internal,
};

const notFoundSchedule = error('Schedule not found', {
  code: 'SCHEDULE_NOT_FOUND',
  error: 'Operating schedule not found',
});

const updateOperation = (operationId: string, summary: string, byBody = false): JsonObject => ({
  tags: ['Admin · Schedules'],
  operationId,
  summary,
  description:
    'Only the fields you send are changed; date/time rules and same-priority overlap are re-checked against the merged result.' +
    (byBody ? ' This variant takes `scheduleId` in the body instead of the path.' : ''),
  security: bearer,
  'x-roles': ADMIN,
  ...(byBody ? {} : { parameters: [scheduleIdParam] }),
  requestBody: body(
    byBody
      ? {
          allOf: [
            ref('OperatingScheduleInput'),
            {
              type: 'object',
              required: ['scheduleId'],
              properties: { scheduleId: { type: 'integer', minimum: 1 } },
            },
          ],
        }
      : ref('OperatingScheduleInput'),
    byBody
      ? { scheduleId: 3, name: 'Midterm exam period 2/2569 (extended)' }
      : { name: 'Midterm exam period 2/2569 (extended)' }
  ),
  responses: {
    200: json('Updated schedule', dataEnvelope(ref('OperatingSchedule')), {
      success: true,
      data: { ...scheduleExample, name: 'Midterm exam period 2/2569 (extended)' },
    }),
    ...scheduleErrors,
    404: notFoundSchedule,
  },
});

const policyUpdate = (operationId: string, summary: string): JsonObject => ({
  tags: ['System Config'],
  operationId,
  summary,
  description:
    'Updates any subset of the booking/ticket policy (PUT and PATCH behave the same: partial update). ' +
    'All fields are validated together; on failure every invalid field is listed in `errors`.',
  security: bearer,
  'x-roles': ADMIN,
  requestBody: body(ref('SystemPolicyInput'), {
    maxBookingDurationMinutes: 180,
    minScoreToBook: 60,
  }),
  responses: {
    200: json('Policy saved', dataEnvelope(ref('SystemPolicy'), { message: { type: 'string' } }), {
      success: true,
      message: 'Booking policy limits updated successfully',
      data: {
        configId: 1,
        maxBookingDurationMinutes: 180,
        maxAdvanceBookingDays: 7,
        minScoreToBook: 60,
        earlyCheckInMinutes: 15,
        lateThresholdMinutes: 15,
        ticketPriceSatang: 5000,
        ticketValidityHours: 2,
        paymentCheckoutExpiryMinutes: 30,
      },
    }),
    400: error('Validation failed', {
      code: 'INVALID_BOOKING_POLICY',
      error: 'minScoreToBook must be an integer between 0 and 100.',
      errors: [
        {
          field: 'minScoreToBook',
          message: 'minScoreToBook must be an integer between 0 and 100.',
        },
      ],
    }),
    401: R.unauthorized,
    403: R.forbiddenRole,
    500: R.internal,
  },
});

export const systemConfigPaths: JsonObject = {
  '/api/system-config/booking-limits': {
    get: {
      tags: ['System Config'],
      operationId: 'getBookingLimits',
      summary: 'Get public booking limits',
      description:
        'Read-only booking limits the frontend uses for client-side validation (max duration, advance days, check-in window, minimum score).',
      security: publicAccess,
      responses: {
        200: json('Current limits', dataEnvelope(ref('BookingLimits')), {
          success: true,
          data: {
            maxBookingDurationMinutes: 120,
            maxAdvanceBookingDays: 7,
            minScoreToBook: 50,
            earlyCheckInMinutes: 15,
            lateThresholdMinutes: 15,
          },
        }),
        500: error('Unexpected error', {
          code: 'BOOKING_SETTINGS_UNAVAILABLE',
          error: 'Booking settings are temporarily unavailable.',
        }),
        503: error('Policy missing, invalid, or DB unreachable', {
          code: 'BOOKING_POLICY_NOT_CONFIGURED',
          error: 'Booking policy has not been configured.',
        }),
      },
    },
  },
  '/api/system-config/policy': {
    get: {
      tags: ['System Config'],
      operationId: 'getSystemPolicy',
      summary: 'Get the full system policy',
      description:
        'All admin-editable settings, including ticket pricing. Defaults are returned if nothing is saved yet.',
      security: bearer,
      'x-roles': ADMIN,
      responses: {
        200: json('Policy', dataEnvelope(ref('SystemPolicy')), {
          success: true,
          data: {
            configId: 1,
            maxBookingDurationMinutes: 120,
            maxAdvanceBookingDays: 7,
            minScoreToBook: 50,
            earlyCheckInMinutes: 15,
            lateThresholdMinutes: 15,
            ticketPriceSatang: 5000,
            ticketValidityHours: 2,
            paymentCheckoutExpiryMinutes: 30,
          },
        }),
        401: R.unauthorized,
        403: R.forbiddenRole,
        500: R.internal,
      },
    },
    put: policyUpdate('updateSystemPolicyPut', 'Update the system policy'),
    patch: policyUpdate('updateSystemPolicyPatch', 'Update the system policy (PATCH)'),
  },
};

export const adminPaths: JsonObject = {
  '/api/admin/users': {
    get: {
      tags: ['Admin · Users'],
      operationId: 'adminSearchUsers',
      summary: 'Search users',
      description:
        'Search by name, email, phone, or student ID, optionally filtered by user type. Thai citizen IDs are masked in the response.',
      security: bearer,
      'x-roles': ADMIN,
      parameters: [
        queryParam('q', 'Free-text search.', { type: 'string' }, 'somchai'),
        queryParam('userType', 'Filter by user type.', ref('UserType')),
        ...pageParams(20),
      ],
      responses: {
        200: json(
          'Matching users',
          dataEnvelope({
            allOf: [
              ref('PageMeta'),
              {
                type: 'object',
                properties: { users: { type: 'array', items: ref('AdminUserSearchItem') } },
              },
            ],
          }),
          {
            success: true,
            data: {
              users: [
                {
                  uid: 12,
                  firstname: 'Somchai',
                  lastname: 'Jaidee',
                  email: '6731234521@student.chula.ac.th',
                  phone: '0812345678',
                  userType: 'UNIVERSITY',
                  behaviourScore: 90,
                  isProfileComplete: true,
                  studentId: '6731234521',
                  citizenId: null,
                  passportId: null,
                  imageUrl: 'https://www.gravatar.com/avatar/0?d=mp&f=y',
                  createdAt: '2026-08-01T03:00:00.000Z',
                },
              ],
              total: 1,
              page: 1,
              pageSize: 20,
            },
          }
        ),
        400: error('Invalid query', { error: 'Invalid userType' }),
        401: R.unauthorized,
        403: R.forbiddenRole,
        500: R.internal,
      },
    },
  },
  '/api/admin/adjust-score': {
    post: {
      tags: ['Admin · Users'],
      operationId: 'adminAdjustScore',
      summary: 'Manually adjust a user’s behaviour score',
      description:
        'Adds or subtracts points. The result is clamped to 0–100 and the change actually applied is logged with the reason. ' +
        'If the score is already at the limit, nothing is written and a `note` is returned.',
      security: bearer,
      'x-roles': ADMIN,
      requestBody: body(
        {
          type: 'object',
          required: ['targetUid', 'scoreChange', 'reason'],
          properties: {
            targetUid: { type: 'integer', minimum: 1, maximum: 2147483647 },
            scoreChange: {
              type: 'integer',
              description: 'Non-zero; negative to deduct.',
              not: { enum: [0] },
            },
            reason: { type: 'string', minLength: 1 },
          },
        },
        { targetUid: 12, scoreChange: -10, reason: 'Left belongings to hold the seat' }
      ),
      responses: {
        200: json(
          'Score adjusted',
          dataEnvelope(
            {
              type: 'object',
              properties: {
                uid: { type: 'integer' },
                behaviourScore: { type: 'integer' },
                note: { type: 'string', description: 'Present only when no change was applied.' },
              },
            },
            { message: { type: 'string' } }
          ),
          {
            success: true,
            message: 'User score adjusted successfully',
            data: { uid: 12, behaviourScore: 80 },
          }
        ),
        400: error('Invalid input', {
          error:
            'Invalid input: targetUid must be a positive database integer and scoreChange must be a non-zero safe integer.',
        }),
        401: R.unauthorized,
        403: error('Not an admin, or admin account no longer exists', {
          code: 'ADMIN_NOT_FOUND',
          error: 'Invalid admin account.',
        }),
        404: error('Target user not found', {
          code: 'USER_NOT_FOUND',
          error: 'Target user not found.',
        }),
        409: error('Score changed concurrently (e.g. by the no-show worker)', {
          code: 'CONCURRENT_MODIFICATION',
          error: 'The user score was modified by another process. Please try again.',
        }),
        500: R.internal,
      },
    },
  },
  '/api/admin/audit-logs': {
    get: {
      tags: ['Admin · Users'],
      operationId: 'adminListAuditLogs',
      summary: 'List manual score adjustments',
      description: 'Audit trail of admin score changes, newest first.',
      security: bearer,
      'x-roles': ADMIN,
      parameters: [
        queryParam('q', 'Search by user name / email / student ID.', { type: 'string' }),
        queryParam('direction', 'Only deductions or only additions.', {
          type: 'string',
          enum: ['deduct', 'add'],
        }),
        queryParam(
          'from',
          'Start of range (ISO 8601 with offset).',
          { type: 'string', format: 'date-time' },
          '2026-11-01T00:00:00+07:00'
        ),
        queryParam(
          'to',
          'End of range (ISO 8601 with offset).',
          { type: 'string', format: 'date-time' },
          '2026-11-30T23:59:59+07:00'
        ),
        ...pageParams(20),
      ],
      responses: {
        200: json(
          'Audit log page',
          dataEnvelope({
            allOf: [
              ref('PageMeta'),
              { type: 'object', properties: { logs: { type: 'array', items: ref('AuditLog') } } },
            ],
          }),
          {
            success: true,
            data: {
              logs: [
                {
                  id: 7,
                  timestamp: '2026-11-10T09:15:00.000Z',
                  scoreChange: -10,
                  reason: 'Left belongings to hold the seat',
                  user: {
                    uid: 12,
                    firstname: 'Somchai',
                    lastname: 'Jaidee',
                    email: '6731234521@student.chula.ac.th',
                    studentId: '6731234521',
                  },
                  admin: {
                    adminId: 1,
                    firstname: 'Library',
                    lastname: 'Admin',
                    email: 'admin@culibspace.local',
                  },
                },
              ],
              total: 1,
              page: 1,
              pageSize: 20,
            },
          }
        ),
        400: error('Invalid query', { error: 'Invalid date range' }),
        401: R.unauthorized,
        403: R.forbiddenRole,
        500: R.internal,
      },
    },
  },
  '/api/admin/issues': {
    get: {
      tags: ['Admin · Issues'],
      operationId: 'adminListIssues',
      summary: 'List issue reports',
      description:
        'All facility issue reports, newest first. `q` matches the description, or the table ID if numeric.',
      security: bearer,
      'x-roles': ADMIN,
      parameters: [
        queryParam('q', 'Search text or table ID.', { type: 'string' }, 'outlet'),
        queryParam('status', 'Filter by status label.', ref('IssueStatusLabel')),
        ...pageParams(20),
      ],
      responses: {
        200: json(
          'Issue page',
          dataEnvelope({
            allOf: [
              ref('PageMeta'),
              {
                type: 'object',
                properties: { issues: { type: 'array', items: ref('AdminIssue') } },
              },
            ],
          }),
          {
            success: true,
            data: {
              issues: [
                {
                  issueId: 9,
                  time: '2026-11-11T07:10:00.000Z',
                  issueInformation: 'Power outlet is not working',
                  status: 'Pending',
                  blocksTable: false,
                  notes: '',
                  user: {
                    uid: 12,
                    firstname: 'Somchai',
                    lastname: 'Jaidee',
                    email: '6731234521@student.chula.ac.th',
                  },
                  table: { tableId: 5, zoneId: 1, zoneType: 'SILENT' },
                },
              ],
              total: 1,
              page: 1,
              pageSize: 20,
            },
          }
        ),
        400: error('Invalid query', { error: 'status must be Pending, In Progress, or Completed' }),
        401: R.unauthorized,
        403: R.forbiddenRole,
        500: R.internal,
      },
    },
  },
  '/api/admin/issues/{issueId}': {
    patch: {
      tags: ['Admin · Issues'],
      operationId: 'adminUpdateIssue',
      summary: 'Update an issue report',
      description:
        'Sets status, admin notes, and whether the issue blocks the table. A blocking unresolved issue makes the table CLOSED for booking. All three fields are required; any other field is rejected. Every update is logged in ManageIssue.',
      security: bearer,
      'x-roles': ADMIN,
      parameters: [pathParam('issueId', 'Issue report ID', 9)],
      requestBody: body(
        {
          type: 'object',
          required: ['status', 'notes', 'blocksTable'],
          additionalProperties: false,
          properties: {
            status: ref('IssueStatusLabel'),
            notes: { type: 'string', maxLength: 2000 },
            blocksTable: { type: 'boolean' },
          },
        },
        { status: 'In Progress', notes: 'Electrician scheduled for tomorrow', blocksTable: true }
      ),
      responses: {
        200: json(
          'Issue updated',
          dataEnvelope(
            {
              type: 'object',
              additionalProperties: true,
              properties: {
                issueId: { type: 'integer' },
                tableId: { type: 'integer' },
                closed: {
                  type: 'boolean',
                  description: 'Whether the table is now closed for booking.',
                },
                status: ref('IssueStatusLabel'),
                blocksTable: { type: 'boolean' },
                notes: { type: 'string' },
                updatedBy: { type: 'integer', description: 'adminId' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
            { message: { type: 'string' } }
          ),
          {
            success: true,
            message: 'Issue report updated successfully',
            data: {
              issueId: 9,
              tableId: 5,
              status: 'In Progress',
              blocksTable: true,
              closed: true,
              notes: 'Electrician scheduled for tomorrow',
              updatedBy: 1,
              updatedAt: '2026-11-11T08:00:00.000Z',
            },
          }
        ),
        400: error('Invalid body or ID', {
          error: 'Only status, notes, and blocksTable can be updated',
        }),
        401: R.unauthorized,
        403: error('Not an admin, or admin account no longer exists', {
          code: 'ADMIN_NOT_FOUND',
          error: 'Invalid admin account.',
        }),
        404: error('Issue not found', {
          code: 'ISSUE_NOT_FOUND',
          error: 'Issue report not found.',
        }),
        500: R.internal,
      },
    },
  },
  '/api/admin/schedules': {
    get: {
      tags: ['Admin · Schedules'],
      operationId: 'adminListSchedules',
      summary: 'List operating schedules',
      description:
        'Ordered by priority (highest first), then start date. `startDate`/`endDate` return schedules that overlap that range.',
      security: bearer,
      'x-roles': ADMIN,
      parameters: [
        queryParam('q', 'Search by name.', { type: 'string' }, 'exam'),
        queryParam('startDate', 'Overlap range start (YYYY-MM-DD).', {
          type: 'string',
          format: 'date',
        }),
        queryParam('endDate', 'Overlap range end (YYYY-MM-DD).', {
          type: 'string',
          format: 'date',
        }),
        queryParam('priority', 'Exact priority.', { type: 'integer', minimum: 1 }),
        queryParam('isClosed', '`true`/`false` (or `1`/`0`).', { type: 'boolean' }),
        queryParam('is24Hours', '`true`/`false` (or `1`/`0`).', { type: 'boolean' }),
        ...pageParams(50),
      ],
      responses: {
        200: json(
          'Schedules',
          {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'array', items: ref('OperatingSchedule') },
              total: { type: 'integer' },
            },
          },
          { success: true, data: [scheduleExample], total: 1 }
        ),
        400: error('Invalid filter', {
          code: 'INVALID_SCHEDULE_INPUT',
          error: 'isClosed must be true or false',
        }),
        401: R.unauthorized,
        403: R.forbiddenRole,
        500: R.internal,
      },
    },
    post: {
      tags: ['Admin · Schedules'],
      operationId: 'adminCreateSchedule',
      summary: 'Create an operating schedule',
      description:
        'Adds opening hours for a date range (US7-4). Required: name, startDate, endDate. Default hours depend on the flags: 08:00–21:00 normally, 00:00–23:59 when is24Hours, 00:00–00:00 when isClosed. Default priority is 1. ' +
        'Two schedules with the same priority cannot overlap.',
      security: bearer,
      'x-roles': ADMIN,
      requestBody: body(
        { allOf: [ref('OperatingScheduleInput'), { required: ['name', 'startDate', 'endDate'] }] },
        scheduleInputExample
      ),
      responses: {
        201: json('Created', dataEnvelope(ref('OperatingSchedule')), {
          success: true,
          data: scheduleExample,
        }),
        ...scheduleErrors,
      },
    },
    put: updateOperation(
      'adminUpdateScheduleByBody',
      'Update an operating schedule (ID in body)',
      true
    ),
  },
  '/api/admin/schedules/active': {
    get: {
      tags: ['Admin · Schedules'],
      operationId: 'adminGetActiveSchedule',
      summary: 'Get the schedule in effect on a date',
      description:
        'The highest-priority schedule covering the date (default: today in Asia/Bangkok). `data` is null if none covers it.',
      security: bearer,
      'x-roles': ADMIN,
      parameters: [
        queryParam('date', 'YYYY-MM-DD or ISO 8601 with offset.', { type: 'string' }, '2026-12-15'),
      ],
      responses: {
        200: json(
          'Schedule in effect',
          dataEnvelope({ ...ref('OperatingSchedule'), nullable: true }),
          { success: true, data: scheduleExample }
        ),
        400: error('Bad date', {
          code: 'INVALID_SCHEDULE_INPUT',
          error: 'Invalid date. Expected YYYY-MM-DD or ISO 8601 with timezone offset',
        }),
        401: R.unauthorized,
        403: R.forbiddenRole,
        409: error('Two schedules tie at the top priority', {
          code: 'SCHEDULE_CONFLICT',
          error: 'Multiple schedules have the same effective priority (2) on 2026-12-15',
        }),
        500: R.internal,
      },
    },
  },
  '/api/admin/schedules/{scheduleId}': {
    get: {
      tags: ['Admin · Schedules'],
      operationId: 'adminGetSchedule',
      summary: 'Get one operating schedule',
      security: bearer,
      'x-roles': ADMIN,
      parameters: [scheduleIdParam],
      responses: {
        200: json('Schedule', dataEnvelope(ref('OperatingSchedule')), {
          success: true,
          data: scheduleExample,
        }),
        400: error('Bad ID', { error: 'scheduleId must be a positive integer' }),
        401: R.unauthorized,
        403: R.forbiddenRole,
        404: notFoundSchedule,
        500: R.internal,
      },
    },
    put: updateOperation('adminUpdateSchedulePut', 'Update an operating schedule'),
    patch: updateOperation('adminUpdateSchedulePatch', 'Update an operating schedule (PATCH)'),
    delete: {
      tags: ['Admin · Schedules'],
      operationId: 'adminDeleteSchedule',
      summary: 'Delete an operating schedule',
      security: bearer,
      'x-roles': ADMIN,
      parameters: [scheduleIdParam],
      responses: {
        200: json('Deleted', ref('MessageResponse'), {
          success: true,
          message: 'Operating schedule deleted successfully',
        }),
        400: error('Bad ID', { error: 'scheduleId must be a positive integer' }),
        401: R.unauthorized,
        403: R.forbiddenRole,
        404: notFoundSchedule,
        500: R.internal,
      },
    },
  },
};

export const miscPaths: JsonObject = {
  '/api/hello': {
    get: {
      tags: ['Health'],
      operationId: 'hello',
      summary: 'Connectivity check',
      description: 'Confirms the frontend can reach the backend.',
      security: publicAccess,
      responses: {
        200: json(
          'Backend reachable',
          { type: 'object', properties: { message: { type: 'string' } } },
          { message: 'Hello! Communication between Next.js and Express is working!' }
        ),
      },
    },
  },
};
