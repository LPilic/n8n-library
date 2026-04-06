const express = require('express');
const pool = require('../db');
const { requireRole } = require('../lib/middleware');
const { auditLog } = require('../lib/audit');
const { WEBHOOK_EVENTS } = require('../lib/webhooks');
const { isPrivateUrl } = require('../lib/helpers');

const router = express.Router();

router.get('/api/webhooks', requireRole('admin'), async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM webhooks ORDER BY created_at DESC');
    res.json({ webhooks: rows, events: WEBHOOK_EVENTS });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/webhooks', requireRole('admin'), async (req, res) => {
  try {
    const { name, url, events, headers, enabled } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'Name and URL required' });
    if (isPrivateUrl(url)) return res.status(400).json({ error: 'Webhook URL must not target a private/internal address' });
    if (!events || events.length === 0) return res.status(400).json({ error: 'At least one event required' });
    const { rows } = await pool.query(
      `INSERT INTO webhooks (name, url, events, headers, enabled) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, url, JSON.stringify(events), JSON.stringify(headers || {}), enabled !== false]
    );
    auditLog(req.user, 'created', 'webhook', rows[0].id, name);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/webhooks/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, url, events, headers, enabled } = req.body;
    const updates = []; const params = []; let idx = 1;
    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (url !== undefined) {
      if (isPrivateUrl(url)) return res.status(400).json({ error: 'Webhook URL must not target a private/internal address' });
      updates.push(`url = $${idx++}`); params.push(url);
    }
    if (events !== undefined) { updates.push(`events = $${idx++}`); params.push(JSON.stringify(events)); }
    if (headers !== undefined) { updates.push(`headers = $${idx++}`); params.push(JSON.stringify(headers)); }
    if (enabled !== undefined) { updates.push(`enabled = $${idx++}`); params.push(enabled); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id);
    const { rowCount } = await pool.query(`UPDATE webhooks SET ${updates.join(', ')} WHERE id = $${idx}`, params);
    if (rowCount === 0) return res.status(404).json({ error: 'Webhook not found' });
    res.json({ message: 'Webhook updated' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/webhooks/:id', requireRole('admin'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM webhooks WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Webhook not found' });
    auditLog(req.user, 'deleted', 'webhook', req.params.id);
    res.json({ message: 'Webhook deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test webhook
router.post('/api/webhooks/:id/test', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM webhooks WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Webhook not found' });
    const wh = rows[0];
    const headers = { 'Content-Type': 'application/json', 'User-Agent': 'n8n-library-webhook/1.0', ...(wh.headers || {}) };
    const body = JSON.stringify({ event: 'test', timestamp: new Date().toISOString(), data: { message: 'Test webhook from n8n Library' } });
    const r = await fetch(wh.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) });
    await pool.query('UPDATE webhooks SET last_triggered_at = NOW(), last_status = $1 WHERE id = $2', [r.status, wh.id]);
    res.json({ status: r.status, ok: r.ok });
  } catch (err) {
    res.json({ status: 0, ok: false, error: err.message });
  }
});

module.exports = router;
