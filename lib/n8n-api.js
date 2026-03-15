const pool = require('../db');

// Cache for monitoring stats and workflow names — keyed by instance ID
const monStatsCacheMap = {};
const monWfCacheMap = {};

// Instance cache (short TTL so DB changes are picked up quickly)
let instancesCache = { list: [], ts: 0 };
const INSTANCE_CACHE_TTL = 10000; // 10s

async function getAllInstances() {
  if (instancesCache.list.length > 0 && Date.now() - instancesCache.ts < INSTANCE_CACHE_TTL) {
    return instancesCache.list;
  }
  try {
    const { rows } = await pool.query('SELECT * FROM n8n_instances ORDER BY is_default DESC, name');
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
  });
  if (!res.ok) throw new Error(`n8n API ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

async function fetchAllWorkflows(instanceId) {
  const all = [];
  let cursor = null;
  do {
    let url = '/api/v1/workflows?limit=250';
    if (cursor) url += '&cursor=' + encodeURIComponent(cursor);
    const data = await n8nApiFetch(url, instanceId);
    all.push(...(data.data || []));
    cursor = data.nextCursor || null;
  } while (cursor);
  return all;
}

async function getWorkflowNameMap(instanceId) {
  const key = instanceId || '_default';
  const cached = monWfCacheMap[key];
  if (cached && cached.map && Object.keys(cached.map).length > 0 && Date.now() - cached.ts < 30000) {
    return cached.map;
  }
  try {
    const wfs = await fetchAllWorkflows(instanceId);
    const map = {};
    for (const wf of wfs) {
      map[wf.id] = wf.name;
    }
    monWfCacheMap[key] = { map, ts: Date.now() };
    return map;
  } catch (e) {
    return (cached && cached.map) || {};
  }
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
  const key = instanceId || '_default';
  delete monWfCacheMap[key];
}

function getMonStatsCache(instanceId) {
  const key = instanceId || '_default';
  return monStatsCacheMap[key] || { data: null, ts: 0 };
}
function setMonStatsCache(data, instanceId) {
  const key = instanceId || '_default';
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
  });
  if (!resp.ok) throw new Error('User not found in n8n');

  const user = await resp.json();
  if (!user || !user.email) throw new Error('Invalid n8n user response');
  return user;
}

module.exports = {
  n8nApiFetch,
  fetchAllWorkflows,
  getWorkflowNameMap,
  enrichExecutions,
  invalidateWfCache,
  getMonStatsCache,
  setMonStatsCache,
  verifyN8nUser,
  getAllInstances,
  getInstanceConfig,
  invalidateInstanceCache,
};
