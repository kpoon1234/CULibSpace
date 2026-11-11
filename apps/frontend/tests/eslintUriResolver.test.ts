import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

// The root package.json overrides `uri-js` (abandoned) with `fast-uri`. Load Ajv
// and the URI library the same way ESLint does, so this checks the real override.
const require = createRequire(import.meta.url);
const ajvPath = require.resolve('ajv', { paths: [require.resolve('eslint')] });
const Ajv = require(ajvPath);
const uri = require(require.resolve('uri-js', { paths: [ajvPath] }));

test('Ajv resolves a parent-directory $ref against the schema $id', () => {
  const ajv = new Ajv();
  ajv.addSchema({
    $id: 'https://example.com/shared.json',
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  });

  const validate = ajv.compile({
    $id: 'https://example.com/schemas/user.json',
    $ref: '../shared.json',
  });

  assert.equal(validate({ name: 'Nida' }), true);
  assert.equal(validate({}), false);
});

test('uri-js replacement follows RFC 3986 reference resolution', () => {
  const base = 'http://a/b/c/d;p?q';
  const cases: Array<[string, string]> = [
    ['g', 'http://a/b/c/g'],
    ['./g', 'http://a/b/c/g'],
    ['../g', 'http://a/b/g'],
    ['../../g', 'http://a/g'],
    ['../../../g', 'http://a/g'],
    ['/./g', 'http://a/g'],
    ['g/../h', 'http://a/b/c/h'],
    ['//g', 'http://g'],
    ['?y', 'http://a/b/c/d;p?y'],
    ['#s', 'http://a/b/c/d;p?q#s'],
  ];

  for (const [reference, expected] of cases) {
    assert.equal(uri.resolve(base, reference), expected, `resolve(${reference})`);
  }
  assert.equal(
    uri.resolve('https://example.com/schemas/user.json', '../shared.json'),
    'https://example.com/shared.json'
  );
});
