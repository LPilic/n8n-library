const pool = require('../db');
const { escHtml, getSettingWithDefault, validateExternalUrl } = require('./helpers');
const { getAllTools, callToolByName, toolsToOpenAiFormat, toolsToClaudeFormat, toolsToGeminiFormat } = require('./tools');
const { n8nApiFetch } = require('./n8n-api');
const { renderEmail, getMailTransport, getSmtpFrom } = require('./email');

let aiConfigCache = { data: null, ts: 0 };
const AI_CONFIG_TTL = 60 * 1000;

async function getAiConfig() {
  if (aiConfigCache.data && Date.now() - aiConfigCache.ts < AI_CONFIG_TTL) return aiConfigCache.data;
  const keys = ['ai_provider', 'ai_api_key', 'ai_model', 'ai_base_url'];
  const { rows } = await pool.query(`SELECT key, value FROM settings WHERE key = ANY($1)`, [keys]);
  const cfg = {};
  for (const r of rows) cfg[r.key] = r.value;
  aiConfigCache = { data: cfg, ts: Date.now() };
  return cfg;
}

function invalidateAiConfigCache() {
  aiConfigCache = { data: null, ts: 0 };
}

const AI_DEFAULT_PROMPTS = {
  ai_prompt_describe: 'You are a concise technical writer. Describe what a workflow automation does in 2-3 short sentences in a single paragraph. Focus on the business purpose and data flow. Use inline HTML formatting (<strong>, <em>) where helpful but do NOT wrap in <p> tags or add extra line breaks. Do not use markdown.',
  ai_prompt_document: 'You are a technical documentation writer specializing in n8n workflow automation. Generate comprehensive HTML documentation for the workflow. Include: 1) Overview/purpose, 2) Node-by-node breakdown explaining what each node does and its configuration, 3) Data flow between nodes, 4) Setup requirements (credentials, external services needed), 5) Troubleshooting tips. Use proper HTML formatting with headings (h3/h4), paragraphs, bold, lists, and code blocks where appropriate. Do not use markdown.',
  ai_prompt_error: 'You are an n8n workflow automation expert. Analyze the error and provide: 1) Root cause, 2) Suggested fix, 3) Prevention tips. Be concise and practical. Do not use markdown formatting.',
  ai_prompt_summary: 'You are an operations analyst. Write a brief, friendly daily summary of n8n workflow execution metrics. Highlight anything noteworthy. 3-4 sentences max.',
  ai_prompt_improve: 'You are an expert prompt engineer. Improve the given prompt to be clearer, more effective, and produce better results from LLMs. Preserve the original intent and any template variables ({{variable_name}}). Return ONLY the improved prompt text, no explanations or metadata.',
};

