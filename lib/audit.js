const pool = require('../db');

async function auditLog(user, action, entityType, entityId, details) {
  try {
    const username = user ? (user.username || user.email || 'unknown') : 'system';
    const userId = user ? user.id : null;
    await pool.query(
      'INSERT INTO audit_log (user_id, username, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, username, action, entityType, String(entityId || ''), details || '']
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

module.exports = { auditLog };
