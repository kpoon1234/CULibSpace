import {
  R,
  bearer,
  body,
  dataEnvelope,
  error,
  json,
  pathParam,
  ref,
  type JsonObject,
} from '../helpers.js';

const TAG = ['Tickets'];

const idempotencyKeySchema = {
  type: 'string',
  maxLength: 64,
  pattern: '^[A-Za-z0-9._:-]{1,64}$',
  description:
    'Client-generated key (e.g. a UUID). Retrying with the same key returns the same purchase instead of charging twice.',
};

const purchaseExample = {
  success: true,
  data: {
    ticketId: 31,
    paymentId: 44,
    checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3',
    amountSatang: 5000,
    currency: 'THB',
    paymentStatus: 'PENDING',
    ticketStatus: 'UNPAID',
    expiresAt: '2026-11-11T07:30:00.000Z',
    ticketStartDateTime: '2026-11-11T07:00:00.000Z',
    ticketEndDateTime: '2026-11-11T09:00:00.000Z',
    replayed: false,
  },
};

const ticketExample = {
  ticketId: 31,
  uid: 27,
  status: 'PAID',
  startDateTime: '2026-11-11T07:02:10.000Z',
  endDateTime: '2026-11-11T09:02:10.000Z',
  createdAt: '2026-11-11T07:00:00.000Z',
  validTimePeriod: {
    startDateTime: '2026-11-11T07:02:10.000Z',
    endDateTime: '2026-11-11T09:02:10.000Z',
    isValidNow: true,
    isExpired: false,
    remainingSeconds: 5400,
  },
  payments: [
    {
      paymentId: 44,
      amountSatang: 5000,
      amountBaht: 50,
      currency: 'THB',
      status: 'PAID',
      gateway: 'stripe',
      ticketValidityHours: 2,
      paidAt: '2026-11-11T07:02:10.000Z',
      createdAt: '2026-11-11T07:00:00.000Z',
    },
  ],
};

const gatewayDown = error('Payment gateway or pricing config unavailable (retryable)', {
  code: 'GATEWAY_UNAVAILABLE',
  error: 'Payment gateway is unavailable',
  retryable: true,
});

