const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth, requireRole } = require('../lib/middleware');

const router = express.Router();

const ROLE_HIERARCHY = { admin: 3, editor: 2, viewer: 1 };

// List current user's API keys
router.get('/api/api-keys', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, key_prefix, role, last_used_at, expires_at, created_at
       FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ keys: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: list all API keys
router.get('/api/api-keys/all', requireRole('admin'), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ak.id, ak.name, ak.key_prefix, ak.role, ak.last_used_at, ak.expires_at, ak.created_at,
              u.username, u.email
       FROM api_keys ak JOIN users u ON u.id = ak.user_id
       ORDER BY ak.created_at DESC`
    );
    res.json({ keys: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create API key
router.post('/api/api-keys', requireAuth, async (req, res) => {
  try {
    const { name = 'Default', role = 'viewer', expires_in } = req.body;

    // Validate role doesn't exceed user's own role
    if (ROLE_HIERARCHY[role] > ROLE_HIERARCHY[req.user.role]) {
      return res.status(403).json({ error: 'Cannot create a key with higher permissions than your own role' });
    }

    const raw = 'n8nlib_' + crypto.randomBytes(32).toString('hex');
    const prefix = raw.substring(0, 15);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');

    let expiresAt = null;
    if (expires_in) {
      expiresAt = new Date(Date.now() + parseInt(expires_in) * 24 * 60 * 60 * 1000);
    }

    const { rows } = await pool.query(
      `INSERT INTO api_keys (user_id, name, key_prefix, key_hash, role, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, key_prefix, role, expires_at, created_at`,
      [req.user.id, name.trim() || 'Default', prefix, hash, role, expiresAt]
    );

    res.json({ ...rows[0], key: raw });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update API key (name, expiry)
router.put('/api/api-keys/:id', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    const { rows } = await pool.query(
      `UPDATE api_keys SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING id, name`,
      [name.trim(), req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Key not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete API key
router.delete('/api/api-keys/:id', requireAuth, async (req, res) => {
  try {
    // Owners can delete their own; admins can delete any
    let result;
    if (req.user.role === 'admin') {
      result = await pool.query('DELETE FROM api_keys WHERE id = $1 RETURNING id', [req.params.id]);
    } else {
      result = await pool.query('DELETE FROM api_keys WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    }
    if (!result.rows.length) return res.status(404).json({ error: 'Key not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
