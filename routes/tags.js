const express = require('express');
const { requireRole } = require('../lib/middleware');
const { getInstanceBase } = require('../lib/n8n-api');

const router = express.Router();

// List tags
router.get('/api/tags', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const r = await fetch(`${cfg.base}/api/v1/tags?limit=100`, {
      headers: { 'X-N8N-API-KEY': cfg.key },
    });
    if (!r.ok) return res.status(r.status).json({ error: 'Failed to fetch tags' });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error('Tags list error:', err.message);
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Create tag
router.post('/api/tags', requireRole('admin'), async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    const r = await fetch(`${cfg.base}/api/v1/tags`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!r.ok) {
      const errBody = await r.text();
      return res.status(r.status).json({ error: errBody || 'Failed to create tag' });
    }
    const data = await r.json();
    res.status(201).json(data);
  } catch (err) {
    console.error('Tag create error:', err.message);
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Update tag
router.put('/api/tags/:id', requireRole('admin'), async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    const r = await fetch(`${cfg.base}/api/v1/tags/${encodeURIComponent(req.params.id)}`, {
      method: 'PUT',
      headers: { 'X-N8N-API-KEY': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!r.ok) {
      const errBody = await r.text();
      return res.status(r.status).json({ error: errBody || 'Failed to update tag' });
    }
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error('Tag update error:', err.message);
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Delete tag
router.delete('/api/tags/:id', requireRole('admin'), async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const r = await fetch(`${cfg.base}/api/v1/tags/${encodeURIComponent(req.params.id)}`, {
      method: 'DELETE',
      headers: { 'X-N8N-API-KEY': cfg.key },
    });
    if (!r.ok) {
      const errBody = await r.text();
      return res.status(r.status).json({ error: errBody || 'Failed to delete tag' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Tag delete error:', err.message);
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Get workflow tags
router.get('/api/tags/workflow/:workflowId', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const r = await fetch(`${cfg.base}/api/v1/workflows/${encodeURIComponent(req.params.workflowId)}/tags`, {
      headers: { 'X-N8N-API-KEY': cfg.key },
    });
    if (!r.ok) return res.status(r.status).json({ error: 'Failed to fetch workflow tags' });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Update workflow tags
router.put('/api/tags/workflow/:workflowId', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const { tagIds } = req.body;
    if (!Array.isArray(tagIds)) return res.status(400).json({ error: 'tagIds array required' });
    const r = await fetch(`${cfg.base}/api/v1/workflows/${encodeURIComponent(req.params.workflowId)}/tags`, {
      method: 'PUT',
      headers: { 'X-N8N-API-KEY': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(tagIds.map(id => ({ id }))),
    });
    if (!r.ok) {
      const errBody = await r.text();
      return res.status(r.status).json({ error: errBody || 'Failed to update workflow tags' });
    }
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

module.exports = router;
