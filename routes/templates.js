const express = require('express');
const pool = require('../db');
const { buildTemplateItem, isPrivateUrl } = require('../lib/helpers');
const { requireRole, writeLimiter, publicLimiter } = require('../lib/middleware');
const { auditLog } = require('../lib/audit');
const { fireWebhooks } = require('../lib/webhooks');

const router = express.Router();

// NODE_ICONS and NODE_CREDS are injected from server.js
let NODE_ICONS = {};
let NODE_CREDS = {};

function setNodeData(icons, creds) {
  NODE_ICONS = icons;
  NODE_CREDS = creds;
}

// --- Node icon/creds lookup ---

router.get('/api/node-icons', (_req, res) => { res.json(NODE_ICONS); });
router.get('/api/node-creds', (_req, res) => { res.json(NODE_CREDS); });

// --- Categories (n8n-facing) ---

router.get('/templates/categories', publicLimiter, async (_req, res) => {
  const { rows } = await pool.query('SELECT id, name FROM categories ORDER BY id');
  res.json({
    categories: rows.map(r => ({ id: r.id, name: r.name, displayName: null, icon: '', parent: null })),
  });
});

// --- Categories (library frontend) ---

router.get('/api/categories', async (_req, res) => {
  const { rows } = await pool.query('SELECT id, name, icon, description FROM categories ORDER BY id');
  res.json({
    categories: rows.map(r => ({ id: r.id, name: r.name, icon: r.icon || '', description: r.description || '' })),
  });
});

// --- Search templates ---

router.get('/templates/search', publicLimiter, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const rows = Math.max(1, Math.min(100, parseInt(req.query.rows, 10) || 20));
  const offset = (page - 1) * rows;
  const { category, search } = req.query;

  let where = [];
  let params = [];
  let paramIdx = 1;

  if (search) {
    where.push(`(t.name ILIKE $${paramIdx} OR t.description ILIKE $${paramIdx})`);
    params.push(`%${search}%`);
    paramIdx++;
  }
  if (category) {
    const cats = Array.isArray(category) ? category.map(c => String(c).trim()) : String(category).split(',').map(c => c.trim());
    where.push(`EXISTS (
      SELECT 1 FROM template_categories tc
      JOIN categories c ON c.id = tc.category_id
      WHERE tc.template_id = t.id AND c.name ILIKE ANY($${paramIdx}::text[])
    )`);
    params.push(cats);
    paramIdx++;
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const countResult = await pool.query(`SELECT COUNT(*) FROM templates t ${whereClause}`, params);
  const totalWorkflows = parseInt(countResult.rows[0].count, 10);

  const dataResult = await pool.query(`
    SELECT t.*,
      COALESCE(
        (SELECT json_agg(json_build_object('id', c.id, 'name', c.name))
         FROM template_categories tc JOIN categories c ON c.id = tc.category_id
         WHERE tc.template_id = t.id), '[]'
      ) AS categories
    FROM templates t
    ${whereClause}
    ORDER BY t.created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `, [...params, rows, offset]);

  const workflows = dataResult.rows.map(row => {
    const item = buildTemplateItem(row);
    delete item.workflow;
    return item;
  });

  res.json({ workflows, totalWorkflows });
});

// --- Get template metadata ---

