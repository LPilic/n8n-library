const express = require('express');
const pool = require('../db');
const { requireRole } = require('../lib/middleware');
const { n8nApiFetch, fetchAllWorkflows, getWorkflowNameMap, enrichExecutions, invalidateWfCache, getMonStatsCache, setMonStatsCache, getInstanceConfig, getAllInstances } = require('../lib/n8n-api');
const { encrypt: encryptValue } = require('../lib/crypto');
const { sendDailySummaryEmail } = require('../lib/ai-providers');

const router = express.Router();

// --- Prometheus metrics proxy ---
function parsePrometheusText(text) {
  const metrics = {};
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+(.+)$/);
    if (!match) continue;
    const name = match[1];
    const labelsStr = match[2] || '';
    const value = parseFloat(match[3]);
    const labels = {};
    if (labelsStr) {
      const inner = labelsStr.slice(1, -1);
      const labelMatches = inner.matchAll(/(\w+)="([^"]*)"/g);
      for (const lm of labelMatches) {
        labels[lm[1]] = lm[2];
      }
    }
    if (!metrics[name]) metrics[name] = [];
    metrics[name].push({ labels, value });
  }
  return metrics;
}

// Helper to get instance base URL from request
async function getInstanceBase(req) {
  const inst = await getInstanceConfig(req.query.instance_id);
  if (!inst || !inst.internal_url) return null;
  return { base: inst.internal_url.replace(/\/+$/, ''), key: inst.api_key || '', inst };
}

router.get('/api/monitoring/metrics', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const r = await fetch(`${cfg.base}/metrics`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.status(r.status).json({ error: 'Metrics endpoint returned ' + r.status });
    const text = await r.text();
    const parsed = parsePrometheusText(text);
    res.json(parsed);
  } catch (err) {
    console.error('Metrics fetch error:', err.message);
    res.status(502).json({ error: 'Failed to fetch metrics' });
  }
});

// Metrics history — per-instance, stored in memory
const metricsHistoryMap = {}; // instanceId → { history: [], interval }
const METRICS_HISTORY_MAX = 180;

function getMetricsHistory(instanceId) {
  const id = instanceId || 'default';
  if (!metricsHistoryMap[id]) metricsHistoryMap[id] = { history: [], interval: null };
  return metricsHistoryMap[id];
}

// Collect metrics snapshot for a specific instance
async function collectMetricsSnapshot(instanceId) {
  try {
    const inst = await getInstanceConfig(instanceId);
    if (!inst || !inst.internal_url) return;
    const base = inst.internal_url.replace(/\/+$/, '');
    const r = await fetch(`${base}/metrics`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return;
    const text = await r.text();
    const parsed = parsePrometheusText(text);
    const snapshot = {
      timestamp: Date.now(),
      cpu: getValue(parsed, 'n8n_process_cpu_seconds_total'),
      memoryRss: getValue(parsed, 'n8n_process_resident_memory_bytes'),
      heapUsed: getValue(parsed, 'n8n_nodejs_heap_size_used_bytes'),
      heapTotal: getValue(parsed, 'n8n_nodejs_heap_size_total_bytes'),
      eventLoopLag: getValue(parsed, 'n8n_nodejs_eventloop_lag_seconds'),
      eventLoopP99: getValue(parsed, 'n8n_nodejs_eventloop_lag_p99_seconds'),
      activeHandles: getValue(parsed, 'n8n_nodejs_active_handles_total'),
      activeRequests: getValue(parsed, 'n8n_nodejs_active_requests_total'),
      queueWaiting: getValue(parsed, 'n8n_scaling_mode_queue_jobs_waiting'),
      queueActive: getValue(parsed, 'n8n_scaling_mode_queue_jobs_active'),
      queueCompleted: getValue(parsed, 'n8n_scaling_mode_queue_jobs_completed'),
      queueFailed: getValue(parsed, 'n8n_scaling_mode_queue_jobs_failed'),
      activeWorkflows: getValue(parsed, 'n8n_active_workflow_count'),
    };
    const store = getMetricsHistory(inst.id);
    store.history.push(snapshot);
    if (store.history.length > METRICS_HISTORY_MAX) store.history.shift();
  } catch {}
}

function getValue(parsed, name) {
  const arr = parsed[name];
  if (!arr || !arr.length) return 0;
  return arr[0].value;
}

// Start collecting for all instances
async function startAllMetricsCollectors() {
  try {
    const instances = await getAllInstances();
    for (const inst of instances) {
      const store = getMetricsHistory(inst.id);
      if (!store.interval) {
        collectMetricsSnapshot(inst.id);
        store.interval = setInterval(() => collectMetricsSnapshot(inst.id), 20000);
      }
    }
  } catch {}
}
// Delayed start to let DB connection initialize
setTimeout(startAllMetricsCollectors, 3000);

router.get('/api/monitoring/metrics/history', requireRole('admin', 'editor'), async (req, res) => {
  const instId = req.query.instance_id;
  const inst = await getInstanceConfig(instId);
  const store = getMetricsHistory(inst ? inst.id : 'default');
  res.json(store.history);
});

// Health check
router.get('/api/monitoring/health', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.json({ status: 'not_configured', httpStatus: 0, latencyMs: 0 });
    const start = Date.now();
    const r = await fetch(`${cfg.base}/healthz`, { signal: AbortSignal.timeout(5000) });
    const latency = Date.now() - start;
    res.json({ status: r.ok ? 'healthy' : 'unhealthy', httpStatus: r.status, latencyMs: latency });
  } catch (err) {
    res.json({ status: 'unreachable', httpStatus: 0, latencyMs: 0 });
  }
});

