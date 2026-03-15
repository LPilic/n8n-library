const crypto = require('crypto');
const pool = require('../db');

const ROLE_HIERARCHY = { admin: 3, editor: 2, viewer: 1 };

function apiKeyAuth(req, _res, next) {
  if (req.user) return next(); // already authenticated via session

  const header = req.headers['authorization'] || req.headers['x-api-key'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (!token || !token.startsWith('n8nlib_')) return next();

  const hash = crypto.createHash('sha256').update(token).digest('hex');

  pool.query(
    `SELECT ak.id AS key_id, ak.role AS key_role, ak.expires_at,
            u.id, u.username, u.email, u.role
     FROM api_keys ak JOIN users u ON u.id = ak.user_id
     WHERE ak.key_hash = $1`,
    [hash]
  ).then(({ rows }) => {
    if (!rows.length) return next();
    const row = rows[0];
    if (row.expires_at && new Date(row.expires_at) < new Date()) return next();

    // Use the more restrictive role
    const effectiveRole = ROLE_HIERARCHY[row.key_role] < ROLE_HIERARCHY[row.role]
      ? row.key_role : row.role;

    req.user = { id: row.id, username: row.username, email: row.email, role: effectiveRole };
    req.apiKeyAuth = true;

    // Update last_used_at (fire-and-forget)
    pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [row.key_id]).catch(() => {});

    next();
  }).catch(() => next());
}

module.exports = apiKeyAuth;
