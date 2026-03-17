const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const { slugify, uniqueSlug } = require('../lib/helpers');
const { requireAuth, requireRole, writeLimiter } = require('../lib/middleware');
const { auditLog } = require('../lib/audit');

const router = express.Router();

// KB Categories
router.get('/api/kb/categories', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, (SELECT COUNT(*) FROM kb_articles a WHERE a.category_id = c.id AND a.status = 'published') AS article_count
      FROM kb_categories c ORDER BY c.sort_order, c.name
    `);
    res.json(rows);
  } catch (err) {
    console.error('KB categories error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/kb/categories', requireRole('admin'), async (req, res) => {
  try {
    const { name, description, icon, sort_order, parent_id } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const slug = slugify(name);
    const { rows } = await pool.query(
      `INSERT INTO kb_categories (name, slug, description, icon, sort_order, parent_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name.trim(), slug, description || '', icon || '', sort_order || 0, parent_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Category already exists' });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/kb/categories/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, description, icon, sort_order, parent_id } = req.body;
    const slug = name ? slugify(name) : undefined;
    const { rows } = await pool.query(
      `UPDATE kb_categories SET name=COALESCE($1,name), slug=COALESCE($2,slug), description=COALESCE($3,description),
       icon=COALESCE($4,icon), sort_order=COALESCE($5,sort_order), parent_id=$6 WHERE id=$7 RETURNING *`,
      [name?.trim(), slug, description, icon, sort_order, parent_id || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/api/kb/categories/:id', requireRole('admin'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM kb_categories WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// KB Tags
router.get('/api/kb/tags', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.*, COUNT(at.article_id) AS article_count
      FROM kb_tags t LEFT JOIN kb_article_tags at ON at.tag_id = t.id
      GROUP BY t.id ORDER BY t.name
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/api/kb/tags/:id', requireAuth, requireRole('admin', 'editor'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM kb_tags WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Tag not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// KB Articles list
router.get('/api/kb/articles', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const { category, tag, status, q, sort } = req.query;
    const isWriter = req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'editor');

    let where = [];
    let params = [];
    let pi = 1;

    if (!isWriter || !status) {
      if (!isWriter) { where.push(`a.status = 'published'`); }
      else if (status) { where.push(`a.status = $${pi++}`); params.push(status); }
    } else {
      where.push(`a.status = $${pi++}`); params.push(status);
    }

    if (category) { where.push(`a.category_id = $${pi++}`); params.push(category); }
    if (tag) {
      where.push(`EXISTS (SELECT 1 FROM kb_article_tags at2 JOIN kb_tags t2 ON t2.id=at2.tag_id WHERE at2.article_id=a.id AND t2.slug=$${pi++})`);
      params.push(tag);
    }

    let rankSelect = '';
    let orderBy = 'a.is_pinned DESC, a.updated_at DESC';
    if (q && q.trim()) {
      const searchTerm = q.trim();
      where.push(`(a.search_vector @@ plainto_tsquery('english', $${pi}) OR a.title ILIKE '%' || $${pi} || '%')`);
      params.push(searchTerm);
      rankSelect = `, ts_rank(a.search_vector, plainto_tsquery('english', $${pi})) AS rank`;
      orderBy = `rank DESC, a.is_pinned DESC, a.updated_at DESC`;
      pi++;
    } else if (sort === 'views') {
      orderBy = 'a.view_count DESC';
    } else if (sort === 'title') {
      orderBy = 'a.title ASC';
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const countRes = await pool.query(`SELECT COUNT(*) FROM kb_articles a ${whereClause}`, params);
    const total = parseInt(countRes.rows[0].count);

    const { rows } = await pool.query(`
      SELECT a.id, a.title, a.slug, a.excerpt, a.status, a.is_pinned, a.is_featured,
             a.view_count, a.helpful_yes, a.helpful_no, a.created_at, a.updated_at, a.published_at,
             a.category_id, c.name AS category_name,
             u.username AS author_name,
             (SELECT array_agg(json_build_object('id',t.id,'name',t.name,'slug',t.slug))
              FROM kb_article_tags at JOIN kb_tags t ON t.id=at.tag_id WHERE at.article_id=a.id) AS tags
             ${rankSelect}
      FROM kb_articles a
      LEFT JOIN kb_categories c ON c.id = a.category_id
      LEFT JOIN users u ON u.id = a.author_id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${pi++} OFFSET $${pi++}
    `, [...params, limit, offset]);

    res.json({ articles: rows, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('KB articles list error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// KB Article detail
router.get('/api/kb/articles/:idOrSlug', requireAuth, async (req, res) => {
  try {
    const param = req.params.idOrSlug;
    const isId = /^\d+$/.test(param);
    const isWriter = req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'editor');

    const { rows } = await pool.query(`
      SELECT a.*, c.name AS category_name, u.username AS author_name,
        (SELECT array_agg(json_build_object('id',t.id,'name',t.name,'slug',t.slug))
         FROM kb_article_tags at JOIN kb_tags t ON t.id=at.tag_id WHERE at.article_id=a.id) AS tags,
        (SELECT array_agg(json_build_object('id',att.id,'filename',att.filename,'original_name',att.original_name,'mime_type',att.mime_type,'size_bytes',att.size_bytes))
         FROM kb_article_attachments att WHERE att.article_id=a.id) AS attachments
      FROM kb_articles a
      LEFT JOIN kb_categories c ON c.id = a.category_id
      LEFT JOIN users u ON u.id = a.author_id
      WHERE ${isId ? 'a.id = $1' : 'a.slug = $1'}
    `, [isId ? parseInt(param) : param]);

    if (!rows.length) return res.status(404).json({ error: 'Article not found' });
    const article = rows[0];
    if (!isWriter && article.status !== 'published') return res.status(404).json({ error: 'Article not found' });

    if (!req.session.kbViewed) req.session.kbViewed = {};
    if (!req.session.kbViewed[article.id]) {
      req.session.kbViewed[article.id] = true;
      await pool.query('UPDATE kb_articles SET view_count = view_count + 1 WHERE id = $1', [article.id]);
      article.view_count++;
    }

    if (req.session.user) {
      const fb = await pool.query('SELECT helpful FROM kb_article_feedback WHERE article_id=$1 AND user_id=$2', [article.id, req.session.user.id]);
      article.user_feedback = fb.rows.length ? fb.rows[0].helpful : null;
    }

    res.json(article);
  } catch (err) {
    console.error('KB article detail error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create KB Article
router.post('/api/kb/articles', requireRole('admin', 'editor'), writeLimiter, async (req, res) => {
  try {
    const { title, body, excerpt, category_id, status, is_pinned, is_featured, tags } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });

    const slug = await uniqueSlug(title);
    const articleStatus = ['draft', 'published', 'archived'].includes(status) ? status : 'draft';
    const publishedAt = articleStatus === 'published' ? new Date() : null;

    const { rows } = await pool.query(
      `INSERT INTO kb_articles (title, slug, body, excerpt, category_id, author_id, status, is_pinned, is_featured, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [title.trim(), slug, body || '', excerpt || '', category_id || null, req.session.user.id,
       articleStatus, is_pinned || false, is_featured || false, publishedAt]
    );
    const article = rows[0];

    if (tags && Array.isArray(tags)) {
      for (const tagName of tags) {
        if (!tagName.trim()) continue;
        const tagSlug = slugify(tagName);
        const tagRes = await pool.query(
          `INSERT INTO kb_tags (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
          [tagName.trim(), tagSlug]
        );
        await pool.query('INSERT INTO kb_article_tags (article_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [article.id, tagRes.rows[0].id]);
      }
    }

    await pool.query(
      'INSERT INTO kb_article_versions (article_id, title, body, edited_by, version_note) VALUES ($1,$2,$3,$4,$5)',
      [article.id, article.title, article.body, req.session.user.id, 'Initial version']
    );

    auditLog(req.user, 'created', 'article', article.id, article.title);
    res.status(201).json(article);
  } catch (err) {
    console.error('KB create article error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update KB Article
router.put('/api/kb/articles/:id', requireRole('admin', 'editor'), writeLimiter, async (req, res) => {
  try {
    const { title, body, excerpt, category_id, status, is_pinned, is_featured, tags, version_note } = req.body;

    const current = await pool.query('SELECT title, body FROM kb_articles WHERE id=$1', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'Not found' });

    await pool.query(
      'INSERT INTO kb_article_versions (article_id, title, body, edited_by, version_note) VALUES ($1,$2,$3,$4,$5)',
      [req.params.id, current.rows[0].title, current.rows[0].body, req.session.user.id, version_note || '']
    );

    const articleStatus = ['draft', 'published', 'archived'].includes(status) ? status : undefined;
    let publishedAt = undefined;
    if (articleStatus === 'published') {
      const existing = await pool.query('SELECT published_at FROM kb_articles WHERE id=$1', [req.params.id]);
      if (!existing.rows[0].published_at) publishedAt = new Date();
    }

    const { rows } = await pool.query(
      `UPDATE kb_articles SET title=COALESCE($1,title), body=COALESCE($2,body), excerpt=COALESCE($3,excerpt),
       category_id=$4, status=COALESCE($5,status), is_pinned=COALESCE($6,is_pinned),
       is_featured=COALESCE($7,is_featured), updated_at=NOW(),
       published_at=COALESCE($8,published_at) WHERE id=$9 RETURNING *`,
      [title?.trim(), body, excerpt, category_id || null, articleStatus, is_pinned, is_featured, publishedAt, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    if (tags && Array.isArray(tags)) {
      await pool.query('DELETE FROM kb_article_tags WHERE article_id=$1', [req.params.id]);
      for (const tagName of tags) {
        if (!tagName.trim()) continue;
        const tagSlug = slugify(tagName);
        const tagRes = await pool.query(
          `INSERT INTO kb_tags (name, slug) VALUES ($1,$2) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
          [tagName.trim(), tagSlug]
        );
        await pool.query('INSERT INTO kb_article_tags (article_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, tagRes.rows[0].id]);
      }
    }

    auditLog(req.user, 'updated', 'article', req.params.id, title || '');
    res.json(rows[0]);
  } catch (err) {
    console.error('KB update article error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete KB Article
router.delete('/api/kb/articles/:id', requireRole('admin'), async (req, res) => {
  try {
    const atts = await pool.query('SELECT filename FROM kb_article_attachments WHERE article_id=$1', [req.params.id]);
    for (const att of atts.rows) {
      const filePath = path.join(__dirname, '..', 'public', 'uploads', 'kb', att.filename);
      fs.unlink(filePath, () => {});
    }
    const { rowCount } = await pool.query('DELETE FROM kb_articles WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    auditLog(req.user, 'deleted', 'article', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// KB Article Feedback
router.post('/api/kb/articles/:id/feedback', requireAuth, async (req, res) => {
  try {
    const { helpful } = req.body;
    if (typeof helpful !== 'boolean') return res.status(400).json({ error: 'helpful must be boolean' });
    await pool.query(
      `INSERT INTO kb_article_feedback (article_id, user_id, helpful) VALUES ($1,$2,$3)
       ON CONFLICT (article_id, user_id) DO UPDATE SET helpful=EXCLUDED.helpful, created_at=NOW()`,
      [req.params.id, req.session.user.id, helpful]
    );
    const counts = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN helpful THEN 1 ELSE 0 END),0) AS yes,
              COALESCE(SUM(CASE WHEN NOT helpful THEN 1 ELSE 0 END),0) AS no
       FROM kb_article_feedback WHERE article_id=$1`, [req.params.id]
    );
    await pool.query('UPDATE kb_articles SET helpful_yes=$1, helpful_no=$2 WHERE id=$3',
      [counts.rows[0].yes, counts.rows[0].no, req.params.id]);
    res.json({ helpful_yes: parseInt(counts.rows[0].yes), helpful_no: parseInt(counts.rows[0].no), user_feedback: helpful });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// KB Pin/Feature toggles
router.patch('/api/kb/articles/:id/pin', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const { rows } = await pool.query('UPDATE kb_articles SET is_pinned=$1, updated_at=NOW() WHERE id=$2 RETURNING is_pinned', [!!req.body.pinned, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.patch('/api/kb/articles/:id/feature', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query('UPDATE kb_articles SET is_featured=$1, updated_at=NOW() WHERE id=$2 RETURNING is_featured', [!!req.body.featured, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// KB Version History
router.get('/api/kb/articles/:id/versions', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT v.id, v.title, v.version_note, v.created_at, u.username AS edited_by_name
       FROM kb_article_versions v LEFT JOIN users u ON u.id=v.edited_by
       WHERE v.article_id=$1 ORDER BY v.created_at DESC`, [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/api/kb/articles/:id/versions/:versionId', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT v.*, u.username AS edited_by_name FROM kb_article_versions v
       LEFT JOIN users u ON u.id=v.edited_by WHERE v.id=$1 AND v.article_id=$2`,
      [req.params.versionId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/api/kb/articles/:id/restore/:versionId', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const version = await pool.query('SELECT title, body FROM kb_article_versions WHERE id=$1 AND article_id=$2', [req.params.versionId, req.params.id]);
    if (!version.rows.length) return res.status(404).json({ error: 'Version not found' });

    const current = await pool.query('SELECT title, body FROM kb_articles WHERE id=$1', [req.params.id]);
    await pool.query(
      'INSERT INTO kb_article_versions (article_id, title, body, edited_by, version_note) VALUES ($1,$2,$3,$4,$5)',
      [req.params.id, current.rows[0].title, current.rows[0].body, req.session.user.id, 'Before restore']
    );

    const { rows } = await pool.query(
      'UPDATE kb_articles SET title=$1, body=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
      [version.rows[0].title, version.rows[0].body, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// KB Attachments
router.post('/api/kb/articles/:id/attachments', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const { data, filename, mime_type } = req.body;
    if (!data || !filename) return res.status(400).json({ error: 'data and filename required' });
    const allowed = ['image/png','image/jpeg','image/gif','image/webp','application/pdf','text/plain'];
    const mimeType = mime_type || 'application/octet-stream';
    if (!allowed.includes(mimeType)) return res.status(400).json({ error: 'File type not allowed' });

    const buf = Buffer.from(data, 'base64');
    if (buf.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'File too large (max 10MB)' });

    const dir = path.join(__dirname, '..', 'public', 'uploads', 'kb');
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(filename) || '';
    const storedName = crypto.randomBytes(16).toString('hex') + ext;
    fs.writeFileSync(path.join(dir, storedName), buf);

    const { rows } = await pool.query(
      `INSERT INTO kb_article_attachments (article_id, filename, original_name, mime_type, size_bytes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, storedName, filename, mimeType, buf.length, req.session.user.id]
    );
    res.status(201).json({ ...rows[0], url: `/uploads/kb/${storedName}` });
  } catch (err) {
    console.error('KB attachment upload error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/kb/articles/:id/attachments/:attachId', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const att = await pool.query('SELECT filename FROM kb_article_attachments WHERE id=$1 AND article_id=$2', [req.params.attachId, req.params.id]);
    if (!att.rows.length) return res.status(404).json({ error: 'Not found' });
    fs.unlink(path.join(__dirname, '..', 'public', 'uploads', 'kb', att.rows[0].filename), () => {});
    await pool.query('DELETE FROM kb_article_attachments WHERE id=$1', [req.params.attachId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// KB Stats
router.get('/api/kb/stats', requireAuth, async (_req, res) => {
  try {
    const total = await pool.query("SELECT COUNT(*) FROM kb_articles WHERE status='published'");
    const byCategory = await pool.query(`
      SELECT c.id, c.name, COUNT(a.id) AS count FROM kb_categories c
      LEFT JOIN kb_articles a ON a.category_id=c.id AND a.status='published'
      GROUP BY c.id ORDER BY c.sort_order, c.name
    `);
    const popular = await pool.query(`
      SELECT id, title, slug, view_count FROM kb_articles WHERE status='published'
      ORDER BY view_count DESC LIMIT 5
    `);
    const recent = await pool.query(`
      SELECT id, title, slug, updated_at FROM kb_articles WHERE status='published'
      ORDER BY updated_at DESC LIMIT 5
    `);
    res.json({
      total: parseInt(total.rows[0].count),
      byCategory: byCategory.rows,
      popular: popular.rows,
      recent: recent.rows
    });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;
