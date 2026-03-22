const express = require('express');
const { requireRole } = require('../lib/middleware');
const { getInstanceConfig } = require('../lib/n8n-api');

const router = express.Router();

async function getInstanceBase(req) {
  const instanceId = req.query.instance_id || req.body?.instance_id;
  const inst = await getInstanceConfig(instanceId);
  if (!inst) return null;
  return { base: inst.internal_url.replace(/\/+$/, ''), key: inst.api_key };
}

// List variables
router.get('/api/variables', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const r = await fetch(`${cfg.base}/api/v1/variables?limit=100`, {
      headers: { 'X-N8N-API-KEY': cfg.key },
    });
    if (!r.ok) return res.status(r.status).json({ error: 'Failed to fetch variables' });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error('Variables list error:', err.message);
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Create variable
router.post('/api/variables', requireRole('admin'), async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const { key, value } = req.body;
    if (!key || !key.trim()) return res.status(400).json({ error: 'key is required' });
    const r = await fetch(`${cfg.base}/api/v1/variables`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key.trim(), value: value || '' }),
    });
    if (!r.ok) {
      const errBody = await r.text();
      return res.status(r.status).json({ error: errBody || 'Failed to create variable' });
    }
    const data = await r.json();
    res.status(201).json(data);
  } catch (err) {
    console.error('Variable create error:', err.message);
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Update variable
router.put('/api/variables/:id', requireRole('admin'), async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const { key, value } = req.body;
    if (!key || !key.trim()) return res.status(400).json({ error: 'key is required' });
    const r = await fetch(`${cfg.base}/api/v1/variables/${encodeURIComponent(req.params.id)}`, {
      method: 'PUT',
      headers: { 'X-N8N-API-KEY': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key.trim(), value: value || '' }),
    });
    if (!r.ok) {
      const errBody = await r.text();
      return res.status(r.status).json({ error: errBody || 'Failed to update variable' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Variable update error:', err.message);
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Delete variable
router.delete('/api/variables/:id', requireRole('admin'), async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const r = await fetch(`${cfg.base}/api/v1/variables/${encodeURIComponent(req.params.id)}`, {
      method: 'DELETE',
      headers: { 'X-N8N-API-KEY': cfg.key },
    });
    if (!r.ok) {
      const errBody = await r.text();
      return res.status(r.status).json({ error: errBody || 'Failed to delete variable' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Variable delete error:', err.message);
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

module.exports = router;
