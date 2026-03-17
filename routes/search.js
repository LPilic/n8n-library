const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../lib/middleware');

const router = express.Router();

router.get('/api/search', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.json({ results: [] });

  const like = `%${q}%`;
  const isWriter = ['admin', 'editor'].includes(req.user.role);

  try {
    const queries = [];

    // Templates
    queries.push(
      pool.query(
        `SELECT id, name AS title, 'template' AS type FROM templates WHERE name ILIKE $1 ORDER BY name LIMIT 5`,
        [like]
      )
    );

    // Tickets
    queries.push(
      pool.query(
        `SELECT id, title, 'ticket' AS type, status, priority FROM tickets WHERE title ILIKE $1 OR description ILIKE $1 ORDER BY updated_at DESC LIMIT 5`,
        [like]
      )
    );

    // KB articles
    const kbWhere = isWriter ? '' : "AND status = 'published'";
    queries.push(
      pool.query(
        `SELECT id, title, 'article' AS type, slug FROM kb_articles WHERE (title ILIKE $1 OR body ILIKE $1) ${kbWhere} ORDER BY view_count DESC LIMIT 5`,
        [like]
      )
    );

    const [templates, tickets, articles] = await Promise.all(queries);

    const results = [
      ...templates.rows.map(r => ({ id: r.id, title: r.title, type: 'template', link: '/library' })),
      ...tickets.rows.map(r => ({ id: r.id, title: `#${r.id} — ${r.title}`, type: 'ticket', link: '/tickets/' + r.id, status: r.status, priority: r.priority })),
      ...articles.rows.map(r => ({ id: r.id, title: r.title, type: 'article', link: '/kb/' + (r.slug || r.id) })),
    ];

    res.json({ results });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
