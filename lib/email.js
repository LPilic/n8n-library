const nodemailer = require('nodemailer');
const pool = require('../db');
const { escHtml, getSettingWithDefault } = require('./helpers');

const SMTP_HOST = process.env.SMTP_HOST || process.env.N8N_SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || process.env.N8N_SMTP_PORT || '25', 10);
const SMTP_USER = process.env.SMTP_USER || process.env.N8N_SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || process.env.N8N_SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || process.env.N8N_SMTP_SENDER || 'n8n-library@localhost';
const APP_URL = process.env.APP_URL || `http://localhost:${process.env.PORT || 3100}`;

let mailTransport = null;
if (SMTP_HOST) {
  mailTransport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    ...(SMTP_USER ? { auth: { user: SMTP_USER, pass: SMTP_PASS } } : {}),
  });
  console.log(`SMTP configured: ${SMTP_HOST}:${SMTP_PORT}`);
} else {
  // Check DB for SMTP settings saved via UI (env vars may not be set)
  pool.query("SELECT key, value FROM settings WHERE key LIKE 'smtp_%'")
    .then(({ rows }) => {
      if (rows.length > 0) {
        const s = {};
        for (const r of rows) s[r.key] = r.value;
        if (s.smtp_host) {
          rebuildTransport(s);
          console.log('SMTP restored from database settings');
        } else {
          console.warn('No SMTP configured — password reset emails will be logged to console');
        }
      } else {
        console.warn('No SMTP configured — password reset emails will be logged to console');
      }
    })
    .catch(() => {
      console.warn('No SMTP configured — password reset emails will be logged to console');
    });
}

function getMailTransport() { return mailTransport; }

function rebuildTransport(settings) {
  const host = settings.smtp_host || SMTP_HOST;
  const port = parseInt(settings.smtp_port || SMTP_PORT, 10);
  const user = settings.smtp_user || SMTP_USER;
  const pass = settings.smtp_pass || SMTP_PASS;
  if (host) {
    mailTransport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465 || settings.smtp_secure === 'true',
      ...(user ? { auth: { user, pass } } : {}),
    });
    console.log(`SMTP reconfigured: ${host}:${port}`);
  }
}

