const express = require('express');
const pool = require('../db');
const { requireRole } = require('../lib/middleware');
const { auditLog } = require('../lib/audit');
const { evaluateAlerts, CONDITION_LABELS } = require('../lib/alert-engine');

const router = express.Router();

// List all alerts
router.get('/api/alerts', requireRole('admin'), async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM alerts ORDER BY created_at DESC');
    res.json({ alerts: rows, conditions: CONDITION_LABELS });
  } catch (err) {
    console.error('List alerts error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create alert
router.post('/api/alerts', requireRole('admin'), async (req, res) => {
  try {
    const { name, condition, config, recipients, cooldown_minutes, enabled } = req.body;
    if (!name || !condition) return res.status(400).json({ error: 'Name and condition required' });
    if (!CONDITION_LABELS[condition]) return res.status(400).json({ error: 'Invalid condition type' });

    const { rows } = await pool.query(
      `INSERT INTO alerts (name, condition, config, recipients, cooldown_minutes, enabled)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        name,
        condition,
        JSON.stringify(config || {}),
        JSON.stringify(recipients || []),
        cooldown_minutes || 30,
        enabled !== false,
      ]
    );
    auditLog(req.user, 'created', 'alert', rows[0].id, name);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create alert error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update alert
router.put('/api/alerts/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, condition, config, recipients, cooldown_minutes, enabled } = req.body;
    const updates = [];
    const params = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (condition !== undefined) {
      if (!CONDITION_LABELS[condition]) return res.status(400).json({ error: 'Invalid condition type' });
      updates.push(`condition = $${idx++}`); params.push(condition);
    }
    if (config !== undefined) { updates.push(`config = $${idx++}`); params.push(JSON.stringify(config)); }
    if (recipients !== undefined) { updates.push(`recipients = $${idx++}`); params.push(JSON.stringify(recipients)); }
    if (cooldown_minutes !== undefined) { updates.push(`cooldown_minutes = $${idx++}`); params.push(cooldown_minutes); }
    if (enabled !== undefined) { updates.push(`enabled = $${idx++}`); params.push(enabled); }

    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.params.id);
    const { rowCount } = await pool.query(
      `UPDATE alerts SET ${updates.join(', ')} WHERE id = $${idx}`, params
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Alert not found' });
    auditLog(req.user, 'updated', 'alert', req.params.id, name || '');
    res.json({ message: 'Alert updated' });
  } catch (err) {
    console.error('Update alert error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete alert
router.delete('/api/alerts/:id', requireRole('admin'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM alerts WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Alert not found' });
    auditLog(req.user, 'deleted', 'alert', req.params.id);
    res.json({ message: 'Alert deleted' });
  } catch (err) {
    console.error('Delete alert error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test alert — evaluate immediately
router.post('/api/alerts/:id/test', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM alerts WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Alert not found' });
    // Run evaluation for all alerts (including this one)
    await evaluateAlerts();
    res.json({ message: 'Alert evaluation triggered' });
  } catch (err) {
    console.error('Test alert error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
