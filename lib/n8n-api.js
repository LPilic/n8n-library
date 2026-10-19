const pool = require('../db');
const { decrypt } = require('./crypto');

// Cache for monitoring stats and workflow names — keyed by instance ID
const monStatsCacheMap = {};
const monWfCacheMap = {};
// Lightweight workflow summaries (id/name/active/tags) for stats and SSE.
// Never fetch full workflow JSON on a hot path: that can take minutes for
// larger n8n instances.
const wfSummaryCacheMap = {};
const summaryRefreshAttempts = {};
const wfFetchInFlight = {};
const WF_SUMMARY_TTL = 15 * 60 * 1000; // 15 minutes
const WF_NAME_TTL = 5 * 60 * 1000; // 5 minutes
const SUMMARY_RETRY_MS = 5 * 60 * 1000; // avoid hammering a failing n8n

// Normalize instance IDs so query strings ("1") and numeric IDs (1) share
// the same cache entry.
function cacheKey(instanceId) {
  return instanceId ? String(instanceId) : '_default';
}

// Instance cache (short TTL so DB changes are picked up quickly)
let instancesCache = { list: [], ts: 0 };
const INSTANCE_CACHE_TTL = 10000; // 10s

function decryptApiKey(key) {
  if (!key) return '';
  try { return decrypt(key); } catch { return key; } // fallback to plaintext during migration
}

async function getAllInstances() {
  if (instancesCache.list.length > 0 && Date.now() - instancesCache.ts < INSTANCE_CACHE_TTL) {
    return instancesCache.list;
  }
  try {
    const { rows } = await pool.query('SELECT * FROM n8n_instances ORDER BY is_default DESC, name');
    // Decrypt API keys transparently
    for (const row of rows) { row.api_key = decryptApiKey(row.api_key); }
    instancesCache = { list: rows, ts: Date.now() };
    return rows;
  } catch {
    return instancesCache.list || [];
  }
}

async function getInstanceConfig(instanceId) {
  const instances = await getAllInstances();
  if (instanceId) {
    const inst = instances.find(i => i.id === Number(instanceId));
    if (inst) return inst;
  }
  // Fall back to default instance
  const def = instances.find(i => i.is_default);
  if (def) return def;
  // Fall back to env vars
  const base = (process.env.N8N_INTERNAL_URL || '').replace(/\/+$/, '');
  const key = process.env.N8N_API_KEY || '';
  if (base) return { id: 0, name: 'Default', internal_url: base, api_key: key };
  return null;
}

function invalidateInstanceCache() {
  instancesCache = { list: [], ts: 0 };
}