// Workflows — cached per instance (60s TTL)
const wfListCacheMap = {};
const WF_LIST_TTL = 60000;

router.get('/api/monitoring/workflows', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const key = req.query.instance_id || '_default';
    const cached = wfListCacheMap[key];
    if (cached && Date.now() - cached.ts < WF_LIST_TTL) {
      return res.json({ data: cached.data });
    }
    const wfs = await fetchAllWorkflows(req.query.instance_id);
    wfListCacheMap[key] = { data: wfs, ts: Date.now() };
    res.json({ data: wfs });
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Activate / deactivate workflow
router.post('/api/monitoring/workflows/:id/activate', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const { active } = req.body;
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const action = active ? 'activate' : 'deactivate';
    const r = await fetch(`${cfg.base}/api/v1/workflows/${encodeURIComponent(req.params.id)}/${action}`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!r.ok) {
      const errBody = await r.text();
      return res.status(r.status).json({ error: errBody || 'Failed to update workflow' });
    }
    const data = await r.json();
    invalidateWfCache(req.query.instance_id);
    delete wfListCacheMap[req.query.instance_id || '_default'];
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Executions
router.get('/api/monitoring/executions', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const params = new URLSearchParams();
    params.set('limit', req.query.limit || '50');
    if (req.query.status) params.set('status', req.query.status);
    if (req.query.workflowId) params.set('workflowId', req.query.workflowId);
    if (req.query.cursor) params.set('cursor', req.query.cursor);
    const [data, wfMap] = await Promise.all([
      n8nApiFetch(`/api/v1/executions?${params.toString()}`, req.query.instance_id),
      getWorkflowNameMap(req.query.instance_id),
    ]);
    if (data.data) enrichExecutions(data.data, wfMap);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

router.get('/api/monitoring/executions/:id', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const [data, wfMap] = await Promise.all([
      n8nApiFetch(`/api/v1/executions/${encodeURIComponent(req.params.id)}?includeData=true`, req.query.instance_id),
      getWorkflowNameMap(req.query.instance_id),
    ]);
    if (data.workflowId && wfMap[data.workflowId]) {
      data.workflowName = wfMap[data.workflowId];
    }
    try {
      const { rows } = await pool.query(
        'SELECT te.ticket_id, t.title, t.status FROM ticket_executions te JOIN tickets t ON t.id = te.ticket_id WHERE te.execution_id = $1',
        [req.params.id]
      );
      data.linkedTickets = rows;
    } catch (e) { data.linkedTickets = []; }
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Retry execution
router.post('/api/monitoring/executions/:id/retry', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const r = await fetch(`${cfg.base}/api/v1/executions/${encodeURIComponent(req.params.id)}/retry`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!r.ok) {
      const errBody = await r.text();
      return res.status(r.status).json({ error: errBody || 'Failed to retry execution' });
    }
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error('Retry execution error:', err.message);
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Stop execution
router.post('/api/monitoring/executions/:id/stop', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const r = await fetch(`${cfg.base}/api/v1/executions/${encodeURIComponent(req.params.id)}/stop`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': cfg.key, 'Content-Type': 'application/json' },
    });
    if (!r.ok) {
      const errBody = await r.text();
      return res.status(r.status).json({ error: errBody || 'Failed to stop execution' });
    }
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error('Stop execution error:', err.message);
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Stop multiple executions
router.post('/api/monitoring/executions/stop', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const cfg = await getInstanceBase(req);
    if (!cfg) return res.status(400).json({ error: 'No n8n instance configured' });
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
    const results = [];
    for (const id of ids) {
      try {
        const r = await fetch(`${cfg.base}/api/v1/executions/${encodeURIComponent(id)}/stop`, {
          method: 'POST',
          headers: { 'X-N8N-API-KEY': cfg.key, 'Content-Type': 'application/json' },
        });
        results.push({ id, ok: r.ok, status: r.status });
      } catch (e) {
        results.push({ id, ok: false, error: e.message });
      }
    }
    res.json({ results, stopped: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length });
  } catch (err) {
    console.error('Bulk stop error:', err.message);
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// Stats
router.get('/api/monitoring/stats', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const cached = getMonStatsCache(req.query.instance_id);
    if (cached.data && Date.now() - cached.ts < 15000) {
      return res.json(cached.data);
    }

    const data = await n8nApiFetch('/api/v1/executions?limit=250', req.query.instance_id);
    const executions = data.data || [];

    const counts = { success: 0, error: 0, running: 0, waiting: 0, canceled: 0, new: 0 };
    let totalDuration = 0;
    let durationCount = 0;

    for (const ex of executions) {
      const st = ex.status || 'unknown';
      if (counts[st] !== undefined) counts[st]++;
      if (ex.startedAt && ex.stoppedAt) {
        const dur = new Date(ex.stoppedAt) - new Date(ex.startedAt);
        if (dur > 0) { totalDuration += dur; durationCount++; }
      }
    }

    let activeWorkflows = 0, totalWorkflows = 0;
    try {
      const wfs = await fetchAllWorkflows(req.query.instance_id);
      totalWorkflows = wfs.length;
      activeWorkflows = wfs.filter(w => w.active).length;
    } catch (e) {}

    let health = 'unknown';
    try {
      const cfg = await getInstanceBase(req);
      if (cfg) {
        const r = await fetch(`${cfg.base}/healthz`, { signal: AbortSignal.timeout(3000) });
        health = r.ok ? 'healthy' : 'unhealthy';
      }
    } catch (e) { health = 'unreachable'; }

    const stats = {
      health,
      total: executions.length,
      counts,
      avgDurationMs: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
      activeWorkflows,
      totalWorkflows,
      successRate: executions.length > 0 ? Math.round((counts.success / executions.length) * 100) : 0,
    };

    setMonStatsCache(stats, req.query.instance_id);
    res.json(stats);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach n8n' });
  }
});

// --- SSE for live monitoring updates ---
const monSseClients = new Map(); // uniqueId -> { res, instanceId }
let monSseCounter = 0;

router.get('/api/monitoring/stream', requireRole('admin', 'editor'), (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':ok\n\n');

  const clientId = ++monSseCounter;
  const instanceId = req.query.instance_id || null;
  monSseClients.set(clientId, { res, instanceId });

  req.on('close', () => { monSseClients.delete(clientId); });

  // Heartbeat
  const hb = setInterval(() => { res.write(':heartbeat\n\n'); }, 30000);
  req.on('close', () => clearInterval(hb));
});

function broadcastMonitoringUpdate(instanceId, eventName, data) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [, client] of monSseClients) {
    // Send to clients watching same instance (or no specific instance)
    if (!client.instanceId || !instanceId || client.instanceId === String(instanceId)) {
      try { client.res.write(payload); } catch {}
    }
  }
}

// Server-side push loop — fetches stats + recent executions and broadcasts
let monPushInterval = null;
function startMonitoringPush() {
  if (monPushInterval) clearInterval(monPushInterval);
  monPushInterval = setInterval(async () => {
    if (monSseClients.size === 0) return; // No listeners, skip work
    try {
      const instances = await getAllInstances();
      for (const inst of instances) {
        try {
          // Fetch stats
          const data = await n8nApiFetch('/api/v1/executions?limit=250', inst.id);
          const executions = data.data || [];
          const counts = { success: 0, error: 0, running: 0, waiting: 0, canceled: 0, new: 0 };
          let totalDuration = 0, durationCount = 0;
          for (const ex of executions) {
            const st = ex.status || 'unknown';
            if (counts[st] !== undefined) counts[st]++;
            if (ex.startedAt && ex.stoppedAt) {
              const dur = new Date(ex.stoppedAt) - new Date(ex.startedAt);
              if (dur > 0) { totalDuration += dur; durationCount++; }
            }
          }
          const wfMap = await getWorkflowNameMap(inst.id);
          const recent = executions.slice(0, 50);
          enrichExecutions(recent, wfMap);

          const stats = {
            total: executions.length,
            counts,
            avgDurationMs: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
            successRate: executions.length > 0 ? Math.round((counts.success / executions.length) * 100) : 0,
          };

          broadcastMonitoringUpdate(inst.id, 'stats', stats);
          broadcastMonitoringUpdate(inst.id, 'executions', { data: recent });
        } catch {}
      }
    } catch {}
  }, 15000); // Push every 15 seconds
}
startMonitoringPush();

// Workers status — polls configured worker URLs for health + metrics
router.get('/api/monitoring/workers', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const inst = await getInstanceConfig(req.query.instance_id);
    if (!inst) return res.json([]);
    const workers = inst.workers || [];
    if (!workers.length) return res.json([]);

    const results = await Promise.all(workers.map(async (w) => {
      const base = (w.url || '').replace(/\/+$/, '');
      if (!base) return { name: w.name, url: w.url, status: 'not_configured', metrics: null };

      const result = { name: w.name, url: w.url, status: 'unreachable', healthDetail: null, metrics: null };

      // Health check
      try {
        const hr = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(3000) });
        if (hr.ok) {
          result.status = 'healthy';
          try { result.healthDetail = await hr.json(); } catch { result.healthDetail = { status: 'ok' }; }
        } else {
          result.status = 'unhealthy';
        }
      } catch { /* unreachable */ }

      // Readiness check
      try {
        const rr = await fetch(`${base}/healthz/readiness`, { signal: AbortSignal.timeout(3000) });
        result.ready = rr.ok;
      } catch { result.ready = false; }

      // Metrics
      try {
        const mr = await fetch(`${base}/metrics`, { signal: AbortSignal.timeout(5000) });
        if (mr.ok) {
          const text = await mr.text();
          const parsed = parsePrometheusText(text);

          // Extract key worker metrics
          const val = (name) => { const a = parsed[name]; return (a && a.length) ? a[0].value : 0; };
          const labelVal = (name) => { const a = parsed[name]; return (a && a[0] && a[0].labels) ? a[0].labels : {}; };

          result.metrics = {
            n8nVersion: labelVal('n8n_version_info').version || '—',
            nodeVersion: labelVal('n8n_nodejs_version_info').version || '—',
            uptime: val('n8n_process_start_time_seconds'),
            memoryRss: val('n8n_process_resident_memory_bytes'),
            heapUsed: val('n8n_nodejs_heap_size_used_bytes'),
            heapTotal: val('n8n_nodejs_heap_size_total_bytes'),
            cpu: val('n8n_process_cpu_seconds_total'),
            eventLoopLag: val('n8n_nodejs_eventloop_lag_seconds'),
            eventLoopP99: val('n8n_nodejs_eventloop_lag_p99_seconds'),
            activeHandles: val('n8n_nodejs_active_handles_total'),
            activeRequests: val('n8n_nodejs_active_requests_total'),
            queueActive: val('n8n_scaling_mode_queue_jobs_active'),
            queueCompleted: val('n8n_scaling_mode_queue_jobs_completed'),
            queueFailed: val('n8n_scaling_mode_queue_jobs_failed'),
          };
        }
      } catch { /* metrics unavailable */ }

      return result;
    }));

    res.json(results);
  } catch (err) {
    console.error('Workers status error:', err.message);
    res.status(500).json({ error: 'Failed to check workers' });
  }
});

