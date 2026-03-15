const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const { escHtml } = require('../lib/helpers');
const { requireAuth, requireRole, ticketLimiter } = require('../lib/middleware');
const { sendTicketNotification } = require('../lib/email');
const { verifyN8nUser } = require('../lib/n8n-api');

const router = express.Router();

// Public ticket categories
router.get('/api/public/ticket-categories', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name FROM ticket_categories ORDER BY name');
    res.json(rows);
  } catch (err) {
    console.error('Public ticket categories error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Validate n8n user
router.get('/api/public/n8n-me', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId query param required' });
    const user = await verifyN8nUser(userId);
    res.json({
      id: user.id, firstName: user.firstName || '',
      lastName: user.lastName || '', email: user.email || '',
    });
  } catch (err) {
    console.error('[/api/public/n8n-me] Error:', err.message);
    res.status(401).json({ error: err.message });
  }
});

// Public ticket submission
router.post('/api/public/ticket', ticketLimiter, async (req, res) => {
  try {
    const { title, description, priority, category_id, n8nUserId, n8nEmail, n8nFirstName, n8nLastName } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
    if (!n8nUserId || !n8nEmail) return res.status(400).json({ error: 'User information is required' });

    let verifiedUser;
    try { verifiedUser = await verifyN8nUser(n8nUserId); }
    catch (authErr) { return res.status(401).json({ error: 'Could not verify your n8n account. Please try again.' }); }

    const submitterName = [verifiedUser.firstName, verifiedUser.lastName].filter(Boolean).join(' ') || verifiedUser.email;
    const submitterEmail = verifiedUser.email.trim().toLowerCase();

    const validPriorities = ['low', 'medium', 'high', 'critical'];
    const prio = validPriorities.includes(priority) ? priority : 'medium';

    let userId;
    const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1', [submitterEmail]);
    if (existing.length) {
      userId = existing[0].id;
    } else {
      const { rows: newUser } = await pool.query(
        `INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, 'n8n-external', 'viewer') RETURNING id`,
        [submitterName, submitterEmail]
      );
      userId = newUser[0].id;
    }

    const { rows } = await pool.query(
      `INSERT INTO tickets (title, description, priority, category_id, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title.trim(), (description || '').trim(), prio, category_id || null, userId]
    );
    const ticket = rows[0];

    await pool.query(
      'INSERT INTO ticket_activity (ticket_id, user_id, action, new_value) VALUES ($1, $2, $3, $4)',
      [ticket.id, userId, 'created', `Submitted via n8n (priority: ${prio})`]
    );

    sendTicketNotification('new_ticket', ticket, { creatorName: submitterName });
    res.json({ success: true, ticketId: ticket.id });
  } catch (err) {
    console.error('Public ticket creation error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public image upload
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

router.post('/api/public/ticket-image', ticketLimiter, (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'No image provided' });
    const match = image.match(/^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Invalid image format. Supported: PNG, JPG, GIF, WebP' });
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'Image too large (max 5MB)' });
    const filename = crypto.randomBytes(16).toString('hex') + '.' + ext;
    fs.writeFileSync(path.join(uploadsDir, filename), buffer);
    res.json({ url: '/uploads/' + filename });
  } catch (err) {
    console.error('Image upload error:', err.message);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Ticket categories (authenticated)
router.get('/api/ticket-categories', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ticket_categories ORDER BY name');
    res.json(rows);
  } catch (err) {
    console.error('Load ticket categories error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/ticket-categories', requireRole('admin'), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
    const { rows } = await pool.query(
      'INSERT INTO ticket_categories (name, description) VALUES ($1, $2) RETURNING *',
      [name.trim(), description || '']
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Category already exists' });
    console.error('Create ticket category error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/ticket-categories/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
    const { rows } = await pool.query(
      'UPDATE ticket_categories SET name=$1, description=$2 WHERE id=$3 RETURNING *',
      [name.trim(), description || '', req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Update ticket category error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/ticket-categories/:id', requireRole('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM ticket_categories WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete ticket category error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assignable users
router.get('/api/tickets/assignable-users', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, username, email FROM users WHERE role IN ('admin','editor') ORDER BY username");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// Ticket stats
router.get('/api/tickets/stats', requireRole('admin', 'editor'), async (_req, res) => {
  try {
    const [byStatus, byPriority, unassigned, avgRes] = await Promise.all([
      pool.query("SELECT status, COUNT(*)::int as count FROM tickets GROUP BY status"),
      pool.query("SELECT priority, COUNT(*)::int as count FROM tickets GROUP BY priority"),
      pool.query("SELECT COUNT(*)::int as count FROM tickets WHERE assigned_to IS NULL AND status NOT IN ('resolved','closed')"),
      pool.query("SELECT ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600)::numeric, 1) as avg_hours FROM tickets WHERE status IN ('resolved','closed')"),
    ]);
    res.json({
      byStatus: byStatus.rows,
      byPriority: byPriority.rows,
      unassigned: unassigned.rows[0]?.count || 0,
      avgResolutionHours: avgRes.rows[0]?.avg_hours || null,
    });
  } catch (err) {
    console.error('Ticket stats error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List tickets
router.get('/api/tickets', requireAuth, async (req, res) => {
  try {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.query.status) { conditions.push(`t.status = $${idx++}`); params.push(req.query.status); }
    if (req.query.priority) { conditions.push(`t.priority = $${idx++}`); params.push(req.query.priority); }
    if (req.query.assignee) { conditions.push(`t.assigned_to = $${idx++}`); params.push(req.query.assignee); }
    if (req.query.category) { conditions.push(`t.category_id = $${idx++}`); params.push(req.query.category); }
    if (req.query.mine === 'true') { conditions.push(`t.created_by = $${idx++}`); params.push(req.user.id); }
    if (req.query.search) {
      conditions.push(`(t.title ILIKE $${idx} OR t.description ILIKE $${idx})`);
      params.push(`%${req.query.search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 25;
    const offset = (page - 1) * limit;

    const countQ = await pool.query(`SELECT COUNT(*)::int as total FROM tickets t ${where}`, params);
    const total = countQ.rows[0].total;

    const { rows } = await pool.query(`
      SELECT t.*, tc.name as category_name,
        cu.username as creator_name, cu.email as creator_email,
        au.username as assignee_name, au.email as assignee_email,
        (SELECT COUNT(*)::int FROM ticket_comments WHERE ticket_id = t.id) as comment_count
      FROM tickets t
      LEFT JOIN ticket_categories tc ON tc.id = t.category_id
      LEFT JOIN users cu ON cu.id = t.created_by
      LEFT JOIN users au ON au.id = t.assigned_to
      ${where}
      ORDER BY
        CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'waiting' THEN 2 WHEN 'resolved' THEN 3 WHEN 'closed' THEN 4 END,
        CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
        t.updated_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, limit, offset]);

    res.json({ tickets: rows, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('List tickets error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get ticket detail
router.get('/api/tickets/:id', requireAuth, async (req, res) => {
  try {
    const { rows: tRows } = await pool.query(`
      SELECT t.*, tc.name as category_name,
        cu.username as creator_name, cu.email as creator_email,
        au.username as assignee_name, au.email as assignee_email
      FROM tickets t
      LEFT JOIN ticket_categories tc ON tc.id = t.category_id
      LEFT JOIN users cu ON cu.id = t.created_by
      LEFT JOIN users au ON au.id = t.assigned_to
      WHERE t.id = $1
    `, [req.params.id]);
    if (tRows.length === 0) return res.status(404).json({ error: 'Ticket not found' });

    const [commentsRes, activityRes, execRes] = await Promise.all([
      pool.query(`
        SELECT c.*, u.username, u.email FROM ticket_comments c
        JOIN users u ON u.id = c.user_id
        WHERE c.ticket_id = $1 ORDER BY c.created_at ASC
      `, [req.params.id]),
      pool.query(`
        SELECT a.*, u.username FROM ticket_activity a
        JOIN users u ON u.id = a.user_id
        WHERE a.ticket_id = $1 ORDER BY a.created_at ASC
      `, [req.params.id]),
      pool.query(`
        SELECT * FROM ticket_executions
        WHERE ticket_id = $1 ORDER BY linked_at DESC
      `, [req.params.id]).catch(() => ({ rows: [] })),
    ]);

    res.json({ ...tRows[0], comments: commentsRes.rows, activity: activityRes.rows, executions: execRes.rows });
  } catch (err) {
    console.error('Get ticket error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create ticket
router.post('/api/tickets', requireAuth, ticketLimiter, async (req, res) => {
  try {
    const { title, description, priority, category_id, assigned_to, execution_data } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    const prio = validPriorities.includes(priority) ? priority : 'medium';
    const execData = execution_data && typeof execution_data === 'object' ? JSON.stringify(execution_data) : null;

    const { rows } = await pool.query(
      `INSERT INTO tickets (title, description, priority, category_id, created_by, assigned_to, execution_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [title.trim(), (description || '').trim(), prio, category_id || null, req.user.id, assigned_to || null, execData]
    );
    const ticket = rows[0];

    await pool.query(
      'INSERT INTO ticket_activity (ticket_id, user_id, action, new_value) VALUES ($1, $2, $3, $4)',
      [ticket.id, req.user.id, 'created', `Created ticket with priority ${prio}`]
    );
    sendTicketNotification('new_ticket', ticket, { creatorName: req.user.username });

    if (assigned_to) {
      const { rows: aRows } = await pool.query('SELECT email FROM users WHERE id=$1', [assigned_to]);
      if (aRows.length) {
        await pool.query(
          'INSERT INTO ticket_activity (ticket_id, user_id, action, new_value) VALUES ($1, $2, $3, $4)',
          [ticket.id, req.user.id, 'assigned', aRows[0].email]
        );
        sendTicketNotification('assignment', ticket, { assigneeEmail: aRows[0].email });
      }
    }

    res.json(ticket);
  } catch (err) {
    console.error('Create ticket error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update ticket
router.put('/api/tickets/:id', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const { rows: cur } = await pool.query('SELECT * FROM tickets WHERE id=$1', [req.params.id]);
    if (cur.length === 0) return res.status(404).json({ error: 'Ticket not found' });
    const old = cur[0];

    const updates = []; const params = []; let idx = 1;
    const activities = [];
    const { title, description, status, priority, category_id, assigned_to } = req.body;

    if (title !== undefined && title !== old.title) {
      updates.push(`title = $${idx++}`); params.push(title.trim());
      activities.push({ action: 'title_changed', old_value: old.title, new_value: title.trim() });
    }
    if (description !== undefined && description !== old.description) {
      updates.push(`description = $${idx++}`); params.push(description);
      activities.push({ action: 'description_changed', old_value: null, new_value: 'Description updated' });
    }
    if (status !== undefined && status !== old.status) {
      const validStatuses = ['open', 'in_progress', 'waiting', 'resolved', 'closed'];
      if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
      updates.push(`status = $${idx++}`); params.push(status);
      activities.push({ action: 'status_changed', old_value: old.status, new_value: status });
    }
    if (priority !== undefined && priority !== old.priority) {
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      if (!validPriorities.includes(priority)) return res.status(400).json({ error: 'Invalid priority' });
      updates.push(`priority = $${idx++}`); params.push(priority);
      activities.push({ action: 'priority_changed', old_value: old.priority, new_value: priority });
    }
    if (category_id !== undefined && category_id !== old.category_id) {
      updates.push(`category_id = $${idx++}`); params.push(category_id || null);
      activities.push({ action: 'category_changed', old_value: String(old.category_id || ''), new_value: String(category_id || '') });
    }
    if (assigned_to !== undefined && assigned_to !== old.assigned_to) {
      updates.push(`assigned_to = $${idx++}`); params.push(assigned_to || null);
      const newAssigneeName = assigned_to ? (await pool.query('SELECT username, email FROM users WHERE id=$1', [assigned_to])).rows[0] : null;
      const oldAssigneeName = old.assigned_to ? (await pool.query('SELECT username FROM users WHERE id=$1', [old.assigned_to])).rows[0]?.username : 'Unassigned';
      activities.push({ action: 'assigned', old_value: oldAssigneeName, new_value: newAssigneeName ? newAssigneeName.username : 'Unassigned' });
      if (newAssigneeName) {
        sendTicketNotification('assignment', { ...old, assigned_to }, { assigneeEmail: newAssigneeName.email });
      }
    }

    if (updates.length === 0) return res.json({ message: 'No changes' });

    updates.push(`updated_at = NOW()`);
    params.push(req.params.id);
    await pool.query(`UPDATE tickets SET ${updates.join(', ')} WHERE id = $${idx}`, params);

    for (const a of activities) {
      await pool.query(
        'INSERT INTO ticket_activity (ticket_id, user_id, action, old_value, new_value) VALUES ($1, $2, $3, $4, $5)',
        [req.params.id, req.user.id, a.action, a.old_value, a.new_value]
      );
    }

    if (status !== undefined && status !== old.status) {
      sendTicketNotification('status_change', { ...old, status }, { oldStatus: old.status, newStatus: status, changedBy: req.user.id });
    }

    const { rows: updated } = await pool.query('SELECT * FROM tickets WHERE id=$1', [req.params.id]);
    res.json(updated[0]);
  } catch (err) {
    console.error('Update ticket error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete ticket
router.delete('/api/tickets/:id', requireRole('admin'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM tickets WHERE id=$1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ message: 'Ticket deleted' });
  } catch (err) {
    console.error('Delete ticket error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add comment
router.post('/api/tickets/:id/comments', requireAuth, ticketLimiter, async (req, res) => {
  try {
    const { body: commentBody, is_internal } = req.body;
    if (!commentBody || !commentBody.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });

    const { rows: tRows } = await pool.query('SELECT * FROM tickets WHERE id=$1', [req.params.id]);
    if (tRows.length === 0) return res.status(404).json({ error: 'Ticket not found' });
    const ticket = tRows[0];

    const internal = (is_internal === true && ['admin', 'editor'].includes(req.user.role)) ? true : false;

    const { rows } = await pool.query(
      'INSERT INTO ticket_comments (ticket_id, user_id, body, is_internal) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.params.id, req.user.id, commentBody.trim(), internal]
    );
    await pool.query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [req.params.id]);
    await pool.query(
      'INSERT INTO ticket_activity (ticket_id, user_id, action, new_value) VALUES ($1, $2, $3, $4)',
      [req.params.id, req.user.id, 'commented', internal ? 'Added internal note' : 'Added comment']
    );

    if (!internal) {
      sendTicketNotification('new_comment', ticket, {
        commenterId: req.user.id,
        commenterName: req.user.username,
        commentBody: commentBody.trim(),
      });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Add comment error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Link/unlink executions
router.post('/api/tickets/:id/executions', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const { execution_id, workflow_id, workflow_name, status } = req.body;
    if (!execution_id) return res.status(400).json({ error: 'execution_id is required' });
    await pool.query(
      `INSERT INTO ticket_executions (ticket_id, execution_id, workflow_id, workflow_name, status)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [req.params.id, execution_id, workflow_id || null, workflow_name || null, status || null]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/api/tickets/:id/executions/:execId', requireRole('admin', 'editor'), async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM ticket_executions WHERE ticket_id = $1 AND execution_id = $2',
      [req.params.id, req.params.execId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;
