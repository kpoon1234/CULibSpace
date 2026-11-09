import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { request } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { gzipSync } from 'node:zlib';
import type { Express, ErrorRequestHandler } from 'express';
import type session from 'express-session';
import { createApp } from '../app.js';
import { StripePaymentGateway } from '../services/stripePaymentGateway.js';

// Resolve Express's dependency, rather than relying on where npm hoists qs.
const qs = createRequire(import.meta.resolve('express'))('qs') as typeof import('qs');

const testEnvironment = { NODE_ENV: 'test', SESSION_SECRET: 'express-security-tests-only' };

function securityApp(environment: NodeJS.ProcessEnv = {}) {
  return createApp({ environment: { ...testEnvironment, ...environment } });
}

async function withServer(app: Express, run: (url: string) => Promise<void>) {
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

function parsingApp() {
  const app = securityApp();
  app.post('/body', (req, res) => res.json(req.body));
  app.get('/query', (req, res) => res.json(req.query));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use(((error, _req, res, _next) => {
    res.status(error.status || 500).json({ type: error.type });
  }) as ErrorRequestHandler);
  return app;
}

test('untrusted forwarded headers cannot spoof the client IP or protocol', async () => {
  // The IPv6 subnet cases reproduce GHSA-jqcg-44mw-7w3h. These settings
  // belong only to this fixture; production keeps Express's default trust=false.
  for (const trust of [false, '::ffff:10.0.0.0/8', '::/1'] as const) {
    const app = securityApp({ TRUST_PROXY: trust === false ? undefined : trust });
    app.get('/', (req, res) => res.json({ ip: req.ip, ips: req.ips, protocol: req.protocol }));
    await withServer(app, async (url) => {
      const response = await fetch(url, {
        headers: { 'X-Forwarded-For': '198.51.100.42', 'X-Forwarded-Proto': 'https' },
      });
      assert.deepEqual(await response.json(), { ip: '127.0.0.1', ips: [], protocol: 'http' });
    });
  }
});

test('an explicitly trusted proxy preserves headers and stops at the first untrusted hop', async () => {
  for (const trust of ['loopback', '::ffff:127.0.0.0/104']) {
    const app = securityApp({ TRUST_PROXY: trust });
    app.get('/', (req, res) => res.json({ ip: req.ip, ips: req.ips, protocol: req.protocol }));
    await withServer(app, async (url) => {
      const response = await fetch(url, {
        headers: {
          'X-Forwarded-For': '192.0.2.99, 198.51.100.42',
          'X-Forwarded-Proto': 'https',
        },
      });
      assert.deepEqual(await response.json(), {
        ip: '198.51.100.42',
        ips: ['198.51.100.42'],
        protocol: 'https',
      });
    });
  }
});

test('JSON, compressed JSON, extended forms and default query parsing still work', async () => {
  await withServer(parsingApp(), async (url) => {
    const data = { booking: { table: 12 }, tags: ['a', 'b'] };
    const json = await fetch(`${url}/body`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    assert.equal(json.status, 200);
    assert.deepEqual(await json.json(), data);

    const compressed = await fetch(`${url}/body`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      body: gzipSync(JSON.stringify(data)),
    });
    assert.equal(compressed.status, 200);
    assert.deepEqual(await compressed.json(), data);

    const form = await fetch(`${url}/body`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'booking[table]=12&tags[]=a&tags[]=b&__proto__[polluted]=true',
    });
    assert.equal(form.status, 200);
    assert.deepEqual(await form.json(), { booking: { table: '12' }, tags: ['a', 'b'] });
    assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false);

    const query = await fetch(`${url}/query?tag=a&tag=b&search=A%26B&filter[room]=A`);
    assert.equal(query.status, 200);
    assert.deepEqual(await query.json(), {
      tag: ['a', 'b'],
      search: 'A&B',
      'filter[room]': 'A',
    });
  });
});

test('invalid JSON, broken compression and oversized bodies are rejected without taking down HTTP', async () => {
  await withServer(parsingApp(), async (url) => {
    for (const [body, encoding, expected] of [
      ['{"broken":', 'identity', 400],
      ['not a gzip stream', 'gzip', 400],
      [JSON.stringify({ value: 'x'.repeat(101 * 1024) }), 'identity', 413],
    ] as const) {
      const response = await fetch(`${url}/body`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Encoding': encoding },
        body,
      });
      assert.equal(response.status, expected);
      await response.arrayBuffer();
      const healthy = await fetch(`${url}/health`);
      assert.equal(healthy.status, 200);
      assert.deepEqual(await healthy.json(), { ok: true });
    }
  });
});

test(
  'trailing bytes after a finished compressed frame do not crash or hang the server',
  { timeout: 10000 },
  async () => {
    // GHSA-27r3-jxmh-p828: a finished gzip frame followed by invalid bytes.
    // Keep the HTTP body larger than one socket read so bytes reach Gunzip
    // after raw-body finishes. The old deflate-only case also passed on 2.3.0.
    await withServer(parsingApp(), async (url) => {
      const body = Buffer.concat([
        gzipSync('{"booking":12}'),
        Buffer.from([0]),
        Buffer.alloc(100 * 1024, 0x58),
      ]);
      const result = await new Promise<{ status: number | undefined; body: string }>(
        (resolve, reject) => {
          const client = request(
            `${url}/body`,
            {
              method: 'POST',
              agent: false,
              headers: {
                'Content-Type': 'application/json',
                'Content-Encoding': 'gzip',
                'Content-Length': body.length,
              },
            },
            (res) => {
              let body = '';
              res.setEncoding('utf8');
              res.on('data', (chunk: string) => {
                body += chunk;
              });
              res.on('error', reject);
              res.on('end', () => resolve({ status: res.statusCode, body }));
            }
          );
          client.on('error', reject);
          client.setTimeout(3000, () =>
            client.destroy(new Error('Compressed request did not finish'))
          );
          client.end(body);
        }
      );
      assert.equal(result.status, 200);
      assert.deepEqual(JSON.parse(result.body), { booking: 12 });
      // The vulnerable decoder emits its unhandled error after the response.
      await delay(200);
      const healthy = await fetch(`${url}/health`);
      assert.equal(healthy.status, 200);
      assert.deepEqual(await healthy.json(), { ok: true });
    });
  }
);

