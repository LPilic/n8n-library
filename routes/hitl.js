const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../lib/middleware');
const { auditLog } = require('../lib/audit');
const { createNotification } = require('./notifications');

const crypto = require('crypto');
const router = express.Router();

// In-memory store for webhook captures (token -> { payload, captured_at })
const _captureStore = new Map();

// --- HITL Templates (form builder schemas) ---

router.get('/api/hitl/templates', requireRole('admin', 'editor'), async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.id, t.name, t.description, t.slug, t.is_active, t.created_at, t.updated_at,
        (SELECT COUNT(*)::int FROM hitl_requests r WHERE r.template_id = t.id) AS request_count,
        (SELECT COUNT(*)::int FROM hitl_requests r WHERE r.template_id = t.id AND r.status = 'pending') AS pending_count
      FROM hitl_templates t ORDER BY t.updated_at DESC
    `);
    res.json({ templates: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

router.get('/api/hitl/templates/:id', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM hitl_templates WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Template not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load template' });
  }
});

router.post('/api/hitl/templates', requireRole('admin'), async (req, res) => {
  try {
    const { name, description, slug, schema } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Name and slug required' });
    if (!schema || !schema.components) return res.status(400).json({ error: 'Schema with components required' });
    const { rows } = await pool.query(
      `INSERT INTO hitl_templates (name, description, slug, schema) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, description || '', slug, JSON.stringify(schema)]
    );
    auditLog(req.user, 'created', 'hitl_template', rows[0].id, name);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Slug already exists' });
    res.status(500).json({ error: 'Failed to create template' });
  }
});

router.put('/api/hitl/templates/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, description, slug, schema } = req.body;
    const updates = []; const params = []; let idx = 1;
    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
    if (slug !== undefined) { updates.push(`slug = $${idx++}`); params.push(slug); }
    if (schema !== undefined) { updates.push(`schema = $${idx++}`); params.push(JSON.stringify(schema)); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    updates.push(`updated_at = NOW()`);
    params.push(req.params.id);
    const { rowCount } = await pool.query(
      `UPDATE hitl_templates SET ${updates.join(', ')} WHERE id = $${idx}`, params
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Template not found' });
    res.json({ message: 'Template updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update template' });
  }
});

router.delete('/api/hitl/templates/:id', requireRole('admin'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM hitl_templates WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Template not found' });
    auditLog(req.user, 'deleted', 'hitl_template', req.params.id);
    res.json({ message: 'Template deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Toggle template active/inactive
router.patch('/api/hitl/templates/:id/toggle', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE hitl_templates SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING id, is_active',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Template not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle template' });
  }
});

// --- HITL Requests (inbound from n8n, API key auth) ---

