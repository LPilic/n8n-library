const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { slugify, getSettingWithDefault } = require('../lib/helpers');
const { requireAuth, requireRole, writeLimiter, aiLimiter } = require('../lib/middleware');
const { auditLog } = require('../lib/audit');
const { aiComplete } = require('../lib/ai-providers');

const router = express.Router();

const AI_DEFAULT_PROMPT_IMPROVE = 'You are an expert prompt engineer. Improve the given prompt to be clearer, more effective, and produce better results from LLMs. Preserve the original intent and any template variables ({{variable_name}}). Return ONLY the improved prompt text, no explanations or metadata.';

// Generate a unique slug for prompts
async function promptSlug(title) {
  let slug = slugify(title);
  if (!slug) slug = 'prompt';
  const { rows } = await pool.query('SELECT 1 FROM prompts WHERE slug = $1', [slug]);
  if (rows.length) slug += '-' + crypto.randomBytes(3).toString('hex');
  return slug;
}

// --- Prompt categories (distinct values) --- must be before :idOrSlug route
router.get('/api/prompts/categories', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT category FROM prompts WHERE category != '' ORDER BY category`
    );
    res.json(rows.map(r => r.category));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- List prompts ---
router.get('/api/prompts', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const { category, status, q, sort } = req.query;
    const isWriter = req.user && (req.user.role === 'admin' || req.user.role === 'editor');

    let where = [];
    let params = [];
    let pi = 1;

    if (!isWriter) {
      where.push(`p.status = 'published'`);
    } else if (status) {
      where.push(`p.status = $${pi++}`);
      params.push(status);
    }

    if (category) {
      where.push(`p.category = $${pi++}`);
      params.push(category);
    }

    let rankSelect = '';
    let orderBy = 'p.updated_at DESC';
    if (q && q.trim()) {
      const searchTerm = q.trim();
      where.push(`(p.search_vector @@ plainto_tsquery('english', $${pi}) OR p.name ILIKE '%' || $${pi} || '%')`);
      params.push(searchTerm);
      rankSelect = `, ts_rank(p.search_vector, plainto_tsquery('english', $${pi})) AS rank`;
      orderBy = `rank DESC, p.updated_at DESC`;
      pi++;
    } else if (sort === 'name') {
      orderBy = 'p.name ASC';
    } else if (sort === 'created') {
      orderBy = 'p.created_at DESC';
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const countRes = await pool.query(`SELECT COUNT(*) FROM prompts p ${whereClause}`, params);
    const total = parseInt(countRes.rows[0].count);

    const { rows } = await pool.query(`
      SELECT p.id, p.name, p.slug, p.description, p.category, p.tags, p.status,
             p.current_version, p.created_at, p.updated_at,
             u.username AS created_by_name,
             u2.username AS updated_by_name
             ${rankSelect}
      FROM prompts p
      LEFT JOIN users u ON u.id = p.created_by
      LEFT JOIN users u2 ON u2.id = p.updated_by
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${pi++} OFFSET $${pi++}
    `, [...params, limit, offset]);

    res.json({ prompts: rows, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Prompts list error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Get prompt detail ---
router.get('/api/prompts/:idOrSlug', requireAuth, async (req, res) => {
  try {
    const param = req.params.idOrSlug;
    const isId = /^\d+$/.test(param);
    const isWriter = req.user && (req.user.role === 'admin' || req.user.role === 'editor');

    const { rows } = await pool.query(`
      SELECT p.*, u.username AS created_by_name, u2.username AS updated_by_name
      FROM prompts p
      LEFT JOIN users u ON u.id = p.created_by
      LEFT JOIN users u2 ON u2.id = p.updated_by
      WHERE ${isId ? 'p.id = $1' : 'p.slug = $1'}
    `, [isId ? parseInt(param) : param]);

    if (!rows.length) return res.status(404).json({ error: 'Prompt not found' });
    const prompt = rows[0];
    if (!isWriter && prompt.status !== 'published') return res.status(404).json({ error: 'Prompt not found' });

    res.json(prompt);
  } catch (err) {
    console.error('Prompt detail error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Create prompt ---
router.post('/api/prompts', requireRole('admin', 'editor'), writeLimiter, async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, description, content, variables, category, tags, status } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

    const slug = await promptSlug(name);
    const promptStatus = ['draft', 'published', 'archived'].includes(status) ? status : 'draft';

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO prompts (name, slug, description, content, variables, category, tags, status, current_version, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$9) RETURNING *`,
      [name.trim(), slug, description || '', content || '', JSON.stringify(variables || []),
       category || '', tags || [], promptStatus, req.user.id]
    );
    const prompt = rows[0];

    await client.query(
      `INSERT INTO prompt_versions (prompt_id, version, content, variables, change_note, created_by)
       VALUES ($1, 1, $2, $3, $4, $5)`,
      [prompt.id, content || '', JSON.stringify(variables || []), 'Initial version', req.user.id]
    );

    await client.query('COMMIT');

    auditLog(req.user, 'created', 'prompt', prompt.id, prompt.name);
    res.status(201).json(prompt);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create prompt error:', err.message);
    if (err.code === '23505') return res.status(409).json({ error: 'A prompt with this name already exists' });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// --- Update prompt ---
