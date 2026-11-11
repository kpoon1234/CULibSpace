/**
 * Keeps the hand-written OpenAPI spec (src/openapi/) in sync with the real
 * Express routes, and checks that /api-docs is not exposed in production.
 *
 * Routes are discovered from the app itself: app.use(path, router) calls are
 * recorded while createApp() runs, then each router's route layers are read.
 * If this fails after you add/rename a route, update src/openapi/paths/.
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express, { type Express } from 'express';
import { createApp } from '../app.js';
import { buildOpenApiSpec, isApiDocsEnabled } from '../openapi/openapi.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const DOCS_PATHS = new Set(['/api-docs', '/api-docs.json']);
const baseEnvironment = { NODE_ENV: 'test', SESSION_SECRET: 'openapi-spec-tests-only' };

type RouteLayer = { route?: { path: unknown; methods: Record<string, boolean> } };
type Mount = { path: string; handler: unknown };

/** Express ":param" → OpenAPI "{param}", without trailing slash. */
function toOpenApiPath(path: string): string {
  const normalized = path.replace(/:([A-Za-z0-9_]+)/g, '{$1}').replace(/\/+$/, '');
  return normalized === '' ? '/' : normalized;
}

function routeLayers(stack: unknown): RouteLayer[] {
  return Array.isArray(stack) ? (stack as RouteLayer[]).filter((layer) => layer.route) : [];
}

function collectRoutes(layers: RouteLayer[], prefix: string, into: Set<string>) {
  for (const { route } of layers) {
    if (!route || typeof route.path !== 'string') continue;
    const fullPath = toOpenApiPath(prefix + route.path);
    if (DOCS_PATHS.has(fullPath)) continue;
    for (const method of Object.keys(route.methods)) {
      if ((HTTP_METHODS as readonly string[]).includes(method)) {
        into.add(`${method.toUpperCase()} ${fullPath}`);
      }
    }
  }
}

/** Every "METHOD /path" the app actually serves (excluding the docs themselves). */
function expressRoutes(): Set<string> {
  const mounts: Mount[] = [];
  const originalUse = express.application.use;
  express.application.use = function (this: Express, ...args: unknown[]) {
    if (typeof args[0] === 'string') {
      for (const handler of args.slice(1)) mounts.push({ path: args[0], handler });
    }
    return originalUse.apply(this, args as Parameters<typeof originalUse>);
  } as typeof originalUse;

  let app: Express;
  try {
    app = createApp({ environment: baseEnvironment });
  } finally {
    express.application.use = originalUse;
  }

  const routes = new Set<string>();
  // Routes registered directly on the app, e.g. GET /api/hello.
  collectRoutes(
    routeLayers((app as unknown as { router: { stack: unknown } }).router.stack),
    '',
    routes
  );
  // Routes inside routers mounted with app.use('/prefix', router).
  for (const { path, handler } of mounts) {
    collectRoutes(routeLayers((handler as { stack?: unknown }).stack), path, routes);
  }
  return routes;
}

function specOperations(): Set<string> {
  const spec = buildOpenApiSpec(baseEnvironment) as { paths: Record<string, object> };
  const operations = new Set<string>();
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of Object.keys(item)) {
      if ((HTTP_METHODS as readonly string[]).includes(method)) {
        operations.add(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  return operations;
}

async function statusOf(environment: NodeJS.ProcessEnv, path: string): Promise<number> {
  const server = createApp({ environment: { ...baseEnvironment, ...environment } }).listen(
    0,
    '127.0.0.1'
  );
  try {
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    await response.arrayBuffer();
    return response.status;
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('route discovery finds the routes (sanity check for the drift test)', () => {
  const routes = expressRoutes();
  assert.ok(routes.has('GET /api/hello'), 'app-level route');
  assert.ok(routes.has('POST /api/bookings/{bookingId}/cancel'), 'router route with param');
  assert.ok(routes.has('POST /api/tickets/payment/webhook'), 'webhook router');
  assert.ok(routes.size >= 50, `expected at least 50 routes, found ${routes.size}`);
});

test('every Express route is documented in the OpenAPI spec', () => {
  const documented = specOperations();
  const missing = [...expressRoutes()].filter((route) => !documented.has(route)).sort();
  assert.deepEqual(missing, [], `Add these routes to src/openapi/paths/: ${missing.join(', ')}`);
});

test('the OpenAPI spec documents no routes that do not exist', () => {
  const served = expressRoutes();
  const extra = [...specOperations()].filter((operation) => !served.has(operation)).sort();
  assert.deepEqual(extra, [], `Remove or fix these spec operations: ${extra.join(', ')}`);
});

test('isApiDocsEnabled: on outside production, off in production, flag overrides', () => {
  assert.equal(isApiDocsEnabled({ NODE_ENV: 'development' }), true);
  assert.equal(isApiDocsEnabled({}), true);
  assert.equal(isApiDocsEnabled({ NODE_ENV: 'production' }), false);
  assert.equal(isApiDocsEnabled({ NODE_ENV: 'production', ENABLE_API_DOCS: 'true' }), true);
  assert.equal(isApiDocsEnabled({ NODE_ENV: 'development', ENABLE_API_DOCS: 'false' }), false);
});

test('/api-docs is served in development and hidden in production', async () => {
  assert.equal(await statusOf({ NODE_ENV: 'development' }, '/api-docs/'), 200);
  assert.equal(await statusOf({ NODE_ENV: 'development' }, '/api-docs.json'), 200);
  assert.equal(await statusOf({ NODE_ENV: 'production' }, '/api-docs/'), 404);
  assert.equal(await statusOf({ NODE_ENV: 'production' }, '/api-docs.json'), 404);
  assert.equal(
    await statusOf({ NODE_ENV: 'production', ENABLE_API_DOCS: 'true' }, '/api-docs.json'),
    200
  );
});
