// --- AI Settings ---
var aiEnabled = false;

function onAiProviderChange() {
  var prov = document.getElementById('aiProvider').value;
  document.getElementById('aiApiKeyGroup').style.display = prov === 'ollama' || !prov ? 'none' : '';
  // Reset model dropdown when provider changes
  var sel = document.getElementById('aiModel');
  sel.innerHTML = '<option value="">Select a model...</option>';
  refreshCustomSelect(sel);
  var hint = document.getElementById('aiModelHint');
  if (prov) hint.textContent = 'Click "Fetch Models" to load available models from ' + prov;
  else hint.textContent = '';
}

async function fetchAiModels() {
  var prov = document.getElementById('aiProvider').value;
  if (!prov) return toast('Select a provider first', 'error');
  var apiKey = document.getElementById('aiApiKey').value;
  var baseUrl = document.getElementById('aiBaseUrl').value.trim();
  if (prov !== 'ollama' && !apiKey) return toast('Enter an API key first', 'error');

  var btn = document.getElementById('aiFetchModelsBtn');
  btn.disabled = true;
  btn.textContent = 'Loading...';
  try {
    var res = await fetch(API + '/api/ai/models', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ provider: prov, api_key: apiKey, base_url: baseUrl }),
    });
    if (!res.ok) { var e = await res.json(); throw new Error(e.error || 'Failed'); }
    var data = await res.json();
    var sel = document.getElementById('aiModel');
    var currentVal = sel.value;
    sel.innerHTML = '<option value="">Select a model...</option>';
    (data.models || []).forEach(function(m) {
      var opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name !== m.id ? m.name + ' (' + m.id + ')' : m.id;
      sel.appendChild(opt);
    });
    // Restore previous selection if still available
    if (currentVal) sel.value = currentVal;
    refreshCustomSelect(sel);
    var hint = document.getElementById('aiModelHint');
    hint.textContent = data.models.length + ' model(s) found';
    toast('Loaded ' + data.models.length + ' models', 'success');
  } catch (e) {
    toast('Failed to fetch models: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Fetch Models';
  }
}

async function loadAiSettings() {
  try {
    var res = await fetch(API + '/api/settings/ai');
    if (!res.ok) return;
    var data = await res.json();
    document.getElementById('aiProvider').value = data.ai_provider || '';
    if (typeof syncCustomSelect === 'function') syncCustomSelect(document.getElementById('aiProvider'));
    document.getElementById('aiApiKey').value = data.ai_api_key || '';
    document.getElementById('aiBaseUrl').value = data.ai_base_url || '';
    document.getElementById('aiSummaryHour').value = data.daily_summary_hour || '';
    // Set up provider-specific UI
    var prov = data.ai_provider || '';
    document.getElementById('aiApiKeyGroup').style.display = prov === 'ollama' || !prov ? 'none' : '';
    // If a model was saved, add it as an option and select it
    var sel = document.getElementById('aiModel');
    sel.innerHTML = '<option value="">Select a model...</option>';
    if (data.ai_model) {
      var opt = document.createElement('option');
      opt.value = data.ai_model;
      opt.textContent = data.ai_model;
      sel.appendChild(opt);
      sel.value = data.ai_model;
      if (typeof refreshCustomSelect === 'function') refreshCustomSelect(sel);
    }
    var hint = document.getElementById('aiModelHint');
    if (prov && data.ai_model) hint.textContent = 'Current model: ' + data.ai_model + '. Click "Fetch Models" to see all available.';
    else if (prov) hint.textContent = 'Click "Fetch Models" to load available models from ' + prov;
    else hint.textContent = '';
  } catch (e) {
    console.warn('Could not load AI settings');
  }
}

