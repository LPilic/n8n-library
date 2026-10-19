const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const request = require('supertest');

const { pool, prepareDatabase } = require('./test-db');
const { signPayload } = require('../lib/helpers');
const apiKeyAuth = require('../lib/api-key-auth');

const hitlRouter = require('../routes/hitl');
const mcpRouter = require('../routes/mcp-routes');
const kbRouter = require('../routes/kb');

const RUN = crypto.randomBytes(4).toString('hex');
const emails = {
  admin: `test-admin-${RUN}@example.test`,
  editor1: `test-editor1-${RUN}@example.test`,
  editor2: `test-editor2-${RUN}@example.test`,
  viewer: `test-viewer-${RUN}@example.test`,
};

let users = {};
let templateId;

function makeApp(router, user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use(router);
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

async function insertUser(email, role) {
  const { rows } = await pool.query(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ($1, $2, 'test-hash', $3)
     RETURNING id, username, email, role`,
    [role + '-' + RUN, email, role]
  );
  return rows[0];
}

test.before(async () => {
  await prepareDatabase();
  users.admin = await insertUser(emails.admin, 'admin');
  users.editor1 = await insertUser(emails.editor1, 'editor');
  users.editor2 = await insertUser(emails.editor2, 'editor');
  users.viewer = await insertUser(emails.viewer, 'viewer');

  const tpl = await pool.query(
    `INSERT INTO hitl_templates (name, description, slug, schema)
     VALUES ($1, '', $2, '{"components":[]}'::jsonb) RETURNING id`,
    ['Test approval ' + RUN, 'test-approval-' + RUN]
  );
  templateId = tpl.rows[0].id;
});

test.after(async () => {
  await pool.query("DELETE FROM notifications WHERE user_id = ANY($1::int[])", [Object.values(users).map(u => u.id)]);
  await pool.query('DELETE FROM hitl_requests WHERE template_id = $1', [templateId]);
  await pool.query('DELETE FROM hitl_templates WHERE id = $1', [templateId]);
  await pool.query("DELETE FROM kb_articles WHERE author_id = ANY($1::int[])", [Object.values(users).map(u => u.id)]);
  await pool.query("DELETE FROM users WHERE email LIKE $1", [`test-%-${RUN}@example.test`]);
  await pool.end();
});

async function insertRequest({ assignTo = null, expiresAt = null, callbackUrl = 'http://127.0.0.1:9/callback' } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO hitl_requests (template_id, callback_url, title, description, data, priority, expires_at, assign_to)
     VALUES ($1, $2, $3, '', '{}'::jsonb, 'medium', $4, $5)
     RETURNING id, status`,
    [templateId, callbackUrl, 'Test request ' + RUN, expiresAt, assignTo]
  );
  return rows[0];
}

test('HITL respond requires a staff role and the assigned reviewer', async () => {
  process.env.HITL_ALLOW_PRIVATE_CALLBACKS = 'true';
  const hitl = await insertRequest({ assignTo: users.editor2.id });
  const path = `/api/hitl/requests/${hitl.id}/respond`;

  await request(makeApp(hitlRouter, users.viewer)).post(path).send({ action: 'approve' }).expect(403);
  await request(makeApp(hitlRouter, users.editor1)).post(path).send({ action: 'approve' }).expect(403);

  await request(makeApp(hitlRouter, users.editor2)).post(path).send({ action: 'bogus' }).expect(400);

  const ok = await request(makeApp(hitlRouter, users.editor2)).post(path).send({ action: 'approve' }).expect(200);
  assert.equal(ok.body.callback_sent, false);

  const { rows } = await pool.query('SELECT status FROM hitl_requests WHERE id = $1', [hitl.id]);
  assert.equal(rows[0].status, 'approved');
  delete process.env.HITL_ALLOW_PRIVATE_CALLBACKS;
});

test('expired HITL requests cannot be approved', async () => {
  process.env.HITL_ALLOW_PRIVATE_CALLBACKS = 'true';
  const hitl = await insertRequest({ expiresAt: new Date(Date.now() - 1000) });
  const path = `/api/hitl/requests/${hitl.id}/respond`;

  const res = await request(makeApp(hitlRouter, users.editor1)).post(path).send({ action: 'approve' }).expect(400);
  assert.match(res.body.error, /expired/i);
  const { rows } = await pool.query('SELECT status FROM hitl_requests WHERE id = $1', [hitl.id]);
  assert.equal(rows[0].status, 'expired');
  delete process.env.HITL_ALLOW_PRIVATE_CALLBACKS;
});

test('HITL rejects private callback URLs unless explicitly allowed', async () => {
  delete process.env.HITL_ALLOW_PRIVATE_CALLBACKS;
  delete process.env.N8N_INTERNAL_URL;
  const res = await request(makeApp(hitlRouter, users.viewer))
    .post('/api/hitl/requests')
    .send({
      template: 'test-approval-' + RUN,
      callback_url: 'http://169.254.169.254/latest/meta-data',
      title: 'SSRF attempt',
    })
    .expect(400);
  assert.match(res.body.error, /callback_url/i);
});

test('HITL signs callbacks when a secret is configured', async () => {
  process.env.HITL_ALLOW_PRIVATE_CALLBACKS = 'true';
  process.env.HITL_CALLBACK_SECRET = 'test-callback-secret';

  let resolveCallback;
  const callbackPromise = new Promise(resolve => { resolveCallback = resolve; });
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
      resolveCallback({ headers: req.headers, body });
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const created = await request(makeApp(hitlRouter, users.viewer))
      .post('/api/hitl/requests')
      .send({
        template: 'test-approval-' + RUN,
        callback_url: `http://127.0.0.1:${port}/callback`,
        title: 'Signed callback ' + RUN,
      })
      .expect(201);

    const res = await request(makeApp(hitlRouter, users.editor1))
      .post(`/api/hitl/requests/${created.body.id}/respond`)
      .send({ action: 'approve', comment: 'looks good' })
      .expect(200);
    assert.equal(res.body.callback_sent, true);

    const callback = await callbackPromise;
    assert.equal(callback.headers['x-n8n-library-signature'], signPayload('test-callback-secret', callback.body));
    const payload = JSON.parse(callback.body);
    assert.equal(payload.status, 'approved');
    assert.equal(payload.comment, 'looks good');
  } finally {
    server.close();
    delete process.env.HITL_ALLOW_PRIVATE_CALLBACKS;
    delete process.env.HITL_CALLBACK_SECRET;
  }
});