router.put('/api/prompts/:id', requireRole('admin', 'editor'), writeLimiter, async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, description, content, variables, category, tags, status, change_note } = req.body;

    const current = await client.query('SELECT * FROM prompts WHERE id = $1', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'Not found' });
    const old = current.rows[0];

    await client.query('BEGIN');

    // Create new version if content or variables changed
    const contentChanged = content !== undefined && content !== old.content;
    const varsChanged = variables !== undefined && JSON.stringify(variables) !== JSON.stringify(old.variables);
    let newVersion = old.current_version;

    if (contentChanged || varsChanged) {
      newVersion = old.current_version + 1;
      await client.query(
        `INSERT INTO prompt_versions (prompt_id, version, content, variables, change_note, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.params.id, newVersion, content ?? old.content, JSON.stringify(variables ?? old.variables),
         change_note || '', req.user.id]
      );
    }

    const promptStatus = ['draft', 'published', 'archived'].includes(status) ? status : undefined;

    const { rows } = await client.query(
      `UPDATE prompts SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        content = COALESCE($3, content),
        variables = COALESCE($4, variables),
        category = COALESCE($5, category),
        tags = COALESCE($6, tags),
        status = COALESCE($7, status),
        current_version = $8,
        updated_by = $9,
        updated_at = NOW()
       WHERE id = $10 RETURNING *`,
      [name?.trim(), description, content, variables ? JSON.stringify(variables) : null,
       category, tags, promptStatus, newVersion, req.user.id, req.params.id]
    );

    await client.query('COMMIT');

    auditLog(req.user, 'updated', 'prompt', req.params.id, name || old.name);
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update prompt error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// --- Delete prompt ---
router.delete('/api/prompts/:id', requireRole('admin'), async (req, res) => {
  try {
    const current = await pool.query('SELECT name FROM prompts WHERE id = $1', [req.params.id]);
    const { rowCount } = await pool.query('DELETE FROM prompts WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    auditLog(req.user, 'deleted', 'prompt', req.params.id, current.rows[0]?.name || '');
    res.json({ success: true });
  } catch (err) {
    console.error('Delete prompt error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Change status ---
router.patch('/api/prompts/:id/status', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['draft', 'published', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const { rows } = await pool.query(
      'UPDATE prompts SET status = $1, updated_by = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [status, req.user.id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    auditLog(req.user, 'status_changed', 'prompt', req.params.id, `Status changed to ${status}`);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- List versions ---
router.get('/api/prompts/:id/versions', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT v.id, v.version, v.change_note, v.created_at, u.username AS created_by_name
       FROM prompt_versions v LEFT JOIN users u ON u.id = v.created_by
       WHERE v.prompt_id = $1 ORDER BY v.version DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Get specific version ---
router.get('/api/prompts/:id/versions/:version', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT v.*, u.username AS created_by_name FROM prompt_versions v
       LEFT JOIN users u ON u.id = v.created_by
       WHERE v.prompt_id = $1 AND v.version = $2`,
      [req.params.id, req.params.version]
    );
    if (!rows.length) return res.status(404).json({ error: 'Version not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Diff between two versions ---
router.get('/api/prompts/:id/diff', requireAuth, async (req, res) => {
  try {
    const from = parseInt(req.query.from);
    const to = parseInt(req.query.to);
    if (!from || !to) return res.status(400).json({ error: 'from and to version numbers required' });

    const { rows } = await pool.query(
      `SELECT v.version, v.content, v.variables, v.change_note, v.created_at, u.username AS created_by_name
       FROM prompt_versions v LEFT JOIN users u ON u.id = v.created_by
       WHERE v.prompt_id = $1 AND v.version IN ($2, $3)
       ORDER BY v.version`,
      [req.params.id, from, to]
    );
    if (rows.length < 2) return res.status(404).json({ error: 'One or both versions not found' });

    const fromRow = rows.find(r => r.version === from);
    const toRow = rows.find(r => r.version === to);
    res.json({ from: fromRow, to: toRow });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Revert to a previous version ---
router.post('/api/prompts/:id/revert/:version', requireRole('admin', 'editor'), writeLimiter, async (req, res) => {
  const client = await pool.connect();
  try {
    const version = await client.query(
      'SELECT content, variables FROM prompt_versions WHERE prompt_id = $1 AND version = $2',
      [req.params.id, req.params.version]
    );
    if (!version.rows.length) return res.status(404).json({ error: 'Version not found' });

    const current = await client.query('SELECT current_version, name FROM prompts WHERE id = $1', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'Prompt not found' });

    const newVersion = current.rows[0].current_version + 1;

    await client.query('BEGIN');

    await client.query(
      `INSERT INTO prompt_versions (prompt_id, version, content, variables, change_note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.params.id, newVersion, version.rows[0].content, JSON.stringify(version.rows[0].variables),
       `Reverted to version ${req.params.version}`, req.user.id]
    );

    const { rows } = await client.query(
      `UPDATE prompts SET content = $1, variables = $2, current_version = $3, updated_by = $4, updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [version.rows[0].content, JSON.stringify(version.rows[0].variables), newVersion, req.user.id, req.params.id]
    );

    await client.query('COMMIT');

    auditLog(req.user, 'reverted', 'prompt', req.params.id, `Reverted to v${req.params.version}`);
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Revert prompt error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// --- AI: Improve prompt ---
router.post('/api/prompts/:id/improve', requireRole('admin', 'editor'), aiLimiter, async (req, res) => {
  try {
    const { content, instruction } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'content is required' });

    const systemPrompt = await getSettingWithDefault('ai_prompt_improve', AI_DEFAULT_PROMPT_IMPROVE);
    const userPrompt = instruction
      ? `Improve this prompt (${instruction}):\n\n${content}`
      : `Improve this prompt:\n\n${content}`;

    const improved = await aiComplete(systemPrompt, userPrompt, 2048);
    res.json({ improved });
  } catch (err) {
    console.error('AI improve prompt error:', err.message);
    res.status(500).json({ error: 'AI prompt improvement failed' });
  }
});

// --- Public API: List published prompts (API key required) ---
router.get('/api/public/prompts', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'API key required' });

    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.slug, p.description, p.variables, p.category, p.tags, p.current_version, p.updated_at
       FROM prompts p WHERE p.status = 'published' ORDER BY p.name`
    );
    res.json({ prompts: rows });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Public API: Get prompt by slug (API key required) ---
router.get('/api/public/prompts/:slug', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'API key required' });

    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.slug, p.description, p.content, p.variables, p.category, p.tags, p.current_version, p.updated_at
       FROM prompts p WHERE p.slug = $1 AND p.status = 'published'`,
      [req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Prompt not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Public API: Get specific version by slug (API key required) ---
router.get('/api/public/prompts/:slug/v/:version', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'API key required' });

    const prompt = await pool.query(
      'SELECT id, name, slug, description, category, tags FROM prompts WHERE slug = $1 AND status = $2',
      [req.params.slug, 'published']
    );
    if (!prompt.rows.length) return res.status(404).json({ error: 'Prompt not found' });

    const { rows } = await pool.query(
      `SELECT v.version, v.content, v.variables, v.created_at
       FROM prompt_versions v WHERE v.prompt_id = $1 AND v.version = $2`,
      [prompt.rows[0].id, req.params.version]
    );
    if (!rows.length) return res.status(404).json({ error: 'Version not found' });

    res.json({ ...prompt.rows[0], ...rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
