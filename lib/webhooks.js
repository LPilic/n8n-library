const pool = require('../db');
const { validateExternalUrlResolved, signPayload } = require('./helpers');

const WEBHOOK_EVENTS = {
  'ticket.created': 'Ticket Created',
  'ticket.status_changed': 'Ticket Status Changed',
  'ticket.assigned': 'Ticket Assigned',
  'ticket.comment': 'New Ticket Comment',
  'template.created': 'Template Created',
  'template.updated': 'Template Updated',
  'template.deleted': 'Template Deleted',
  'alert.triggered': 'Alert Triggered',
};

async function fireWebhooks(eventName, payload) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM webhooks WHERE enabled = TRUE`
    );
    for (const wh of rows) {
      const events = wh.events || [];
      if (!events.includes(eventName)) continue;
      // Fire-and-forget
      sendWebhook(wh, eventName, payload).catch(() => {});
    }
  } catch {}
}

// Webhooks are admin-configured, but still validate the destination to avoid
// using the library as an SSRF pivot. Set WEBHOOK_ALLOW_PRIVATE=true when
// intentionally targeting an internal service.
async function validateWebhookUrl(url) {
  if (process.env.WEBHOOK_ALLOW_PRIVATE === 'true') return true;
  return validateExternalUrlResolved(url);
}

async function sendWebhook(webhook, eventName, payload) {
  try {
    if (!(await validateWebhookUrl(webhook.url))) {
      throw new Error('Webhook URL is not allowed (private or unresolvable destination)');
    }

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'n8n-library-webhook/1.0',
      ...(webhook.headers || {}),
    };
    const body = JSON.stringify({
      event: eventName,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    if (process.env.WEBHOOK_SIGNING_SECRET) {
      headers['X-N8N-Library-Signature'] = signPayload(process.env.WEBHOOK_SIGNING_SECRET, body);
    }

    const res = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10000),
    });

    await pool.query(
      'UPDATE webhooks SET last_triggered_at = NOW(), last_status = $1 WHERE id = $2',
      [res.status, webhook.id]
    );
  } catch (err) {
    await pool.query(
      'UPDATE webhooks SET last_triggered_at = NOW(), last_status = 0 WHERE id = $1',
      [webhook.id]
    ).catch(() => {});
  }
}

module.exports = { WEBHOOK_EVENTS, fireWebhooks, sendWebhook, validateWebhookUrl };
