const express = require('express');
const pool = require('../db');
const { escHtml } = require('../lib/helpers');
const { requireRole } = require('../lib/middleware');
const {
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, APP_URL,
  EMAIL_TEMPLATES, getBrandingConfig, getEmailTemplate, replaceTemplateVars, renderEmail,
  getMailTransport, rebuildTransport, getSmtpFrom,
} = require('../lib/email');
const { getAiConfig, invalidateAiConfigCache, AI_DEFAULT_PROMPTS, scheduleDailySummaryCron } = require('../lib/ai-providers');

const router = express.Router();

// --- SMTP settings ---

router.get('/api/settings/smtp', requireRole('admin'), async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT key, value FROM settings WHERE key LIKE 'smtp_%' OR key = 'app_url'");
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    res.json({
      smtp_host: settings.smtp_host || SMTP_HOST || '',
      smtp_port: settings.smtp_port || String(SMTP_PORT) || '25',
      smtp_user: settings.smtp_user || SMTP_USER || '',
      smtp_pass: settings.smtp_pass ? '••••••' : (SMTP_PASS ? '••••••' : ''),
      smtp_from: settings.smtp_from || SMTP_FROM || '',
      smtp_secure: settings.smtp_secure || (SMTP_PORT === 465 ? 'true' : 'false'),
      app_url: settings.app_url || APP_URL || '',
      source: Object.keys(settings).length > 0 ? 'database' : 'environment',
    });
  } catch (err) {
    console.error('Load SMTP settings error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/settings/smtp', requireRole('admin'), async (req, res) => {
  try {
    const keys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_secure', 'app_url'];
    for (const key of keys) {
      if (req.body[key] !== undefined) {
        if (key === 'smtp_pass' && req.body[key] === '••••••') continue;
        await pool.query(
          `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
          [key, req.body[key]]
        );
      }
    }
    const { rows } = await pool.query("SELECT key, value FROM settings WHERE key LIKE 'smtp_%'");
    const s = {};
    for (const r of rows) s[r.key] = r.value;
    rebuildTransport(s);
    res.json({ message: 'SMTP settings saved' });
  } catch (err) {
    console.error('Save SMTP settings error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/settings/smtp/test', requireRole('admin'), async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'Recipient email required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: 'Invalid email address' });
    const mailTransport = getMailTransport();
    if (!mailTransport) return res.status(400).json({ error: 'SMTP not configured — save SMTP settings first' });
    const fromAddr = await getSmtpFrom();
    const emailData = await renderEmail('test_email', {});
    await mailTransport.sendMail({ from: fromAddr, to, subject: emailData.subject, html: emailData.html });
    res.json({ message: 'Test email sent to ' + escHtml(to) });
  } catch (err) {
    console.error('SMTP test error:', err.message, err.response);
    res.status(500).json({ error: 'SMTP test failed. Check server logs for details.' });
  }
});

// --- Email Template System ---

router.get('/api/settings/email-templates', requireRole('admin'), async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT key, value FROM settings WHERE key LIKE 'email_tpl_%'");
    const dbSettings = {};
    for (const r of rows) dbSettings[r.key] = r.value;
    const templates = {};
    for (const [key, defaults] of Object.entries(EMAIL_TEMPLATES)) {
      templates[key] = {
        label: defaults.label,
        subject: dbSettings[`email_tpl_${key}_subject`] || defaults.subject,
        body: dbSettings[`email_tpl_${key}_body`] || defaults.body,
      };
    }
    res.json({ templates });
  } catch (err) {
    console.error('Load email templates error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/settings/email-templates', requireRole('admin'), async (req, res) => {
  try {
    const { templates } = req.body;
    if (!templates || typeof templates !== 'object') return res.status(400).json({ error: 'templates object required' });
    for (const [key, tpl] of Object.entries(templates)) {
      if (!EMAIL_TEMPLATES[key]) continue;
      if (tpl.subject !== undefined) {
        await pool.query(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
          [`email_tpl_${key}_subject`, tpl.subject]);
      }
      if (tpl.body !== undefined) {
        await pool.query(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
          [`email_tpl_${key}_body`, tpl.body]);
      }
    }
    res.json({ message: 'Email templates saved' });
  } catch (err) {
    console.error('Save email templates error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/settings/email-templates/reset', requireRole('admin'), async (req, res) => {
  try {
    const { template_key } = req.body;
    if (!template_key || !EMAIL_TEMPLATES[template_key]) return res.status(400).json({ error: 'Invalid template key' });
    await pool.query(`DELETE FROM settings WHERE key IN ($1, $2)`,
      [`email_tpl_${template_key}_subject`, `email_tpl_${template_key}_body`]);
    const defaults = EMAIL_TEMPLATES[template_key];
    res.json({ subject: defaults.subject, body: defaults.body });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/settings/email-templates/preview', requireRole('admin'), async (req, res) => {
  try {
    const { template_key, subject: overrideSubject, body: overrideBody } = req.body;
    if (!template_key || !EMAIL_TEMPLATES[template_key]) return res.status(400).json({ error: 'Invalid template key' });
    const sampleVars = {
      username: 'John Doe', reset_url: '#',
      ticket_id: '42', ticket_title: 'Sample Ticket', ticket_description: 'This is a sample ticket description...',
      ticket_priority: 'high', ticket_status: 'open', ticket_url: '#',
      creator_name: 'Jane Smith', commenter_name: 'Bob Wilson', comment_body: 'This is a sample comment...',
      old_status: 'open', new_status: 'in progress',
      total_count: '150', success_count: '142', error_count: '8', running_count: '0', success_rate: '95',
      top_failing: '<ul><li><strong>Invoice Workflow</strong>: 5 failures</li></ul>',
      longest_running: '<ul><li><strong>Data Sync</strong>: 45s</li></ul>',
      ai_summary: '<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;margin:16px 0;border-radius:4px"><strong>AI Summary:</strong><br>Overall healthy day with a 95% success rate.</div>',
      generated_at: new Date().toLocaleString(),
    };
    if (overrideSubject !== undefined || overrideBody !== undefined) {
      const branding = await getBrandingConfig();
      const tpl = await getEmailTemplate(template_key);
      const subjectTpl = overrideSubject !== undefined ? overrideSubject : tpl.subject;
      const bodyTpl = overrideBody !== undefined ? overrideBody : tpl.body;
      const allVars = {
        app_name: branding.brand_app_name || 'n8n Library',
        primary_color: branding.brand_primary || '#ff6d5a',
        primary_hover: branding.brand_primary_hover || '#e0523f',
        logo_url: branding.brand_logo || '',
        ...sampleVars,
      };
      const renderedSubject = replaceTemplateVars(subjectTpl, allVars);
      const renderedBody = replaceTemplateVars(bodyTpl, allVars);
      const logoImg = allVars.logo_url
        ? `<img src="${allVars.logo_url}" alt="${escHtml(allVars.app_name)}" style="max-height:36px;max-width:160px">`
        : '';
      const logoHtml = `<div style="display:flex;align-items:center;gap:12px">${logoImg}<span style="font-size:18px;font-weight:700;color:${allVars.primary_color}">${escHtml(allVars.app_name)}</span></div>`;
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px">
    <div style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
      <div style="padding:24px 32px;border-bottom:3px solid ${allVars.primary_color}">${logoHtml}</div>
      <div style="padding:24px 32px">${renderedBody}</div>
      <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
        <p style="font-size:12px;color:#9ca3af;margin:0">This is an automated message from ${escHtml(allVars.app_name)}.</p>
      </div>
    </div>
  </div>
</body></html>`;
      return res.json({ subject: renderedSubject, html });
    }
    const result = await renderEmail(template_key, sampleVars);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Branding / Design settings ---

router.get('/api/settings/branding', async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT key, value FROM settings WHERE key LIKE 'brand_%'");
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    res.json(settings);
  } catch (err) {
    console.error('Load branding error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/settings/branding', requireRole('admin'), async (req, res) => {
  try {
    const allowed = [
      'brand_logo', 'brand_primary', 'brand_primary_hover',
      'brand_bg', 'brand_sidebar', 'brand_card',
      'brand_text', 'brand_text_dark', 'brand_app_name',
    ];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'brand_logo' && req.body[key]) {
          if (!/^data:image\/(png|jpe?g|gif|svg\+xml|webp);base64,/.test(req.body[key])) {
            return res.status(400).json({ error: 'Logo must be a valid image (PNG, JPG, GIF, SVG, WebP)' });
          }
          if (req.body[key].length > 2 * 1024 * 1024) {
            return res.status(400).json({ error: 'Logo must be under 2MB' });
          }
        }
        if (key.startsWith('brand_') && key !== 'brand_logo' && key !== 'brand_app_name' && req.body[key]) {
          if (!/^#[0-9a-fA-F]{3,8}$/.test(req.body[key])) {
            return res.status(400).json({ error: `Invalid color value for ${key}` });
          }
        }
        await pool.query(
          `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
          [key, req.body[key]]
        );
      }
    }
    res.json({ message: 'Branding settings saved' });
  } catch (err) {
    console.error('Save branding error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- AI Settings ---

router.get('/api/settings/ai', requireRole('admin'), async (_req, res) => {
  try {
    const keys = ['ai_provider', 'ai_api_key', 'ai_model', 'ai_base_url', 'daily_summary_hour'];
    const { rows } = await pool.query(`SELECT key, value FROM settings WHERE key = ANY($1)`, [keys]);
    const cfg = {};
    for (const r of rows) cfg[r.key] = r.value;
    if (cfg.ai_api_key) {
      const k = cfg.ai_api_key;
      cfg.ai_api_key_masked = k.length > 8 ? k.slice(0, 4) + '****' + k.slice(-4) : '****';
      cfg.ai_api_key_set = true;
    } else {
      cfg.ai_api_key_masked = '';
      cfg.ai_api_key_set = false;
    }
    delete cfg.ai_api_key;
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/settings/ai', requireRole('admin'), async (req, res) => {
  try {
    const allowed = ['ai_provider', 'ai_api_key', 'ai_model', 'ai_base_url', 'daily_summary_hour'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'ai_api_key' && req.body[key] === '') continue;
        await pool.query(
          `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
          [key, req.body[key]]
        );
      }
    }
    invalidateAiConfigCache();
    scheduleDailySummaryCron();
    res.json({ message: 'AI settings saved' });
  } catch (err) {
    console.error('Save AI settings error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/ai/status', async (req, res) => {
  try {
    const cfg = await getAiConfig();
    const configured = cfg.ai_provider === 'ollama' ? true : !!(cfg.ai_provider && cfg.ai_api_key);
    res.json({ configured, provider: cfg.ai_provider || null });
  } catch (e) {
    res.json({ configured: false, provider: null });
  }
});

// AI: System prompts
router.get('/api/settings/ai-prompts', requireRole('admin'), async (_req, res) => {
  try {
    const keys = Object.keys(AI_DEFAULT_PROMPTS);
    const { rows } = await pool.query('SELECT key, value FROM settings WHERE key = ANY($1)', [keys]);
    const result = {};
    for (const k of keys) {
      const row = rows.find(r => r.key === k);
      result[k] = row ? row.value : AI_DEFAULT_PROMPTS[k];
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/settings/ai-prompts', requireRole('admin'), async (req, res) => {
  try {
    const keys = Object.keys(AI_DEFAULT_PROMPTS);
    for (const key of keys) {
      if (req.body[key] !== undefined) {
        await pool.query(
          'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
          [key, req.body[key]]
        );
      }
    }
    res.json({ message: 'Prompts saved' });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- MCP Server toggle ---

router.get('/api/settings/mcp-server', requireRole('admin'), async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'mcp_server_enabled'");
    res.json({ enabled: !rows.length || rows[0].value !== 'false' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/api/settings/mcp-server', requireRole('admin'), async (req, res) => {
  try {
    const enabled = req.body.enabled !== false;
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('mcp_server_enabled', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [String(enabled)]
    );
    res.json({ enabled, message: 'MCP server ' + (enabled ? 'enabled' : 'disabled') });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- MCP Server tools ---

const MCP_TOOLS = [
  'search_templates', 'get_template', 'list_tickets', 'get_ticket',
  'create_ticket', 'search_kb_articles', 'get_kb_article', 'get_stats', 'list_users'
];

router.get('/api/settings/mcp-server-tools', requireRole('admin'), async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'mcp_disabled_tools'");
    const disabled = rows.length ? JSON.parse(rows[0].value) : [];
    const tools = MCP_TOOLS.map(name => ({ name, enabled: !disabled.includes(name) }));
    res.json({ tools });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/api/settings/mcp-server-tools', requireRole('admin'), async (req, res) => {
  try {
    const { tool, enabled } = req.body;
    if (!MCP_TOOLS.includes(tool)) return res.status(400).json({ error: 'Unknown tool' });
    const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'mcp_disabled_tools'");
    let disabled = rows.length ? JSON.parse(rows[0].value) : [];
    if (enabled) {
      disabled = disabled.filter(t => t !== tool);
    } else {
      if (!disabled.includes(tool)) disabled.push(tool);
    }
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('mcp_disabled_tools', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [JSON.stringify(disabled)]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Export / Import Settings ---

router.get('/api/settings/export', requireRole('admin'), async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings ORDER BY key');
    const { rows: cats } = await pool.query('SELECT name, icon, description FROM categories ORDER BY id');
    const { rows: webhooks } = await pool.query('SELECT name, url, events, headers, enabled FROM webhooks ORDER BY id');
    const { rows: alerts } = await pool.query('SELECT name, condition, config, cooldown_minutes, enabled, recipients FROM alerts ORDER BY id');
    res.json({
      exported_at: new Date().toISOString(),
      version: 1,
      settings: rows,
      categories: cats,
      webhooks,
      alerts,
    });
  } catch (err) {
    console.error('Export settings error:', err.message);
    res.status(500).json({ error: 'Failed to export settings' });
  }
});

router.post('/api/settings/import', requireRole('admin'), async (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.version) return res.status(400).json({ error: 'Invalid export file' });
    const imported = { settings: 0, categories: 0, webhooks: 0, alerts: 0 };

    if (data.settings && Array.isArray(data.settings)) {
      for (const s of data.settings) {
        if (!s.key) continue;
        await pool.query(
          `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
          [s.key, s.value]
        );
        imported.settings++;
      }
    }
    if (data.categories && Array.isArray(data.categories)) {
      for (const c of data.categories) {
        if (!c.name) continue;
        await pool.query(
          `INSERT INTO categories (name, icon, description) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING`,
          [c.name, c.icon || '', c.description || '']
        );
        imported.categories++;
      }
    }
    if (data.webhooks && Array.isArray(data.webhooks)) {
      for (const w of data.webhooks) {
        if (!w.name || !w.url) continue;
        await pool.query(
          `INSERT INTO webhooks (name, url, events, headers, enabled) VALUES ($1, $2, $3, $4, $5)`,
          [w.name, w.url, JSON.stringify(w.events || []), JSON.stringify(w.headers || {}), w.enabled !== false]
        );
        imported.webhooks++;
      }
    }
    if (data.alerts && Array.isArray(data.alerts)) {
      for (const a of data.alerts) {
        if (!a.name || !a.condition) continue;
        await pool.query(
          `INSERT INTO alerts (name, condition, config, cooldown_minutes, enabled, recipients) VALUES ($1, $2, $3, $4, $5, $6)`,
          [a.name, a.condition, JSON.stringify(a.config || {}), a.cooldown_minutes || 30, a.enabled !== false, JSON.stringify(a.recipients || [])]
        );
        imported.alerts++;
      }
    }
    res.json({ message: 'Import complete', imported });
  } catch (err) {
    console.error('Import settings error:', err.message);
    res.status(500).json({ error: 'Failed to import settings' });
  }
});

module.exports = router;