test('qs handles non-callable toString and encodes empty-array keys safely', () => {
  // Both Snyk qs advisories, including the Medium fixed in 6.16.2.
  assert.equal(
    qs.stringify({ items: [{ toString: null }] }, { arrayFormat: 'comma' }),
    'items=%5Bobject%20Object%5D'
  );
  const encoded = qs.stringify({ 'safe&admin=true': [] }, { allowEmptyArrays: true });
  assert.equal(encoded, 'safe%26admin%3Dtrue[]');
  assert.deepEqual(qs.parse(encoded, { allowEmptyArrays: true }), { 'safe&admin=true': [] });
});

function sessionApp(secure: boolean, trustProxy?: string) {
  const app = securityApp({ NODE_ENV: secure ? 'production' : 'test', TRUST_PROXY: trustProxy });
  app.get('/session', (req, res) => {
    const state = req.session as session.Session & { visits?: number };
    state.visits = (state.visits || 0) + 1;
    res.json({ visits: state.visits });
  });
  app.post('/logout', (req, res, next) => {
    req.session.destroy((error) => {
      if (error) return next(error);
      res.sendStatus(204);
    });
  });
  return app;
}

test('HTTP session cookies persist, reject tampering and stop working after logout', async () => {
  await withServer(sessionApp(false), async (url) => {
    const first = await fetch(`${url}/session`);
    assert.deepEqual(await first.json(), { visits: 1 });
    const setCookie = first.headers.get('set-cookie');
    assert.ok(setCookie);
    assert.match(setCookie, /; HttpOnly/);
    const cookie = setCookie.split(';')[0];

    const second = await fetch(`${url}/session`, { headers: { Cookie: cookie } });
    assert.deepEqual(await second.json(), { visits: 2 });

    const tampered = await fetch(`${url}/session`, { headers: { Cookie: 'connect.sid=tampered' } });
    assert.deepEqual(await tampered.json(), { visits: 1 });

    const logout = await fetch(`${url}/logout`, { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(logout.status, 204);
    const afterLogout = await fetch(`${url}/session`, { headers: { Cookie: cookie } });
    assert.deepEqual(await afterLogout.json(), { visits: 1 });
  });
});

test('spoofed HTTPS headers cannot cause a secure cookie over an untrusted HTTP connection', async () => {
  await withServer(sessionApp(true), async (url) => {
    const response = await fetch(`${url}/session`, { headers: { 'X-Forwarded-Proto': 'https' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('set-cookie'), null);
    await response.arrayBuffer();
  });
});

test('secure session cookies work only through the configured proxy', async () => {
  // Use the same factory configuration as the local Next.js/ngrok deployment.
  const trustedApp = sessionApp(true, 'loopback');
  await withServer(trustedApp, async (url) => {
    const first = await fetch(`${url}/session`, { headers: { 'X-Forwarded-Proto': 'https' } });
    assert.deepEqual(await first.json(), { visits: 1 });
    const setCookie = first.headers.get('set-cookie');
    assert.ok(setCookie);
    assert.match(setCookie, /; Secure/);
    assert.match(setCookie, /; HttpOnly/);
    const second = await fetch(`${url}/session`, {
      headers: { 'X-Forwarded-Proto': 'https', Cookie: setCookie.split(';')[0] },
    });
    assert.deepEqual(await second.json(), { visits: 2 });
  });
  assert.throws(() => securityApp({ TRUST_PROXY: 'true' }), /invalid IP address/);
});

test('the real app verifies Stripe signatures over raw bytes before the JSON parser', async () => {
  const secret = 'whsec_express_security_only';
  const gateway = new StripePaymentGateway({ secretKey: 'sk_test_fixture', webhookSecret: secret });
  const payload =
    JSON.stringify(
      {
        id: 'evt_raw_security',
        type: 'customer.created',
        livemode: false,
        data: { object: { id: 'cus_security' } },
      },
      null,
      2
    ) + '\n';
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')}`;
  const originalParse = gateway.parseWebhookEvent.bind(gateway);
  let verifiedBytes: Buffer | undefined;
  gateway.parseWebhookEvent = async (body, header) => {
    assert.ok(Buffer.isBuffer(body));
    const event = await originalParse(body, header);
    verifiedBytes = body;
    return event;
  };
  const app = createApp({ environment: testEnvironment, paymentGatewayFactory: () => gateway });
  await withServer(app, async (url) => {
    const post = (body: string, header: string | undefined) =>
      fetch(`${url}/api/tickets/payment/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(header ? { 'Stripe-Signature': header } : {}),
        },
        body,
      });
    const valid = await post(payload, signature);
    assert.equal(valid.status, 200);
    // Unknown event types acknowledge receipt without touching the database.
    assert.deepEqual(await valid.json(), { received: true, handled: false });
    assert.deepEqual(verifiedBytes, Buffer.from(payload));
    for (const [body, header] of [
      [payload.trim(), signature],
      [payload, 'invalid'],
      [payload, undefined],
    ] as const) {
      const invalid = await post(body, header);
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).received, false);
    }
  });
});
