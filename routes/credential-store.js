const express = require('express');
const pool = require('../db');
const { encrypt, decrypt } = require('../lib/crypto');
const { requireAuth, requireRole, credentialLimiter } = require('../lib/middleware');
const { getInstanceConfig } = require('../lib/n8n-api');
const { auditLog } = require('../lib/audit');

const router = express.Router();

// List credential templates (metadata only — never return shared_data)
router.get('/api/credential-store', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT cs.id, cs.name, cs.description, cs.credential_type, cs.user_fields,
        cs.allowed_roles, cs.instance_id, cs.created_by, cs.created_at, cs.updated_at,
        u.username as creator_name, ni.name as instance_name
      FROM credential_store cs
      LEFT JOIN users u ON u.id = cs.created_by
      LEFT JOIN n8n_instances ni ON ni.id = cs.instance_id
      ORDER BY cs.name
    `);
    // Filter by user role
    const userRole = req.user.role;
    const visible = userRole === 'admin' ? rows : rows.filter(r => r.allowed_roles.includes(userRole));
    res.json(visible);
  } catch (err) {
    console.error('Credential store list error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single template detail (metadata + schema info, no secrets)
router.get('/api/credential-store/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT cs.id, cs.name, cs.description, cs.credential_type, cs.user_fields,
        cs.allowed_roles, cs.instance_id, cs.created_by, cs.created_at, cs.updated_at,
        u.username as creator_name, ni.name as instance_name
      FROM credential_store cs
      LEFT JOIN users u ON u.id = cs.created_by
      LEFT JOIN n8n_instances ni ON ni.id = cs.instance_id
      WHERE cs.id = $1
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Template not found' });
    const tpl = rows[0];
    if (!tpl.allowed_roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });

    // Fetch audit history
    const { rows: audit } = await pool.query(`
      SELECT ca.*, u.username FROM credential_audit ca
      LEFT JOIN users u ON u.id = ca.user_id
      WHERE ca.credential_store_id = $1
      ORDER BY ca.created_at DESC LIMIT 50
    `, [req.params.id]);

    res.json({ ...tpl, audit });
  } catch (err) {
    console.error('Credential store detail error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get stored field keys for a template (admin only — shows which fields are stored, not values)
router.get('/api/credential-store/:id/fields', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT shared_data FROM credential_store WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Template not found' });
    const data = JSON.parse(decrypt(rows[0].shared_data));
    // Return only the keys, never the values
    res.json({ storedFields: Object.keys(data) });
  } catch (err) {
    console.error('Credential store fields error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create credential template (admin only)
router.post('/api/credential-store', requireRole('admin'), credentialLimiter, async (req, res) => {
  try {
    const { name, description, credential_type, shared_data, user_fields, allowed_roles, instance_id } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    if (!credential_type) return res.status(400).json({ error: 'Credential type is required' });
    if (!shared_data || typeof shared_data !== 'object' || Object.keys(shared_data).length === 0) {
      return res.status(400).json({ error: 'Shared data must be a non-empty object' });
    }

    const encrypted = encrypt(JSON.stringify(shared_data));
    const validRoles = ['admin', 'editor', 'viewer'];
    const roles = Array.isArray(allowed_roles) ? allowed_roles.filter(r => validRoles.includes(r)) : validRoles;
    const fields = Array.isArray(user_fields) ? user_fields : [];

    const { rows } = await pool.query(
      `INSERT INTO credential_store (name, description, credential_type, shared_data, user_fields, allowed_roles, instance_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, name, credential_type, created_at`,
      [name.trim(), (description || '').trim(), credential_type, encrypted, fields, roles, instance_id || null, req.user.id]
    );

    await pool.query(
      'INSERT INTO credential_audit (credential_store_id, credential_name, credential_type, instance_id, user_id, action, detail) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [rows[0].id, name.trim(), credential_type, instance_id || null, req.user.id, 'template_created', `Stored ${Object.keys(shared_data).length} shared fields`]
    );
    auditLog(req.user, 'created', 'credential_template', rows[0].id, name.trim());

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Credential store create error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update credential template (admin only)
router.patch('/api/credential-store/:id', requireRole('admin'), credentialLimiter, async (req, res) => {
  try {
    const { rows: cur } = await pool.query('SELECT * FROM credential_store WHERE id = $1', [req.params.id]);
    if (cur.length === 0) return res.status(404).json({ error: 'Template not found' });

    const updates = [];
    const params = [];
    let idx = 1;
    const { name, description, shared_data, user_fields, allowed_roles, instance_id } = req.body;

    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name.trim()); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description.trim()); }
    if (shared_data !== undefined && typeof shared_data === 'object' && Object.keys(shared_data).length > 0) {
      updates.push(`shared_data = $${idx++}`);
      params.push(encrypt(JSON.stringify(shared_data)));
    }
    if (user_fields !== undefined) { updates.push(`user_fields = $${idx++}`); params.push(Array.isArray(user_fields) ? user_fields : []); }
    if (allowed_roles !== undefined) {
      const validRoles = ['admin', 'editor', 'viewer'];
      updates.push(`allowed_roles = $${idx++}`);
      params.push(Array.isArray(allowed_roles) ? allowed_roles.filter(r => validRoles.includes(r)) : validRoles);
    }
    if (instance_id !== undefined) { updates.push(`instance_id = $${idx++}`); params.push(instance_id || null); }

    if (updates.length === 0) return res.json({ message: 'No changes' });

    updates.push(`updated_at = NOW()`);
    params.push(req.params.id);
    await pool.query(`UPDATE credential_store SET ${updates.join(', ')} WHERE id = $${idx}`, params);

    const changes = [];
    if (name !== undefined) changes.push('name');
    if (shared_data !== undefined) changes.push('secrets');
    if (user_fields !== undefined) changes.push('user_fields');
    if (allowed_roles !== undefined) changes.push('allowed_roles');
    await pool.query(
      'INSERT INTO credential_audit (credential_store_id, credential_name, credential_type, user_id, action, detail) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.params.id, name || cur[0].name, cur[0].credential_type, req.user.id, 'template_updated', `Updated: ${changes.join(', ')}`]
    );
    auditLog(req.user, 'updated', 'credential_template', req.params.id, changes.join(', '));

    res.json({ message: 'Updated' });
  } catch (err) {
    console.error('Credential store update error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete credential template (admin only)
router.delete('/api/credential-store/:id', requireRole('admin'), credentialLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT name, credential_type FROM credential_store WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Template not found' });

    await pool.query('DELETE FROM credential_store WHERE id = $1', [req.params.id]);

    await pool.query(
      'INSERT INTO credential_audit (credential_store_id, credential_name, credential_type, user_id, action, detail) VALUES ($1, $2, $3, $4, $5, $6)',
      [null, rows[0].name, rows[0].credential_type, req.user.id, 'template_deleted', `Deleted template: ${rows[0].name}`]
    );
    auditLog(req.user, 'deleted', 'credential_template', req.params.id, rows[0].name);

    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Credential store delete error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Provision credential to n8n instance (any allowed user)
router.post('/api/credential-store/:id/provision', requireAuth, credentialLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM credential_store WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Template not found' });
    const tpl = rows[0];

    // Check role access (admins always have access)
    if (req.user.role !== 'admin' && !tpl.allowed_roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have access to this credential template' });
    }

    // Get n8n instance config
    const instanceId = req.body.instance_id || tpl.instance_id;
    const inst = await getInstanceConfig(instanceId);
    if (!inst) return res.status(400).json({ error: 'No n8n instance configured' });
    const base = inst.internal_url.replace(/\/+$/, '');

    // Decrypt shared secrets
    const sharedData = JSON.parse(decrypt(tpl.shared_data));

    // Merge with user-provided fields
    const userData = req.body.data || {};
    // Validate user provided required fields
    for (const field of tpl.user_fields) {
      if (!userData[field] && userData[field] !== false && userData[field] !== 0) {
        return res.status(400).json({ error: `Required field "${field}" is missing` });
      }
    }
    // Only allow user_fields to be set by user (prevent overriding shared secrets)
    const userFieldsOnly = {};
    for (const field of tpl.user_fields) {
      if (userData[field] !== undefined) userFieldsOnly[field] = userData[field];
    }

    const mergedData = { ...sharedData, ...userFieldsOnly };
    const credName = (req.body.name || `${tpl.name} - ${req.user.username}`).trim();

    // Fetch credential schema to fill in required fields with defaults.
    // n8n's public API validates ALL required fields strictly — missing required
    // fields or extra disallowed fields both cause errors.
    try {
      const schemaRes = await fetch(`${base}/api/v1/credentials/schema/${encodeURIComponent(tpl.credential_type)}`, {
        headers: { 'X-N8N-API-KEY': inst.api_key },
      });
      if (schemaRes.ok) {
        const schema = await schemaRes.json();

        // Recursively collect all sub-schemas (root + allOf/oneOf/anyOf at any depth)
        function collectSchemas(s, out = []) {
          if (!s) return out;
          out.push(s);
          for (const key of ['allOf', 'oneOf', 'anyOf']) {
            if (Array.isArray(s[key])) s[key].forEach(sub => collectSchemas(sub, out));
          }
          return out;
        }
        const allSchemas = collectSchemas(schema);

        // Also collect the set of all allowed property names to strip extras
        const allowedKeys = new Set();
        for (const s of allSchemas) {
          if (!s.properties) continue;
          const required = s.required || [];
          for (const [key, prop] of Object.entries(s.properties)) {
            allowedKeys.add(key);
            if (mergedData[key] === undefined) {
              if (required.includes(key) || prop.default !== undefined) {
                mergedData[key] = prop.default !== undefined ? prop.default
                  : prop.type === 'object' ? {}
                  : prop.type === 'boolean' ? false
                  : prop.type === 'number' ? 0
                  : '';
              }
            }
          }
        }

        // Remove any keys not in the schema (n8n rejects additional properties)
        const hasAdditionalProps = allSchemas.some(s => s.additionalProperties !== false);
        if (!hasAdditionalProps && allowedKeys.size > 0) {
          for (const key of Object.keys(mergedData)) {
            if (!allowedKeys.has(key)) {
              console.log('[provision] Stripping disallowed key:', key);
              delete mergedData[key];
            }
          }
        }

        console.log('[provision] Schema applied for', tpl.credential_type,
          '— allowed:', [...allowedKeys].join(', '),
          '— final:', Object.keys(mergedData).join(', '));
      } else {
        console.warn('[provision] Schema fetch failed:', schemaRes.status);
      }
    } catch (schemaErr) {
      console.warn('[provision] Schema fetch error:', schemaErr.message);
    }

    // Create credential on n8n
    const r = await fetch(`${base}/api/v1/credentials`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': inst.api_key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: credName, type: tpl.credential_type, data: mergedData }),
    });
    if (!r.ok) {
      const errBody = await r.text();
      return res.status(r.status).json({ error: errBody || 'Failed to create credential on n8n' });
    }
    const created = await r.json();

    // Audit log (never log secrets)
    await pool.query(
      'INSERT INTO credential_audit (credential_store_id, n8n_credential_id, credential_name, credential_type, instance_id, user_id, action, detail) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [tpl.id, created.id, credName, tpl.credential_type, inst.id || null, req.user.id, 'provisioned',
        `User ${req.user.username} provisioned from template "${tpl.name}"`]
    );
    auditLog(req.user, 'provisioned', 'credential', created.id, `${credName} (from template: ${tpl.name})`);

    res.status(201).json({ success: true, credentialId: created.id, name: credName });
  } catch (err) {
    console.error('Credential provision error:', err.message);
    if (err.cause?.code === 'ENOTFOUND' || err.cause?.code === 'ECONNREFUSED' || err.message === 'fetch failed') {
      return res.status(502).json({ error: `Cannot reach n8n instance. Check that the instance URL is accessible from this server.` });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
