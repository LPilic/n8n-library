const express = require('express');
const { requireRole, aiLimiter } = require('../lib/middleware');
const {
  getTracingConfig,
  listTraceServices,
  searchTraces,
  getTrace,
} = require('../lib/tracing');

const router = express.Router();

function parseLimit(value, fallback = 20) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 100);
}

function parseLookback(value) {
  if (!value) return '1h';
  return /^\d+[smhd]$/.test(value) ? value : '1h';
}

function validTraceId(value) {
  return typeof value === 'string' && /^[a-f0-9]{16,32}$/i.test(value);
}

router.get('/api/tracing/config', requireRole('admin', 'editor'), (_req, res) => {
  const config = getTracingConfig();
  res.json({
    backend: config.backend,
    serviceName: config.serviceName,
    publicUrl: config.publicUrl,
    queryUrl: config.queryUrl,
  });
});

router.get('/api/tracing/health', requireRole('admin', 'editor'), async (_req, res) => {
  try {
    const services = await listTraceServices();
    res.json({ status: 'ok', services });
  } catch (err) {
    res.status(502).json({ status: 'unavailable', error: err.message });
  }
});

router.get('/api/tracing/services', requireRole('admin', 'editor'), async (_req, res) => {
  try {
    res.json({ services: await listTraceServices() });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/api/tracing/traces', requireRole('admin', 'editor'), aiLimiter, async (req, res) => {
  try {
    const traces = await searchTraces({
      service: typeof req.query.service === 'string' ? req.query.service.trim() : undefined,
      lookback: parseLookback(req.query.lookback),
      limit: parseLimit(req.query.limit),
      executionId: typeof req.query.executionId === 'string' ? req.query.executionId.trim() : undefined,
      workflowId: typeof req.query.workflowId === 'string' ? req.query.workflowId.trim() : undefined,
      status: typeof req.query.status === 'string' ? req.query.status.trim() : undefined,
    });
    res.json({ traces });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/api/tracing/executions/:executionId', requireRole('admin', 'editor'), aiLimiter, async (req, res) => {
  try {
    const traces = await searchTraces({
      executionId: req.params.executionId,
      lookback: parseLookback(req.query.lookback),
      limit: parseLimit(req.query.limit, 10),
    });
    res.json({ executionId: req.params.executionId, traces });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get('/api/tracing/traces/:traceId', requireRole('admin', 'editor'), aiLimiter, async (req, res) => {
  if (!validTraceId(req.params.traceId)) {
    return res.status(400).json({ error: 'Invalid trace ID' });
  }
  try {
    res.json(await getTrace(req.params.traceId));
  } catch (err) {
    res.status(err.message === 'Trace not found' ? 404 : 502).json({ error: err.message });
  }
});

module.exports = router;
