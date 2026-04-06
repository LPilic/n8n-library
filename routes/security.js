const express = require('express');
const { requireRole } = require('../lib/middleware');
const { getInstanceBase } = require('../lib/n8n-api');

const router = express.Router();

// Run security audit
router.post('/api/security/audit', requireRole('admin'), async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const { categories, daysAbandonedWorkflow } = req.body;
    const body = {};
    if (categories || daysAbandonedWorkflow) {
      body.additionalOptions = {};
      if (categories) body.additionalOptions.categories = categories;
      if (daysAbandonedWorkflow) body.additionalOptions.daysAbandonedWorkflow = daysAbandonedWorkflow;
    }
    const r = await fetch(`${cfg.base}/api/v1/audit`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const errBody = await r.text();
      return res.status(r.status).json({ error: errBody || 'Audit failed' });
    }
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error('Security audit error:', err.message);
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

module.exports = router;