test('MCP endpoints enforce admin/editor roles', async () => {
  await request(makeApp(mcpRouter, users.viewer)).get('/api/mcp/servers').expect(403);
  await request(makeApp(mcpRouter, users.admin)).get('/api/mcp/servers').expect(200);

  await request(makeApp(mcpRouter, users.viewer))
    .post('/api/mcp/tools/call')
    .send({ serverId: 1, toolName: 'anything' })
    .expect(403);

  // The role check passes for editors; without a connected server the route
  // should return a validation error rather than a permission error.
  const res = await request(makeApp(mcpRouter, users.editor1))
    .post('/api/mcp/tools/call')
    .send({ serverId: 999999, toolName: 'anything' })
    .expect(400);
  assert.match(res.body.error, /not connected/i);
});

test('KB writes work with req.user and remain staff-only', async () => {
  await request(makeApp(kbRouter, users.viewer))
    .post('/api/kb/articles')
    .send({ title: 'Viewer article ' + RUN })
    .expect(403);

  const res = await request(makeApp(kbRouter, users.editor1))
    .post('/api/kb/articles')
    .send({ title: 'Editor article ' + RUN, body: '<p>hello</p>' })
    .expect(201);
  assert.equal(res.body.author_id, users.editor1.id);
});

function runApiKeyAuth(headers) {
  const req = { headers, user: null };
  return new Promise(resolve => {
    apiKeyAuth(req, {}, () => resolve(req));
  });
}

test('API key auth caps the effective role at the user role', async () => {
  const raw = 'n8nlib_' + crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  await pool.query(
    `INSERT INTO api_keys (user_id, name, key_prefix, key_hash, role)
     VALUES ($1, 'test-key', $2, $3, 'admin')`,
    [users.viewer.id, raw.substring(0, 15), hash]
  );

  const req = await runApiKeyAuth({ authorization: `Bearer ${raw}` });
  assert.ok(req.user);
  assert.equal(req.user.id, users.viewer.id);
  assert.equal(req.user.role, 'viewer'); // key role admin, user role viewer
});

test('expired API keys are ignored', async () => {
  const raw = 'n8nlib_' + crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  await pool.query(
    `INSERT INTO api_keys (user_id, name, key_prefix, key_hash, role, expires_at)
     VALUES ($1, 'expired-key', $2, $3, 'editor', NOW() - INTERVAL '1 day')`,
    [users.editor1.id, raw.substring(0, 15), hash]
  );

  const req = await runApiKeyAuth({ 'x-api-key': raw });
  assert.equal(req.user, null);
});
