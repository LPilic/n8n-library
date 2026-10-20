const express = require('express');
const pool = require('../db');
const { encrypt, decrypt } = require('../lib/crypto');
const { requireAuth, requireRole, credentialLimiter } = require('../lib/middleware');
const { getInstanceConfig } = require('../lib/n8n-api');
const { applySchemaDefaults } = require('../lib/credential-schema');
const { auditLog } = require('../lib/audit');

const router = express.Router();

const VALID_ROLES = ['admin', 'editor', 'viewer'];
const SENSITIVE_NAME_PARTS = ['password', 'secret', 'token', 'apikey', 'api_key', 'private'];
const MAX_NAME_LENGTH = 120;

function camelToLabel(value) {
  return String(value)
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function isSensitiveName(name) {
  const lower = String(name).toLowerCase();
  return SENSITIVE_NAME_PARTS.some((part) => lower.includes(part));
}

function normalizeUserFields(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const fields = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const key = item.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    fields.push(key);
  }
  return fields;
}

function normalizeDefinitions(userFields, provided) {
  const keys = normalizeUserFields(userFields);
  const providedMap = new Map();
  for (const def of Array.isArray(provided) ? provided : []) {
    if (!def || typeof def.key !== 'string') continue;
    providedMap.set(def.key, def);
  }

  return keys.map((key) => {
    const def = providedMap.get(key) || {};
    const type = ['string', 'number', 'integer', 'boolean'].includes(def.type) ? def.type : 'string';
    return {
      key,
      label: def.label || camelToLabel(key),
      type,
      // A user field is required unless the template explicitly marks it optional.
      required: def.required !== false,
      sensitive: def.sensitive !== undefined ? !!def.sensitive : isSensitiveName(key),
      description: def.description || '',
    };
  });
}

