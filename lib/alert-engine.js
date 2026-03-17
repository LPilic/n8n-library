const cron = require('node-cron');
const pool = require('../db');
const { n8nApiFetch, getAllInstances } = require('./n8n-api');
const { renderEmail, getMailTransport, getSmtpFrom } = require('./email');
const { createNotification } = require('../routes/notifications');

let alertCronJob = null;

// Evaluate all active alerts
async function evaluateAlerts() {
  try {
    const { rows: alerts } = await pool.query(
      `SELECT * FROM alerts WHERE enabled = TRUE`
    );
    if (alerts.length === 0) return;

    for (const alert of alerts) {
      try {
        const triggered = await checkCondition(alert);
        if (triggered) {
          await fireAlert(alert, triggered);
        }
      } catch (err) {
        console.error(`Alert "${alert.name}" evaluation error:`, err.message);
      }
    }
  } catch (err) {
    console.error('Alert engine error:', err.message);
  }
}

// Check a single alert condition, returns context object if triggered or null
async function checkCondition(alert) {
  const config = alert.config || {};

  if (alert.condition === 'execution_failure_rate') {
    return await checkFailureRate(config);
  }
  if (alert.condition === 'execution_failure_count') {
    return await checkFailureCount(config);
  }
  if (alert.condition === 'open_tickets_threshold') {
    return await checkOpenTickets(config);
  }
  if (alert.condition === 'ticket_sla_breach') {
    return await checkTicketSla(config);
  }
  if (alert.condition === 'n8n_unreachable') {
    return await checkN8nHealth(config);
  }
  return null;
}

async function checkFailureRate(config) {
  const windowMinutes = config.window_minutes || 60;
  const threshold = config.threshold || 20;
  const instances = await getAllInstances();

  for (const inst of instances) {
    try {
      const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
      const url = `/api/v1/executions?status=error&startedAfter=${encodeURIComponent(since)}&limit=250`;
      const errorData = await n8nApiFetch(url, inst.id);
      const urlAll = `/api/v1/executions?startedAfter=${encodeURIComponent(since)}&limit=250`;
      const allData = await n8nApiFetch(urlAll, {}, inst.id);

      const errorCount = (errorData.data || []).length;
      const totalCount = (allData.data || []).length;
      if (totalCount === 0) continue;

      const rate = Math.round((errorCount / totalCount) * 100);
      if (rate >= threshold) {
        return {
          message: `Failure rate ${rate}% (${errorCount}/${totalCount}) in last ${windowMinutes}min on "${inst.name}"`,
          instance: inst.name,
          rate,
          errorCount,
          totalCount,
        };
      }
    } catch {}
  }
  return null;
}

async function checkFailureCount(config) {
  const windowMinutes = config.window_minutes || 60;
  const threshold = config.threshold || 5;
  const instances = await getAllInstances();

  for (const inst of instances) {
    try {
      const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
      const url = `/api/v1/executions?status=error&startedAfter=${encodeURIComponent(since)}&limit=250`;
      const data = await n8nApiFetch(url, inst.id);
      const count = (data.data || []).length;
      if (count >= threshold) {
        return {
          message: `${count} failed executions in last ${windowMinutes}min on "${inst.name}" (threshold: ${threshold})`,
          instance: inst.name,
          count,
        };
      }
    } catch {}
  }
  return null;
}

async function checkOpenTickets(config) {
  const threshold = config.threshold || 10;
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count FROM tickets WHERE status IN ('open', 'in_progress')`
  );
  const count = parseInt(rows[0].count, 10);
  if (count >= threshold) {
    return {
      message: `${count} open tickets (threshold: ${threshold})`,
      count,
    };
  }
  return null;
}

async function checkTicketSla(config) {
  const hoursThreshold = config.hours || 24;
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count FROM tickets
     WHERE status IN ('open', 'in_progress')
     AND created_at < NOW() - INTERVAL '1 hour' * $1`,
    [hoursThreshold]
  );
  const count = parseInt(rows[0].count, 10);
  if (count > 0) {
    return {
      message: `${count} tickets older than ${hoursThreshold}h without resolution`,
      count,
    };
  }
  return null;
}

async function checkN8nHealth(config) {
  const instances = await getAllInstances();
  const unreachable = [];

  for (const inst of instances) {
    try {
      const url = inst.internal_url.replace(/\/+$/, '');
      const r = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) unreachable.push(inst.name);
    } catch {
      unreachable.push(inst.name);
    }
  }

  if (unreachable.length > 0) {
    return {
      message: `n8n instance(s) unreachable: ${unreachable.join(', ')}`,
      instances: unreachable,
    };
  }
  return null;
}

async function fireAlert(alert, context) {
  // Cooldown check — don't fire again within cooldown period
  const cooldownMin = alert.cooldown_minutes || 30;
  if (alert.last_fired_at) {
    const elapsed = Date.now() - new Date(alert.last_fired_at).getTime();
    if (elapsed < cooldownMin * 60 * 1000) return;
  }

  // Update last_fired_at
  await pool.query('UPDATE alerts SET last_fired_at = NOW() WHERE id = $1', [alert.id]);

  const recipients = alert.recipients || [];

  // Send in-app notifications
  for (const r of recipients) {
    if (r.type === 'user') {
      await createNotification(
        r.id,
        'alert',
        `Alert: ${alert.name}`,
        context.message,
        '/monitoring'
      ).catch(() => {});
    }
  }

  // Send email notifications
  const mailTransport = getMailTransport();
  if (mailTransport) {
    const emailAddrs = [];
    for (const r of recipients) {
      if (r.email) emailAddrs.push(r.email);
    }
    if (emailAddrs.length > 0) {
      try {
        const fromAddr = await getSmtpFrom();
        const emailData = await renderEmail('alert_triggered', {
          alert_name: alert.name,
          alert_message: context.message,
          condition: CONDITION_LABELS[alert.condition] || alert.condition,
        });
        await mailTransport.sendMail({
          from: fromAddr,
          to: emailAddrs.join(','),
          subject: emailData.subject,
          html: emailData.html,
        });
      } catch (err) {
        console.error('Alert email error:', err.message);
      }
    }
  }

  console.log(`Alert fired: "${alert.name}" — ${context.message}`);
}

const CONDITION_LABELS = {
  execution_failure_rate: 'Execution failure rate',
  execution_failure_count: 'Execution failure count',
  open_tickets_threshold: 'Open tickets threshold',
  ticket_sla_breach: 'Ticket SLA breach',
  n8n_unreachable: 'n8n instance unreachable',
};

// Schedule the alert engine to run every 5 minutes
function startAlertEngine() {
  if (alertCronJob) { alertCronJob.stop(); alertCronJob = null; }
  alertCronJob = cron.schedule('*/5 * * * *', () => {
    evaluateAlerts();
  });
  console.log('Alert engine started (runs every 5 minutes)');
}

module.exports = { evaluateAlerts, startAlertEngine, CONDITION_LABELS };
