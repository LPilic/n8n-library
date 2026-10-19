const cron = require('node-cron');
const pool = require('../db');

const AUDIT_RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS, 10) || 180;
const CREDENTIAL_AUDIT_RETENTION_DAYS = parseInt(process.env.CREDENTIAL_AUDIT_RETENTION_DAYS, 10) || 365;
const NOTIFICATION_RETENTION_DAYS = parseInt(process.env.NOTIFICATION_RETENTION_DAYS, 10) || 30;
const RESET_TOKEN_RETENTION_DAYS = parseInt(process.env.RESET_TOKEN_RETENTION_DAYS, 10) || 7;

let retentionJob = null;

async function runRetentionCleanup() {
  const results = await Promise.allSettled([
    pool.query(
      `DELETE FROM password_reset_tokens
       WHERE used = TRUE OR expires_at < NOW() - ($1 || ' days')::interval`,
      [RESET_TOKEN_RETENTION_DAYS]
    ),
    pool.query(
      `DELETE FROM audit_log
       WHERE created_at < NOW() - ($1 || ' days')::interval`,
      [AUDIT_RETENTION_DAYS]
    ),
    pool.query(
      `DELETE FROM credential_audit
       WHERE created_at < NOW() - ($1 || ' days')::interval`,
      [CREDENTIAL_AUDIT_RETENTION_DAYS]
    ),
    pool.query(
      `DELETE FROM notifications
       WHERE read = TRUE AND created_at < NOW() - ($1 || ' days')::interval`,
      [NOTIFICATION_RETENTION_DAYS]
    ),
  ]);

  const counts = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value.rowCount || 0;
    console.warn('Retention cleanup failed:', r.reason?.message || r.reason);
    return 0;
  });

  const summary = {
    reset_tokens: counts[0],
    audit_log: counts[1],
    credential_audit: counts[2],
    notifications: counts[3],
  };
  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  if (total > 0) console.log('Retention cleanup removed:', summary);
  return summary;
}

function startRetentionJob() {
  if (retentionJob) {
    retentionJob.stop();
    retentionJob = null;
  }
  // Daily at 03:15, plus one delayed run after startup so a long-running
  // process does not accumulate data indefinitely between deploys.
  retentionJob = cron.schedule('15 3 * * *', () => {
    runRetentionCleanup().catch(err => console.error('Retention job error:', err.message));
  });
  const startupTimer = setTimeout(() => {
    runRetentionCleanup().catch(err => console.error('Startup retention error:', err.message));
  }, 60000);
  startupTimer.unref();
  console.log('Retention cleanup scheduled (daily at 03:15)');
}

module.exports = { runRetentionCleanup, startRetentionJob };