async function saveAiSettings() {
  try {
    var body = {
      ai_provider: document.getElementById('aiProvider').value,
      ai_api_key: document.getElementById('aiApiKey').value,
      ai_model: document.getElementById('aiModel').value.trim(),
      ai_base_url: document.getElementById('aiBaseUrl').value.trim(),
      daily_summary_hour: document.getElementById('aiSummaryHour').value.trim(),
    };
    var res = await fetch(API + '/api/settings/ai', {
      method: 'PUT',
      headers: CSRF_HEADERS,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      var data = await res.json();
      return toast(data.error || 'Failed to save', 'error');
    }
    toast('AI settings saved', 'success');
    document.getElementById('aiSettingsStatus').textContent = 'Saved';
    checkAiStatus();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function checkAiStatus() {
  try {
    var res = await fetch(API + '/api/ai/status');
    if (!res.ok) { aiEnabled = false; return; }
    var data = await res.json();
    aiEnabled = !!data.configured;
  } catch (e) {
    aiEnabled = false;
  }
}

// --- AI Prompts ---
var AI_DEFAULT_PROMPTS = {
  ai_prompt_describe: 'You are a concise technical writer. Describe what a workflow automation does in 2-3 sentences. Focus on the business purpose and data flow. Do not use markdown formatting.',
  ai_prompt_document: 'You are a technical documentation writer specializing in n8n workflow automation. Generate comprehensive HTML documentation for the workflow. Include: 1) Overview/purpose, 2) Node-by-node breakdown explaining what each node does and its configuration, 3) Data flow between nodes, 4) Setup requirements (credentials, external services needed), 5) Troubleshooting tips. Use proper HTML formatting with headings (h3/h4), paragraphs, bold, lists, and code blocks where appropriate. Do not use markdown.',
  ai_prompt_error: 'You are an n8n workflow automation expert. Analyze the error and provide: 1) Root cause, 2) Suggested fix, 3) Prevention tips. Be concise and practical. Do not use markdown formatting.',
  ai_prompt_summary: 'You are an operations analyst. Write a brief, friendly daily summary of n8n workflow execution metrics. Highlight anything noteworthy. 3-4 sentences max.',
};

async function loadAiPrompts() {
  try {
    var res = await fetch(API + '/api/settings/ai-prompts');
    if (!res.ok) return;
    var data = await res.json();
    document.getElementById('aiPromptDescribe').value = data.ai_prompt_describe || '';
    document.getElementById('aiPromptDocument').value = data.ai_prompt_document || '';
    document.getElementById('aiPromptError').value = data.ai_prompt_error || '';
    document.getElementById('aiPromptSummary').value = data.ai_prompt_summary || '';
  } catch (e) { console.warn('Could not load AI prompts'); }
}

async function saveAiPrompts() {
  try {
    var body = {
      ai_prompt_describe: document.getElementById('aiPromptDescribe').value,
      ai_prompt_document: document.getElementById('aiPromptDocument').value,
      ai_prompt_error: document.getElementById('aiPromptError').value,
      ai_prompt_summary: document.getElementById('aiPromptSummary').value,
    };
    var res = await fetch(API + '/api/settings/ai-prompts', {
      method: 'PUT', headers: CSRF_HEADERS, body: JSON.stringify(body),
    });
    if (!res.ok) return toast('Failed to save prompts', 'error');
    toast('Prompts saved', 'success');
  } catch (e) { toast('Error: ' + e.message, 'error'); }
}

function resetAiPrompt(which) {
  var map = { describe: 'aiPromptDescribe', document: 'aiPromptDocument', error: 'aiPromptError', summary: 'aiPromptSummary' };
  var keyMap = { describe: 'ai_prompt_describe', document: 'ai_prompt_document', error: 'ai_prompt_error', summary: 'ai_prompt_summary' };
  var el = document.getElementById(map[which]);
  if (el) el.value = AI_DEFAULT_PROMPTS[keyMap[which]];
  toast('Reset to default — click Save to apply', 'info');
}

// --- MCP Servers ---
var mcpServersCache = [];

async function loadMcpServers() {
  try {
    var res = await fetch(API + '/api/mcp/servers');
    if (!res.ok) return;
    var data = await res.json();
    mcpServersCache = data.servers || [];
    renderMcpServers(mcpServersCache);
  } catch (e) { console.warn('Could not load MCP servers'); }
}

function renderMcpServers(servers) {
  var el = document.getElementById('mcpServerList');
  if (!servers.length) {
    el.innerHTML = '<p style="color:var(--color-text-muted);font-size:13px">No MCP servers configured. Add one to extend AI capabilities.</p>';
    return;
  }
  var html = '<div style="display:flex;flex-direction:column;gap:8px">';
  for (var i = 0; i < servers.length; i++) {
    var s = servers[i];
    var statusColor = s.status === 'connected' ? 'var(--color-success)' : s.status === 'error' ? 'var(--color-danger)' : 'var(--color-text-xmuted)';
    var statusLabel = s.status || 'disconnected';
    html += '<div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--color-bg);border:1px solid var(--color-border);border-radius:var(--radius)">';
    html += '<div style="flex:1;min-width:0">';
    html += '<div style="font-weight:600;font-size:13px">' + esc(s.name) + '</div>';
    html += '<div style="font-size:11px;color:var(--color-text-muted);margin-top:2px">' + esc(s.type) + (s.type === 'stdio' ? ' — ' + esc(s.command || '') : ' — ' + esc(s.url || '')) + '</div>';
    html += '</div>';
    html += '<div style="display:flex;align-items:center;gap:6px;font-size:12px"><span style="width:8px;height:8px;border-radius:50%;background:' + statusColor + ';display:inline-block"></span>' + esc(statusLabel);
    if (typeof s.toolCount === 'number') html += ' <span style="color:var(--color-text-muted)">(' + s.toolCount + ' tools)</span>';
    html += '</div>';
    html += '<div style="display:flex;gap:4px">';
    html += '<button class="btn btn-secondary btn-sm" onclick="reconnectMcpServer(' + s.id + ')" title="Reconnect"><i class="fa fa-refresh"></i></button>';
    html += '<button class="btn btn-secondary btn-sm" onclick="editMcpServer(' + s.id + ')" title="Edit"><i class="fa fa-pencil"></i></button>';
    html += '<button class="btn btn-secondary btn-sm" onclick="deleteMcpServer(' + s.id + ')" title="Delete" style="color:var(--color-danger)"><i class="fa fa-trash"></i></button>';
    html += '</div></div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function onMcpTypeChange() {
  var type = document.getElementById('mcpServerType').value;
  document.getElementById('mcpStdioFields').style.display = type === 'stdio' ? '' : 'none';
  document.getElementById('mcpHttpFields').style.display = type === 'http' ? '' : 'none';
}

function openMcpServerModal(server) {
  document.getElementById('mcpServerModalTitle').textContent = server ? 'Edit MCP Server' : 'Add MCP Server';
  document.getElementById('mcpServerEditId').value = server ? server.id : '';
  document.getElementById('mcpServerName').value = server ? server.name : '';
  document.getElementById('mcpServerType').value = server ? server.type : 'stdio';
  if (typeof syncCustomSelect === 'function') syncCustomSelect(document.getElementById('mcpServerType'));
  document.getElementById('mcpServerCommand').value = server ? server.command : '';
  document.getElementById('mcpServerArgs').value = server ? JSON.stringify(server.args || []) : '';
  document.getElementById('mcpServerEnv').value = server ? JSON.stringify(server.env || {}, null, 2) : '';
  document.getElementById('mcpServerUrl').value = server ? server.url : '';
  document.getElementById('mcpServerAuth').value = server ? server.auth_header : '';
  document.getElementById('mcpServerEnabled').checked = server ? server.enabled : true;
  onMcpTypeChange();
  openModal('mcpServerModal');
}

function editMcpServer(id) {
  var s = mcpServersCache.find(function(x) { return x.id === id; });
  if (s) openMcpServerModal(s);
}

async function saveMcpServer() {
  var id = document.getElementById('mcpServerEditId').value;
  var name = document.getElementById('mcpServerName').value.trim();
  if (!name) return toast('Name is required', 'error');
  var type = document.getElementById('mcpServerType').value;
  var body = { name: name, type: type, enabled: document.getElementById('mcpServerEnabled').checked };
  if (type === 'stdio') {
    body.command = document.getElementById('mcpServerCommand').value.trim();
    if (!body.command) return toast('Command is required', 'error');
    try { body.args = JSON.parse(document.getElementById('mcpServerArgs').value || '[]'); } catch (e) { return toast('Invalid args JSON', 'error'); }
    try { body.env = JSON.parse(document.getElementById('mcpServerEnv').value || '{}'); } catch (e) { return toast('Invalid env JSON', 'error'); }
  } else {
    body.url = document.getElementById('mcpServerUrl').value.trim();
    if (!body.url) return toast('URL is required', 'error');
    body.auth_header = document.getElementById('mcpServerAuth').value.trim();
  }
  try {
    var url = id ? API + '/api/mcp/servers/' + id : API + '/api/mcp/servers';
    var res = await fetch(url, { method: id ? 'PUT' : 'POST', headers: CSRF_HEADERS, body: JSON.stringify(body) });
    if (!res.ok) { var e = await res.json(); throw new Error(e.error || 'Failed'); }
    closeModal('mcpServerModal');
    toast(id ? 'MCP server updated' : 'MCP server added', 'success');
    loadMcpServers();
  } catch (e) { toast('Error: ' + e.message, 'error'); }
}

async function deleteMcpServer(id) {
  if (!confirm('Delete this MCP server?')) return;
  try {
    var res = await fetch(API + '/api/mcp/servers/' + id, { method: 'DELETE', headers: CSRF_HEADERS });
    if (!res.ok) throw new Error('Failed');
    toast('MCP server deleted', 'success');
    loadMcpServers();
  } catch (e) { toast('Error: ' + e.message, 'error'); }
}

async function reconnectMcpServer(id) {
  toast('Reconnecting...', 'info');
  try {
    var res = await fetch(API + '/api/mcp/servers/' + id + '/reconnect', { method: 'POST', headers: CSRF_HEADERS });
    if (!res.ok) { var e = await res.json(); throw new Error(e.error || 'Failed'); }
    var data = await res.json();
    toast(data.message || 'Reconnected', 'success');
    loadMcpServers();
  } catch (e) { toast('Error: ' + e.message, 'error'); }
}

// --- AI Chat ---
let aiChatHistory = []; // { role, content }
let aiCurrentConvId = null;
let aiConversationsCache = [];
let aiEnabledMcpServers = null; // null = all, array = specific IDs
let aiChatMcpServersCache = []; // cached server list for toggles

function toggleAiChat() {
  var panel = document.getElementById('aiChatPanel');
  var overlay = document.getElementById('aiChatOverlay');
  var fab = document.getElementById('aiChatFab');
  var isOpen = panel.classList.contains('open');
  panel.classList.toggle('open');
  overlay.classList.toggle('open');
  if (fab) fab.style.display = isOpen ? '' : 'none';
  if (!isOpen) {
    loadAiChatMcpServers();
    if (!aiCurrentConvId) showAiConversationList();
    setTimeout(function() { document.getElementById('aiChatInput').focus(); }, 350);
  }
}

function showChatView() {
  document.getElementById('aiConvList').style.display = 'none';
  document.getElementById('aiChatMessages').style.display = '';
  document.querySelector('.ai-chat-input-area').style.display = '';
}

function showAiConversationList() {
  document.getElementById('aiConvList').style.display = 'flex';
  document.getElementById('aiChatMessages').style.display = 'none';
  document.querySelector('.ai-chat-input-area').style.display = 'none';
  document.getElementById('aiMcpPanel').style.display = 'none';
  document.getElementById('aiChatTitle').textContent = 'AI Chat';
  loadAiConversations();
}

async function loadAiConversations() {
  try {
    var res = await fetch(API + '/api/ai/conversations', { headers: CSRF_HEADERS });
    if (!res.ok) return;
    var data = await res.json();
    aiConversationsCache = data.conversations || [];
    renderAiConversations();
  } catch (e) { console.warn('Failed to load conversations'); }
}

function renderAiConversations() {
  var el = document.getElementById('aiConvListItems');
  if (aiConversationsCache.length === 0) {
    el.innerHTML = '<div style="padding:20px 12px;text-align:center;color:var(--color-text-xmuted);font-size:13px">No conversations yet.<br>Start a new chat!</div>';
    return;
  }
  el.innerHTML = aiConversationsCache.map(function(c) {
    var date = new Date(c.updated_at);
    var timeStr = date.toLocaleDateString(undefined, { month:'short', day:'numeric' }) + ' ' + date.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' });
    var msgCount = c.message_count || 0;
    return '<div class="ai-conv-item" onclick="loadAiConversation(' + c.id + ')">'
      + '<div class="ai-conv-item-info">'
      + '<div class="ai-conv-item-title">' + escapeHtml(c.title) + '</div>'
      + '<div class="ai-conv-item-meta">' + timeStr + ' &middot; ' + msgCount + ' msgs</div>'
      + '</div>'
      + '<button class="ai-conv-item-delete" onclick="event.stopPropagation();deleteAiConversation(' + c.id + ')" title="Delete">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>'
      + '</button></div>';
  }).join('');
}

async function startNewAiChat() {
  aiChatHistory = [];
  aiCurrentConvId = null;
  aiEnabledMcpServers = null;
  document.getElementById('aiChatTitle').textContent = 'New Chat';
  var el = document.getElementById('aiChatMessages');
  el.innerHTML = '<div class="ai-chat-msg assistant">Hello! I can help you with your n8n instance. Ask me about your workflows, executions, credentials, or anything else.</div>';
  showChatView();
  renderMcpToggles();
  document.getElementById('aiChatInput').focus();
}

async function loadAiConversation(id) {
  try {
    var res = await fetch(API + '/api/ai/conversations/' + id, { headers: CSRF_HEADERS });
    if (!res.ok) return;
    var conv = await res.json();
    aiCurrentConvId = conv.id;
    aiChatHistory = conv.messages || [];
    aiEnabledMcpServers = conv.enabled_mcp_servers || null;
    document.getElementById('aiChatTitle').textContent = conv.title;
    // Render messages
    var el = document.getElementById('aiChatMessages');
    el.innerHTML = '<div class="ai-chat-msg assistant">Hello! I can help you with your n8n instance. Ask me about your workflows, executions, credentials, or anything else.</div>';
    for (var m of aiChatHistory) {
      appendChatMsg(m.role, m.content);
    }
    showChatView();
    renderMcpToggles();
    el.scrollTop = el.scrollHeight;
  } catch (e) { toast('Failed to load conversation', 'error'); }
}

async function deleteAiConversation(id) {
  if (!confirm('Delete this conversation?')) return;
  try {
    await fetch(API + '/api/ai/conversations/' + id, { method: 'DELETE', headers: CSRF_HEADERS });
    if (aiCurrentConvId === id) { aiCurrentConvId = null; aiChatHistory = []; }
    loadAiConversations();
  } catch (e) { toast('Failed to delete', 'error'); }
}

async function saveAiConversation() {
  if (!aiChatHistory.length) return;
  var firstUserMsg = aiChatHistory.find(function(m) { return m.role === 'user'; });
  var title = firstUserMsg ? firstUserMsg.content.substring(0, 60) : 'New Chat';
  if (firstUserMsg && firstUserMsg.content.length > 60) title += '...';
  try {
    if (aiCurrentConvId) {
      // Update existing
      var res = await fetch(API + '/api/ai/conversations/' + aiCurrentConvId, {
        method: 'PUT', headers: CSRF_HEADERS,
        body: JSON.stringify({ title: title, messages: aiChatHistory, enabledMcpServers: aiEnabledMcpServers }),
      });
      if (!res.ok) console.warn('Save failed:', res.status);
    } else {
      // Create new with messages included
      var res = await fetch(API + '/api/ai/conversations', {
        method: 'POST', headers: CSRF_HEADERS,
        body: JSON.stringify({ title: title, enabledMcpServers: aiEnabledMcpServers }),
      });
      if (res.ok) {
        var conv = await res.json();
        aiCurrentConvId = conv.id;
        // Now save the messages
        var res2 = await fetch(API + '/api/ai/conversations/' + aiCurrentConvId, {
          method: 'PUT', headers: CSRF_HEADERS,
          body: JSON.stringify({ messages: aiChatHistory }),
        });
        if (!res2.ok) console.warn('Save messages failed:', res2.status);
      } else {
        console.warn('Create conversation failed:', res.status, await res.text());
      }
    }
    document.getElementById('aiChatTitle').textContent = title;
  } catch (e) { console.warn('Auto-save failed:', e); }
}

// MCP server toggles
async function loadAiChatMcpServers() {
  try {
    var res = await fetch(API + '/api/mcp/servers', { headers: CSRF_HEADERS });
    if (!res.ok) return;
    var data = await res.json();
    aiChatMcpServersCache = (data.servers || []).filter(function(s) { return s.enabled && s.status === 'connected'; });
    renderMcpToggles();
  } catch (e) {}
}

function renderMcpToggles() {
  var el = document.getElementById('aiMcpToggles');
  if (!aiChatMcpServersCache.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--color-text-xmuted);padding:4px 0">No MCP servers connected</div>';
    return;
  }
  el.innerHTML = aiChatMcpServersCache.map(function(s) {
    var checked = !aiEnabledMcpServers || aiEnabledMcpServers.includes(s.id);
    return '<div class="ai-mcp-toggle">'
      + '<input type="checkbox" id="aiMcp_' + s.id + '" ' + (checked ? 'checked' : '') + ' onchange="onMcpToggleChange()">'
      + '<label for="aiMcp_' + s.id + '">' + escapeHtml(s.name) + '</label>'
      + '<span class="ai-mcp-tools">' + (s.toolCount || 0) + ' tools</span>'
      + '</div>';
  }).join('');
}

function onMcpToggleChange() {
  var all = true;
  var ids = [];
  aiChatMcpServersCache.forEach(function(s) {
    var cb = document.getElementById('aiMcp_' + s.id);
    if (cb && cb.checked) ids.push(s.id);
    else all = false;
  });
  aiEnabledMcpServers = all ? null : ids;
  // Auto-save preference if conversation exists
  if (aiCurrentConvId) {
    fetch(API + '/api/ai/conversations/' + aiCurrentConvId, {
      method: 'PUT', headers: CSRF_HEADERS,
      body: JSON.stringify({ enabledMcpServers: aiEnabledMcpServers }),
    }).catch(function() {});
  }
}

function toggleMcpPanel() {
  var panel = document.getElementById('aiMcpPanel');
  panel.style.display = panel.style.display === 'none' ? '' : 'none';
}

function appendChatMsg(role, text) {
  var el = document.getElementById('aiChatMessages');
  var div = document.createElement('div');
  div.className = 'ai-chat-msg ' + role;
  if (role === 'assistant') {
    div.innerHTML = formatChatMarkdown(text);
  } else {
    div.textContent = text;
  }
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
  return div;
}

function formatChatMarkdown(text) {
  var html = escapeHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
    return '<pre><code>' + code.trim() + '</code></pre>';
  });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return html;
}

async function sendAiChat() {
  var input = document.getElementById('aiChatInput');
  var msg = input.value.trim();
  if (!msg) return;

  input.value = '';
  appendChatMsg('user', msg);
  aiChatHistory.push({ role: 'user', content: msg });

  var sendBtn = document.getElementById('aiChatSendBtn');
  sendBtn.disabled = true;
  input.disabled = true;

  var typingEl = document.createElement('div');
  typingEl.className = 'ai-chat-typing';
  typingEl.innerHTML = '<span class="ai-loading-inline"><span class="ai-spinner"></span> Thinking...</span>';
  document.getElementById('aiChatMessages').appendChild(typingEl);
  document.getElementById('aiChatMessages').scrollTop = document.getElementById('aiChatMessages').scrollHeight;

  try {
    var res = await fetch(API + '/api/ai/chat', {
      method: 'POST',
      headers: { ...CSRF_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: aiChatHistory, enabledMcpServers: aiEnabledMcpServers }),
    });
    if (!res.ok) {
      var err = await res.json();
      throw new Error(err.error || 'Chat failed');
    }
    var data = await res.json();

    if (data.toolCalls && data.toolCalls.length > 0) {
      for (var tc of data.toolCalls) {
        appendChatMsg('tool-info', 'Used tool: ' + tc.tool);
      }
    }

    if (data.reply) {
      appendChatMsg('assistant', data.reply);
      aiChatHistory.push({ role: 'assistant', content: data.reply });
    }

    // Auto-save after every exchange
    saveAiConversation();
  } catch (e) {
    appendChatMsg('error', 'Error: ' + e.message);
  } finally {
    if (typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
    sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
  }
}


// --- AI Feature Functions ---

async function aiRenameN8nWorkflow(wfId) {
  var wf = n8nWorkflowsCache.find(function(w) { return w.id === wfId || w.id === String(wfId); });
  if (!wf) return toast('Workflow not found', 'error');
  // Find and animate the button
  var btn = event && event.target ? event.target.closest('.ai-gen-btn') : null;
  var oldBtnHtml = '';
  if (btn) { oldBtnHtml = btn.innerHTML; btn.innerHTML = '<span class="ai-spinner"></span> Renaming...'; btn.classList.add('ai-loading'); }
  try {
    var res = await fetch(API + '/api/ai/name-workflow', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ nodes: wf.nodes || [], connections: wf.connections || {} }),
    });
    if (!res.ok) { var e = await res.json(); throw new Error(e.error || 'Failed'); }
    var data = await res.json();
    if (!data.name) { if (btn) { btn.innerHTML = oldBtnHtml; btn.classList.remove('ai-loading'); } return toast('No name generated', 'error'); }

    // Update the workflow name in n8n via proxy
    var s = getSettings();
    var updateRes = await fetch(API + '/api/n8n-proxy', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({
        n8nUrl: s.n8nUrl,
        apiKey: s.apiKey,
        path: '/api/v1/workflows/' + wfId,
        method: 'PATCH',
        body: { name: data.name },
      }),
    });
    if (updateRes.ok) {
      wf.name = data.name;
      renderN8nWorkflows();
      toast('Renamed to: ' + data.name, 'success');
    } else {
      toast('Suggested name: ' + data.name, 'success', 8000);
    }
  } catch (e) {
    toast('AI error: ' + e.message, 'error');
  } finally {
    if (btn) { btn.innerHTML = oldBtnHtml; btn.classList.remove('ai-loading'); }
  }
}