// Daily summary
router.post('/api/monitoring/daily-summary', requireRole('admin'), async (_req, res) => {
  try {
    const result = await sendDailySummaryEmail();
    res.json({ message: `Daily summary sent to ${result.sent} recipient(s)` });
  } catch (e) {
    console.error('Daily summary error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// --- Instance CRUD ---
router.get('/api/instances', requireRole('admin', 'editor'), async (req, res) => {
  try {
    const instances = await getAllInstances();
    // Strip API keys for non-admin users
    if (req.user.role !== 'admin') {
      res.json(instances.map(i => ({ ...i, api_key: i.api_key ? '••••••••' : '' })));
    } else {
      res.json(instances);
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to load instances' });
  }
});

router.post('/api/instances', requireRole('admin'), async (req, res) => {
  try {
    const { name, environment, internal_url, api_key, is_default, color, workers } = req.body;
    if (!name || !internal_url) return res.status(400).json({ error: 'Name and URL are required' });
    // If setting as default, unset others
    if (is_default) {
      await pool.query('UPDATE n8n_instances SET is_default = FALSE');
    }
    const encKey = api_key ? encryptValue(api_key) : '';
    const { rows } = await pool.query(
      `INSERT INTO n8n_instances (name, environment, internal_url, api_key, is_default, color, workers)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, environment || 'production', internal_url, encKey, !!is_default, color || '', JSON.stringify(workers || [])]
    );
    const { invalidateInstanceCache } = require('../lib/n8n-api');
    invalidateInstanceCache();
    // Start metrics collector for new instance
    const store = getMetricsHistory(rows[0].id);
    if (!store.interval) {
      collectMetricsSnapshot(rows[0].id);
      store.interval = setInterval(() => collectMetricsSnapshot(rows[0].id), 20000);
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/instances/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, environment, internal_url, api_key, is_default, color, workers } = req.body;
    if (!name || !internal_url) return res.status(400).json({ error: 'Name and URL are required' });
    if (is_default) {
      await pool.query('UPDATE n8n_instances SET is_default = FALSE');
    }
    const encKey = api_key ? encryptValue(api_key) : '';
    const { rows } = await pool.query(
      `UPDATE n8n_instances SET name=$1, environment=$2, internal_url=$3, api_key=$4, is_default=$5, color=$6, workers=$7
       WHERE id=$8 RETURNING *`,
      [name, environment || 'production', internal_url, encKey, !!is_default, color || '', JSON.stringify(workers || []), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Instance not found' });
    const { invalidateInstanceCache } = require('../lib/n8n-api');
    invalidateInstanceCache();
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/instances/:id', requireRole('admin'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM n8n_instances WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Instance not found' });
    // Stop metrics collector
    const store = metricsHistoryMap[req.params.id];
    if (store && store.interval) { clearInterval(store.interval); delete metricsHistoryMap[req.params.id]; }
    const { invalidateInstanceCache } = require('../lib/n8n-api');
    invalidateInstanceCache();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.metricsHistory = metricsHistoryMap;
module.exports.metricsHistoryMap = metricsHistoryMap;
module.exports.parsePrometheusText = parsePrometheusText;
module.exports.getMetricsHistory = getMetricsHistory;
