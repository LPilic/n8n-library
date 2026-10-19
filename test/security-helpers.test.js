const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CREDENTIAL_ENCRYPTION_KEY = 'ab'.repeat(32);

const {
  isPrivateIp,
  isPrivateUrl,
  validateExternalUrl,
  signPayload,
} = require('../lib/helpers');
const { encrypt, decrypt } = require('../lib/crypto');
const { validateWebhookUrl } = require('../lib/webhooks');

test('isPrivateIp blocks private, loopback, link-local and reserved ranges', () => {
  for (const ip of [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ]) {
    assert.equal(isPrivateIp(ip), true, `${ip} should be private`);
  }

  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
    assert.equal(isPrivateIp(ip), false, `${ip} should be public`);
  }
});

test('isPrivateUrl rejects localhost, private literals and non-http schemes', () => {
  assert.equal(isPrivateUrl('http://localhost:3100'), true);
  assert.equal(isPrivateUrl('http://127.0.0.1/'), true);
  assert.equal(isPrivateUrl('http://10.0.0.1/'), true);
  assert.equal(isPrivateUrl('http://169.254.169.254/latest/meta-data'), true);
  assert.equal(isPrivateUrl('ftp://example.com/file'), true);
  assert.equal(isPrivateUrl('https://example.com/hook'), false);
});

test('validateExternalUrl allows public http(s) URLs and rejects unsafe ones', () => {
  assert.equal(validateExternalUrl('https://example.com/hook'), true);
  assert.equal(validateExternalUrl('http://8.8.8.8/'), true);
  assert.equal(validateExternalUrl('http://127.0.0.1/'), false);
  assert.equal(validateExternalUrl('javascript:alert(1)'), false);
  assert.equal(validateExternalUrl('not a url'), false);
  assert.equal(validateExternalUrl(''), true);
});

test('signPayload is deterministic and keyed', () => {
  const body = JSON.stringify({ hello: 'world' });
  const a = signPayload('secret-a', body);
  const b = signPayload('secret-a', body);
  const c = signPayload('secret-b', body);

  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^sha256=[a-f0-9]{64}$/);
});

test('credential crypto round-trips and rejects tampering', () => {
  const plaintext = JSON.stringify({ apiKey: 'n8n_api_example' });
  const ciphertext = encrypt(plaintext);
  assert.notEqual(ciphertext, plaintext);
  assert.equal(decrypt(ciphertext), plaintext);

  const bytes = Buffer.from(ciphertext, 'base64');
  bytes[bytes.length - 1] ^= 0xff;
  assert.throws(() => decrypt(bytes.toString('base64')));
});

test('webhook URL validation honours the private-network override', async () => {
  delete process.env.WEBHOOK_ALLOW_PRIVATE;
  assert.equal(await validateWebhookUrl('http://127.0.0.1:5678/webhook'), false);

  process.env.WEBHOOK_ALLOW_PRIVATE = 'true';
  assert.equal(await validateWebhookUrl('http://127.0.0.1:5678/webhook'), true);
  delete process.env.WEBHOOK_ALLOW_PRIVATE;
});
