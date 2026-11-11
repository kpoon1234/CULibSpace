/**
 * OpenAPI 3.0 specification for the CU LibSpace backend.
 *
 * Served by swagger-ui-express at /api-docs (UI) and /api-docs.json (raw spec);
 * see app.ts. The spec is plain TypeScript so it ships with the build and does
 * not depend on reading source-file comments at runtime.
 *
 * When you add or change a route, update the matching file in ./paths/.
 */
import { responses, schemas, securitySchemes } from './components.js';
import type { JsonObject } from './helpers.js';
import { authPaths } from './paths/auth.js';
import { bookingPaths, layoutPaths, profilePaths } from './paths/bookings.js';
import { issuePaths, ticketPaths } from './paths/tickets.js';
import { adminPaths, miscPaths, systemConfigPaths } from './paths/admin.js';

/**
 * Server list shown in the Swagger UI "Servers" dropdown.
 *
 * - API_PUBLIC_URL: comma-separated public base URL(s), e.g.
 *   "https://api.culibspace.example.com,http://localhost:8080"
 * - otherwise BASE_URL (already used by server.ts for its startup log)
 * - otherwise "/" — same origin as the docs page, so "Try it out" works on any
 *   deployment without configuration.
 */
function buildServers(environment: NodeJS.ProcessEnv): JsonObject[] {
  const configured = (environment.API_PUBLIC_URL || environment.BASE_URL || '')
    .split(',')
    .map((url) => url.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (configured.length === 0) {
    return [{ url: '/', description: 'This server (same origin as the docs)' }];
  }
  return configured.map((url) => ({ url }));
}

export function buildOpenApiSpec(environment: NodeJS.ProcessEnv = process.env): JsonObject {
  return {
    openapi: '3.0.3',
    info: {
      title: 'CU LibSpace API',
      version: '1.0.0',
      description: [
        'REST API for **CU LibSpace**, Chulalongkorn University’s library seat booking system.',
        '',
        '**Authentication.** Most endpoints need a JWT in `Authorization: Bearer <token>`. Get one from:',
        '- `POST /api/auth/login`: library users (Google-verified email)',
        '- `POST /api/auth/admin-login`: admins (email + password)',
        '- the Google OAuth redirect flow (`GET /api/auth/google`), which hands the token to the frontend',
        '',
        'Click **Authorize** and paste the token (without the `Bearer ` prefix).',
        '',
        '**Roles.** Taken from the JWT: `STUDENT`, `STAFF`, `OUTSIDER` (outside visitor), `ADMIN`. ' +
          'Endpoints limited to certain roles say so in their description and in the `x-roles` extension.',
        '',
        '**Responses.** Most endpoints return `{ success, data }` on success and `{ success: false, error, code? }` on failure.',
        'All timestamps are ISO 8601 UTC. Opening hours and the `date`/`timeSlot` parameters use Asia/Bangkok time.',
      ].join('\n'),
    },
    servers: buildServers(environment),
    tags: [
      { name: 'Auth', description: 'Sign-in, sessions, onboarding, and behaviour score' },
      {
        name: 'Auth (RBAC examples)',
        description: 'Demo endpoints that check the auth middleware',
      },
      { name: 'Profile', description: 'Update the signed-in user’s profile' },
      { name: 'Layout', description: 'Floor plan and live table availability' },
      { name: 'Bookings', description: 'Hold → confirm → check in / cancel a seat' },
      { name: 'Tickets', description: 'Paid entry tickets for outside visitors (Stripe)' },
      { name: 'Issues', description: 'Users reporting facility problems' },
      { name: 'System Config', description: 'Booking limits and admin policy settings' },
      { name: 'Admin · Users', description: 'User search, score adjustment, audit log' },
      { name: 'Admin · Issues', description: 'Handle facility issue reports' },
      { name: 'Admin · Schedules', description: 'Library operating hours by date range' },
      { name: 'Webhooks', description: 'Called by third parties, not the frontend' },
      { name: 'Health', description: 'Connectivity check' },
    ],
    paths: {
      ...authPaths,
      ...profilePaths,
      ...layoutPaths,
      ...bookingPaths,
      ...ticketPaths,
      ...issuePaths,
      ...systemConfigPaths,
      ...adminPaths,
      ...miscPaths,
    },
    components: { schemas, responses, securitySchemes },
  };
}