const EMAIL_TEMPLATES = {
  password_reset: {
    label: 'Password Reset',
    subject: '{{app_name}} — Password Reset',
    body: `<p>Hi <strong>{{username}}</strong>,</p>
<p>We received a request to reset your password. Click the button below to set a new password:</p>
<p style="text-align:center;margin:24px 0">
  <a href="{{reset_url}}" style="background:{{primary_color}};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Reset Password</a>
</p>
<p style="font-size:13px;color:#7e8186">This link expires in 1 hour. If you did not request this, you can safely ignore this email.</p>`,
  },
  test_email: {
    label: 'Test Email',
    subject: '{{app_name}} — Test Email',
    body: `<p>This is a test email from your <strong>{{app_name}}</strong> instance.</p>
<p style="color:#7e8186;font-size:13px">If you received this, your SMTP configuration is working correctly.</p>`,
  },
  ticket_new: {
    label: 'New Ticket',
    subject: '{{app_name}} — New Ticket #{{ticket_id}}: {{ticket_title}}',
    body: `<p><strong>{{creator_name}}</strong> created a new ticket:</p>
<p><strong>{{ticket_title}}</strong></p>
<p style="color:#7e8186">{{ticket_description}}</p>
<p>Priority: <strong>{{ticket_priority}}</strong></p>
<p style="margin-top:20px"><a href="{{ticket_url}}" style="background:{{primary_color}};color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block">View Ticket</a></p>`,
  },
  ticket_status: {
    label: 'Ticket Status Change',
    subject: '{{app_name}} — Ticket #{{ticket_id}} — {{new_status}}',
    body: `<p>Ticket <strong>#{{ticket_id}}: {{ticket_title}}</strong> status changed:</p>
<p>{{old_status}} &rarr; <strong>{{new_status}}</strong></p>
<p style="margin-top:20px"><a href="{{ticket_url}}" style="background:{{primary_color}};color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block">View Ticket</a></p>`,
  },
  ticket_comment: {
    label: 'New Ticket Comment',
    subject: '{{app_name}} — New comment on Ticket #{{ticket_id}}: {{ticket_title}}',
    body: `<p><strong>{{commenter_name}}</strong> commented on <strong>#{{ticket_id}}: {{ticket_title}}</strong>:</p>
<p style="color:#7e8186">{{comment_body}}</p>
<p style="margin-top:20px"><a href="{{ticket_url}}" style="background:{{primary_color}};color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block">View Ticket</a></p>`,
  },
  ticket_assignment: {
    label: 'Ticket Assignment',
    subject: '{{app_name}} — Ticket #{{ticket_id}} assigned to you',
    body: `<p>You have been assigned to ticket <strong>#{{ticket_id}}: {{ticket_title}}</strong></p>
<p>Priority: <strong>{{ticket_priority}}</strong> | Status: <strong>{{ticket_status}}</strong></p>
<p style="margin-top:20px"><a href="{{ticket_url}}" style="background:{{primary_color}};color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block">View Ticket</a></p>`,
  },
  alert_triggered: {
    label: 'Alert Triggered',
    subject: '{{app_name}} — Alert: {{alert_name}}',
    body: `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:16px 0">
  <p style="font-weight:700;color:#dc2626;margin-bottom:8px">Alert Triggered: {{alert_name}}</p>
  <p style="color:#7f1d1d">{{alert_message}}</p>
  <p style="font-size:13px;color:#9ca3af;margin-top:12px">Condition: {{condition}}</p>
</div>`,
  },
  daily_summary: {
    label: 'Daily Summary',
    subject: '{{app_name}} — Daily Summary: {{success_count}}/{{total_count}} success, {{error_count}} errors',
    body: `<div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:16px 0">
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:8px"><strong>Total</strong></td><td style="padding:8px">{{total_count}}</td>
        <td style="padding:8px"><strong>Success</strong></td><td style="padding:8px;color:#22c55e">{{success_count}}</td></tr>
    <tr><td style="padding:8px"><strong>Errors</strong></td><td style="padding:8px;color:#ef4444">{{error_count}}</td>
        <td style="padding:8px"><strong>Running</strong></td><td style="padding:8px">{{running_count}}</td></tr>
    <tr><td style="padding:8px"><strong>Success Rate</strong></td><td colspan="3" style="padding:8px">{{success_rate}}%</td></tr>
  </table>
</div>
{{ai_summary}}
<h3>Top Failing Workflows</h3>
{{top_failing}}
<h3>Longest Running</h3>
{{longest_running}}
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
<p style="font-size:12px;color:#9ca3af">Generated at {{generated_at}}</p>`,
  },
};

async function getBrandingConfig() {
  const defaults = { brand_app_name: 'n8n Library', brand_primary: '#ff6d5a', brand_primary_hover: '#e0523f', brand_logo: '' };
  try {
    const { rows } = await pool.query("SELECT key, value FROM settings WHERE key LIKE 'brand_%'");
    for (const r of rows) defaults[r.key] = r.value;
  } catch (e) {}
  return defaults;
}

async function getEmailTemplate(templateKey) {
  const defaults = EMAIL_TEMPLATES[templateKey];
  if (!defaults) throw new Error(`Unknown email template: ${templateKey}`);
  const subjectKey = `email_tpl_${templateKey}_subject`;
  const bodyKey = `email_tpl_${templateKey}_body`;
  const subject = await getSettingWithDefault(subjectKey, defaults.subject);
  const body = await getSettingWithDefault(bodyKey, defaults.body);
  return { subject, body };
}

function replaceTemplateVars(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] !== undefined ? vars[key] : `{{${key}}}`);
}