async function aiGenerateImportName() {
  var btn = document.getElementById('aiGenImportName');
  var oldText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="ai-spinner"></span> Generating...'; btn.classList.add('ai-loading');
  try {
    var wfData = JSON.parse(document.getElementById('importWorkflowData').value || '{}');
    var res = await fetch(API + '/api/ai/name-workflow', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ nodes: wfData.nodes || [], connections: wfData.connections || {} }),
    });
    if (!res.ok) { var e = await res.json(); throw new Error(e.error || 'Failed'); }
    var data = await res.json();
    if (data.name) {
      document.getElementById('importName').value = data.name;
      toast('Name generated', 'success');
    }
  } catch (e) {
    toast('AI error: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('ai-loading');
    btn.innerHTML = oldText;
  }
}

async function aiGenerateImportDescription() {
  var btn = document.getElementById('aiGenImportDesc');
  var oldText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="ai-spinner"></span> Generating...'; btn.classList.add('ai-loading');
  try {
    var wfData = JSON.parse(document.getElementById('importWorkflowData').value || '{}');
    var res = await fetch(API + '/api/ai/describe-workflow', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ nodes: wfData.nodes || [], connections: wfData.connections || {} }),
    });
    if (!res.ok) { var e = await res.json(); throw new Error(e.error || 'Failed'); }
    var data = await res.json();
    if (data.description) {
      setEditorContent('importDescription', data.description);
      toast('Description generated', 'success');
    }
  } catch (e) {
    toast('AI error: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('ai-loading');
    btn.innerHTML = oldText;
  }
}