router.get('/templates/workflows/:id', publicLimiter, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT t.*,
      COALESCE(
        (SELECT json_agg(json_build_object('id', c.id, 'name', c.name))
         FROM template_categories tc JOIN categories c ON c.id = tc.category_id
         WHERE tc.template_id = t.id), '[]'
      ) AS categories
    FROM templates t WHERE t.id = $1
  `, [req.params.id]);

  if (rows.length === 0) return res.status(404).json({ error: 'Template not found' });
  res.json({ workflow: buildTemplateItem(rows[0]) });
});

// --- Get workflow for canvas import ---

router.get('/workflows/templates/:id', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, workflow FROM templates WHERE id = $1', [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Template not found' });
  res.json({ id: rows[0].id, name: rows[0].name, workflow: rows[0].workflow });
});

// --- Collections ---

router.get('/templates/collections', publicLimiter, async (req, res) => {
  const { category, search } = req.query;
  let where = [];
  let params = [];
  let paramIdx = 1;

  if (search) {
    where.push(`col.name ILIKE $${paramIdx}`);
    params.push(`%${search}%`);
    paramIdx++;
  }
  if (category) {
    const cats = Array.isArray(category) ? category.map(c => String(c).trim()) : String(category).split(',').map(c => c.trim());
    where.push(`EXISTS (
      SELECT 1 FROM collection_workflows cw
      JOIN template_categories tc ON tc.template_id = cw.template_id
      JOIN categories c ON c.id = tc.category_id
      WHERE cw.collection_id = col.id AND c.name ILIKE ANY($${paramIdx}::text[])
    )`);
    params.push(cats);
    paramIdx++;
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const { rows } = await pool.query(`
    SELECT col.*,
      COALESCE(
        (SELECT json_agg(json_build_object('id', cw.template_id))
         FROM collection_workflows cw WHERE cw.collection_id = col.id), '[]'
      ) AS workflows
    FROM collections col
    ${whereClause}
    ORDER BY col.rank
  `, params);

  const collections = rows.map(r => ({
    id: r.id, rank: r.rank, name: r.name, totalViews: r.total_views,
    createdAt: r.created_at, workflows: r.workflows, nodes: [],
  }));
  res.json({ collections });
});

router.get('/templates/collections/:id', publicLimiter, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT col.*,
      COALESCE(
        (SELECT json_agg(json_build_object('id', cw.template_id))
         FROM collection_workflows cw WHERE cw.collection_id = col.id), '[]'
      ) AS workflows
    FROM collections col WHERE col.id = $1
  `, [req.params.id]);

  if (rows.length === 0) return res.status(404).json({ error: 'Collection not found' });
  const r = rows[0];
  res.json({
    collection: { id: r.id, rank: r.rank, name: r.name, totalViews: r.total_views, createdAt: r.created_at, workflows: r.workflows, nodes: [] },
  });
});

// --- WRITE API ---