async function aiComplete(systemPrompt, userPrompt, maxTokens = 1024) {
  const cfg = await getAiConfig();
  const provider = cfg.ai_provider || '';
  const apiKey = cfg.ai_api_key || '';
  const model = cfg.ai_model || '';
  const baseUrl = cfg.ai_base_url || '';

  if (!provider) throw new Error('AI not configured — set provider in Settings');

  if (provider === 'gemini') {
    if (!apiKey) throw new Error('Gemini API key not set');
    const m = model || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 },
      }),
    });
    if (!resp.ok) throw new Error(`Gemini API error: ${resp.status}`);
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (provider === 'openai') {
    if (!apiKey) throw new Error('OpenAI API key not set');
    const base = baseUrl || 'https://api.openai.com/v1';
    if (baseUrl && !validateExternalUrl(baseUrl)) throw new Error('Invalid AI base URL');
    const m = model || 'gpt-4o-mini';
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: m,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        max_tokens: maxTokens, temperature: 0.3,
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI API error: ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (provider === 'groq') {
    if (!apiKey) throw new Error('Groq API key not set');
    const m = model || 'llama-3.3-70b-versatile';
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: m,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        max_completion_tokens: maxTokens, temperature: 0.3,
      }),
    });
    if (!resp.ok) throw new Error(`Groq API error: ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (provider === 'claude') {
    if (!apiKey) throw new Error('Anthropic API key not set');
    const m = model || 'claude-sonnet-4-6';
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: m,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: maxTokens, temperature: 0.3,
      }),
    });
    if (!resp.ok) throw new Error(`Claude API error: ${resp.status}`);
    const data = await resp.json();
    return data.content?.[0]?.text || '';
  }

  if (provider === 'ollama') {
    const base = baseUrl || 'http://host.docker.internal:11434';
    const m = model || 'llama3';
    const resp = await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: m, system: systemPrompt, prompt: userPrompt, stream: false }),
    });
    if (!resp.ok) throw new Error(`Ollama error: ${resp.status}`);
    const data = await resp.json();
    return data.response || '';
  }

  throw new Error(`Unknown AI provider: ${provider}`);
}

// --- AI Chat with tool calling (agentic loop) ---

async function aiChatWithTools(messages, maxIterations = 10, allowedMcpServerIds = null) {
  const cfg = await getAiConfig();
  const provider = cfg.ai_provider || '';
  const apiKey = cfg.ai_api_key || '';
  const model = cfg.ai_model || '';
  const baseUrl = cfg.ai_base_url || '';

  if (!provider) throw new Error('AI not configured — set provider in AI settings');

  const allTools = getAllTools(allowedMcpServerIds);
  const hasTools = allTools.length > 0;

  const systemPrompt = `You are an AI assistant for an n8n workflow automation platform. You have access to tools that let you:
- Query the n8n instance (list workflows, get execution details, manage credentials, etc.) via MCP tools
- Search and read support tickets (search_tickets, get_ticket, get_ticket_stats)
- Search and read knowledge base articles (search_kb_articles, get_kb_article)

Use the appropriate tools when the user asks about workflows, executions, tickets, KB articles, or the n8n instance. Always use tools to get real data rather than guessing. Be concise and helpful. Format responses clearly with relevant details.`;

  if (baseUrl && !validateExternalUrl(baseUrl)) throw new Error('Invalid AI base URL');

  if (provider === 'openai' || provider === 'groq') {
    return await _chatLoopOpenAi(provider, apiKey, model, baseUrl, systemPrompt, messages, allTools, hasTools, maxIterations);
  }
  if (provider === 'claude') {
    return await _chatLoopClaude(apiKey, model, systemPrompt, messages, allTools, hasTools, maxIterations);
  }
  if (provider === 'gemini') {
    return await _chatLoopGemini(apiKey, model, systemPrompt, messages, allTools, hasTools, maxIterations);
  }
  if (provider === 'ollama') {
    const userMsg = messages[messages.length - 1]?.content || '';
    const result = await aiComplete(systemPrompt, userMsg, 2048);
    return { reply: result, toolCalls: [] };
  }
  throw new Error(`Unknown AI provider: ${provider}`);
}

async function _chatLoopOpenAi(provider, apiKey, model, baseUrl, systemPrompt, messages, mcpTools, hasTools, maxIterations) {
  let base, m, maxTokensKey;
  if (provider === 'groq') {
    base = 'https://api.groq.com/openai/v1';
    m = model || 'llama-3.3-70b-versatile';
    maxTokensKey = 'max_completion_tokens';
  } else {
    base = baseUrl || 'https://api.openai.com/v1';
    m = model || 'gpt-4o-mini';
    maxTokensKey = 'max_tokens';
  }

  const apiMessages = [{ role: 'system', content: systemPrompt }, ...messages];
  const toolCalls = [];

  for (let i = 0; i < maxIterations; i++) {
    const body = { model: m, messages: apiMessages, [maxTokensKey]: 2048, temperature: 0.3 };
    if (hasTools) body.tools = toolsToOpenAiFormat(mcpTools);

    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`${provider} API error: ${resp.status}`);
    const data = await resp.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error('No response from AI');

    const msg = choice.message;
    apiMessages.push(msg);

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        const toolName = tc.function.name;
        const toolArgs = JSON.parse(tc.function.arguments || '{}');
        toolCalls.push({ tool: toolName, args: toolArgs });
        let toolResult;
        try { toolResult = await callToolByName(toolName, toolArgs); }
        catch (e) { toolResult = `Error: ${e.message}`; }
        toolCalls[toolCalls.length - 1].result = toolResult;
        apiMessages.push({ role: 'tool', tool_call_id: tc.id, content: toolResult });
      }
      continue;
    }
    return { reply: msg.content || '', toolCalls };
  }
  return { reply: apiMessages[apiMessages.length - 1]?.content || 'Max iterations reached', toolCalls };
}

async function _chatLoopClaude(apiKey, model, systemPrompt, messages, mcpTools, hasTools, maxIterations) {
  const m = model || 'claude-sonnet-4-6';
  const apiMessages = [...messages];
  const toolCalls = [];

  for (let i = 0; i < maxIterations; i++) {
    const body = { model: m, system: systemPrompt, messages: apiMessages, max_tokens: 2048, temperature: 0.3 };
    if (hasTools) body.tools = toolsToClaudeFormat(mcpTools);

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`Claude API error: ${resp.status}`);
    const data = await resp.json();

    const toolUseBlocks = (data.content || []).filter(b => b.type === 'tool_use');
    const textBlocks = (data.content || []).filter(b => b.type === 'text');

    if (toolUseBlocks.length > 0 && data.stop_reason === 'tool_use') {
      apiMessages.push({ role: 'assistant', content: data.content });
      const toolResults = [];
      for (const tb of toolUseBlocks) {
        toolCalls.push({ tool: tb.name, args: tb.input });
        let toolResult;
        try { toolResult = await callToolByName(tb.name, tb.input); }
        catch (e) { toolResult = `Error: ${e.message}`; }
        toolCalls[toolCalls.length - 1].result = toolResult;
        toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: toolResult });
      }
      apiMessages.push({ role: 'user', content: toolResults });
      continue;
    }
    const reply = textBlocks.map(b => b.text).join('\n') || '';
    return { reply, toolCalls };
  }
  return { reply: 'Max iterations reached', toolCalls };
}

async function _chatLoopGemini(apiKey, model, systemPrompt, messages, mcpTools, hasTools, maxIterations) {
  const m = model || 'gemini-2.0-flash';
  const toolCalls = [];
  const contents = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  for (let i = 0; i < maxIterations; i++) {
    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: 2048, temperature: 0.3 },
    };
    if (hasTools) body.tools = toolsToGeminiFormat(mcpTools);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`Gemini API error: ${resp.status}`);
    const data = await resp.json();

    const candidate = data.candidates?.[0];
    if (!candidate) throw new Error('No response from Gemini');

    const parts = candidate.content?.parts || [];
    const functionCalls = parts.filter(p => p.functionCall);
    const textParts = parts.filter(p => p.text);

    if (functionCalls.length > 0) {
      contents.push({ role: 'model', parts });
      const responseParts = [];
      for (const fc of functionCalls) {
        toolCalls.push({ tool: fc.functionCall.name, args: fc.functionCall.args });
        let toolResult;
        try { toolResult = await callToolByName(fc.functionCall.name, fc.functionCall.args); }
        catch (e) { toolResult = `Error: ${e.message}`; }
        toolCalls[toolCalls.length - 1].result = toolResult;
        responseParts.push({ functionResponse: { name: fc.functionCall.name, response: { result: toolResult } } });
      }
      contents.push({ role: 'user', parts: responseParts });
      continue;
    }
    const reply = textParts.map(p => p.text).join('\n') || '';
    return { reply, toolCalls };
  }
  return { reply: 'Max iterations reached', toolCalls };
}

// --- Daily Summary ---

async function generateDailySummary() {
  const data = await n8nApiFetch('/api/v1/executions?limit=250');
  const executions = (data.data || []).filter(ex => {
    if (!ex.startedAt) return false;
    return (Date.now() - new Date(ex.startedAt).getTime()) < 24 * 60 * 60 * 1000;
  });

  const total = executions.length;
  const success = executions.filter(e => e.status === 'success').length;
  const errors = executions.filter(e => e.status === 'error').length;
  const running = executions.filter(e => e.status === 'running').length;

  const failMap = {};
  for (const ex of executions.filter(e => e.status === 'error')) {
    const name = ex.workflowData?.name || ex.workflowId || 'Unknown';
    failMap[name] = (failMap[name] || 0) + 1;
  }
  const topFailing = Object.entries(failMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const withDuration = executions
    .filter(e => e.startedAt && e.stoppedAt)
    .map(e => ({ name: e.workflowData?.name || e.workflowId, duration: new Date(e.stoppedAt) - new Date(e.startedAt) }))
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 3);

  const statsText = `Last 24h: ${total} executions, ${success} success, ${errors} errors, ${running} running.
Success rate: ${total > 0 ? Math.round((success / total) * 100) : 0}%.
Top failing: ${topFailing.length ? topFailing.map(([n, c]) => `${n} (${c})`).join(', ') : 'None'}.
Longest: ${withDuration.length ? withDuration.map(w => `${w.name} (${Math.round(w.duration / 1000)}s)`).join(', ') : 'None'}.`;

  let narrative = '';
  try {
    const cfg = await getAiConfig();
    if (cfg.ai_provider) {
      const summaryPrompt = await getSettingWithDefault('ai_prompt_summary', AI_DEFAULT_PROMPTS.ai_prompt_summary);
      narrative = await aiComplete(summaryPrompt, statsText, 300);
    }
  } catch (e) { /* AI optional */ }

  return { total, success, errors, running, topFailing, withDuration, statsText, narrative };
}

async function sendDailySummaryEmail() {
  const summary = await generateDailySummary();

  const { rows: users } = await pool.query("SELECT email FROM users WHERE role IN ('admin', 'editor') AND email NOT LIKE '%@localhost'");
  if (!users.length) throw new Error('No admin/editor users with real email addresses');

  const transport = getMailTransport();
  if (!transport) throw new Error('SMTP not configured — set up SMTP in Settings first');

  const topFailHtml = summary.topFailing.length
    ? '<ul>' + summary.topFailing.map(([n, c]) => `<li><strong>${escHtml(n)}</strong>: ${c} failures</li>`).join('') + '</ul>'
    : '<p>No failures!</p>';

  const longestHtml = summary.withDuration.length
    ? '<ul>' + summary.withDuration.map(w => `<li><strong>${escHtml(w.name)}</strong>: ${Math.round(w.duration / 1000)}s</li>`).join('') + '</ul>'
    : '<p>No completed executions</p>';

  const emailData = await renderEmail('daily_summary', {
    total_count: String(summary.total),
    success_count: String(summary.success),
    error_count: String(summary.errors),
    running_count: String(summary.running),
    success_rate: String(summary.total > 0 ? Math.round((summary.success / summary.total) * 100) : 0),
    top_failing: topFailHtml,
    longest_running: longestHtml,
    ai_summary: summary.narrative ? `<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;margin:16px 0;border-radius:4px"><strong>AI Summary:</strong><br>${escHtml(summary.narrative)}</div>` : '',
    generated_at: new Date().toLocaleString(),
  });

  const fromAddr = await getSmtpFrom();
  const recipients = users.map(u => u.email);
  await transport.sendMail({
    from: fromAddr,
    to: recipients.join(', '),
    subject: emailData.subject,
    html: emailData.html,
  });

  return { sent: recipients.length, summary };
}

// Daily summary cron management
let dailySummaryCronJob = null;

function scheduleDailySummaryCron() {
  if (dailySummaryCronJob) { dailySummaryCronJob.stop(); dailySummaryCronJob = null; }
  pool.query("SELECT value FROM settings WHERE key = 'daily_summary_hour'").then(({ rows }) => {
    const hour = parseInt(rows[0]?.value, 10);
    if (isNaN(hour) || hour < 0 || hour > 23) return;
    try {
      const cron = require('node-cron');
      dailySummaryCronJob = cron.schedule(`0 ${hour} * * *`, () => {
        console.log('Running daily summary cron...');
        sendDailySummaryEmail().catch(err => console.error('Cron summary failed:', err.message));
      });
      console.log(`Daily summary cron scheduled at ${hour}:00`);
    } catch (e) { console.warn('node-cron not available, daily summary cron disabled'); }
  }).catch(() => {});
}

module.exports = {
  getAiConfig,
  invalidateAiConfigCache,
  AI_DEFAULT_PROMPTS,
  aiComplete,
  aiChatWithTools,
  generateDailySummary,
  sendDailySummaryEmail,
  scheduleDailySummaryCron,
};