router.post('/api/hitl/requests', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required (API key or session)' });
    const { template, callback_url, title, description, data, priority, timeout_minutes, assign_to } = req.body;
    if (!template || !callback_url) return res.status(400).json({ error: 'template (slug) and callback_url required' });

    // Look up template by slug
    const tplRes = await pool.query('SELECT id, name, is_active FROM hitl_templates WHERE slug = $1', [template]);
    if (tplRes.rows.length === 0) return res.status(404).json({ error: `Template "${template}" not found` });
    const tpl = tplRes.rows[0];
    if (!tpl.is_active) return res.status(403).json({ error: `Template "${template}" is inactive` });

    const expiresAt = timeout_minutes
      ? new Date(Date.now() + timeout_minutes * 60 * 1000)
      : new Date(Date.now() + 24 * 60 * 60 * 1000); // default 24h

    const { rows } = await pool.query(
      `INSERT INTO hitl_requests (template_id, callback_url, title, description, data, priority, expires_at, assign_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        tpl.id, callback_url,
        title || tpl.name,
        description || '',
        JSON.stringify(data || {}),
        priority || 'medium',
        expiresAt,
        assign_to || null,
      ]
    );

    const request = rows[0];

    // Send notifications to admins/editors
    const { rows: users } = await pool.query(
      "SELECT id FROM users WHERE role IN ('admin','editor')" + (assign_to ? " OR id = $1" : ""),
      assign_to ? [assign_to] : []
    );
    for (const u of users) {
      createNotification(u.id, 'hitl', `Approval: ${request.title}`, description || 'New approval request', '/approvals').catch(() => {});
    }

    // Broadcast to SSE clients
    broadcastHitlUpdate({ type: 'new_request', request: { id: request.id, title: request.title, priority: request.priority } });

    res.status(201).json({ id: request.id, status: 'pending', expires_at: expiresAt });
  } catch (err) {
    console.error('HITL create request error:', err.message);
    res.status(500).json({ error: 'Failed to create approval request' });
  }
});

// --- HITL Requests listing (for reviewers) ---

router.get('/api/hitl/requests', requireAuth, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    let where = '';
    const params = [];
    if (status !== 'all') {
      where = 'WHERE r.status = $1';
      params.push(status);
    }

    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;

    const { rows } = await pool.query(
      `SELECT r.*, t.name as template_name, t.slug as template_slug, t.schema as template_schema,
              u.username as responded_by_name
       FROM hitl_requests r
       LEFT JOIN hitl_templates t ON t.id = r.template_id
       LEFT JOIN users u ON u.id = r.responded_by
       ${where}
       ORDER BY r.created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...params, limit, offset]
    );

    const countRes = await pool.query(
      `SELECT COUNT(*)::int as count FROM hitl_requests r ${where}`, params
    );

    // Count pending separately for badge
    const pendingRes = await pool.query(
      "SELECT COUNT(*)::int as count FROM hitl_requests WHERE status = 'pending'"
    );

    res.json({
      requests: rows,
      total: countRes.rows[0].count,
      pending_count: pendingRes.rows[0].count,
    });
  } catch (err) {
    console.error('HITL list error:', err.message);
    res.status(500).json({ error: 'Failed to load requests' });
  }
});

router.get('/api/hitl/requests/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, t.name as template_name, t.slug as template_slug, t.schema as template_schema,
              u.username as responded_by_name
       FROM hitl_requests r
       LEFT JOIN hitl_templates t ON t.id = r.template_id
       LEFT JOIN users u ON u.id = r.responded_by
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Request not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load request' });
  }
});

// --- HITL Response (reviewer submits decision) ---

