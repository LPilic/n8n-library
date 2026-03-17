const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../lib/middleware');

const router = express.Router();

router.get('/api/search', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.json({ results: [] });

  const isWriter = ['admin', 'editor'].includes(req.user.role);

  try {
    // Build tsquery — add :* for prefix matching
    const tsquery = q.split(/\s+/).filter(Boolean).map(w => w.replace(/[^\w]/g, '')).filter(Boolean).map(w => w + ':*').join(' & ');
    const like = `%${q}%`;

    const queries = [];

    // Templates — full-text search with ILIKE fallback
    queries.push(
      pool.query(
        `SELECT id, name AS title, 'template' AS type,
          ts_rank(search_vector, to_tsquery('english', $1)) AS rank
         FROM templates
         WHERE search_vector @@ to_tsquery('english', $1) OR name ILIKE $2
         ORDER BY rank DESC, name
         LIMIT 5`,
        [tsquery, like]
      )
    );

    // Tickets — full-text search with ILIKE fallback
    queries.push(
      pool.query(
        `SELECT id, title, 'ticket' AS type, status, priority,
          ts_rank(search_vector, to_tsquery('english', $1)) AS rank
         FROM tickets
         WHERE search_vector @@ to_tsquery('english', $1) OR title ILIKE $2 OR description ILIKE $2
         ORDER BY rank DESC, updated_at DESC
         LIMIT 5`,
        [tsquery, like]
      )
    );

    // KB articles — full-text search (already has search_vector)
    const kbWhere = isWriter ? '' : "AND status = 'published'";
    queries.push(
      pool.query(
        `SELECT id, title, 'article' AS type, slug,
          ts_rank(search_vector, to_tsquery('english', $1)) AS rank
         FROM kb_articles
         WHERE (search_vector @@ to_tsquery('english', $1) OR title ILIKE $2) ${kbWhere}
         ORDER BY rank DESC, view_count DESC
         LIMIT 5`,
        [tsquery, like]
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