function serializeTemplate(row) {
  const userFields = normalizeUserFields(row.user_fields);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.credential_type,
    credential_type: row.credential_type,
    creator: row.creator_name,
    creator_name: row.creator_name,
    allowed_roles: row.allowed_roles || [],
    instance_id: row.instance_id,
    instance_name: row.instance_name,
    user_fields: userFields,
    user_field_definitions: normalizeDefinitions(userFields, row.user_field_definitions),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function overlapError(sharedData, userFields) {
  const overlap = userFields.filter((key) => Object.hasOwn(sharedData, key));
  if (overlap.length > 0) {
    return `Fields cannot be both shared and user-supplied: ${overlap.join(', ')}`;
  }
  return null;
}

function coerceUserValue(def, value) {
  if (def.type === 'boolean') {
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    throw new Error(`Field "${def.label}" must be a boolean`);
  }
  if (def.type === 'number' || def.type === 'integer') {
    const num = Number(value);
    if (!Number.isFinite(num)) throw new Error(`Field "${def.label}" must be a number`);
    return def.type === 'integer' ? Math.trunc(num) : num;
  }
  return String(value);
}

function safeAuditDetail(detail) {
  return String(detail || '').slice(0, 1000);
}

// List credential templates (metadata only — never return shared_data)
router.get('/api/credential-store', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT cs.id, cs.name, cs.description, cs.credential_type, cs.user_fields,
        cs.user_field_definitions, cs.allowed_roles, cs.instance_id, cs.created_by,
        cs.created_at, cs.updated_at,
        u.username as creator_name, ni.name as instance_name
      FROM credential_store cs
      LEFT JOIN users u ON u.id = cs.created_by
      LEFT JOIN n8n_instances ni ON ni.id = cs.instance_id
      ORDER BY cs.name
    `);
    const userRole = req.user.role;
    const visible = rows
      .filter((row) => userRole === 'admin' || (row.allowed_roles || []).includes(userRole))
      .map(serializeTemplate);
    res.json(visible);
  } catch (err) {
    console.error('Credential store list error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single template detail (metadata + audit, no secrets)
router.get('/api/credential-store/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT cs.id, cs.name, cs.description, cs.credential_type, cs.user_fields,
        cs.user_field_definitions, cs.allowed_roles, cs.instance_id, cs.created_by,
        cs.created_at, cs.updated_at,
        u.username as creator_name, ni.name as instance_name
      FROM credential_store cs
      LEFT JOIN users u ON u.id = cs.created_by
      LEFT JOIN n8n_instances ni ON ni.id = cs.instance_id
      WHERE cs.id = $1
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Template not found' });
    const tpl = rows[0];
    if (req.user.role !== 'admin' && !(tpl.allowed_roles || []).includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { rows: audit } = await pool.query(`
      SELECT ca.*, u.username FROM credential_audit ca
      LEFT JOIN users u ON u.id = ca.user_id
      WHERE ca.credential_store_id = $1
      ORDER BY ca.created_at DESC LIMIT 50
    `, [req.params.id]);

    res.json({ ...serializeTemplate(tpl), audit });
  } catch (err) {
    console.error('Credential store detail error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get stored field metadata for a template (admin only — never values)
router.get('/api/credential-store/:id/fields', requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT shared_data, user_fields, user_field_definitions FROM credential_store WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Template not found' });
    const data = JSON.parse(decrypt(rows[0].shared_data));
    const userFields = normalizeUserFields(rows[0].user_fields);
    res.json({
      storedFields: Object.keys(data),
      userFields,
      userFieldDefinitions: normalizeDefinitions(userFields, rows[0].user_field_definitions),
    });
  } catch (err) {
    console.error('Credential store fields error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create credential template (admin only)
router.post('/api/credential-store', requireRole('admin'), credentialLimiter, async (req, res) => {
  try {
    const {
      name, description, credential_type, shared_data,
      user_fields, user_field_definitions, allowed_roles, instance_id,
    } = req.body;

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) return res.status(400).json({ error: 'Name is required' });
    if (trimmedName.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ error: `Name must be ${MAX_NAME_LENGTH} characters or fewer` });
    }
    if (!credential_type || typeof credential_type !== 'string') {
      return res.status(400).json({ error: 'Credential type is required' });
    }
    if (shared_data !== undefined && (typeof shared_data !== 'object' || Array.isArray(shared_data))) {
      return res.status(400).json({ error: 'Shared data must be an object' });
    }

    const fields = normalizeUserFields(user_fields);
    const definitions = normalizeDefinitions(fields, user_field_definitions);
    const sharedObject = shared_data && typeof shared_data === 'object' ? shared_data : {};
    if (Object.keys(sharedObject).length === 0 && fields.length === 0) {
      return res.status(400).json({ error: 'At least one shared or user field is required' });
    }
    const overlap = overlapError(sharedObject, fields);
    if (overlap) return res.status(400).json({ error: overlap });

    const roles = Array.isArray(allowed_roles)
      ? allowed_roles.filter((role) => VALID_ROLES.includes(role))
      : VALID_ROLES;

    const encrypted = encrypt(JSON.stringify(sharedObject));
    const { rows } = await pool.query(
      `INSERT INTO credential_store
         (name, description, credential_type, shared_data, user_fields, user_field_definitions,
          allowed_roles, instance_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, credential_type, created_at`,
      [
        trimmedName,
        typeof description === 'string' ? description.trim() : '',
        credential_type,
        encrypted,
        fields,
        JSON.stringify(definitions),
        roles,
        instance_id || null,
        req.user.id,
      ]
    );

    try {
      await pool.query(
        'INSERT INTO credential_audit (credential_store_id, credential_name, credential_type, instance_id, user_id, action, detail) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [rows[0].id, trimmedName, credential_type, instance_id || null, req.user.id, 'template_created', `Stored ${Object.keys(sharedObject).length} shared fields`]
      );
    } catch (auditErr) {
      console.error('Credential store create audit error:', auditErr.message);
    }
    auditLog(req.user, 'created', 'credential_template', rows[0].id, trimmedName);

    res.status(201).json({
      ...rows[0],
      type: rows[0].credential_type,
      user_fields: fields,
      user_field_definitions: definitions,
    });
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
    const current = cur[0];

    const {
      name, description, shared_data, user_fields, user_field_definitions,
      allowed_roles, instance_id,
    } = req.body;

    const currentShared = JSON.parse(decrypt(current.shared_data));
    const nextShared = shared_data !== undefined ? shared_data : currentShared;
    if (nextShared !== undefined && (typeof nextShared !== 'object' || Array.isArray(nextShared))) {
      return res.status(400).json({ error: 'Shared data must be an object' });
    }

    const nextFields = user_fields !== undefined
      ? normalizeUserFields(user_fields)
      : normalizeUserFields(current.user_fields);
    const nextDefinitions = user_field_definitions !== undefined
      ? normalizeDefinitions(nextFields, user_field_definitions)
      : normalizeDefinitions(nextFields, current.user_field_definitions);

    const sharedObject = nextShared && typeof nextShared === 'object' ? nextShared : {};
    if (Object.keys(sharedObject).length === 0 && nextFields.length === 0) {
      return res.status(400).json({ error: 'At least one shared or user field is required' });
    }
    const overlap = overlapError(sharedObject, nextFields);
    if (overlap) return res.status(400).json({ error: overlap });

    const updates = [];
    const params = [];
    let idx = 1;
    const changes = [];

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return res.status(400).json({ error: 'Name cannot be empty' });
      if (trimmed.length > MAX_NAME_LENGTH) {
        return res.status(400).json({ error: `Name must be ${MAX_NAME_LENGTH} characters or fewer` });
      }
      updates.push(`name = $${idx++}`);
      params.push(trimmed);
      changes.push('name');
    }
    if (description !== undefined) {
      updates.push(`description = $${idx++}`);
      params.push(String(description).trim());
      changes.push('description');
    }
    if (shared_data !== undefined) {
      updates.push(`shared_data = $${idx++}`);
      params.push(encrypt(JSON.stringify(sharedObject)));
      changes.push('secrets');
    }
    if (user_fields !== undefined || user_field_definitions !== undefined) {
      updates.push(`user_fields = $${idx++}`);
      params.push(nextFields);
      updates.push(`user_field_definitions = $${idx++}`);
      params.push(JSON.stringify(nextDefinitions));
      changes.push('user_fields');
    }
    if (allowed_roles !== undefined) {
      const roles = Array.isArray(allowed_roles)
        ? allowed_roles.filter((role) => VALID_ROLES.includes(role))
        : VALID_ROLES;
      updates.push(`allowed_roles = $${idx++}`);
      params.push(roles);
      changes.push('allowed_roles');
    }
    if (instance_id !== undefined) {
      updates.push(`instance_id = $${idx++}`);
      params.push(instance_id || null);
      changes.push('instance');
    }

    if (updates.length === 0) return res.json({ message: 'No changes' });

    updates.push(`updated_at = NOW()`);
    params.push(req.params.id);
    await pool.query(`UPDATE credential_store SET ${updates.join(', ')} WHERE id = $${idx}`, params);

    try {
      await pool.query(
        'INSERT INTO credential_audit (credential_store_id, credential_name, credential_type, instance_id, user_id, action, detail) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [req.params.id, name ? String(name).trim() : current.name, current.credential_type, instance_id || current.instance_id || null, req.user.id, 'template_updated', `Updated: ${changes.join(', ')}`]
      );
    } catch (auditErr) {
      console.error('Credential store update audit error:', auditErr.message);
    }
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

    try {
      await pool.query(
        'INSERT INTO credential_audit (credential_store_id, credential_name, credential_type, user_id, action, detail) VALUES ($1, $2, $3, $4, $5, $6)',
        [null, rows[0].name, rows[0].credential_type, req.user.id, 'template_deleted', `Deleted template: ${rows[0].name}`]
      );
    } catch (auditErr) {
      console.error('Credential store delete audit error:', auditErr.message);
    }
    auditLog(req.user, 'deleted', 'credential_template', req.params.id, rows[0].name);

    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Credential store delete error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Provision credential to the template's n8n instance (any allowed user)
router.post('/api/credential-store/:id/provision', requireAuth, credentialLimiter, async (req, res) => {
  let tpl = null;
  let inst = null;
  let credName = '';
  try {
    const { rows } = await pool.query('SELECT * FROM credential_store WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Template not found' });
    tpl = rows[0];

    if (req.user.role !== 'admin' && !(tpl.allowed_roles || []).includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have access to this credential template' });
    }

    // A template pinned to an instance can never be provisioned elsewhere.
    if (tpl.instance_id && req.body.instance_id && Number(req.body.instance_id) !== Number(tpl.instance_id)) {
      return res.status(400).json({ error: 'This template is restricted to its configured n8n instance' });
    }
    const instanceId = tpl.instance_id || req.body.instance_id;
    inst = await getInstanceConfig(instanceId);
    if (!inst) return res.status(400).json({ error: 'No n8n instance configured' });
    const base = inst.internal_url.replace(/\/+$/, '');

    const sharedData = JSON.parse(decrypt(tpl.shared_data));
    const definitions = normalizeDefinitions(tpl.user_fields, tpl.user_field_definitions);
    const userKeys = definitions.map((def) => def.key);

    const userData = req.body.data === undefined ? {} : req.body.data;
    if (!userData || typeof userData !== 'object' || Array.isArray(userData)) {
      return res.status(400).json({ error: 'data must be an object' });
    }

    const unknownKeys = Object.keys(userData).filter((key) => !userKeys.includes(key));
    if (unknownKeys.length > 0) {
      return res.status(400).json({ error: `Unknown user field(s): ${unknownKeys.join(', ')}` });
    }

    const overlap = overlapError(sharedData, userKeys);
    if (overlap) {
      return res.status(400).json({ error: 'Template is misconfigured: shared and user fields overlap' });
    }

    const userFieldsOnly = {};
    for (const def of definitions) {
      const value = userData[def.key];
      if (value === undefined || value === null || value === '') {
        if (def.required) return res.status(400).json({ error: `Required field "${def.label}" is missing` });
        continue;
      }
      try {
        userFieldsOnly[def.key] = coerceUserValue(def, value);
      } catch (valueErr) {
        return res.status(400).json({ error: valueErr.message });
      }
    }

    const mergedData = { ...sharedData, ...userFieldsOnly };
    const requestedName = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    credName = (requestedName || `${tpl.name} - ${req.user.username}`).slice(0, MAX_NAME_LENGTH);
    if (!credName) return res.status(400).json({ error: 'Credential name is required' });

    // Fetch the current schema. Fill safe defaults and validate the template's
    // user fields, but never use an empty default to hide a required value.
    let schemaApplied = false;
    try {
      const schemaRes = await fetch(`${base}/api/v1/credentials/schema/${encodeURIComponent(tpl.credential_type)}`, {
        headers: { 'X-N8N-API-KEY': inst.api_key },
        signal: AbortSignal.timeout(30000),
      });
      if (schemaRes.ok) {
        const schema = await schemaRes.json();
        const result = applySchemaDefaults(schema, mergedData);

        const invalidUserFields = userKeys.filter((key) => !result.allowedKeys.includes(key));
        if (invalidUserFields.length > 0) {
          return res.status(400).json({
            error: `Template user field(s) are not valid for this credential type: ${invalidUserFields.join(', ')}`,
          });
        }
        if (result.missingRequired.length > 0) {
          return res.status(400).json({
            error: `Missing required credential field(s): ${result.missingRequired.join(', ')}`,
          });
        }
        Object.assign(mergedData, result.data);
        schemaApplied = true;
      } else {
        console.warn('[provision] Schema fetch failed:', schemaRes.status);
      }
    } catch (schemaErr) {
      console.warn('[provision] Schema fetch error:', schemaErr.message);
    }

    if (!schemaApplied) {
      console.warn('[provision] Proceeding without a credential schema; field validation is limited');
    }

    const r = await fetch(`${base}/api/v1/credentials`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': inst.api_key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: credName, type: tpl.credential_type, data: mergedData }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) {
      const errBody = await r.text().catch(() => '');
      console.error('[provision] n8n rejected credential:', r.status, errBody.slice(0, 1000));
      return res.status(502).json({ error: 'n8n rejected the credential. Check the template fields and server logs.' });
    }
    const created = await r.json();

    // The credential already exists in n8n. An audit failure must not turn the
    // request into an error and cause the user to create a duplicate.
    try {
      await pool.query(
        'INSERT INTO credential_audit (credential_store_id, n8n_credential_id, credential_name, credential_type, instance_id, user_id, action, detail) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [tpl.id, created.id, credName, tpl.credential_type, inst.id || null, req.user.id, 'provisioned',
          safeAuditDetail(`User ${req.user.username} provisioned from template "${tpl.name}"`)]
      );
    } catch (auditErr) {
      console.error('Credential provision audit error:', auditErr.message);
    }
    auditLog(req.user, 'provisioned', 'credential', created.id, `${credName} (from template: ${tpl.name})`);

    res.status(201).json({ success: true, credentialId: created.id, name: credName });
  } catch (err) {
    console.error('Credential provision error:', err.message);
    try {
      if (tpl) {
        await pool.query(
          'INSERT INTO credential_audit (credential_store_id, credential_name, credential_type, instance_id, user_id, action, detail) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [tpl.id, credName || tpl.name, tpl.credential_type, inst?.id || null, req.user.id, 'provision_failed', safeAuditDetail(err.message)]
        );
      }
    } catch (auditErr) {
      console.error('Credential provision failure audit error:', auditErr.message);
    }
    if (err.cause?.code === 'ENOTFOUND' || err.cause?.code === 'ECONNREFUSED' || err.message === 'fetch failed') {
      return res.status(502).json({ error: 'Cannot reach n8n instance. Check that the instance URL is accessible from this server.' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