async function renderEmail(templateKey, vars = {}) {
  const branding = await getBrandingConfig();
  const { subject, body } = await getEmailTemplate(templateKey);

  const allVars = {
    app_name: branding.brand_app_name || 'n8n Library',
    primary_color: branding.brand_primary || '#ff6d5a',
    primary_hover: branding.brand_primary_hover || '#e0523f',
    logo_url: branding.brand_logo || '',
    ...vars,
  };

  const renderedSubject = replaceTemplateVars(subject, allVars);
  const renderedBody = replaceTemplateVars(body, allVars);

  const logoImg = allVars.logo_url
    ? `<img src="${allVars.logo_url}" alt="${escHtml(allVars.app_name)}" style="max-height:36px;max-width:160px">`
    : '';
  const logoHtml = `<div style="display:flex;align-items:center;gap:12px">${logoImg}<span style="font-size:18px;font-weight:700;color:${allVars.primary_color}">${escHtml(allVars.app_name)}</span></div>`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px">
    <div style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
      <div style="padding:24px 32px;border-bottom:3px solid ${allVars.primary_color}">
        ${logoHtml}
      </div>
      <div style="padding:24px 32px">
        ${renderedBody}
      </div>
      <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
        <p style="font-size:12px;color:#9ca3af;margin:0">This is an automated message from ${escHtml(allVars.app_name)}.</p>
      </div>
    </div>
  </div>
</body></html>`;

  return { subject: renderedSubject, html };
}

async function getSmtpFrom() {
  let fromAddr = SMTP_FROM;
  try {
    const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'smtp_from'");
    if (rows[0]?.value) fromAddr = rows[0].value;
  } catch (e) {}
  return fromAddr;
}

async function sendTicketNotification(type, ticket, extras = {}) {
  if (!mailTransport) return;
  try {
    const fromAddr = await getSmtpFrom();
    const appUrl = await getSettingWithDefault('app_url', APP_URL);
    const ticketUrl = `${appUrl}?ticket=${ticket.id}`;

    let recipients = [];
    let templateKey = '';
    const vars = {
      ticket_id: String(ticket.id),
      ticket_title: escHtml(ticket.title),
      ticket_description: escHtml((ticket.description || '').substring(0, 200)) + (ticket.description && ticket.description.length > 200 ? '...' : ''),
      ticket_priority: ticket.priority || 'medium',
      ticket_status: (ticket.status || '').replace(/_/g, ' '),
      ticket_url: ticketUrl,
    };

    if (type === 'new_ticket') {
      const { rows } = await pool.query("SELECT email FROM users WHERE role IN ('admin','editor')");
      recipients = rows.map(r => r.email);
      templateKey = 'ticket_new';
      vars.creator_name = escHtml(extras.creatorName || 'Someone');
    } else if (type === 'status_change') {
      const ids = [ticket.created_by];
      if (ticket.assigned_to && ticket.assigned_to !== extras.changedBy) ids.push(ticket.assigned_to);
      const { rows } = await pool.query('SELECT email FROM users WHERE id = ANY($1::int[])', [ids]);
      recipients = rows.map(r => r.email);
      templateKey = 'ticket_status';
      vars.old_status = (extras.oldStatus || '').replace(/_/g, ' ');
      vars.new_status = (extras.newStatus || '').replace(/_/g, ' ');
    } else if (type === 'new_comment') {
      const ids = [];
      if (ticket.created_by !== extras.commenterId) ids.push(ticket.created_by);
      if (ticket.assigned_to && ticket.assigned_to !== extras.commenterId) ids.push(ticket.assigned_to);
      if (ids.length === 0) return;
      const { rows } = await pool.query('SELECT email FROM users WHERE id = ANY($1::int[])', [ids]);
      recipients = rows.map(r => r.email);
      templateKey = 'ticket_comment';
      vars.commenter_name = escHtml(extras.commenterName || 'Someone');
      vars.comment_body = escHtml((extras.commentBody || '').substring(0, 300));
    } else if (type === 'assignment') {
      if (!extras.assigneeEmail) return;
      recipients = [extras.assigneeEmail];
      templateKey = 'ticket_assignment';
    }

    if (recipients.length === 0 || !templateKey) return;

    const emailData = await renderEmail(templateKey, vars);
    await mailTransport.sendMail({
      from: fromAddr,
      to: recipients.join(','),
      subject: emailData.subject,
      html: emailData.html,
    });
  } catch (err) {
    console.error('Ticket notification error:', err.message);
  }
}

module.exports = {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  APP_URL,
  EMAIL_TEMPLATES,
  getMailTransport,
  rebuildTransport,
  getBrandingConfig,
  getEmailTemplate,
  replaceTemplateVars,
  renderEmail,
  getSmtpFrom,
  sendTicketNotification,
};
