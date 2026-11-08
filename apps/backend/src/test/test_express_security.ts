import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { deflateSync, gzipSync } from 'node:zlib';
import express, { type ErrorRequestHandler } from 'express';
import session from 'express-session';

// Resolve Express's dependency, rather than relying on where npm hoists qs.
const qs = createRequire(import.meta.resolve('express'))('qs') as typeof import('qs');

async function withServer(app: express.Express, run: (url: string) => Promise<void>) {
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
  const app = express();
  // Match server.ts: default JSON limits and extended form parsing.
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
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
  for (const trust of [false, '::ffff:10.0.0.0/8', '::/1']) {
    const app = express();
    app.set('trust proxy', trust);
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
    const app = express();
    app.set('trust proxy', trust);
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
    // GHSA-27r3-jxmh-p828: send the suffix only AFTER the decoder finishes.
    // A single buffered fetch can miss the error emitted by the finished stream.
    const app = express();
    let finishRequest: (() => void) | undefined;
    app.use(express.json());
    app.post('/body', (req, res) => {
      req.once('end', () => res.json(req.body));
      finishRequest!();
    });
    app.get('/health', (_req, res) => res.json({ ok: true }));
    await withServer(app, async (url) => {
      const first = Buffer.concat([deflateSync('{"booking":12}'), Buffer.from([0])]);
      const trailing = Buffer.alloc(64 * 1024, 0x58);
      const result = await new Promise<{ status: number | undefined; body: string }>(
        (resolve, reject) => {
          const client = request(
            `${url}/body`,
            {
              method: 'POST',
              agent: false,
              headers: {
                'Content-Type': 'application/json',
                'Content-Encoding': 'deflate',
                'Content-Length': first.length + trailing.length,
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
          finishRequest = () => {
            client.end(trailing);
          };
          client.write(first);
        }
      );
      assert.equal(result.status, 200);
      assert.deepEqual(JSON.parse(result.body), { booking: 12 });
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

function sessionApp(secure: boolean) {
  const app = express();
  app.use(
    session({
      secret: 'express-security-tests-only',
      resave: false,
      saveUninitialized: false,
      cookie: { secure, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 },
    })
  );
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