async function n8nApiFetch(apiPath, instanceId) {
  const inst = await getInstanceConfig(instanceId);
  if (!inst || !inst.internal_url) throw new Error('No n8n instance configured');
  const base = inst.internal_url.replace(/\/+$/, '');
  const key = inst.api_key || '';
  if (!key) throw new Error('n8n API key not configured for instance: ' + inst.name);
  const res = await fetch(`${base}${apiPath}`, {
    headers: { 'X-N8N-API-KEY': key, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`n8n API ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

async function fetchProjects(instanceId) {
  try {
    const data = await n8nApiFetch('/api/v1/projects', instanceId);
    const list = Array.isArray(data) ? data : (data.data || []);
    const map = {};
    for (const p of list) {
      if (p.id && p.name) map[p.id] = p.name;
    }
    return map;
  } catch {
    return {};
  }
}

// Single-flight full workflow fetch. The result is not cached here; callers
// that need it repeatedly should use getWorkflowSummary() or their own cache.
async function fetchAllWorkflows(instanceId) {
  const key = cacheKey(instanceId);
  if (wfFetchInFlight[key]) return wfFetchInFlight[key];

  const promise = (async () => {
    const all = [];
    let cursor = null;
    do {
      let url = '/api/v1/workflows?limit=250';
      if (cursor) url += '&cursor=' + encodeURIComponent(cursor);
      const data = await n8nApiFetch(url, instanceId);
      all.push(...(data.data || []));
      cursor = data.nextCursor || null;
    } while (cursor);

    // Enrich with owner names from projects
    const projectMap = await fetchProjects(instanceId);
    for (const wf of all) {
      const owner = (wf.shared || []).find(s => s.role === 'workflow:owner');
      if (owner && owner.projectId && projectMap[owner.projectId]) {
        wf.ownerName = projectMap[owner.projectId];
        wf.ownerProjectId = owner.projectId;
      }
    }
    return all;
  })();

  wfFetchInFlight[key] = promise;
  try {
    return await promise;
  } finally {
    if (wfFetchInFlight[key] === promise) delete wfFetchInFlight[key];
  }
}

function projectWorkflowSummary(workflows) {
  return workflows.map(wf => ({
    id: wf.id,
    name: wf.name,
    active: !!wf.active,
    tags: wf.tags || [],
  }));
}

// Seed the summary from an existing full workflow response so monitoring can
// show counts without issuing a second, expensive fetch.
function seedWorkflowSummary(instanceId, workflows) {
  const key = cacheKey(instanceId);
  const summary = projectWorkflowSummary(workflows);
  wfSummaryCacheMap[key] = { data: summary, ts: Date.now(), promise: null };
  delete summaryRefreshAttempts[key];
  const map = {};
  for (const wf of workflows) map[wf.id] = wf.name;
  monWfCacheMap[key] = { map, ts: Date.now() };
  return summary;
}

async function refreshWorkflowSummary(instanceId) {
  const key = cacheKey(instanceId);
  const existing = wfSummaryCacheMap[key];
  if (existing && existing.promise) return existing.promise;

  const promise = (async () => {
    const workflows = await fetchAllWorkflows(instanceId);
    const data = projectWorkflowSummary(workflows);
    wfSummaryCacheMap[key] = { data, ts: Date.now(), promise: null };
    const map = {};
    for (const wf of workflows) map[wf.id] = wf.name;
    monWfCacheMap[key] = { map, ts: Date.now() };
    return data;
  })();

  wfSummaryCacheMap[key] = { ...(existing || { data: null, ts: 0 }), promise };
  try {
    return await promise;
  } catch (e) {
    if (wfSummaryCacheMap[key] && wfSummaryCacheMap[key].promise === promise) {
      wfSummaryCacheMap[key].promise = null;
    }
    throw e;
  }
}

// Non-blocking by default. Returns stale data immediately and refreshes in the
// background; returns null only when no summary has ever been loaded.
async function getWorkflowSummary(instanceId, { allowBlocking = false } = {}) {
  const key = cacheKey(instanceId);
  const cached = wfSummaryCacheMap[key];
  const now = Date.now();

  if (cached && cached.data) {
    if (now - cached.ts >= WF_SUMMARY_TTL && now - (summaryRefreshAttempts[key] || 0) >= SUMMARY_RETRY_MS) {
      summaryRefreshAttempts[key] = now;
      refreshWorkflowSummary(instanceId).catch(e => {
        console.warn(`Workflow summary refresh failed for ${key}:`, e.message);
      });
    }
    return cached.data;
  }

  if (allowBlocking) {
    summaryRefreshAttempts[key] = now;
    return refreshWorkflowSummary(instanceId);
  }

  if (now - (summaryRefreshAttempts[key] || 0) >= SUMMARY_RETRY_MS) {
    summaryRefreshAttempts[key] = now;
    refreshWorkflowSummary(instanceId).catch(e => {
      console.warn(`Workflow summary warm-up failed for ${key}:`, e.message);
    });
  }
  return null;
}

async function getWorkflowNameMap(instanceId, { allowBlocking = false } = {}) {
  const key = cacheKey(instanceId);
  const cached = monWfCacheMap[key];
  if (cached && cached.map && Date.now() - cached.ts < WF_NAME_TTL) {
    return cached.map;
  }

  // Reuse the summary cache; this is populated by the Workflows page or a
  // background refresh. With allowBlocking=false we never wait minutes for a
  // full workflow list just to decorate executions.
  const summary = await getWorkflowSummary(instanceId, { allowBlocking });
  if (summary) {
    const map = {};
    for (const wf of summary) map[wf.id] = wf.name;
    monWfCacheMap[key] = { map, ts: Date.now() };
    return map;
  }

  return (cached && cached.map) || {};
}

function enrichExecutions(executions, wfMap) {
  for (const ex of executions) {
    if (ex.workflowId && wfMap[ex.workflowId]) {
      ex.workflowName = wfMap[ex.workflowId];
    }
  }
  return executions;
}

function invalidateWfCache(instanceId) {
  const key = cacheKey(instanceId);
  delete monWfCacheMap[key];
  // Keep the old summary data for immediate reads, but mark it stale so the
  // next summary read refreshes active/inactive counts.
  if (wfSummaryCacheMap[key]) wfSummaryCacheMap[key] = { ...wfSummaryCacheMap[key], ts: 0 };
}

function getMonStatsCache(instanceId) {
  const key = cacheKey(instanceId);
  return monStatsCacheMap[key] || { data: null, ts: 0 };
}
function setMonStatsCache(data, instanceId) {
  const key = cacheKey(instanceId);
  monStatsCacheMap[key] = { data, ts: Date.now() };
}

async function verifyN8nUser(userId) {
  const inst = await getInstanceConfig();
  if (!inst || !inst.internal_url) throw new Error('No n8n instance configured');
  const n8nBase = inst.internal_url.replace(/\/+$/, '');
  const apiKey = inst.api_key || '';
  if (!apiKey) throw new Error('n8n API key not configured');
  if (!userId) throw new Error('No user ID provided');

  const resp = await fetch(`${n8nBase}/api/v1/users/${encodeURIComponent(userId)}`, {
    headers: { 'X-N8N-API-KEY': apiKey },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error('User not found in n8n');

  const user = await resp.json();
  if (!user || !user.email) throw new Error('Invalid n8n user response');
  return user;
}

async function fetchN8nUsers(instanceId) {
  const data = await n8nApiFetch('/api/v1/users?limit=100&includeRole=true', instanceId);
  return data.data || data || [];
}

module.exports = {
  n8nApiFetch,
  fetchAllWorkflows,
  getWorkflowNameMap,
  getWorkflowSummary,
  seedWorkflowSummary,
  enrichExecutions,
  invalidateWfCache,
  getMonStatsCache,
  setMonStatsCache,
  verifyN8nUser,
  fetchN8nUsers,
  getAllInstances,
  getInstanceConfig,
  invalidateInstanceCache,
};
