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

// Transform n8n audit response to the flat format the React frontend expects
function transformAuditResponse(data) {
  const result = {
    credentials: [],
    nodes: [],
    community_nodes: [],
    custom_nodes: [],
    settings: [],
    versions: [],
  };

  for (const key of Object.keys(data)) {
    const report = data[key];
    if (!report || !report.sections) continue;
    const risk = report.risk || '';

    for (const section of report.sections) {
      const items = section.location || [];
      const hasSettings = !!section.settings;
      const hasNextVersions = !!section.nextVersions;

      // Derive severity from item count — matches legacy logic (public/js/security.js:88)
      let severity;
      if (items.length === 0 && !hasSettings && !hasNextVersions) continue;
      if (items.length < 3) severity = 'low';
      else if (items.length < 10) severity = 'medium';
      else severity = 'high';

      const details = [section.description, section.recommendation].filter(Boolean).join(' — ');

      // Determine target category based on risk field
      let targetCat;
      if (risk === 'credentials') {
        targetCat = 'credentials';
      } else if (risk === 'nodes') {
        targetCat = 'nodes';
      } else if (risk === 'instance') {
        targetCat = hasNextVersions ? 'versions' : 'settings';
      } else if (risk === 'database') {
        targetCat = 'nodes';
      } else if (risk === 'filesystem') {
        targetCat = 'custom_nodes';
      } else {
        targetCat = 'settings';
      }

      if (items.length > 0) {
        // Add individual items for detailed display
        for (const loc of items) {
          let message = section.title;
          let itemDetails = details;

          // Build a readable name from the location object
          const parts = [];
          if (loc.name) parts.push(loc.name);
          if (loc.kind === 'community') {
            targetCat = 'community_nodes';
          } else if (loc.kind === 'custom') {
            targetCat = 'custom_nodes';
          }
          if (loc.nodeType) parts.push(loc.nodeType);
          if (loc.type) parts.push(loc.type);
          if (parts.length > 0) {
            itemDetails = parts.join(' · ') + (details ? ' — ' + details : '');
          }

          result[targetCat].push({ severity, message, details: itemDetails });
        }
      } else {
        // Settings/version sections without location items
        let message = section.title;
        let itemDetails = details;
        if (hasNextVersions) {
          itemDetails = 'Next versions: ' + section.nextVersions.map(v => v.name).join(', ');
          severity = 'medium';
        }
        if (hasSettings) {
          const settingNames = Object.keys(section.settings);
          if (settingNames.length > 0) {
            itemDetails = settingNames.map(k => `${k}: ${section.settings[k]}`).join(', ');
          }
          severity = 'low';
        }
        result[targetCat].push({ severity, message, details: itemDetails });
      }
    }
  }

  return result;
}

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
      console.error(`Security audit n8n error: status=${r.status} body=${errBody}`);
      return res.status(r.status).json({ error: errBody || 'Audit failed' });
    }
    const data = await r.json();
    res.json(transformAuditResponse(data));
  } catch (err) {
    console.error('Security audit error:', err.message);
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

module.exports = router;