async function aiDescribeWorkflow(wfId) {
  var wf = monWorkflowCache.find(function(w) { return w.id === wfId; });
  if (!wf) return toast('Workflow not found in cache', 'error');
  var btn = event && event.target ? event.target.closest('.btn') : null;
  var oldBtnHtml = '';
  if (btn) { oldBtnHtml = btn.innerHTML; btn.innerHTML = '<span class="ai-spinner"></span> Describing...'; btn.classList.add('ai-loading'); }
  try {
    var res = await fetch(API + '/api/ai/describe-workflow', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ nodes: wf.nodes || [], connections: wf.connections || {} }),
    });
    if (!res.ok) { var e = await res.json(); throw new Error(e.error || 'Failed'); }
    var data = await res.json();
    toast(data.description || 'No description generated', 'success', 8000);
  } catch (e) {
    toast('AI error: ' + e.message, 'error');
  } finally {
    if (btn) { btn.innerHTML = oldBtnHtml; btn.classList.remove('ai-loading'); }
  }
}

// --- Workflow Documentation Generation ---

async function generateWorkflowDocs(id, source) {
  var wfData, wfName;
  if (source === 'library') {
    var wf = libraryWorkflowCache[id];
    if (!wf) {
      try {
        var res = await fetch(API + '/workflows/templates/' + id);
        var data = await res.json();
        wf = data.workflow || {};
        libraryWorkflowCache[id] = wf;
      } catch { return toast('Failed to load workflow', 'error'); }
    }
    wfData = wf;
    wfName = wf.name || 'Template #' + id;
  } else if (source === 'n8n') {
    var wf = (typeof n8nWorkflowsCache !== 'undefined' ? n8nWorkflowsCache : []).find(function(w) { return w.id === id || w.id === String(id); });
    if (!wf) return toast('Workflow not found', 'error');
    wfData = wf;
    wfName = wf.name || 'Workflow ' + id;
  } else if (source === 'monitoring') {
    var wf = (typeof monWorkflowCache !== 'undefined' ? monWorkflowCache : []).find(function(w) { return w.id === id || w.id === String(id); });
    if (!wf) return toast('Workflow not found', 'error');
    wfData = wf;
    wfName = wf.name || 'Workflow ' + id;
  }
  _generateDocs(wfData, wfName);
}

