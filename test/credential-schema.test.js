const test = require('node:test');
const assert = require('node:assert/strict');
const {
  collectProperties,
  collectRequiredKeys,
  applySchemaDefaults,
} = require('../lib/credential-schema');

test('collects properties across allOf and skips notice fields', () => {
  const schema = {
    type: 'object',
    properties: { apiKey: { type: 'string' } },
    allOf: [
      { properties: { region: { type: 'string' }, notice: { type: 'notice' } } },
    ],
  };
  const props = collectProperties(schema);
  assert.deepEqual([...props.keys()].sort(), ['apiKey', 'region']);
});

test('collects required keys from root and allOf, but not oneOf alternatives', () => {
  const schema = {
    required: ['root'],
    allOf: [{ required: ['shared'] }],
    oneOf: [{ required: ['branchA'] }, { required: ['branchB'] }],
  };
  assert.deepEqual([...collectRequiredKeys(schema)].sort(), ['root', 'shared']);
});

test('applies defaults without hiding missing required fields', () => {
  const schema = {
    type: 'object',
    required: ['token'],
    properties: {
      token: { type: 'string' },
      enabled: { type: 'boolean' },
      count: { type: 'number' },
      mode: { type: 'string', default: 'auto' },
    },
  };
  const result = applySchemaDefaults(schema, {});
  assert.deepEqual(result.missingRequired, ['token']);
  assert.equal(result.data.enabled, false);
  assert.equal(result.data.count, 0);
  assert.equal(result.data.mode, 'auto');
  assert.equal(result.data.token, undefined);
});

test('explicit values win over defaults and unknown keys are removed when disallowed', () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      token: { type: 'string', default: 'default-token' },
      enabled: { type: 'boolean', default: true },
    },
  };
  const result = applySchemaDefaults(schema, { token: 'explicit', extra: 'remove-me' });
  assert.equal(result.data.token, 'explicit');
  assert.equal(result.data.enabled, true);
  assert.equal(result.data.extra, undefined);
  assert.deepEqual(result.unknownKeys, ['extra']);
});

test('uses the first enum value for optional enum fields', () => {
  const schema = {
    type: 'object',
    properties: {
      allowedHttpRequestDomains: { type: 'string', enum: ['all', 'domains', 'none'] },
    },
  };
  const result = applySchemaDefaults(schema, {});
  assert.equal(result.data.allowedHttpRequestDomains, 'all');
});

test('keeps unknown keys when the schema permits additional properties', () => {
  const schema = {
    type: 'object',
    properties: { token: { type: 'string' } },
  };
  const result = applySchemaDefaults(schema, { token: 'x', extra: 'keep-me' });
  assert.equal(result.data.extra, 'keep-me');
});
