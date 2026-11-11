import {
  R,
  bearer,
  body,
  cookie,
  error,
  json,
  publicAccess,
  ref,
  type JsonObject,
} from '../helpers.js';

const TAG = ['Auth'];

const loginBody = body(
  {
    type: 'object',
    required: ['email', 'firstname', 'lastname'],
    properties: {
      email: { type: 'string', format: 'email' },
      firstname: { type: 'string', maxLength: 50 },
      lastname: { type: 'string', maxLength: 50 },
      phone: { type: 'string', pattern: '^\\d{10}$', description: 'Optional until onboarding.' },
      studentId: {
        type: 'string',
        pattern: '^\\d{10}$',
        description: 'Optional; otherwise extracted from a 10-digit student email.',
      },
    },
  },
  {
    email: '6731234521@student.chula.ac.th',
    firstname: 'Somchai',
    lastname: 'Jaidee',
  }
);

const loginOperation = (operationId: string, summary: string, extra = ''): JsonObject => ({
  tags: TAG,
  operationId,
  summary,
  description:
    'Finds or creates the user by email, maps the role from the email domain, and returns a signed JWT. ' +
    'The caller is expected to have already verified the email with Google.' +
    extra,
  security: publicAccess,
  requestBody: loginBody,
  responses: {
    200: json('Authenticated', ref('AuthResult'), {
      success: true,
      message: 'Authentication and role mapping successful',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjEyfQ.sig',
      user: {
        uid: 12,
        email: '6731234521@student.chula.ac.th',
        firstname: 'Somchai',
        lastname: 'Jaidee',
        phone: null,
        imageUrl: 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y',
        isProfileComplete: false,
        behaviourScore: 100,
        role: 'STUDENT',
        userType: 'UNIVERSITY',
        studentId: '6731234521',
      },
    }),
    400: error('Missing required fields', { error: 'Email, firstname, and lastname are required' }),
    500: R.internal,
  },
});

const scoreOperation = (operationId: string, aliasNote = ''): JsonObject => ({
  tags: TAG,
  operationId,
  summary: 'Get my behaviour score and history' + aliasNote,
  description:
    'Returns the caller’s behaviour score (0–100) and every score change, newest first (US1-5). ' +
    'Admin tokens are rejected because admins have no score.',
  security: bearer,
  responses: {
    200: json('Score and history', ref('ScoreResult'), {
      success: true,
      uid: 12,
      behaviourScore: 90,
      history: [
        {
          timestamp: '2026-11-10T09:15:00.000Z',
          scoreChange: -10,
          adminId: 1,
          adminName: 'Library Admin',
          reason: 'No-show penalty',
        },
      ],
    }),
    401: R.unauthorized,
    404: error('User no longer exists', { error: 'User not found' }),
    500: R.internal,
  },
});

