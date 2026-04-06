const express = require('express');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const { requireAuth, requireRole, credentialLimiter } = require('../lib/middleware');
const { getInstanceConfig } = require('../lib/n8n-api');
const { auditLog } = require('../lib/audit');

const router = express.Router();

async function getInstanceBase(req) {
  const instanceId = req.query.instance_id || req.body?.instance_id;
  const inst = await getInstanceConfig(instanceId);
  if (!inst) return null;
  return { base: inst.internal_url.replace(/\/+$/, ''), key: inst.api_key };
}

// List credentials (metadata only — secrets excluded by n8n API)
router.get('/api/credentials', requireRole('admin'), async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const allCreds = [];
    let cursor = '';
    let hasMore = true;
    while (hasMore) {
      const url = cursor
        ? `${cfg.base}/api/v1/credentials?limit=100&cursor=${cursor}`
        : `${cfg.base}/api/v1/credentials?limit=100`;
      const r = await fetch(url, { headers: { 'X-N8N-API-KEY': cfg.key } });
      if (!r.ok) return res.status(r.status).json({ error: 'Failed to fetch credentials' });
      const data = await r.json();
      allCreds.push(...(data.data || []));
      cursor = data.nextCursor || '';
      hasMore = !!cursor;
    }
    res.json({ data: allCreds });
  } catch (err) {
    console.error('Credentials list error:', err.message);
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// List all available credential types (from bundled data)
let credentialTypesCache = null;
router.get('/api/credentials/types', requireRole('admin'), (_req, res) => {
  if (!credentialTypesCache) {
    try {
      credentialTypesCache = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'credential-types.json'), 'utf8'));
    } catch (e) {
      return res.json([]);
    }
  }
  res.json(credentialTypesCache);
});

// List projects (for transfer dropdown) — must be before /:id routes
router.get('/api/credentials/projects', requireRole('admin'), async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const r = await fetch(`${cfg.base}/api/v1/projects?limit=100`, {
      headers: { 'X-N8N-API-KEY': cfg.key },
    });
    if (!r.ok) return res.status(r.status).json({ error: 'Failed to fetch projects' });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Get credential schema for a type
router.get('/api/credentials/schema/:typeName', requireRole('admin'), async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const r = await fetch(`${cfg.base}/api/v1/credentials/schema/${encodeURIComponent(req.params.typeName)}`, {
      headers: { 'X-N8N-API-KEY': cfg.key },
    });
    if (!r.ok) return res.status(r.status).json({ error: 'Schema not found' });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Create credential
router.post('/api/credentials', requireRole('admin'), credentialLimiter, async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const { name, type, data } = req.body;
    if (!name || !type || !data) return res.status(400).json({ error: 'name, type and data are required' });
    const r = await fetch(`${cfg.base}/api/v1/credentials`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type, data }),
    });
    if (!r.ok) {
      const errBody = await r.text();
      return res.status(r.status).json({ error: errBody || 'Failed to create credential' });
    }
    const result = await r.json();
    const instanceId = req.query.instance_id || req.body?.instance_id || null;
    pool.query(
      'INSERT INTO credential_audit (n8n_credential_id, credential_name, credential_type, instance_id, user_id, action, detail) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [result.id, name, type, instanceId, req.user.id, 'created', `Created credential "${name}" (${type})`]
    ).catch(() => {});
    auditLog(req.user, 'created', 'credential', result.id, `${name} (${type})`);
    res.status(201).json(result);
  } catch (err) {
    console.error('Credential create error:', err.message);
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Update credential
router.patch('/api/credentials/:id', requireRole('admin'), credentialLimiter, async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const { name, type, data } = req.body;
    const body = {};
    if (name) body.name = name;
    if (type) body.type = type;
    if (data) body.data = data;
    const r = await fetch(`${cfg.base}/api/v1/credentials/${encodeURIComponent(req.params.id)}`, {
      method: 'PATCH',
      headers: { 'X-N8N-API-KEY': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const errBody = await r.text();
      return res.status(r.status).json({ error: errBody || 'Failed to update credential' });
    }
    const result = await r.json();
    const instanceId = req.query.instance_id || req.body?.instance_id || null;
    const changes = [name && 'name', data && 'fields'].filter(Boolean).join(', ') || 'metadata';
    pool.query(
      'INSERT INTO credential_audit (n8n_credential_id, credential_name, credential_type, instance_id, user_id, action, detail) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [req.params.id, name || result.name, type || result.type, instanceId, req.user.id, 'updated', `Updated ${changes}`]
    ).catch(() => {});
    auditLog(req.user, 'updated', 'credential', req.params.id, `Updated ${changes}`);
    res.json(result);
  } catch (err) {
    console.error('Credential update error:', err.message);
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Delete credential
router.delete('/api/credentials/:id', requireRole('admin'), credentialLimiter, async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const r = await fetch(`${cfg.base}/api/v1/credentials/${encodeURIComponent(req.params.id)}`, {
      method: 'DELETE',
      headers: { 'X-N8N-API-KEY': cfg.key },
    });
    if (!r.ok) {
      const errBody = await r.text();
      return res.status(r.status).json({ error: errBody || 'Failed to delete credential' });
    }
    const instanceId = req.query.instance_id || null;
    pool.query(
      'INSERT INTO credential_audit (n8n_credential_id, instance_id, user_id, action, detail) VALUES ($1,$2,$3,$4,$5)',
      [req.params.id, instanceId, req.user.id, 'deleted', `Deleted credential #${req.params.id}`]
    ).catch(() => {});
    auditLog(req.user, 'deleted', 'credential', req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Credential delete error:', err.message);
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Transfer credential to another project
router.put('/api/credentials/:id/transfer', requireRole('admin'), credentialLimiter, async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const { destinationProjectId } = req.body;
    if (!destinationProjectId) return res.status(400).json({ error: 'destinationProjectId is required' });
    const r = await fetch(`${cfg.base}/api/v1/credentials/${encodeURIComponent(req.params.id)}/transfer`, {
      method: 'PUT',
      headers: { 'X-N8N-API-KEY': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinationProjectId }),
    });
    if (!r.ok) {
      const errBody = await r.text();
      return res.status(r.status).json({ error: errBody || 'Failed to transfer credential' });
    }
    const instanceId = req.query.instance_id || null;
    pool.query(
      'INSERT INTO credential_audit (n8n_credential_id, instance_id, user_id, action, detail) VALUES ($1,$2,$3,$4,$5)',
      [req.params.id, instanceId, req.user.id, 'transferred', `Transferred to project ${destinationProjectId}`]
    ).catch(() => {});
    auditLog(req.user, 'transferred', 'credential', req.params.id, `to project ${destinationProjectId}`);
    res.json({ success: true });
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Credential audit history
router.get('/api/credentials/audit', requireRole('admin', 'editor'), async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ca.*, u.username FROM credential_audit ca
      LEFT JOIN users u ON u.id = ca.user_id
      ORDER BY ca.created_at DESC LIMIT 100
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// My provisioning history (any authenticated user)
router.get('/api/credentials/my-provisions', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ca.*, ni.name as instance_name FROM credential_audit ca
      LEFT JOIN n8n_instances ni ON ni.id = ca.instance_id
      WHERE ca.user_id = $1 AND ca.action = 'provisioned'
      ORDER BY ca.created_at DESC LIMIT 50
    `, [req.user.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