router.post('/api/templates', requireRole('admin', 'editor'), writeLimiter, async (req, res) => {
  const { name, description, categories: categoryNames, workflow } = req.body;

  if (!workflow || !workflow.nodes || !workflow.connections) {
    return res.status(400).json({ error: 'Request body must include a valid workflow object with nodes and connections' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const nodes = (workflow.nodes || []).map((node, i) => {
      const nodeType = node.type || 'unknown';
      const iconInfo = NODE_ICONS[nodeType] || {};
      return {
        id: i + 1,
        icon: iconInfo.icon || 'fa:question',
        name: nodeType,
        codex: { data: { categories: [] } },
        group: iconInfo.group || ((nodeType).toLowerCase().includes('trigger') ? '["trigger"]' : '["transform"]'),
        defaults: { name: node.name || iconInfo.displayName || nodeType },
        iconData: iconInfo.iconData || { type: 'icon', icon: 'question' },
        displayName: iconInfo.displayName || node.name || nodeType,
        typeVersion: node.typeVersion || 1,
        nodeCategories: [],
      };
    });

    const nodeTypes = {};
    for (const node of workflow.nodes || []) {
      const t = node.type || 'unknown';
      nodeTypes[t] = nodeTypes[t] || { count: 0 };
      nodeTypes[t].count++;
    }

    const workflowData = {
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: workflow.settings || {},
      pinData: workflow.pinData || {},
    };

    const insertResult = await client.query(`
      INSERT INTO templates (name, description, nodes, workflow_info, workflow)
      VALUES ($1, $2, $3, $4, $5) RETURNING id
    `, [
      name || workflow.name || 'Untitled Template',
      description || '',
      JSON.stringify(nodes),
      JSON.stringify({ nodeCount: (workflow.nodes || []).length, nodeTypes }),
      JSON.stringify(workflowData),
    ]);

    const templateId = insertResult.rows[0].id;

    if (categoryNames && categoryNames.length > 0) {
      for (const catName of categoryNames) {
        const catResult = await client.query(
          `INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [catName]
        );
        await client.query(
          'INSERT INTO template_categories (template_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [templateId, catResult.rows[0].id]
        );
      }
    }

    // Save initial version
    await client.query(
      'INSERT INTO template_versions (template_id, name, description, workflow, edited_by, version_note) VALUES ($1,$2,$3,$4,$5,$6)',
      [templateId, name || workflow.name || 'Untitled Template', description || '', JSON.stringify(workflowData), req.user.id, 'Initial version']
    );

    await client.query('COMMIT');
    auditLog(req.user, 'created', 'template', templateId, name);
    fireWebhooks('template.created', { id: templateId, name: name || workflow.name });
    res.status(201).json({ id: templateId, message: 'Template created' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create template error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

router.put('/api/templates/:id', requireRole('admin', 'editor'), writeLimiter, async (req, res) => {
  const { name, description, categories: categoryNames, version_note } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Snapshot current state before update
    const current = await client.query('SELECT name, description, workflow FROM templates WHERE id=$1', [req.params.id]);
    if (current.rows.length > 0) {
      await client.query(
        'INSERT INTO template_versions (template_id, name, description, workflow, edited_by, version_note) VALUES ($1,$2,$3,$4,$5,$6)',
        [req.params.id, current.rows[0].name, current.rows[0].description, current.rows[0].workflow, req.user.id, version_note || '']
      );
    }
    const updates = []; const params = []; let idx = 1;
    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
    if (updates.length > 0) {
      params.push(req.params.id);
      await client.query(`UPDATE templates SET ${updates.join(', ')} WHERE id = $${idx}`, params);
    }
    if (categoryNames !== undefined) {
      await client.query('DELETE FROM template_categories WHERE template_id = $1', [req.params.id]);
      for (const catName of categoryNames) {
        const catResult = await client.query(
          `INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [catName]
        );
        await client.query(
          'INSERT INTO template_categories (template_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [req.params.id, catResult.rows[0].id]
        );
      }
    }
    await client.query('COMMIT');
    auditLog(req.user, 'updated', 'template', req.params.id, name || '');
    fireWebhooks('template.updated', { id: req.params.id, name: name || '' });
    res.json({ message: 'Template updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update template error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

router.delete('/api/templates/:id', requireRole('admin'), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM templates WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Template not found' });
  auditLog(req.user, 'deleted', 'template', req.params.id);
  fireWebhooks('template.deleted', { id: req.params.id });
  res.json({ message: 'Template deleted' });
});

// --- Template Version History ---

router.get('/api/templates/:id/versions', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT v.id, v.name, v.version_note, v.created_at, u.username AS edited_by_name
       FROM template_versions v LEFT JOIN users u ON u.id=v.edited_by
       WHERE v.template_id=$1 ORDER BY v.created_at DESC`,
      [req.params.id]
    );
    res.json({ versions: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load versions' });
  }
});

router.get('/api/templates/:id/versions/:versionId', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT v.*, u.username AS edited_by_name
       FROM template_versions v LEFT JOIN users u ON u.id=v.edited_by
       WHERE v.id=$1 AND v.template_id=$2`,
      [req.params.versionId, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Version not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load version' });
  }
});

router.post('/api/templates/:id/versions/:versionId/restore', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const ver = await pool.query('SELECT * FROM template_versions WHERE id=$1 AND template_id=$2', [req.params.versionId, req.params.id]);
    if (ver.rows.length === 0) return res.status(404).json({ error: 'Version not found' });
    const v = ver.rows[0];
    // Save current state as a version before restoring
    const current = await pool.query('SELECT name, description, workflow FROM templates WHERE id=$1', [req.params.id]);
    if (current.rows.length > 0) {
      await pool.query(
        'INSERT INTO template_versions (template_id, name, description, workflow, edited_by, version_note) VALUES ($1,$2,$3,$4,$5,$6)',
        [req.params.id, current.rows[0].name, current.rows[0].description, current.rows[0].workflow, req.user.id, 'Before restore']
      );
    }
    await pool.query('UPDATE templates SET name=$1, description=$2, workflow=$3 WHERE id=$4',
      [v.name, v.description, v.workflow, req.params.id]);
    auditLog(req.user, 'restored', 'template', req.params.id, `Restored to version ${v.id}`);
    res.json({ message: 'Template restored to version' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore version' });
  }
});

// --- Category management ---

router.post('/api/categories', requireRole('admin'), async (req, res) => {
  const { name, icon, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO categories (name, icon, description) VALUES ($1, $2, $3) RETURNING id, name, icon, description',
      [name, icon || '', description || '']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(409).json({ error: 'Category already exists' });
  }
});

router.put('/api/categories/:id', requireRole('admin'), async (req, res) => {
  const { name, icon, description } = req.body;
  const updates = []; const params = []; let idx = 1;
  if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
  if (icon !== undefined) { updates.push(`icon = $${idx++}`); params.push(icon); }
  if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id);
  const { rowCount } = await pool.query(`UPDATE categories SET ${updates.join(', ')} WHERE id = $${idx}`, params);
  if (rowCount === 0) return res.status(404).json({ error: 'Category not found' });
  res.json({ message: 'Category updated' });
});

router.delete('/api/categories/:id', requireRole('admin'), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Category not found' });
  res.json({ message: 'Category deleted' });
});

// --- n8n API proxy ---

router.post('/api/n8n-proxy', requireRole('admin', 'editor'), async (req, res) => {
  const { n8nUrl, apiKey, path: apiPath, method: proxyMethod, body: proxyBody } = req.body;
  if (!n8nUrl || !apiKey || !apiPath) {
    return res.status(400).json({ error: 'n8nUrl, apiKey, and path are required' });
  }
  if (!apiPath.startsWith('/api/')) {
    return res.status(400).json({ error: 'apiPath must start with /api/' });
  }
  const allowedMethods = ['GET', 'PATCH', 'PUT', 'POST'];
  const fetchMethod = (proxyMethod || 'GET').toUpperCase();
  if (!allowedMethods.includes(fetchMethod)) {
    return res.status(400).json({ error: 'Method not allowed' });
  }

  try {
    const N8N_INTERNAL = process.env.N8N_INTERNAL_URL || '';
    let baseUrl = n8nUrl.replace(/\/+$/, '');
    if (N8N_INTERNAL && (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1'))) {
      baseUrl = N8N_INTERNAL.replace(/\/+$/, '');
    }
    const url = `${baseUrl}${apiPath}`;
    // Skip SSRF check when using the internal Docker URL (server-configured, not user-supplied)
    if (!N8N_INTERNAL || baseUrl !== N8N_INTERNAL.replace(/\/+$/, '')) {
      if (isPrivateUrl(url)) {
        return res.status(400).json({ error: 'Requests to private networks are not allowed' });
      }
    }
    console.log(`n8n-proxy: ${fetchMethod} ${url}`);
    const fetchOpts = {
      method: fetchMethod,
      headers: { 'X-N8N-API-KEY': apiKey, 'Accept': 'application/json' },
    };
    if (proxyBody && fetchMethod !== 'GET') {
      fetchOpts.headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify(proxyBody);
    }
    const response = await fetch(url, fetchOpts);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// --- Rebuild node icons ---

router.post('/api/rebuild-icons', requireRole('admin'), async (_req, res) => {
  const { rows } = await pool.query('SELECT id, workflow FROM templates');
  let updated = 0;
  for (const row of rows) {
    const wf = row.workflow;
    if (!wf || !wf.nodes) continue;

    const nodes = wf.nodes.map((node, i) => {
      const nodeType = node.type || 'unknown';
      const iconInfo = NODE_ICONS[nodeType] || {};
      return {
        id: i + 1,
        icon: iconInfo.icon || 'fa:question',
        name: nodeType,
        codex: { data: { categories: [] } },
        group: iconInfo.group || ((nodeType).toLowerCase().includes('trigger') ? '["trigger"]' : '["transform"]'),
        defaults: { name: node.name || iconInfo.displayName || nodeType },
        iconData: iconInfo.iconData || { type: 'icon', icon: 'question' },
        displayName: iconInfo.displayName || node.name || nodeType,
        typeVersion: node.typeVersion || 1,
        nodeCategories: [],
      };
    });

    await pool.query('UPDATE templates SET nodes = $1 WHERE id = $2', [JSON.stringify(nodes), row.id]);
    updated++;
  }
  res.json({ message: `Rebuilt icons for ${updated} templates` });
});

router.setNodeData = setNodeData;
module.exports = router;