export const authPaths: JsonObject = {
  '/api/auth/google': {
    get: {
      tags: TAG,
      operationId: 'googleOAuthStart',
      summary: 'Start Google OAuth sign-in',
      description:
        'Browser redirect to Google’s consent screen (scopes: profile, email). Open in a browser — not callable from Swagger UI.',
      security: publicAccess,
      responses: { 302: { description: 'Redirect to accounts.google.com' } },
    },
    post: loginOperation(
      'loginGoogleAlias',
      'Log in with a Google-verified profile (alias of /login)',
      ' Identical to `POST /api/auth/login`.'
    ),
  },
  '/api/auth/google/callback': {
    get: {
      tags: TAG,
      operationId: 'googleOAuthCallback',
      summary: 'Google OAuth callback',
      description:
        'Google redirects here after consent. On success, creates the session and redirects to `{CLIENT_URL}/auth/callback?token=<JWT>`; on failure, redirects to `{CLIENT_URL}/login`.',
      security: publicAccess,
      parameters: [
        {
          name: 'code',
          in: 'query',
          required: true,
          schema: { type: 'string' },
          description: 'OAuth authorization code from Google.',
        },
      ],
      responses: {
        302: {
          description: 'Redirect to the frontend',
          headers: {
            Location: {
              schema: { type: 'string' },
              example: 'https://culibspace.example.com/auth/callback?token=eyJhbGci...',
            },
          },
        },
      },
    },
  },
  '/api/auth/login': {
    post: loginOperation('login', 'Log in / register with a Google-verified profile'),
  },
  '/api/auth/admin-login': {
    post: {
      tags: TAG,
      operationId: 'adminLogin',
      summary: 'Admin log in with email and password',
      description: 'Checks the bcrypt-hashed admin password and returns a JWT with role ADMIN.',
      security: publicAccess,
      requestBody: body(
        {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', format: 'password' },
          },
        },
        { email: 'admin@culibspace.local', password: 'correct-horse-battery' }
      ),
      responses: {
        200: json(
          'Admin authenticated',
          {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              token: { type: 'string' },
              user: ref('AdminUser'),
            },
          },
          {
            success: true,
            message: 'Admin login successful',
            token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhZG1pbklkIjoxfQ.sig',
            user: {
              adminId: 1,
              email: 'admin@culibspace.local',
              firstname: 'Library',
              lastname: 'Admin',
              role: 'ADMIN',
            },
          }
        ),
        400: error('Missing credentials', { error: 'Email and password are required' }),
        401: error('Wrong email or password', { error: 'Invalid credentials' }),
        500: R.internal,
      },
    },
  },
  '/api/auth/logout': {
    post: {
      tags: TAG,
      operationId: 'logout',
      summary: 'Log out of the OAuth session',
      description:
        'Destroys the Passport session and clears the `connect.sid` cookie. JWTs are stateless, so clients should also discard their stored token.',
      security: [...cookie, {}],
      responses: {
        200: json('Logged out', ref('MessageResponse'), { message: 'Logged out successfully' }),
        500: json('Session store failure', ref('ErrorResponse'), { error: 'Logout failed' }),
      },
    },
  },
  '/api/auth/session/me': {
    get: {
      tags: TAG,
      operationId: 'getSessionMe',
      summary: 'Get the user stored in the OAuth session',
      description: 'Session-cookie only. Returns the Passport session user, including its JWT.',
      security: cookie,
      responses: {
        200: json(
          'Session user',
          {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              user: { type: 'object', additionalProperties: true },
            },
          },
          {
            success: true,
            user: { uid: 12, email: '6731234521@student.chula.ac.th', token: 'eyJhbGci...' },
          }
        ),
        401: error('No active session', { error: 'Unauthorized: Valid session required' }),
      },
    },
  },
  '/api/auth/me': {
    get: {
      tags: TAG,
      operationId: 'getMe',
      summary: 'Get the current user profile',
      description:
        'If an `Authorization` header is present, the Bearer JWT is verified and the profile is read from the database (users or admins). ' +
        'Otherwise it falls back to the session cookie, like `/api/auth/session/me`.',
      security: [...bearer, ...cookie],
      responses: {
        200: json(
          'Current profile',
          {
            type: 'object',
            properties: { success: { type: 'boolean' }, user: ref('CurrentUser') },
          },
          {
            success: true,
            user: {
              uid: 12,
              email: '6731234521@student.chula.ac.th',
              firstname: 'Somchai',
              lastname: 'Jaidee',
              phone: '0812345678',
              imageUrl: 'https://www.gravatar.com/avatar/0?d=mp&f=y',
              isProfileComplete: true,
              behaviourScore: 100,
              role: 'STUDENT',
              userType: 'UNIVERSITY',
              studentId: '6731234521',
            },
          }
        ),
        401: R.unauthorized,
        404: error('User or admin record no longer exists', { error: 'User not found' }),
        500: R.internal,
      },
    },
  },
  '/api/auth/score': { get: scoreOperation('getMyScore') },
  '/api/auth/me/score': { get: scoreOperation('getMyScoreAliasMe', ' (alias)') },
  '/api/auth/user/score': { get: scoreOperation('getMyScoreAliasUser', ' (alias)') },
  '/api/auth/complete-profile': {
    post: {
      tags: TAG,
      operationId: 'completeProfile',
      summary: 'Complete first-login onboarding',
      description:
        'Saves name and phone. Outside visitors must also provide exactly one identity document (Thai citizen ID or foreign passport). ' +
        'Returns a refreshed JWT with `isProfileComplete: true`. Can only be done once.',
      security: bearer,
      requestBody: body(
        {
          type: 'object',
          required: ['firstname', 'lastname', 'phone'],
          properties: {
            firstname: { type: 'string', minLength: 1, maxLength: 50 },
            lastname: { type: 'string', minLength: 1, maxLength: 50 },
            phone: { type: 'string', pattern: '^\\d{10}$' },
            identityType: {
              type: 'string',
              enum: ['THAI', 'FOREIGN'],
              description: 'Required for outside visitors; ignored for university users.',
            },
            citizenId: {
              type: 'string',
              pattern: '^\\d{13}$',
              description: 'Required when identityType = THAI.',
            },
            passportId: {
              type: 'string',
              pattern: '^[A-Za-z0-9]{9}$',
              description: 'Required when identityType = FOREIGN.',
            },
          },
        },
        {
          firstname: 'Anna',
          lastname: 'Schmidt',
          phone: '0891234567',
          identityType: 'FOREIGN',
          passportId: 'C01X00T47',
        }
      ),
      responses: {
        200: json('Profile completed; new token issued', ref('AuthResult'), {
          success: true,
          message: 'Profile completed successfully',
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjI3fQ.sig',
          user: {
            uid: 27,
            email: 'anna.schmidt@gmail.com',
            firstname: 'Anna',
            lastname: 'Schmidt',
            phone: '0891234567',
            isProfileComplete: true,
            behaviourScore: 100,
            role: 'OUTSIDER',
            userType: 'FOREIGN',
          },
        }),
        400: error('Validation failed', { error: 'Phone number must contain exactly 10 digits' }),
        401: R.unauthorized,
        404: error('User no longer exists', { error: 'User not found' }),
        409: error('Already completed, or phone / ID already used', {
          field: 'phone',
          error: 'This phone number is already registered to another account.',
        }),
        500: R.internal,
      },
    },
  },
  '/api/auth/protected/profile': {
    get: {
      tags: ['Auth (RBAC examples)'],
      operationId: 'protectedProfile',
      summary: 'RBAC demo: any authenticated user',
      description: 'Echoes the decoded JWT claims. Used to verify the auth middleware.',
      security: bearer,
      responses: {
        200: json(
          'Access granted',
          { type: 'object', properties: { message: { type: 'string' }, user: ref('JwtPayload') } },
          {
            message: 'Access granted to authenticated profile',
            user: { uid: 12, role: 'STUDENT', email: '6731234521@student.chula.ac.th' },
          }
        ),
        401: R.unauthorized,
      },
    },
  },
  '/api/auth/protected/student-only': {
    get: {
      tags: ['Auth (RBAC examples)'],
      operationId: 'protectedStudentOnly',
      summary: 'RBAC demo: STUDENT only',
      security: bearer,
      'x-roles': ['STUDENT'],
      responses: {
        200: json(
          'Access granted',
          {
            type: 'object',
            properties: { message: { type: 'string' }, studentId: { type: 'string' } },
          },
          { message: 'Access granted: Student area', studentId: '6731234521' }
        ),
        401: R.unauthorized,
        403: R.forbiddenRole,
      },
    },
  },
  '/api/auth/protected/admin-only': {
    get: {
      tags: ['Auth (RBAC examples)'],
      operationId: 'protectedAdminOnly',
      summary: 'RBAC demo: ADMIN only',
      security: bearer,
      'x-roles': ['ADMIN'],
      responses: {
        200: json(
          'Access granted',
          {
            type: 'object',
            properties: { message: { type: 'string' }, adminId: { type: 'integer' } },
          },
          { message: 'Access granted: Admin area', adminId: 1 }
        ),
        401: R.unauthorized,
        403: R.forbiddenRole,
      },
    },
  },
};
