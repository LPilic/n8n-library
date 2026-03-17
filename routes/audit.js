const express = require('express');
const pool = require('../db');
const { requireRole } = require('../lib/middleware');

const router = express.Router();

router.get('/api/audit-log', requireRole('admin'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const entityType = req.query.entity_type || '';
    const action = req.query.action || '';
    const search = req.query.search || '';

    const conditions = [];
    const params = [];
    let idx = 1;

    if (entityType) { conditions.push(`entity_type = $${idx++}`); params.push(entityType); }
    if (action) { conditions.push(`action = $${idx++}`); params.push(action); }
    if (search) { conditions.push(`(username ILIKE $${idx} OR details ILIKE $${idx} OR entity_id ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const [rows, countRes] = await Promise.all([
      pool.query(
        `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM audit_log ${where}`, params),
    ]);

    res.json({ entries: rows.rows, total: countRes.rows[0].total });
  } catch (err) {
    console.error('Audit log error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