function generateWorkflowDocsFromEdit() {
  var wf = window._editWorkflowData;
  var name = window._editWorkflowName || 'Untitled';
  if (!wf) return toast('No workflow data', 'error');
  _generateDocs(wf, name);
}

async function _generateDocs(wfData, wfName) {
  document.getElementById('docModalTitle').textContent = 'Documentation: ' + wfName;
  document.getElementById('docWorkflowName').value = wfName;
  document.getElementById('docContent').innerHTML = '<div style="text-align:center;padding:40px;color:var(--color-text-muted)"><div class="ai-spinner" style="width:24px;height:24px;margin:0 auto 12px"></div><p>Generating documentation...</p></div>';
  document.getElementById('docSaveKbBtn').style.display = 'none';
  openModal('docModal');

  try {
    var res = await fetch(API + '/api/ai/document-workflow', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({
        nodes: wfData.nodes || [],
        connections: wfData.connections || {},
        workflowName: wfName,
      }),
    });
    if (!res.ok) { var e = await res.json(); throw new Error(e.error || 'Failed'); }
    var data = await res.json();
    if (data.documentation) {
      document.getElementById('docContent').innerHTML = renderContent(data.documentation);
      document.getElementById('docSaveKbBtn').style.display = '';
      toast('Documentation generated', 'success');
    } else {
      document.getElementById('docContent').innerHTML = '<p style="color:var(--color-text-muted)">No documentation generated</p>';
    }
  } catch (e) {
    document.getElementById('docContent').innerHTML = '<p style="color:var(--color-danger)">Error: ' + esc(e.message) + '</p>';
    toast('Documentation generation failed', 'error');
  }
}

