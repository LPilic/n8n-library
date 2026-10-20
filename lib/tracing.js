const DEFAULT_QUERY_URL = 'http://jaeger:16686';
const DEFAULT_SERVICE_NAME = 'n8n';
const REQUEST_TIMEOUT_MS = 15000;

function getTracingConfig() {
  return {
    backend: process.env.OTEL_BACKEND || 'jaeger',
    queryUrl: (process.env.OTEL_QUERY_URL || DEFAULT_QUERY_URL).replace(/\/+$/, ''),
    publicUrl: (process.env.OTEL_PUBLIC_URL || '').replace(/\/+$/, ''),
    serviceName: process.env.OTEL_SERVICE_NAME || DEFAULT_SERVICE_NAME,
    authHeader: process.env.OTEL_QUERY_AUTH_HEADER || '',
  };
}

async function tracingFetch(path, config = getTracingConfig()) {
  const headers = { Accept: 'application/json' };
  if (config.authHeader) headers.Authorization = config.authHeader;
  const res = await fetch(`${config.queryUrl}${path}`, {
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Trace backend returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  return res.json();
}

function tagValue(tag) {
  if (!tag) return undefined;
  if (tag.type === 'bool') return tag.value === true || tag.value === 'true';
  if (tag.type === 'int64' || tag.type === 'float64') return Number(tag.value);
  return tag.value;
}

function tagsToObject(tags) {
  const out = {};
  for (const tag of tags || []) out[tag.key] = tagValue(tag);
  return out;
}

function spanStatus(tags) {
  if (tags['n8n.execution.status']) return tags['n8n.execution.status'];
  if (tags['otel.status_code']) return String(tags['otel.status_code']).toLowerCase();
  if (tags.error === true || tags.error === 'true') return 'error';
  return 'success';
}

function normalizeJaegerTrace(raw) {
  if (!raw || !Array.isArray(raw.spans)) return null;
  const processes = raw.processes || {};
  const spans = raw.spans.map((span) => {
    const tags = tagsToObject(span.tags);
    const process = processes[span.processID] || {};
    const parentRef = (span.references || []).find((r) => r.refType === 'CHILD_OF');
    return {
      id: span.spanID,
      parentId: parentRef ? parentRef.spanID : null,
      name: span.operationName || 'unknown',
      service: process.serviceName || 'unknown',
      startTimeMs: Number(span.startTime || 0) / 1000,
      durationMs: Number(span.duration || 0) / 1000,
      status: spanStatus(tags),
      tags,
      logs: (span.logs || []).map((log) => ({
        timestamp: Number(log.timestamp || 0) / 1000,
        fields: tagsToObject((log.fields || []).map((f) => ({ key: f.key, type: f.type, value: f.value }))),
      })),
    };
  });

  spans.sort((a, b) => a.startTimeMs - b.startTimeMs);
  const traceId = raw.traceID || raw.spans[0]?.traceID || '';
  const startTimeMs = spans.length ? Math.min(...spans.map((s) => s.startTimeMs)) : 0;
  const endTimeMs = spans.length ? Math.max(...spans.map((s) => s.startTimeMs + s.durationMs)) : 0;

  return {
    traceId,
    spans,
    startTimeMs,
    durationMs: Math.max(0, endTimeMs - startTimeMs),
    services: [...new Set(spans.map((s) => s.service))],
  };
}

function buildSpanTree(spans) {
  const nodes = new Map(spans.map((span) => [span.id, { ...span, children: [] }]));
  const roots = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list) => {
    list.sort((a, b) => a.startTimeMs - b.startTimeMs);
    for (const item of list) sort(item.children);
  };
  sort(roots);
  return roots;
}

function traceSummary(trace) {
  const root = trace.spans.find((s) => !s.parentId) || trace.spans[0];
  const tags = root?.tags || {};
  return {
    traceId: trace.traceId,
    name: root?.name || 'trace',
    service: root?.service || 'unknown',
    startTimeMs: trace.startTimeMs,
    durationMs: trace.durationMs,
    status: root?.status || 'success',
    executionId: tags['n8n.execution.id'] || null,
    executionMode: tags['n8n.execution.mode'] || null,
    workflowId: tags['n8n.workflow.id'] || null,
    workflowName: tags['n8n.workflow.name'] || null,
    projectId: tags['n8n.project.id'] || null,
    spanCount: trace.spans.length,
  };
}

function jaegerTraceSearchParams({ service, lookback = '1h', limit = 20, executionId, workflowId, status }) {
  const params = new URLSearchParams();
  params.set('service', service);
  params.set('lookback', lookback);
  params.set('limit', String(limit));
  const tags = {};
  if (executionId) tags['n8n.execution.id'] = executionId;
  if (workflowId) tags['n8n.workflow.id'] = workflowId;
  if (status) tags['n8n.execution.status'] = status;
  if (Object.keys(tags).length) params.set('tags', JSON.stringify(tags));
  return params;
}

async function listTraceServices() {
  const config = getTracingConfig();
  const data = await tracingFetch('/api/services', config);
  return data.data || [];
}

async function searchTraces(options = {}) {
  const config = getTracingConfig();
  const service = options.service || config.serviceName;
  const params = jaegerTraceSearchParams({ ...options, service });
  const data = await tracingFetch(`/api/traces?${params.toString()}`, config);
  return (data.data || [])
    .map(normalizeJaegerTrace)
    .filter(Boolean)
    .map(traceSummary)
    .sort((a, b) => b.startTimeMs - a.startTimeMs);
}

async function getTrace(traceId) {
  const config = getTracingConfig();
  const data = await tracingFetch(`/api/traces/${encodeURIComponent(traceId)}`, config);
  const raw = (data.data || [])[0];
  const trace = normalizeJaegerTrace(raw);
  if (!trace) throw new Error('Trace not found');
  return {
    ...trace,
    summary: traceSummary(trace),
    roots: buildSpanTree(trace.spans),
  };
}

module.exports = {
  getTracingConfig,
  normalizeJaegerTrace,
  buildSpanTree,
  traceSummary,
  listTraceServices,
  searchTraces,
  getTrace,
};
