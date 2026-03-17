const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../lib/middleware');

const router = express.Router();

// --- SSE connections per user ---
const sseClients = new Map(); // userId -> Set<res>

function addSseClient(userId, res) {
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId).add(res);
}

function removeSseClient(userId, res) {
  const clients = sseClients.get(userId);
  if (clients) {
    clients.delete(res);
    if (clients.size === 0) sseClients.delete(userId);
  }
}

function sendSseToUser(userId, event, data) {
  const clients = sseClients.get(userId);
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { /* client gone */ }
  }
}

// --- Create notification helper ---
async function createNotification(userId, type, title, body, link) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, type, title, body || '', link || '']
    );
    const notif = rows[0];
    sendSseToUser(userId, 'notification', notif);
    return notif;
  } catch (err) {
    console.error('Create notification error:', err.message);
    return null;
  }
}

// --- SSE stream ---
router.get('/api/notifications/stream', requireAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':\n\n'); // comment to establish connection

  const userId = req.user.id;
  addSseClient(userId, res);

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    try { res.write(':\n\n'); } catch { clearInterval(heartbeat); }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeSseClient(userId, res);
  });
});

// --- REST endpoints ---

// Get notifications (paginated)
router.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = parseInt(req.query.offset) || 0;
    const [notifs, unread] = await Promise.all([
      pool.query(
        'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [req.user.id, limit, offset]
      ),
      pool.query(
        'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read = FALSE',
        [req.user.id]
      ),
    ]);
    res.json({ notifications: notifs.rows, unreadCount: unread.rows[0].count });
  } catch (err) {
    console.error('Get notifications error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark one as read
router.put('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark all as read
router.put('/api/notifications/read-all', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE',
      [req.user.id]
    );
    sendSseToUser(req.user.id, 'read-all', {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
module.exports.createNotification = createNotification;