async function saveDocToKb() {
  var wfName = document.getElementById('docWorkflowName').value || 'Workflow Documentation';
  var docHtml = document.getElementById('docContent').innerHTML;
  if (!docHtml || docHtml.includes('Generating documentation')) return toast('No documentation to save', 'error');

  var btn = document.getElementById('docSaveKbBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    var res = await fetch(API + '/api/kb/articles', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({
        title: wfName + ' — Documentation',
        body: docHtml,
        excerpt: 'Auto-generated documentation for the ' + wfName + ' workflow.',
        status: 'draft',
        tags: ['workflow-docs', 'auto-generated'],
      }),
    });
    if (!res.ok) { var e = await res.json(); throw new Error(e.error || 'Failed'); }
    var article = await res.json();
    toast('Saved to Knowledge Base as draft', 'success');
    btn.textContent = 'Saved!';
    btn.onclick = function() { closeModal('docModal'); switchPanel('kb'); viewKbArticle(article.id); };
    btn.textContent = 'View in KB';
    btn.disabled = false;
  } catch (e) {
    toast('Failed to save: ' + e.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Save to Knowledge Base';
  }
}

var lastAiAnalysis = null;

async function aiAnalyzeError(execId) {
  lastAiAnalysis = null;
  // Show loading in analysis container
  var container = document.getElementById('aiAnalysisContainer');
  if (container) {
    container.innerHTML = '<div class="ai-analysis-placeholder"><div class="ai-spinner"></div><div style="color:var(--color-text-muted);font-size:13px">Analyzing error...</div></div>';
  }
  // Animate the button
  var btn = event && event.target ? event.target.closest('.btn') : null;
  var oldBtnHtml = '';
  if (btn) { oldBtnHtml = btn.innerHTML; btn.innerHTML = '<span class="ai-spinner"></span> Analyzing...'; btn.classList.add('ai-loading'); }
  try {
    var detail = currentExecDetail;
    if (!detail) return toast('No execution detail loaded', 'error');
    var failedNode = null;
    var errorMsg = detail.data?.resultData?.error?.message || '';
    var runData = detail.data?.resultData?.runData || {};
    for (var nodeName in runData) {
      var runs = runData[nodeName];
      if (runs && runs[0] && runs[0].error) {
        failedNode = { name: nodeName, type: runs[0].executionData?.node?.type || '' };
        errorMsg = runs[0].error.message || errorMsg;
        break;
      }
    }
    var wfNodes = detail.workflowData?.nodes || [];
    var res = await fetch(API + '/api/ai/analyze-error', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({
        errorMessage: errorMsg,
        failedNodeType: failedNode ? failedNode.type : '',
        failedNodeName: failedNode ? failedNode.name : '',
        workflowNodes: wfNodes,
        workflowConnections: detail.workflowData?.connections || {},
      }),
    });
    if (!res.ok) { var e = await res.json(); throw new Error(e.error || 'Failed'); }
    var data = await res.json();
    lastAiAnalysis = data.analysis || '';
    showAiAnalysis(data);
  } catch (e) {
    toast('AI error: ' + e.message, 'error');
    if (container) container.innerHTML = '';
  } finally {
    if (btn) { btn.innerHTML = oldBtnHtml; btn.classList.remove('ai-loading'); }
  }
}

