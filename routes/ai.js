const express = require('express');
const pool = require('../db');
const { getSettingWithDefault } = require('../lib/helpers');
const { requireAuth, requireRole, aiLimiter } = require('../lib/middleware');
const { getAiConfig, AI_DEFAULT_PROMPTS, aiComplete, aiChatWithTools } = require('../lib/ai-providers');
const { validateExternalUrl } = require('../lib/helpers');

const router = express.Router();

// AI: Fetch available models from provider
router.post('/api/ai/models', requireRole('admin'), async (req, res) => {
  try {
    const { provider, api_key, base_url } = req.body;
    if (!provider) return res.status(400).json({ error: 'Provider required' });
    let models = [];

    if (provider === 'gemini') {
      if (!api_key) return res.status(400).json({ error: 'API key required for Gemini' });
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=100`, {
        headers: { 'x-goog-api-key': api_key },
      });
      if (!r.ok) throw new Error('Gemini API error: ' + r.status);
      const data = await r.json();
      models = (data.models || [])
        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => ({ id: m.name.replace('models/', ''), name: m.displayName || m.name }));
    } else if (provider === 'openai') {
      if (!api_key) return res.status(400).json({ error: 'API key required for OpenAI' });
      if (base_url && !validateExternalUrl(base_url)) return res.status(400).json({ error: 'Invalid base URL' });
      const endpoint = (base_url || 'https://api.openai.com').replace(/\/+$/, '') + '/v1/models';
      const r = await fetch(endpoint, { headers: { Authorization: `Bearer ${api_key}` } });
      if (!r.ok) throw new Error('OpenAI API error: ' + r.status);
      const data = await r.json();
      models = (data.data || [])
        .filter(m => !/^(text-embedding|dall-e|whisper|tts|davinci|babbage|canary|omni-mod)/.test(m.id))
        .map(m => ({ id: m.id, name: m.id }))
        .sort((a, b) => a.id.localeCompare(b.id));
    } else if (provider === 'groq') {
      if (!api_key) return res.status(400).json({ error: 'API key required for Groq' });
      const r = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${api_key}` },
      });
      if (!r.ok) throw new Error('Groq API error: ' + r.status);
      const data = await r.json();
      models = (data.data || [])
        .filter(m => !/^(whisper|distil-whisper|playai|mistral-saba)/.test(m.id))
        .map(m => ({ id: m.id, name: m.id }))
        .sort((a, b) => a.id.localeCompare(b.id));
    } else if (provider === 'claude') {
      if (!api_key) return res.status(400).json({ error: 'API key required for Claude' });
      let allModels = [];
      let afterId = null;
      for (let i = 0; i < 5; i++) {
        const url = 'https://api.anthropic.com/v1/models?limit=100' + (afterId ? '&after_id=' + encodeURIComponent(afterId) : '');
        const r = await fetch(url, {
          headers: { 'x-api-key': api_key, 'anthropic-version': '2023-06-01' },
        });
        if (!r.ok) throw new Error('Anthropic API error: ' + r.status);
        const data = await r.json();
        allModels = allModels.concat(data.data || []);
        if (!data.has_more) break;
        afterId = data.last_id;
      }
      models = allModels
        .map(m => ({ id: m.id, name: m.display_name || m.id }))
        .sort((a, b) => a.id.localeCompare(b.id));
    } else if (provider === 'ollama') {
      // Ollama is a local service, allow localhost for this provider only
      const endpoint = (base_url || 'http://localhost:11434').replace(/\/+$/, '') + '/api/tags';
      const r = await fetch(endpoint);
      if (!r.ok) throw new Error('Ollama API error: ' + r.status);
      const data = await r.json();
      models = (data.models || []).map(m => ({ id: m.name, name: m.name }));
    } else {
      return res.status(400).json({ error: 'Unknown provider' });
    }

    res.json({ models });
  } catch (e) {
    console.error('Fetch AI models error:', e.message);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// AI: Generate workflow description
// AI: Generate workflow name
router.post('/api/ai/name-workflow', requireAuth, aiLimiter, async (req, res) => {
  try {
    const { nodes, connections } = req.body;
    if (!nodes || !Array.isArray(nodes)) return res.status(400).json({ error: 'nodes array required' });

    const nodeList = nodes.map(n => `${n.name || 'Unnamed'} (${n.type || 'unknown'})`).join(', ');
    const connSummary = connections ? Object.keys(connections).map(src => {
      const targets = connections[src]?.main?.flat()?.map(c => c.node) || [];
      return targets.length ? `${src} → ${targets.join(', ')}` : null;
    }).filter(Boolean).join('; ') : 'none';

    const systemPrompt = 'You are a naming expert for workflow automations. Generate a single short, descriptive name (3-8 words) for the workflow based on its nodes and connections. The name should clearly convey the workflow\'s purpose. Return ONLY the name, nothing else — no quotes, no explanation.';
    const userPrompt = `Name this n8n workflow:\nNodes: ${nodeList}\nConnections: ${connSummary}`;

    const name = await aiComplete(systemPrompt, userPrompt, 30);
    res.json({ name: name.replace(/^["']|["']$/g, '').trim() });
  } catch (e) {
    console.error('AI name-workflow error:', e.message);
    res.status(500).json({ error: 'AI name generation failed' });
  }
});

// AI: Generate workflow description
router.post('/api/ai/describe-workflow', requireAuth, aiLimiter, async (req, res) => {
  try {
    const { nodes, connections } = req.body;
    if (!nodes || !Array.isArray(nodes)) return res.status(400).json({ error: 'nodes array required' });

    const nodeList = nodes.map(n => `${n.name || 'Unnamed'} (${n.type || 'unknown'})`).join(', ');
    const connSummary = connections ? Object.keys(connections).map(src => {
      const targets = connections[src]?.main?.flat()?.map(c => c.node) || [];
      return targets.length ? `${src} → ${targets.join(', ')}` : null;
    }).filter(Boolean).join('; ') : 'none';

    const systemPrompt = await getSettingWithDefault('ai_prompt_describe', AI_DEFAULT_PROMPTS.ai_prompt_describe);
    const userPrompt = `Describe this n8n workflow:\nNodes: ${nodeList}\nConnections: ${connSummary}`;

    const description = await aiComplete(systemPrompt, userPrompt, 256);
    res.json({ description });
  } catch (e) {
    console.error('AI describe-workflow error:', e.message);
    res.status(500).json({ error: 'AI generation failed' });
  }
});

// AI: Generate workflow documentation
router.post('/api/ai/document-workflow', requireAuth, aiLimiter, async (req, res) => {
  try {
    const { nodes, connections, workflowName } = req.body;
    if (!nodes || !Array.isArray(nodes)) return res.status(400).json({ error: 'nodes array required' });

    const nodeDetails = nodes.map(n => {
      let detail = `${n.name || 'Unnamed'} (type: ${n.type || 'unknown'})`;
      if (n.parameters && Object.keys(n.parameters).length > 0) {
        detail += ` — params: ${JSON.stringify(n.parameters)}`;
      }
      return detail;
    }).join('\n');

    const connSummary = connections ? Object.keys(connections).map(src => {
      const targets = connections[src]?.main?.flat()?.map(c => c.node) || [];
      return targets.length ? `${src} → ${targets.join(', ')}` : null;
    }).filter(Boolean).join('\n') : 'none';

    const systemPrompt = await getSettingWithDefault('ai_prompt_document', AI_DEFAULT_PROMPTS.ai_prompt_document);
    const userPrompt = `Generate documentation for the n8n workflow "${workflowName || 'Untitled'}":\n\nNodes:\n${nodeDetails}\n\nConnections:\n${connSummary}`;

    const documentation = await aiComplete(systemPrompt, userPrompt, 2048);
    res.json({ documentation });
  } catch (e) {
    console.error('AI document-workflow error:', e.message);
    res.status(500).json({ error: 'AI documentation generation failed' });
  }
});

// AI: Analyze failed execution error
router.post('/api/ai/analyze-error', requireAuth, aiLimiter, async (req, res) => {
  try {
    const { errorMessage, failedNodeType, failedNodeName, workflowNodes, workflowConnections } = req.body;
    if (!errorMessage) return res.status(400).json({ error: 'errorMessage required' });

    const nodeList = (workflowNodes || []).map(n => `${n.name} (${n.type})`).join(', ');
    const systemPrompt = await getSettingWithDefault('ai_prompt_error', AI_DEFAULT_PROMPTS.ai_prompt_error);
    const userPrompt = `Error in n8n workflow execution:
Failed node: ${failedNodeName || 'unknown'} (type: ${failedNodeType || 'unknown'})
Error: ${errorMessage}
Workflow nodes: ${nodeList || 'not provided'}`;

    const analysis = await aiComplete(systemPrompt, userPrompt, 512);

    let relatedArticles = [];
    try {
      const searchTerms = (failedNodeType || '').replace(/n8n-nodes-base\./, '') + ' ' + (errorMessage || '').substring(0, 100);
      const { rows } = await pool.query(
        `SELECT id, title, slug, excerpt FROM kb_articles
         WHERE status = 'published' AND search_vector @@ plainto_tsquery('english', $1)
         ORDER BY ts_rank(search_vector, plainto_tsquery('english', $1)) DESC LIMIT 3`,
        [searchTerms]
      );
      relatedArticles = rows;
    } catch (e) { /* KB search optional */ }

    res.json({ analysis, relatedArticles });
  } catch (e) {
    console.error('AI analyze-error:', e.message);
    res.status(500).json({ error: 'AI analysis failed' });
  }
});

// AI: Observability report — generate a performance analysis from current metrics
router.post('/api/ai/observability-report', requireRole('admin', 'editor'), aiLimiter, async (req, res) => {
  try {
    const monitoring = require('./monitoring');
    const { getInstanceConfig } = require('../lib/n8n-api');
    const instanceId = req.body.instance_id || req.query.instance_id;
    const inst = await getInstanceConfig(instanceId);
    const store = monitoring.getMetricsHistory(inst ? inst.id : 'default');
    const history = store.history;

    // Fetch current raw metrics from the selected instance
    const base = inst ? inst.internal_url.replace(/\/+$/, '') : '';
    let rawMetrics = {};
    try {
      if (base) {
        const r = await fetch(`${base}/metrics`, { signal: AbortSignal.timeout(5000) });
        if (r.ok) rawMetrics = monitoring.parsePrometheusText(await r.text());
      }
    } catch {}

    // Build a compact summary for the LLM
    const latest = history.length ? history[history.length - 1] : {};
    const oldest = history.length > 1 ? history[0] : latest;
    const spanMinutes = history.length > 1 ? Math.round((latest.timestamp - oldest.timestamp) / 60000) : 0;

    // CPU rate over the window
    let cpuRate = 'N/A';
    if (history.length > 1 && latest.cpu > oldest.cpu) {
      const elapsedSec = (latest.timestamp - oldest.timestamp) / 1000;
      cpuRate = ((latest.cpu - oldest.cpu) / elapsedSec * 100).toFixed(1) + '%';
    }

    // Extract version info
    let n8nVersion = 'unknown', nodeVersion = 'unknown';
    const verMetric = rawMetrics['n8n_version_info'] || [];
    if (verMetric.length && verMetric[0].labels) {
      n8nVersion = verMetric[0].labels.version || 'unknown';
      nodeVersion = verMetric[0].labels.nodejs_version || 'unknown';
    }

    // Queue totals trend
    const queueSummary = history.length > 5 ? {
      completedStart: history[0].queueCompleted || 0,
      completedEnd: latest.queueCompleted || 0,
      failedStart: history[0].queueFailed || 0,
      failedEnd: latest.queueFailed || 0,
      waitingNow: latest.queueWaiting || 0,
      activeNow: latest.queueActive || 0,
    } : null;

    // Heap trend
    const heapPct = latest.heapTotal ? ((latest.heapUsed / latest.heapTotal) * 100).toFixed(1) : 'N/A';

    // Build the metrics block
    let metricsBlock = `n8n Instance Metrics Snapshot
=============================
n8n version: ${n8nVersion}
Node.js version: ${nodeVersion}
Observation window: ${spanMinutes} minutes (${history.length} data points)

Current Values:
- Memory (RSS): ${(latest.memoryRss / 1048576).toFixed(1)} MB
- Heap: ${(latest.heapUsed / 1048576).toFixed(1)} / ${(latest.heapTotal / 1048576).toFixed(1)} MB (${heapPct}%)
- CPU usage rate: ${cpuRate}
- Event loop lag: ${((latest.eventLoopLag || 0) * 1000).toFixed(1)} ms
- Event loop p99: ${((latest.eventLoopP99 || 0) * 1000).toFixed(1)} ms
- Active handles: ${latest.activeHandles || 0}
- Active requests: ${latest.activeRequests || 0}
- Active workflows: ${latest.activeWorkflows || 0}`;

    if (queueSummary) {
      const completedInWindow = queueSummary.completedEnd - queueSummary.completedStart;
      const failedInWindow = queueSummary.failedEnd - queueSummary.failedStart;
      const failRate = completedInWindow + failedInWindow > 0
        ? ((failedInWindow / (completedInWindow + failedInWindow)) * 100).toFixed(1)
        : '0';
      metricsBlock += `
- Queue waiting: ${queueSummary.waitingNow}
- Queue active: ${queueSummary.activeNow}
- Executions completed (in window): ${completedInWindow}
- Executions failed (in window): ${failedInWindow}
- Failure rate: ${failRate}%`;
    }

    // Add memory/heap trend (sample 5 points)
    if (history.length > 5) {
      const step = Math.floor(history.length / 5);
      metricsBlock += '\n\nMemory Trend (sampled):';
      for (let i = 0; i < history.length; i += step) {
        const h = history[i];
        const t = new Date(h.timestamp).toISOString().substring(11, 19);
        metricsBlock += `\n  ${t} — RSS: ${(h.memoryRss / 1048576).toFixed(0)}MB, Heap: ${(h.heapUsed / 1048576).toFixed(0)}/${(h.heapTotal / 1048576).toFixed(0)}MB, Lag: ${((h.eventLoopLag || 0) * 1000).toFixed(1)}ms`;
      }
    }

    const systemPrompt = `You are an expert n8n DevOps engineer analyzing instance performance metrics. Produce a clear, actionable performance report in Markdown format. Structure your report with these sections:

## Health Summary
A one-paragraph overall health assessment with a clear verdict (Healthy / Warning / Critical).

## Key Metrics Analysis
Analyze CPU, memory, heap usage, event loop latency, and queue performance. Flag any concerning values with specific thresholds (e.g., heap >85%, event loop lag >100ms, rising failure rate).

## Trends
If trend data is available, identify patterns — memory leaks (steadily growing RSS/heap), increasing latency, queue backlogs, etc.

## Recommendations
Provide 2-5 specific, prioritized recommendations to improve performance or maintain health. Include n8n-specific advice (workflow optimization, scaling, environment variables, resource allocation).

Be concise and data-driven. Reference actual numbers from the metrics. If something looks normal, say so briefly and move on. Focus attention on anomalies and potential issues.`;

    const report = await aiComplete(systemPrompt, metricsBlock, 1024);
    res.json({ report });
  } catch (e) {
    console.error('AI observability report error:', e.message);
    res.status(500).json({ error: 'Failed to generate observability report' });
  }
});

// AI Chat endpoint
router.post('/api/ai/chat', requireAuth, aiLimiter, async (req, res) => {
  try {
    const { messages, enabledMcpServers } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }
    if (messages.length > 100) return res.status(400).json({ error: 'Too many messages (max 100)' });
    const sanitized = messages.map(m => {
      const content = String(m.content || '').substring(0, 50000);
      return { role: m.role === 'assistant' ? 'assistant' : 'user', content };
    });
    const mcpFilter = Array.isArray(enabledMcpServers) ? enabledMcpServers : null;
    const result = await aiChatWithTools(sanitized, 10, mcpFilter);
    res.json(result);
  } catch (e) {
    console.error('AI chat error:', e.message);
    res.status(500).json({ error: 'AI chat failed' });
  }
});

// --- AI Conversations ---

router.get('/api/ai/conversations', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, enabled_mcp_servers, created_at, updated_at,
              messages->-1->>'content' AS last_message,
              jsonb_array_length(messages) AS message_count
       FROM ai_conversations WHERE user_id = $1
       ORDER BY updated_at DESC LIMIT 50`,
      [req.session.user.id]
    );
    res.json({ conversations: rows });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

router.post('/api/ai/conversations', requireAuth, async (req, res) => {
  try {
    const { title, enabledMcpServers } = req.body;
    const mcpVal = Array.isArray(enabledMcpServers) ? JSON.stringify(enabledMcpServers) : null;
    const { rows } = await pool.query(
      `INSERT INTO ai_conversations (user_id, title, enabled_mcp_servers)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.session.user.id, title || 'New Chat', mcpVal]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('Create conversation error:', e.message);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

router.get('/api/ai/conversations/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ai_conversations WHERE id = $1 AND user_id = $2',
      [req.params.id, req.session.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

router.put('/api/ai/conversations/:id', requireAuth, async (req, res) => {
  try {
    const { title, messages, enabledMcpServers } = req.body;
    const sets = ['updated_at = NOW()'];
    const vals = [];
    let idx = 1;
    if (title !== undefined) { sets.push(`title = $${idx}`); vals.push(title); idx++; }
    if (messages !== undefined) { sets.push(`messages = $${idx}::jsonb`); vals.push(JSON.stringify(messages)); idx++; }
    if (enabledMcpServers !== undefined) { sets.push(`enabled_mcp_servers = $${idx}::jsonb`); vals.push(enabledMcpServers ? JSON.stringify(enabledMcpServers) : null); idx++; }
    vals.push(req.params.id, req.session.user.id);
    const { rows } = await pool.query(
      `UPDATE ai_conversations SET ${sets.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`,
      vals
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('Update conversation error:', e.message);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

router.delete('/api/ai/conversations/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM ai_conversations WHERE id = $1 AND user_id = $2',
      [req.params.id, req.session.user.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

module.exports = router;