export const ticketPaths: JsonObject = {
  '/api/tickets/purchase': {
    post: {
      tags: TAG,
      operationId: 'purchaseTicket',
      summary: 'Buy a visitor ticket (Stripe Checkout)',
      description:
        'Outside visitors only. Creates an UNPAID ticket and a Stripe Checkout session, then returns `checkoutUrl` for the visitor to pay. ' +
        'Price and validity come from the server config — the client cannot set them. ' +
        'Only one open purchase per user is allowed: an unfinished one must be completed or reconciled first.',
      security: bearer,
      'x-roles': ['OUTSIDER'],
      requestBody: body(
        { type: 'object', properties: { idempotencyKey: idempotencyKeySchema } },
        { idempotencyKey: '7b1e4c2a-0f3d-4e8a-9c61-2d5b7a9e1f04' },
        false
      ),
      responses: {
        200: json(
          'Checkout created (or replayed)',
          dataEnvelope(ref('TicketPurchaseResult')),
          purchaseExample
        ),
        400: error('Malformed idempotency key', {
          code: 'INVALID_IDEMPOTENCY_KEY',
          error: 'idempotencyKey may only contain letters, numbers, and the characters . _ : -',
        }),
        401: R.unauthorized,
        403: error('Not an outside visitor, or profile incomplete', {
          code: 'NOT_AN_OUTSIDE_USER',
          error: 'Only outside visitors can purchase visitor tickets',
        }),
        404: error('User no longer exists', {
          code: 'USER_NOT_FOUND',
          error: 'User with ID 27 not found',
        }),
        409: error('A previous purchase is still unresolved', {
          code: 'PAYMENT_AWAITING_CONFIRMATION',
          error:
            'A previous purchase is still awaiting payment confirmation. Please retry with the same idempotency key.',
          retryable: true,
          paymentId: 44,
          ticketId: 31,
        }),
        500: R.internal,
        503: gatewayDown,
      },
    },
  },
  '/api/tickets/reconcile': {
    post: {
      tags: TAG,
      operationId: 'reconcileTicketPurchase',
      summary: 'Check / recover a previous ticket purchase',
      description:
        'Looks up the purchase made with this idempotency key and never creates a new one. If it is still unconfirmed, checks with Stripe and confirms the payment if Stripe reports it paid. Use after the Stripe redirect or after a timeout.',
      security: bearer,
      'x-roles': ['OUTSIDER'],
      requestBody: body(
        {
          type: 'object',
          required: ['idempotencyKey'],
          properties: { idempotencyKey: idempotencyKeySchema },
        },
        { idempotencyKey: '7b1e4c2a-0f3d-4e8a-9c61-2d5b7a9e1f04' }
      ),
      responses: {
        200: json('Current purchase state', dataEnvelope(ref('TicketPurchaseResult')), {
          success: true,
          data: {
            ...purchaseExample.data,
            paymentStatus: 'PAID',
            ticketStatus: 'PAID',
            replayed: true,
          },
        }),
        400: error('Missing or malformed idempotency key', {
          code: 'INVALID_IDEMPOTENCY_KEY',
          error: 'Missing idempotency key',
        }),
        401: R.unauthorized,
        403: R.forbiddenRole,
        404: error('No purchase for this key', {
          code: 'PAYMENT_NOT_FOUND',
          error:
            'No existing purchase found for idempotency key 7b1e4c2a-0f3d-4e8a-9c61-2d5b7a9e1f04',
        }),
        500: R.internal,
        503: error('Could not reach Stripe to verify', {
          code: 'PAYMENT_LOOKUP_UNAVAILABLE',
          error:
            'Could not verify checkout status with the gateway; retry later. (No charge was made.)',
          retryable: true,
        }),
      },
    },
  },
  '/api/tickets/my-tickets': {
    get: {
      tags: TAG,
      operationId: 'getMyTickets',
      summary: 'List my tickets and payment history',
      description:
        'Outside visitors only. Each ticket includes its validity window and every payment attempt.',
      security: bearer,
      'x-roles': ['OUTSIDER'],
      responses: {
        200: json('Tickets', dataEnvelope({ type: 'array', items: ref('Ticket') }), {
          success: true,
          data: [ticketExample],
        }),
        401: R.unauthorized,
        403: R.forbiddenRole,
        500: R.internal,
      },
    },
  },
  '/api/tickets/{ticketId}': {
    get: {
      tags: TAG,
      operationId: 'getTicketById',
      summary: 'Get one ticket',
      description: 'Visitors can read only their own tickets. Admins can read any ticket.',
      security: bearer,
      parameters: [pathParam('ticketId', 'Ticket ID', 31)],
      responses: {
        200: json('Ticket', dataEnvelope(ref('Ticket')), { success: true, data: ticketExample }),
        400: error('Bad ticket ID', {
          code: 'INVALID_TICKET_ID',
          error: 'ticketId must be a positive integer within Prisma Int bounds',
        }),
        401: R.unauthorized,
        403: error('Ticket belongs to someone else', { code: 'FORBIDDEN', error: 'Access denied' }),
        404: error('No such ticket', { code: 'TICKET_NOT_FOUND', error: 'Ticket not found' }),
        500: R.internal,
      },
    },
  },
  '/api/tickets/payment/webhook': {
    post: {
      tags: ['Webhooks'],
      operationId: 'stripeWebhook',
      summary: 'Stripe payment webhook',
      description:
        'Called by Stripe, not by the frontend. The raw body is verified against `Stripe-Signature` using `STRIPE_WEBHOOK_SECRET`. ' +
        'A `checkout.session.completed` event marks the payment PAID and activates the ticket. Duplicate deliveries are ignored safely. ' +
        'Responds 503 when Stripe should retry the delivery. ' +
        'Cannot be called from Swagger UI without a valid signature — use `stripe listen --forward-to <server>/api/tickets/payment/webhook`.',
      security: [{ stripeSignature: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: 'Stripe Event object (raw bytes, max 256 KB).',
              additionalProperties: true,
            },
            example: {
              id: 'evt_1Q2w3E4r5T6y',
              type: 'checkout.session.completed',
              data: {
                object: {
                  id: 'cs_test_a1b2c3',
                  payment_status: 'paid',
                  amount_total: 5000,
                  currency: 'thb',
                },
              },
            },
          },
        },
      },
      responses: {
        200: json(
          'Event received (handled, already processed, or deliberately ignored)',
          {
            type: 'object',
            properties: {
              received: { type: 'boolean' },
              handled: { type: 'boolean' },
              code: { type: 'string' },
            },
            additionalProperties: true,
          },
          { received: true, handled: true }
        ),
        400: json(
          'Missing or invalid signature',
          {
            type: 'object',
            properties: { received: { type: 'boolean' }, code: { type: 'string' } },
          },
          {
            received: false,
            code: 'INVALID_WEBHOOK_REQUEST',
          }
        ),
        503: json(
          'Temporary failure — Stripe will retry',
          {
            type: 'object',
            properties: { received: { type: 'boolean' }, code: { type: 'string' } },
          },
          {
            received: false,
            code: 'PAYMENT_PROCESSING_UNAVAILABLE',
          }
        ),
      },
    },
  },
};

export const issuePaths: JsonObject = {
  '/api/issues': {
    post: {
      tags: ['Issues'],
      operationId: 'reportIssue',
      summary: 'Report a problem with a table',
      description:
        'Library users (not admins) report a facility problem, such as a broken plug or light. The report starts as `Pending`; an admin can then mark the table as blocked.',
      security: bearer,
      'x-roles': ['STUDENT', 'STAFF', 'OUTSIDER'],
      requestBody: body(
        {
          type: 'object',
          required: ['tableId', 'issueInformation'],
          properties: {
            tableId: {
              type: 'integer',
              minimum: 1,
              description: 'Must be a JSON number, not a string.',
            },
            issueInformation: { type: 'string', minLength: 1, maxLength: 2000 },
          },
        },
        { tableId: 5, issueInformation: 'Power outlet is not working' }
      ),
      responses: {
        201: json(
          'Issue reported',
          dataEnvelope(ref('IssueCreated'), { message: { type: 'string' } }),
          {
            success: true,
            message: 'Issue report submitted successfully',
            data: {
              issueId: 9,
              time: '2026-11-11T07:10:00.000Z',
              tableId: 5,
              issueInformation: 'Power outlet is not working',
              status: 'Pending',
            },
          }
        ),
        400: error('Invalid input or table does not exist', {
          error: 'The selected table does not exist',
        }),
        401: R.unauthorized,
        403: error('Admin token, or profile incomplete', {
          code: 'PROFILE_INCOMPLETE',
          error: 'Please complete your profile onboarding before reporting an issue',
        }),
        500: R.internal,
      },
    },
  },
};