router.post('/api/hitl/requests/:id/respond', requireAuth, async (req, res) => {
  try {
    const { action, form_data, comment } = req.body;
    if (!action) return res.status(400).json({ error: 'Action required' });

    const reqRes = await pool.query('SELECT * FROM hitl_requests WHERE id = $1', [req.params.id]);
    if (reqRes.rows.length === 0) return res.status(404).json({ error: 'Request not found' });
    const hitlReq = reqRes.rows[0];

    if (hitlReq.status !== 'pending') {
      return res.status(400).json({ error: `Request already ${hitlReq.status}` });
    }

    // Check if expired
    if (hitlReq.expires_at && new Date(hitlReq.expires_at) < new Date()) {
      await pool.query("UPDATE hitl_requests SET status = 'expired' WHERE id = $1", [hitlReq.id]);
      return res.status(400).json({ error: 'Request has expired' });
    }

    // Update request status
    const newStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action;
    await pool.query(
      `UPDATE hitl_requests SET status = $1, responded_by = $2, responded_at = NOW(), response_data = $3, response_comment = $4 WHERE id = $5`,
      [newStatus, req.user.id, JSON.stringify(form_data || {}), comment || '', hitlReq.id]
    );

    // Callback to n8n
    const callbackPayload = {
      request_id: hitlReq.id,
      action: action,
      status: newStatus,
      responded_by: req.user.username,
      form_data: form_data || {},
      comment: comment || '',
      timestamp: new Date().toISOString(),
    };

    try {
      // Rewrite localhost callback URLs to use internal n8n URL (Docker networking)
      let callbackUrl = hitlReq.callback_url;
      const internalUrl = process.env.N8N_INTERNAL_URL;
      if (internalUrl) {
        try {
          const parsed = new URL(callbackUrl);
          if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
            const internal = new URL(internalUrl);
            parsed.protocol = internal.protocol;
            parsed.host = internal.host;
            callbackUrl = parsed.toString();
          }
        } catch {}
      }
      console.log('HITL callback: original_url=%s rewritten_url=%s', hitlReq.callback_url, callbackUrl);
      const cbRes = await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'n8n-library-hitl/1.0' },
        body: JSON.stringify(callbackPayload),
        signal: AbortSignal.timeout(15000),
      });
      console.log('HITL callback: status=%d', cbRes.status);
      await pool.query('UPDATE hitl_requests SET callback_status = $1 WHERE id = $2', [cbRes.status, hitlReq.id]);
    } catch (cbErr) {
      console.error('HITL callback error:', cbErr.message);
      await pool.query('UPDATE hitl_requests SET callback_status = 0 WHERE id = $1', [hitlReq.id]);
    }

    auditLog(req.user, action, 'hitl_request', hitlReq.id, `${hitlReq.title} — ${action}`);
    broadcastHitlUpdate({ type: 'response', request_id: hitlReq.id, action, responded_by: req.user.username });

    res.json({ message: `Request ${newStatus}`, callback_sent: true });
  } catch (err) {
    console.error('HITL respond error:', err.message);
    res.status(500).json({ error: 'Failed to submit response' });
  }
});

// --- SSE for real-time HITL updates ---

const hitlSseClients = new Map();

router.get('/api/hitl/stream', requireAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':\n\n');

  const clientId = Date.now() + '-' + Math.random().toString(36).slice(2);
  hitlSseClients.set(clientId, res);

  req.on('close', () => { hitlSseClients.delete(clientId); });
});

function broadcastHitlUpdate(data) {
  const msg = `event: hitl\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [, res] of hitlSseClients) {
    try { res.write(msg); } catch {}
  }
}

// --- Pending count (for nav badge) ---

router.get('/api/hitl/pending-count', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT COUNT(*)::int as count FROM hitl_requests WHERE status = 'pending'");
    res.json({ count: rows[0].count });
  } catch (err) {
    res.json({ count: 0 });
  }
});

// --- Production Webhook (creates a real HITL request) ---
// Usage from n8n: POST /api/hitl/webhook/<slug> with Authorization: Bearer n8nlib_xxx
// Body: { callback_url, title?, description?, data?, priority?, timeout_minutes?, assign_to? }

router.post('/api/hitl/webhook/:slug', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required (API key)' });

    const { rows: tplRows } = await pool.query('SELECT id, name, is_active FROM hitl_templates WHERE slug = $1', [req.params.slug]);
    if (!tplRows.length) return res.status(404).json({ error: `Template "${req.params.slug}" not found` });
    const tpl = tplRows[0];
    if (!tpl.is_active) return res.status(403).json({ error: `Template "${req.params.slug}" is inactive — enable it to accept webhooks` });

    const { callback_url, title, description, data, priority, timeout_minutes, assign_to } = req.body;
    if (!callback_url) return res.status(400).json({ error: 'callback_url is required' });

    const expiresAt = timeout_minutes
      ? new Date(Date.now() + timeout_minutes * 60 * 1000)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    const { rows } = await pool.query(
      `INSERT INTO hitl_requests (template_id, callback_url, title, description, data, priority, expires_at, assign_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [tpl.id, callback_url, title || tpl.name, description || '', JSON.stringify(data || {}),
       priority || 'medium', expiresAt, assign_to || null]
    );
    const request = rows[0];

    // Notify admins/editors
    const { rows: users } = await pool.query(
      "SELECT id FROM users WHERE role IN ('admin','editor')" + (assign_to ? " OR id = $1" : ""),
      assign_to ? [assign_to] : []
    );
    for (const u of users) {
      createNotification(u.id, 'hitl', `Approval: ${request.title}`, description || 'New approval request', '/approvals').catch(() => {});
    }
    broadcastHitlUpdate({ type: 'new_request', request: { id: request.id, title: request.title, priority: request.priority } });

    res.status(201).json({ id: request.id, status: 'pending', expires_at: expiresAt });
  } catch (err) {
    console.error('HITL webhook error:', err.message);
    res.status(500).json({ error: 'Failed to create approval request' });
  }
});