function showAiAnalysis(data) {
  var html = '<div style="background:var(--color-card);border:1px solid var(--color-border);border-radius:var(--radius);padding:16px;margin-top:12px">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">';
  html += '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:16px">&#10024;</span><strong>AI Error Analysis</strong></div>';
  html += '<button class="btn btn-primary btn-sm" onclick="reportIssueWithAnalysis()"><i class="fa fa-ticket"></i> Report Issue</button>';
  html += '</div>';
  html += '<div style="white-space:pre-wrap;font-size:13px;line-height:1.6;color:var(--color-text)">' + escapeHtml(data.analysis || 'No analysis available') + '</div>';
  if (data.relatedArticles && data.relatedArticles.length) {
    html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--color-border)">';
    html += '<strong style="font-size:12px;color:var(--color-text-muted)">Related KB Articles:</strong><ul style="margin:8px 0 0;padding-left:20px">';
    data.relatedArticles.forEach(function(a) {
      html += '<li><a href="#" onclick="event.preventDefault();switchPanel(\'knowledge-base\');setTimeout(function(){openKbArticle(' + a.id + ')},300)" style="color:var(--color-primary)">' + escapeHtml(a.title) + '</a></li>';
    });
    html += '</ul></div>';
  }
  html += '</div>';
  var container = document.getElementById('aiAnalysisContainer');
  if (container) container.innerHTML = html;
}

function reportIssueWithAnalysis() {
  reportIssueFromExecution();
}

async function sendDailySummary() {
  var btn = event && event.target ? event.target.closest('.btn') : null;
  var oldBtnHtml = '';
  if (btn) { oldBtnHtml = btn.innerHTML; btn.innerHTML = '<span class="ai-spinner"></span> Generating summary...'; btn.classList.add('ai-loading'); }
  try {
    var res = await fetch(API + '/api/monitoring/daily-summary', {
      method: 'POST',
      headers: CSRF_HEADERS,
    });
    if (!res.ok) { var e = await res.json(); throw new Error(e.error || 'Failed'); }
    var data = await res.json();
    toast(data.message || 'Daily summary sent!', 'success');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    if (btn) { btn.innerHTML = oldBtnHtml; btn.classList.remove('ai-loading'); }
  }
}