// --- Test Webhook (validates but does NOT create a request) ---
// Usage from n8n: POST /api/hitl/webhook/test/<slug> with Authorization: Bearer n8nlib_xxx

router.post('/api/hitl/webhook/test/:slug', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required (API key)' });

    const { rows: tplRows } = await pool.query('SELECT id, name, schema, is_active FROM hitl_templates WHERE slug = $1', [req.params.slug]);
    if (!tplRows.length) return res.status(404).json({ error: `Template "${req.params.slug}" not found` });
    const tpl = tplRows[0];

    const { callback_url, title, data } = req.body;

    res.json({
      ok: true,
      message: 'Test webhook received — no request created',
      active: tpl.is_active,
      template: { id: tpl.id, name: tpl.name },
      would_create: {
        title: title || tpl.name,
        callback_url: callback_url || '(missing — required in production)',
        data_fields: data ? Object.keys(data) : [],
        data_preview: data || {},
      }
    });
  } catch (err) {
    console.error('HITL test webhook error:', err.message);
    res.status(500).json({ error: 'Failed to validate' });
  }
});

// --- Webhook Capture (for form builder) ---

// Start a capture session — returns a token and URL
router.post('/api/hitl/capture', requireRole('admin', 'editor'), (req, res) => {
  const token = crypto.randomBytes(16).toString('hex');
  _captureStore.set(token, { payload: null, captured_at: null });
  // Clean up after 10 minutes
  setTimeout(() => _captureStore.delete(token), 10 * 60 * 1000);
  res.json({ token });
});

// Receive webhook payload (no auth — this is what n8n hits)
// Hardened: single-use, size-limited, rate-limited per IP
const _captureAttempts = new Map(); // ip -> { count, resetAt }
router.post('/api/hitl/capture/:token', express.json({ limit: '1mb' }), (req, res) => {
  // Rate limit: max 20 attempts per minute per IP
  const ip = req.ip;
  const now = Date.now();
  let attempts = _captureAttempts.get(ip);
  if (!attempts || now > attempts.resetAt) {
    attempts = { count: 0, resetAt: now + 60000 };
    _captureAttempts.set(ip, attempts);
  }
  attempts.count++;
  if (attempts.count > 20) return res.status(429).json({ error: 'Too many attempts' });

  const entry = _captureStore.get(req.params.token);
  if (!entry) return res.status(404).json({ error: 'Capture session expired or not found' });
  if (entry.payload) return res.status(409).json({ error: 'Payload already captured' });
  entry.payload = req.body;
  entry.captured_at = new Date().toISOString();
  res.json({ ok: true, message: 'Payload captured' });
});

// Poll for captured payload (auth required)
router.get('/api/hitl/capture/:token', requireAuth, (req, res) => {
  const entry = _captureStore.get(req.params.token);
  if (!entry) return res.status(404).json({ error: 'Session not found' });
  if (!entry.payload) return res.json({ captured: false });
  res.json({ captured: true, payload: entry.payload, captured_at: entry.captured_at });
  // Clean up after retrieval
  _captureStore.delete(req.params.token);
});

// Cancel a capture session
router.delete('/api/hitl/capture/:token', requireAuth, (_req, res) => {
  _captureStore.delete(_req.params.token);
  res.json({ ok: true });
});

module.exports = router;
