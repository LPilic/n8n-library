// --- Users management ---
async function loadUsers() {
  try {
    const res = await fetch(`${API}/api/users`);
    if (!res.ok) return;
    const data = await res.json();
    const container = document.getElementById('usersTableContainer');
    if (!data.users.length) {
      container.innerHTML = '<p style="color:var(--color-text-muted)">No users found.</p>';
      return;
    }
    let html = '<div class="users-card"><table class="users-table"><thead><tr>';
    html += '<th>User</th><th>Role</th><th>Created</th><th style="width:80px"></th>';
    html += '</tr></thead><tbody>';
    for (const u of data.users) {
      const date = new Date(u.created_at).toLocaleDateString();
      const isSelf = currentUser && currentUser.id === u.id;
      const initial = (u.username || u.email).charAt(0).toUpperCase();
      const displayName = esc(u.username || u.email.split('@')[0]);
      html += '<tr>';
      html += '<td><div class="user-identity">';
      html += '<div class="user-avatar">' + esc(initial) + '</div>';
      html += '<div><div class="user-name">' + displayName + (isSelf ? '<span class="you-tag">you</span>' : '') + '</div>';
      html += '<div class="user-email">' + esc(u.email) + '</div></div>';
      html += '</div></td>';
      html += '<td><span class="role-badge ' + u.role + '">' + u.role + '</span></td>';
      html += '<td style="color:var(--color-text-muted);font-size:12px">' + date + '</td>';
      html += '<td><div class="row-actions">';
      html += '<button title="Edit" onclick="editUser(' + u.id + ',\'' + esc(u.username) + '\',\'' + esc(u.email || '') + '\',\'' + u.role + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>';
      if (!isSelf) {
        html += '<button class="delete-btn" title="Delete" onclick="deleteUser(' + u.id + ',\'' + esc(u.username) + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
      }
      html += '</div></td>';
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    container.innerHTML = html;
  } catch (e) {
    console.error('Failed to load users:', e);
  }
}

function openUserModal(id, username, email, role) {
  const isEdit = !!id;
  document.getElementById('userModalTitle').textContent = isEdit ? 'Edit User' : 'Add User';
  document.getElementById('editUserId').value = id || '';
  document.getElementById('newEmail').value = email || '';
  document.getElementById('newUsername').value = username || '';
  document.getElementById('newPassword').value = '';
  document.getElementById('newPassword').placeholder = isEdit ? 'Leave blank to keep current' : 'Password';
  document.getElementById('newRole').value = role || 'viewer';
  if (typeof syncCustomSelect === 'function') syncCustomSelect(document.getElementById('newRole'));
  openModal('userModal');
  setTimeout(() => document.getElementById('newEmail').focus(), 100);
}

function editUser(id, username, email, role) {
  openUserModal(id, username, email, role);
}

async function saveUser() {
  const id = document.getElementById('editUserId').value;
  const username = document.getElementById('newUsername').value.trim();
  const email = document.getElementById('newEmail').value.trim();
  const password = document.getElementById('newPassword').value;
  const role = document.getElementById('newRole').value;

  if (!id && (!email || !password)) {
    return toast('Email and password required', 'error');
  }

  try {
    let res;
    if (id) {
      const body = { username, email, role };
      if (password) body.password = password;
      res = await fetch(`${API}/api/users/${id}`, {
        method: 'PUT',
        headers: CSRF_HEADERS,
        body: JSON.stringify(body),
      });
    } else {
      res = await fetch(`${API}/api/users`, {
        method: 'POST',
        headers: CSRF_HEADERS,
        body: JSON.stringify({ username, email, password, role }),
      });
    }
    if (!res.ok) {
      const data = await res.json();
      return toast(data.error || 'Failed to save user', 'error');
    }
    toast(id ? 'User updated' : 'User created', 'success');
    closeModal('userModal');
    loadUsers();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function deleteUser(id, username) {
  if (!confirm('Delete user "' + username + '"?')) return;
  try {
    const res = await fetch(`${API}/api/users/${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (!res.ok) {
      const data = await res.json();
      return toast(data.error || 'Failed to delete', 'error');
    }
    toast('User deleted', 'success');
    loadUsers();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

// --- Settings ---
function getSettings() {
  return JSON.parse(localStorage.getItem('n8nLibSettings') || '{}');
}
function saveSettings() {
  // Legacy — kept for compatibility
  localStorage.setItem('n8nLibSettings', JSON.stringify(getSettings()));
}
function loadSettings() {
  loadBranding();
  loadInstances();
  loadApiKeys();
  if (currentUser && currentUser.role === 'admin') { loadSmtpSettings(); loadEmailTemplates(); loadMcpServerStatus(); if (typeof loadAlerts === 'function') loadAlerts(); }
}

// --- n8n Instance Management ---
var instancesCache = [];
var activeInstanceId = null;

async function loadInstances() {
  try {
    var res = await fetch(API + '/api/instances', { headers: CSRF_HEADERS });
    if (!res.ok) return;
    instancesCache = await res.json();
    renderInstancesList();
    renderInstanceSelector();
    // Auto-select: saved preference → default → first
    var saved = localStorage.getItem('activeInstanceId');
    var def = instancesCache.find(function(i) { return i.is_default; });
    var target = null;
    if (saved) target = instancesCache.find(function(i) { return i.id === Number(saved); });
    if (!target) target = def || instancesCache[0] || null;
    if (target) selectInstance(target.id, true);
  } catch (e) {}
}

function selectInstance(id, silent) {
  activeInstanceId = id;
  localStorage.setItem('activeInstanceId', id);
  renderInstanceSelector();
  // Update connection status
  var inst = instancesCache.find(function(i) { return i.id === id; });
  if (inst) {
    // Also update legacy settings for backward compat
    var s = getSettings();
    s.n8nUrl = inst.internal_url;
    s.apiKey = inst.api_key;
    localStorage.setItem('n8nLibSettings', JSON.stringify(s));
    updateConnectionStatus();
  }
  if (!silent) {
    toast('Switched to ' + (inst ? inst.name : 'instance'), 'success');
    // Reload monitoring/observability if active
    var activePanel = document.querySelector('.panel.active');
    if (activePanel) {
      var id2 = activePanel.id;
      if (id2 === 'panel-monitoring') { loadMonitoringExecutions(true); }
      if (id2 === 'panel-observability') { loadObservability(); }
    }
  }
}

function getActiveInstanceParam() {
  return activeInstanceId ? 'instance_id=' + activeInstanceId : '';
}

function renderInstanceSelector() {
  var sel = document.getElementById('instanceSelector');
  var dot = document.getElementById('instanceDot');
  var name = document.getElementById('instanceName');
  var badge = document.getElementById('instanceBadge');
  var menu = document.getElementById('instanceMenu');
  if (!instancesCache.length) { sel.style.display = 'none'; return; }
  sel.style.display = '';
  var active = instancesCache.find(function(i) { return i.id === activeInstanceId; }) || instancesCache[0];
  dot.style.background = active.color || envColor(active.environment);
  name.textContent = active.name;
  badge.textContent = envLabel(active.environment);
  badge.style.background = (active.color || envColor(active.environment)) + '20';
  badge.style.color = active.color || envColor(active.environment);
  badge.style.borderColor = (active.color || envColor(active.environment)) + '40';

  var html = '';
  for (var i = 0; i < instancesCache.length; i++) {
    var inst = instancesCache[i];
    var isActive = inst.id === activeInstanceId;
    html += '<div class="instance-menu-item' + (isActive ? ' active' : '') + '" onclick="selectInstance(' + inst.id + ');closeInstanceDropdown()">';
    html += '<span class="instance-env-dot" style="background:' + (inst.color || envColor(inst.environment)) + '"></span>';
    html += '<span>' + escapeHtml(inst.name) + '</span>';
    html += '<span class="instance-item-env">' + envLabel(inst.environment) + '</span>';
    html += '</div>';
  }
  menu.innerHTML = html;
}

function toggleInstanceDropdown() {
  document.getElementById('instanceSelector').classList.toggle('open');
}
function closeInstanceDropdown() {
  document.getElementById('instanceSelector').classList.remove('open');
}
document.addEventListener('click', function(e) {
  if (!e.target.closest('.instance-selector')) closeInstanceDropdown();
});

function envColor(env) {
  var colors = { production: '#22c55e', staging: '#f59e0b', development: '#3b82f6', testing: '#8b5cf6' };
  return colors[env] || '#6b7280';
}
function envLabel(env) {
  var labels = { production: 'PROD', staging: 'STG', development: 'DEV', testing: 'TEST' };
  return labels[env] || env.toUpperCase();
}

function renderInstancesList() {
  var el = document.getElementById('instancesList');
  if (!el) return;
  if (!instancesCache.length) {
    el.innerHTML = '<p style="color:var(--color-text-muted);font-size:13px;padding:8px 0">No instances configured. Add one to get started.</p>';
    return;
  }
  var html = '';
  for (var i = 0; i < instancesCache.length; i++) {
    var inst = instancesCache[i];
    var c = inst.color || envColor(inst.environment);
    html += '<div class="instance-list-item">';
    html += '<span class="instance-list-dot" style="background:' + c + '"></span>';
    html += '<div class="instance-list-info">';
    html += '<div class="instance-list-name">' + escapeHtml(inst.name) + '</div>';
    html += '<div class="instance-list-url">' + escapeHtml(inst.internal_url) + '</div>';
    html += '</div>';
    html += '<div class="instance-list-badges">';
    html += '<span class="instance-list-env" style="background:' + c + '">' + envLabel(inst.environment) + '</span>';
    if (inst.is_default) html += '<span class="instance-list-default">DEFAULT</span>';
    html += '</div>';
    html += '<div class="instance-list-actions">';
    html += '<button class="btn btn-secondary btn-sm" onclick="openInstanceModal(instancesCache[' + i + '])"><i class="fa fa-pencil"></i></button>';
    html += '<button class="btn btn-secondary btn-sm" onclick="deleteInstance(' + inst.id + ')" style="color:var(--color-danger)"><i class="fa fa-trash"></i></button>';
    html += '</div>';
    html += '</div>';
  }
  el.innerHTML = html;
}

function openInstanceModal(inst) {
  document.getElementById('instanceModalTitle').textContent = inst ? 'Edit Instance' : 'Add Instance';
  document.getElementById('instanceEditId').value = inst ? inst.id : '';
  document.getElementById('instanceNameInput').value = inst ? inst.name : '';
  document.getElementById('instanceEnv').value = inst ? inst.environment : 'production';
  if (typeof syncCustomSelect === 'function') syncCustomSelect(document.getElementById('instanceEnv'));
  document.getElementById('instanceUrl').value = inst ? inst.internal_url : '';
  document.getElementById('instanceApiKey').value = inst ? inst.api_key : '';
  document.getElementById('instanceColor').value = inst ? (inst.color || '#22c55e') : '#22c55e';
  document.getElementById('instanceDefault').checked = inst ? inst.is_default : false;
  // Workers
  var container = document.getElementById('instanceWorkersContainer');
  container.innerHTML = '';
  var workers = (inst && inst.workers) || [];
  for (var i = 0; i < workers.length; i++) addWorkerRow(workers[i]);
  openModal('instanceModal');
}

function addWorkerRow(w) {
  var container = document.getElementById('instanceWorkersContainer');
  var row = document.createElement('div');
  row.className = 'instance-worker-row';
  row.innerHTML =
    '<input type="text" class="form-input worker-name" placeholder="Name (e.g. Worker 1)" value="' + esc((w && w.name) || '') + '" style="flex:1;min-width:100px">' +
    '<input type="text" class="form-input worker-url" placeholder="http://n8n-worker:5678" value="' + esc((w && w.url) || '') + '" style="flex:2;min-width:180px">' +
    '<button type="button" class="btn btn-secondary btn-sm" onclick="this.parentElement.remove()" style="flex-shrink:0;padding:6px 8px"><i class="fa fa-trash"></i></button>';
  container.appendChild(row);
}

function getWorkersFromModal() {
  var rows = document.querySelectorAll('#instanceWorkersContainer .instance-worker-row');
  var workers = [];
  rows.forEach(function(row) {
    var name = row.querySelector('.worker-name').value.trim();
    var url = row.querySelector('.worker-url').value.trim().replace(/\/+$/, '');
    if (url) workers.push({ name: name || ('Worker ' + (workers.length + 1)), url: url });
  });
  return workers;
}

async function saveInstance() {
  var id = document.getElementById('instanceEditId').value;
  var body = {
    name: document.getElementById('instanceNameInput').value.trim(),
    environment: document.getElementById('instanceEnv').value,
    internal_url: document.getElementById('instanceUrl').value.trim().replace(/\/+$/, ''),
    api_key: document.getElementById('instanceApiKey').value,
    color: document.getElementById('instanceColor').value,
    is_default: document.getElementById('instanceDefault').checked,
    workers: getWorkersFromModal(),
  };
  if (!body.name || !body.internal_url) return toast('Name and URL are required', 'error');
  try {
    var url = id ? API + '/api/instances/' + id : API + '/api/instances';
    var method = id ? 'PUT' : 'POST';
    var res = await fetch(url, { method: method, headers: CSRF_HEADERS, body: JSON.stringify(body) });
    if (!res.ok) { var e = await res.json(); throw new Error(e.error || 'Failed'); }
    toast(id ? 'Instance updated' : 'Instance added', 'success');
    closeModal('instanceModal');
    loadInstances();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteInstance(id) {
  if (!confirm('Delete this instance?')) return;
  try {
    var res = await fetch(API + '/api/instances/' + id, { method: 'DELETE', headers: CSRF_HEADERS });
    if (!res.ok) throw new Error('Failed');
    toast('Instance deleted', 'success');
    if (activeInstanceId === id) activeInstanceId = null;
    loadInstances();
  } catch (e) { toast(e.message, 'error'); }
}

async function loadSmtpSettings() {
  try {
    const res = await fetch(`${API}/api/settings/smtp`);
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('smtpHost').value = data.smtp_host || '';
    document.getElementById('smtpPort').value = data.smtp_port || '25';
    document.getElementById('smtpUser').value = data.smtp_user || '';
    document.getElementById('smtpPass').value = data.smtp_pass || '';
    document.getElementById('smtpFrom').value = data.smtp_from || '';
    document.getElementById('appUrl').value = data.app_url || '';
    document.getElementById('smtpStatus').textContent = data.source === 'database' ? 'Saved in database' : (data.smtp_host ? 'From environment' : '');
  } catch (e) {
    console.warn('Could not load SMTP settings');
  }
}

async function saveSmtpSettings() {
  try {
    const body = {
      smtp_host: document.getElementById('smtpHost').value.trim(),
      smtp_port: document.getElementById('smtpPort').value.trim() || '25',
      smtp_user: document.getElementById('smtpUser').value.trim(),
      smtp_pass: document.getElementById('smtpPass').value,
      smtp_from: document.getElementById('smtpFrom').value.trim(),
      app_url: document.getElementById('appUrl').value.trim().replace(/\/+$/, ''),
    };
    const res = await fetch(`${API}/api/settings/smtp`, {
      method: 'PUT',
      headers: CSRF_HEADERS,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      return toast(data.error || 'Failed to save', 'error');
    }
    toast('SMTP settings saved', 'success');
    document.getElementById('smtpStatus').textContent = 'Saved in database';
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function testSmtp() {
  const to = (currentUser && currentUser.email) || prompt('Send test email to:');
  if (!to) return;
  document.getElementById('smtpStatus').textContent = 'Sending...';
  try {
    const res = await fetch(`${API}/api/settings/smtp/test`, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ to }),
    });
    const data = await res.json();
    if (!res.ok) {
      document.getElementById('smtpStatus').textContent = '';
      return toast(data.error || 'Failed to send', 'error');
    }
    document.getElementById('smtpStatus').textContent = '';
    toast(data.message, 'success');
  } catch (e) {
    document.getElementById('smtpStatus').textContent = '';
    toast('Error: ' + e.message, 'error');
  }
}

// --- Email Templates ---
let emailTemplatesCache = {};

const EMAIL_TPL_GLOBAL_VARS = [
  { name: 'app_name', desc: 'Application name from Layout/Design settings' },
  { name: 'primary_color', desc: 'Primary brand color (hex)' },
  { name: 'primary_hover', desc: 'Primary hover color (hex)' },
  { name: 'logo_url', desc: 'Logo image URL (data URI or URL)' },
];

const EMAIL_TPL_VARS = {
  password_reset: [
    { name: 'username', desc: 'Name of the user requesting the reset' },
    { name: 'reset_url', desc: 'Password reset link (valid for 1 hour)' },
  ],
  test_email: [],
  ticket_new: [
    { name: 'ticket_id', desc: 'Ticket number' },
    { name: 'ticket_title', desc: 'Ticket title' },
    { name: 'ticket_description', desc: 'Ticket description (first 200 chars)' },
    { name: 'ticket_priority', desc: 'Priority level (low/medium/high/critical)' },
    { name: 'creator_name', desc: 'Name of the user who created the ticket' },
    { name: 'ticket_url', desc: 'Direct link to the ticket' },
  ],
  ticket_status: [
    { name: 'ticket_id', desc: 'Ticket number' },
    { name: 'ticket_title', desc: 'Ticket title' },
    { name: 'old_status', desc: 'Previous status' },
    { name: 'new_status', desc: 'New status' },
    { name: 'ticket_url', desc: 'Direct link to the ticket' },
  ],
  ticket_comment: [
    { name: 'ticket_id', desc: 'Ticket number' },
    { name: 'ticket_title', desc: 'Ticket title' },
    { name: 'commenter_name', desc: 'Name of the commenter' },
    { name: 'comment_body', desc: 'Comment text (first 300 chars)' },
    { name: 'ticket_url', desc: 'Direct link to the ticket' },
  ],
  ticket_assignment: [
    { name: 'ticket_id', desc: 'Ticket number' },
    { name: 'ticket_title', desc: 'Ticket title' },
    { name: 'ticket_priority', desc: 'Priority level' },
    { name: 'ticket_status', desc: 'Current status' },
    { name: 'ticket_url', desc: 'Direct link to the ticket' },
  ],
  daily_summary: [
    { name: 'total_count', desc: 'Total executions in last 24h' },
    { name: 'success_count', desc: 'Successful executions' },
    { name: 'error_count', desc: 'Failed executions' },
    { name: 'running_count', desc: 'Currently running executions' },
    { name: 'success_rate', desc: 'Success percentage' },
    { name: 'top_failing', desc: 'HTML list of top failing workflows' },
    { name: 'longest_running', desc: 'HTML list of longest running workflows' },
    { name: 'ai_summary', desc: 'AI-generated narrative summary (HTML block)' },
    { name: 'generated_at', desc: 'Timestamp when summary was generated' },
  ],
};

function getVarsForTemplate(key) {
  return [...EMAIL_TPL_GLOBAL_VARS, ...(EMAIL_TPL_VARS[key] || [])];
}

function renderVarsTable(key) {
  var vars = getVarsForTemplate(key);
  if (!vars.length) return '<em>No variables available</em>';
  var rows = vars.map(function(v) {
    return '<tr><td style="padding:3px 8px 3px 0;font-family:monospace;font-size:12px;color:var(--color-primary);white-space:nowrap;cursor:pointer" onclick="insertTplVar(\'' + v.name + '\')" title="Click to insert">{{' + v.name + '}}</td><td style="padding:3px 0;font-size:12px;color:var(--color-text-muted)">' + v.desc + '</td></tr>';
  });
  return '<table style="width:100%;border-collapse:collapse">' + rows.join('') + '</table>';
}

function insertTplVar(varName) {
  // Insert into whichever field was last focused, or body by default
  var el = document.activeElement;
  if (el && (el.id === 'emailTplSubject' || el.id === 'emailTplBody')) {
    insertAtCursor(el, '{{' + varName + '}}');
  } else {
    insertAtCursor(document.getElementById('emailTplBody'), '{{' + varName + '}}');
  }
  debouncedPreviewEmailTemplate();
}

function insertAtCursor(el, text) {
  var start = el.selectionStart, end = el.selectionEnd;
  var val = el.value;
  el.value = val.substring(0, start) + text + val.substring(end);
  el.selectionStart = el.selectionEnd = start + text.length;
  el.focus();
}

// Autocomplete for {{ in subject/body fields
var _acEl = null, _acTarget = null, _acVars = [];

function initTplAutocomplete() {
  var ac = document.createElement('div');
  ac.id = 'tplAutocomplete';
  ac.style.cssText = 'display:none;position:absolute;z-index:9999;background:var(--color-bg-light);border:1px solid var(--color-border);border-radius:var(--radius);box-shadow:var(--shadow);max-height:200px;overflow-y:auto;min-width:220px';
  document.body.appendChild(ac);
  _acEl = ac;

  document.addEventListener('click', function(e) {
    if (_acEl && !_acEl.contains(e.target)) _acEl.style.display = 'none';
  });
}

function onTplFieldInput(e) {
  var el = e.target;
  var val = el.value;
  var pos = el.selectionStart;
  // Find {{ before cursor
  var before = val.substring(0, pos);
  var match = before.match(/\{\{(\w*)$/);
  if (!match) { if (_acEl) _acEl.style.display = 'none'; return; }
  var partial = match[1].toLowerCase();
  var key = document.getElementById('emailTplSelect').value;
  var allVars = getVarsForTemplate(key);
  var filtered = allVars.filter(function(v) { return v.name.toLowerCase().indexOf(partial) !== -1; });
  if (!filtered.length) { _acEl.style.display = 'none'; return; }
  _acTarget = el;
  _acVars = filtered;
  // Position dropdown
  if (!_acEl) initTplAutocomplete();
  var rect = el.getBoundingClientRect();
  // Approximate caret position
  _acEl.style.left = (rect.left + Math.min(pos * 7, rect.width - 40)) + 'px';
  if (el.tagName === 'TEXTAREA') {
    var linesBefore = val.substring(0, pos).split('\n');
    var lineIdx = linesBefore.length - 1;
    _acEl.style.top = (rect.top + Math.min(lineIdx * 18 + 24, rect.height) + window.scrollY) + 'px';
  } else {
    _acEl.style.top = (rect.bottom + window.scrollY) + 'px';
  }
  _acEl.innerHTML = filtered.map(function(v, i) {
    return '<div style="padding:6px 10px;cursor:pointer;font-size:12px;display:flex;gap:8px;align-items:baseline" onmousedown="selectTplAcItem(' + i + ')" onmouseover="this.style.background=\'var(--color-bg)\'" onmouseout="this.style.background=\'none\'">'
      + '<span style="font-family:monospace;color:var(--color-primary);flex-shrink:0">{{' + v.name + '}}</span>'
      + '<span style="color:var(--color-text-muted);font-size:11px">' + v.desc + '</span></div>';
  }).join('');
  _acEl.style.display = 'block';
}

function selectTplAcItem(idx) {
  var v = _acVars[idx];
  if (!v || !_acTarget) return;
  var el = _acTarget;
  var pos = el.selectionStart;
  var val = el.value;
  var before = val.substring(0, pos);
  // Replace the partial {{ match
  var newBefore = before.replace(/\{\{\w*$/, '{{' + v.name + '}}');
  el.value = newBefore + val.substring(pos);
  el.selectionStart = el.selectionEnd = newBefore.length;
  el.focus();
  _acEl.style.display = 'none';
  debouncedPreviewEmailTemplate();
}

// Initialize autocomplete on load
document.addEventListener('DOMContentLoaded', initTplAutocomplete);

async function loadEmailTemplates() {
  try {
    const res = await fetch(API + '/api/settings/email-templates');
    if (!res.ok) return;
    const data = await res.json();
    emailTemplatesCache = data.templates || {};
    const sel = document.getElementById('emailTplSelect');
    // Keep first option, remove rest
    while (sel.options.length > 1) sel.remove(1);
    for (const [key, tpl] of Object.entries(emailTemplatesCache)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = tpl.label;
      sel.appendChild(opt);
    }
    if (typeof refreshCustomSelect === 'function') refreshCustomSelect(sel);
  } catch (e) {}
}

function onEmailTplChange() {
  var key = document.getElementById('emailTplSelect').value;
  var editor = document.getElementById('emailTplEditor');
  if (!key || !emailTemplatesCache[key]) { editor.style.display = 'none'; return; }
  editor.style.display = '';
  document.getElementById('emailTplSubject').value = emailTemplatesCache[key].subject;
  document.getElementById('emailTplBody').value = emailTemplatesCache[key].body;
  document.getElementById('emailTplVarsHint').innerHTML = renderVarsTable(key);
  document.getElementById('emailTplStatus').textContent = '';
  previewEmailTemplate();
}

var _emailPreviewTimer;
function debouncedPreviewEmailTemplate() {
  clearTimeout(_emailPreviewTimer);
  _emailPreviewTimer = setTimeout(previewEmailTemplate, 500);
}

async function saveEmailTemplate() {
  var key = document.getElementById('emailTplSelect').value;
  if (!key) return;
  var subject = document.getElementById('emailTplSubject').value;
  var body = document.getElementById('emailTplBody').value;
  document.getElementById('emailTplStatus').textContent = 'Saving...';
  try {
    var res = await fetch(API + '/api/settings/email-templates', {
      method: 'PUT',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ templates: { [key]: { subject, body } } }),
    });
    if (!res.ok) { var e = await res.json(); throw new Error(e.error); }
    emailTemplatesCache[key].subject = subject;
    emailTemplatesCache[key].body = body;
    document.getElementById('emailTplStatus').textContent = '';
    toast('Template saved', 'success');
  } catch (e) {
    document.getElementById('emailTplStatus').textContent = '';
    toast('Error: ' + e.message, 'error');
  }
}

async function resetEmailTemplate() {
  var key = document.getElementById('emailTplSelect').value;
  if (!key) return;
  if (!confirm('Reset this template to default?')) return;
  try {
    var res = await fetch(API + '/api/settings/email-templates/reset', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ template_key: key }),
    });
    if (!res.ok) throw new Error('Failed');
    var data = await res.json();
    document.getElementById('emailTplSubject').value = data.subject;
    document.getElementById('emailTplBody').value = data.body;
    emailTemplatesCache[key].subject = data.subject;
    emailTemplatesCache[key].body = data.body;
    toast('Template reset to default', 'success');
  } catch (e) { toast('Error: ' + e.message, 'error'); }
}

async function previewEmailTemplate() {
  var key = document.getElementById('emailTplSelect').value;
  if (!key) return;
  var subject = document.getElementById('emailTplSubject').value;
  var body = document.getElementById('emailTplBody').value;
  try {
    var res = await fetch(API + '/api/settings/email-templates/preview', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ template_key: key, subject: subject, body: body }),
    });
    if (!res.ok) return;
    var data = await res.json();
    document.getElementById('emailPreviewSubject').textContent = 'Subject: ' + data.subject;
    var frame = document.getElementById('emailPreviewFrame');
    var doc = frame.contentDocument || frame.contentWindow.document;
    doc.open();
    doc.write(data.html);
    doc.close();
  } catch (e) { /* silent */ }
}


// --- Categories ---
// --- Unified Category Management ---
var activeCatType = 'workflow';
var allCatData = { workflow: [], ticket: [], kb: [] };

var CAT_TYPE_CONFIG = {
  workflow: { label: 'Workflow', api: '/api/categories', hasIcon: true, hasDescription: true, dataKey: 'categories' },
  ticket:   { label: 'Service Desk', api: '/api/ticket-categories', hasIcon: false, hasDescription: true },
  kb:       { label: 'Knowledge Base', api: '/api/kb/categories', hasIcon: false, hasDescription: true, hasSlug: true, hasSort: true }
};

function switchCatType(type) {
  activeCatType = type;
  loadCategories();
}

async function loadAllCategories() {
  // Load all three types for sidebar counts
  var types = ['workflow', 'ticket', 'kb'];
  await Promise.all(types.map(async function(t) {
    var cfg = CAT_TYPE_CONFIG[t];
    try {
      var res = await fetch(API + cfg.api);
      var data = await res.json();
      allCatData[t] = cfg.dataKey ? (data[cfg.dataKey] || data) : (Array.isArray(data) ? data : []);
    } catch(e) { allCatData[t] = []; }
  }));
  allCategories = allCatData[activeCatType];
}

async function loadCategories() {
  await loadAllCategories();
  renderCatTypeFilter();
  renderCategoryTable();
  renderCatOverview();
}

function renderCategoryTable() {
  var container = document.getElementById('categoriesContent');
  var cfg = CAT_TYPE_CONFIG[activeCatType];
  var cats = allCatData[activeCatType] || [];
  var q = (document.getElementById('categorySearch')?.value || '').toLowerCase();
  var filtered = q ? cats.filter(function(c) { return c.name.toLowerCase().includes(q); }) : cats;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No ' + cfg.label.toLowerCase() + ' categories</p></div>';
    return;
  }

  var html = '<div class="users-card"><table class="tickets-table"><thead><tr>';
  if (cfg.hasIcon) html += '<th style="width:44px"></th>';
  html += '<th>Name</th><th>Description</th>';
  if (cfg.hasSlug) html += '<th>Slug</th>';
  if (cfg.hasSort) html += '<th>Order</th>';
  html += '<th class="admin-only" style="width:80px"></th>';
  html += '</tr></thead><tbody>';

  for (var i = 0; i < filtered.length; i++) {
    var c = filtered[i];
    var plainDesc = c.description ? c.description.replace(/<[^>]*>/g, '').substring(0, 80) : '';

    html += '<tr onclick="editCategory(' + c.id + ')">';
    if (cfg.hasIcon) {
      html += '<td><span class="cat-table-icon"><i class="fa fa-' + esc(c.icon || 'folder') + '"></i></span></td>';
    }
    html += '<td><span class="ticket-title-cell">' + esc(c.name) + '</span></td>';
    html += '<td><span class="ticket-meta">' + (plainDesc ? esc(plainDesc) : '—') + '</span></td>';
    if (cfg.hasSlug) html += '<td><span class="ticket-meta">' + esc(c.slug || '') + '</span></td>';
    if (cfg.hasSort) html += '<td><span class="ticket-meta">' + (c.sort_order != null ? c.sort_order : '—') + '</span></td>';
    html += '<td class="admin-only"><div style="display:flex;gap:6px">' +
      '<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();editCategory(' + c.id + ')">Edit</button>' +
      '<button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteCategory(' + c.id + ')">Delete</button>' +
      '</div></td>';
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  html += '<div style="text-align:center;font-size:12px;color:var(--color-text-muted);padding:4px 0">' + filtered.length + ' categor' + (filtered.length !== 1 ? 'ies' : 'y') + '</div>';
  container.innerHTML = html;
}

function renderCatTypeFilter() {
  var el = document.getElementById('catTypeFilter');
  var types = [
    { key: 'workflow', label: 'Workflow', dot: 'var(--color-primary)' },
    { key: 'ticket', label: 'Service Desk', dot: 'var(--color-warning)' },
    { key: 'kb', label: 'Knowledge Base', dot: 'var(--color-success)' }
  ];
  var html = '';
  for (var i = 0; i < types.length; i++) {
    var t = types[i];
    var count = (allCatData[t.key] || []).length;
    var active = activeCatType === t.key ? ' active' : '';
    html += '<div class="kpi-item' + active + '" onclick="switchCatType(\'' + t.key + '\')" style="cursor:pointer">' +
      '<span class="kpi-label"><span class="kpi-dot" style="background:' + t.dot + '"></span>' + t.label + '</span>' +
      '<span class="kpi-value">' + count + '</span></div>';
  }
  el.innerHTML = html;
}

function renderCatOverview() {
  var el = document.getElementById('catOverviewContent');
  var cats = allCatData[activeCatType] || [];
  var cfg = CAT_TYPE_CONFIG[activeCatType];
  var totalAll = (allCatData.workflow || []).length + (allCatData.ticket || []).length + (allCatData.kb || []).length;

  var html = '<div class="kpi-big"><div class="kpi-big-value" style="color:var(--color-primary)">' + cats.length + '</div>' +
    '<div class="kpi-big-label">' + cfg.label + ' Categories</div></div>';

  html += '<div class="kpi-item"><span class="kpi-label">Total (all types)</span><span class="kpi-value">' + totalAll + '</span></div>';

  if (activeCatType === 'kb') {
    var withArticles = cats.filter(function(c) { return c.article_count > 0; }).length;
    html += '<div class="kpi-item"><span class="kpi-label">With Articles</span><span class="kpi-value">' + withArticles + '</span></div>';
    var totalArticles = cats.reduce(function(s, c) { return s + (parseInt(c.article_count) || 0); }, 0);
    html += '<div class="kpi-item"><span class="kpi-label">Total Articles</span><span class="kpi-value">' + totalArticles + '</span></div>';
  }

  el.innerHTML = html;
}

function showAddCategory() {
  document.getElementById('catEditId').value = '';
  document.getElementById('catEditName').value = '';
  var cfg = CAT_TYPE_CONFIG[activeCatType];
  // Show/hide icon picker
  var iconGroup = document.getElementById('catIconGroup');
  if (iconGroup) iconGroup.style.display = cfg.hasIcon ? '' : 'none';
  // Show/hide slug field
  var slugGroup = document.getElementById('catSlugGroup');
  if (slugGroup) slugGroup.style.display = cfg.hasSlug ? '' : 'none';
  // Show/hide sort field
  var sortGroup = document.getElementById('catSortGroup');
  if (sortGroup) sortGroup.style.display = cfg.hasSort ? '' : 'none';

  if (cfg.hasIcon) {
    document.getElementById('catEditIcon').value = 'folder';
    document.getElementById('catEditIconPreview').className = 'fa fa-folder';
    document.getElementById('iconPicker').style.display = 'none';
  }
  if (cfg.hasSlug) document.getElementById('catEditSlug').value = '';
  if (cfg.hasSort) document.getElementById('catEditSort').value = '0';
  initEditor('catEditDescription', { placeholder: 'Describe what this category is for...' });
  document.getElementById('categoryModalTitle').textContent = 'Add ' + cfg.label + ' Category';
  openModal('categoryModal');
}

function editCategory(id) {
  var cats = allCatData[activeCatType] || [];
  var cat = cats.find(function(c) { return c.id === id; });
  if (!cat) return;
  var cfg = CAT_TYPE_CONFIG[activeCatType];

  document.getElementById('catEditId').value = id;
  document.getElementById('catEditName').value = cat.name;

  var iconGroup = document.getElementById('catIconGroup');
  if (iconGroup) iconGroup.style.display = cfg.hasIcon ? '' : 'none';
  var slugGroup = document.getElementById('catSlugGroup');
  if (slugGroup) slugGroup.style.display = cfg.hasSlug ? '' : 'none';
  var sortGroup = document.getElementById('catSortGroup');
  if (sortGroup) sortGroup.style.display = cfg.hasSort ? '' : 'none';

  if (cfg.hasIcon) {
    document.getElementById('catEditIcon').value = cat.icon || 'folder';
    document.getElementById('catEditIconPreview').className = 'fa fa-' + (cat.icon || 'folder');
    document.getElementById('iconPicker').style.display = 'none';
  }
  if (cfg.hasSlug) document.getElementById('catEditSlug').value = cat.slug || '';
  if (cfg.hasSort) document.getElementById('catEditSort').value = cat.sort_order != null ? cat.sort_order : 0;
  initEditor('catEditDescription', { placeholder: 'Describe what this category is for...' });
  setEditorData('catEditDescription', cat.description || '');
  document.getElementById('categoryModalTitle').textContent = 'Edit ' + cfg.label + ' Category';
  openModal('categoryModal');
}

async function saveCategory() {
  var id = document.getElementById('catEditId').value;
  var name = document.getElementById('catEditName').value.trim();
  if (!name) { toast('Name is required', 'error'); return; }

  var cfg = CAT_TYPE_CONFIG[activeCatType];
  var body = { name, description: getEditorHtml('catEditDescription') };
  if (cfg.hasIcon) body.icon = document.getElementById('catEditIcon').value.trim();
  if (cfg.hasSlug) body.slug = document.getElementById('catEditSlug').value.trim();
  if (cfg.hasSort) body.sort_order = parseInt(document.getElementById('catEditSort').value) || 0;

  var isNew = !id;
  var url = isNew ? API + cfg.api : API + cfg.api + '/' + id;
  var method = isNew ? 'POST' : 'PUT';

  var res = await fetch(url, {
    method: method,
    headers: CSRF_HEADERS,
    body: JSON.stringify(body),
  });
  if (res.ok) {
    toast(isNew ? 'Category added' : 'Category updated', 'success');
    closeModal('categoryModal');
    loadCategories();
  } else {
    var err = await res.json().catch(function() { return {}; });
    toast(err.error || 'Error saving category', 'error');
  }
}

async function deleteCategory(id) {
  if (!confirm('Delete this category?')) return;
  var cfg = CAT_TYPE_CONFIG[activeCatType];
  await fetch(API + cfg.api + '/' + id, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  toast('Category deleted', 'success');
  loadCategories();
}

// --- API Key Management ---

async function loadApiKeys() {
  try {
    var res = await fetch(API + '/api/api-keys');
    if (!res.ok) return;
    var data = await res.json();
    var container = document.getElementById('apiKeysList');
    if (!data.keys || !data.keys.length) {
      container.innerHTML = '<p style="color:var(--color-text-muted);font-size:13px">No API keys yet. Create one to access the API programmatically.</p>';
      return;
    }
    var html = '<div class="users-card"><table class="users-table"><thead><tr>';
    html += '<th>Name</th><th>Key</th><th>Role</th><th>Last Used</th><th>Expires</th><th style="width:60px"></th>';
    html += '</tr></thead><tbody>';
    for (var i = 0; i < data.keys.length; i++) {
      var k = data.keys[i];
      var lastUsed = k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never';
      var expires = k.expires_at ? new Date(k.expires_at).toLocaleDateString() : 'Never';
      var isExpired = k.expires_at && new Date(k.expires_at) < new Date();
      html += '<tr>';
      html += '<td><strong>' + esc(k.name) + '</strong></td>';
      html += '<td><code style="font-size:12px;color:var(--color-text-muted)">' + esc(k.key_prefix) + '...</code></td>';
      html += '<td><span class="role-badge ' + k.role + '">' + k.role + '</span></td>';
      html += '<td style="font-size:12px;color:var(--color-text-muted)">' + lastUsed + '</td>';
      html += '<td style="font-size:12px;' + (isExpired ? 'color:var(--color-danger)' : 'color:var(--color-text-muted)') + '">' + (isExpired ? 'Expired' : expires) + '</td>';
      html += '<td><button class="delete-btn" title="Revoke" onclick="deleteApiKey(' + k.id + ',\'' + esc(k.name).replace(/'/g, "\\'") + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></td>';
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    container.innerHTML = html;
  } catch (e) {
    console.error('Failed to load API keys:', e);
  }
}

function openApiKeyModal() {
  document.getElementById('apiKeyName').value = '';
  document.getElementById('apiKeyExpiry').value = '';
  // Filter role options based on current user's role
  var roleSelect = document.getElementById('apiKeyRole');
  roleSelect.value = 'viewer';
  var hierarchy = { admin: 3, editor: 2, viewer: 1 };
  var userLevel = hierarchy[currentUser.role] || 1;
  for (var opt of roleSelect.options) {
    opt.disabled = hierarchy[opt.value] > userLevel;
  }
  document.getElementById('apiKeyModal').classList.add('active');
}

async function saveApiKey() {
  var name = document.getElementById('apiKeyName').value.trim();
  var role = document.getElementById('apiKeyRole').value;
  var expiresIn = document.getElementById('apiKeyExpiry').value;
  if (!name) { toast('Name is required', 'error'); return; }
  try {
    var res = await fetch(API + '/api/api-keys', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ name: name, role: role, expires_in: expiresIn || undefined })
    });
    var data = await res.json();
    if (!res.ok) { toast(data.error || 'Failed to create key', 'error'); return; }
    closeModal('apiKeyModal');
    // Show the key once
    document.getElementById('apiKeyRevealValue').value = data.key;
    document.getElementById('apiKeyRevealModal').classList.add('active');
    loadApiKeys();
  } catch (e) {
    toast('Failed to create API key', 'error');
  }
}

function copyApiKey() {
  var input = document.getElementById('apiKeyRevealValue');
  input.select();
  navigator.clipboard.writeText(input.value).then(function() {
    toast('API key copied to clipboard', 'success');
  });
}

async function deleteApiKey(id, name) {
  if (!confirm('Revoke API key "' + name + '"? Any integrations using this key will stop working.')) return;
  try {
    await fetch(API + '/api/api-keys/' + id, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    toast('API key revoked', 'success');
    loadApiKeys();
  } catch (e) {
    toast('Failed to delete API key', 'error');
  }
}

// --- MCP Server Management ---

async function loadMcpServerStatus() {
  try {
    var res = await fetch(API + '/api/settings/mcp-server');
    if (!res.ok) return;
    var data = await res.json();
    document.getElementById('mcpServerEnabled').checked = data.enabled;
    document.getElementById('mcpServerInfo').style.display = data.enabled ? '' : 'none';
    if (data.enabled) loadMcpServerTools();
  } catch (e) {
    console.error('Failed to load MCP server status:', e);
  }
}

async function toggleMcpServer(enabled) {
  try {
    await fetch(API + '/api/settings/mcp-server', {
      method: 'PUT', headers: CSRF_HEADERS,
      body: JSON.stringify({ enabled: enabled })
    });
    document.getElementById('mcpServerInfo').style.display = enabled ? '' : 'none';
    if (enabled) loadMcpServerTools();
    toast('MCP server ' + (enabled ? 'enabled' : 'disabled'), 'success');
  } catch (e) {
    toast('Failed to toggle MCP server', 'error');
  }
}

async function loadMcpServerTools() {
  try {
    var res = await fetch(API + '/api/settings/mcp-server-tools');
    if (!res.ok) return;
    var data = await res.json();
    var container = document.getElementById('mcpServerToolsList');
    if (!container || !data.tools || !data.tools.length) return;
    var html = '<div style="margin-top:10px"><strong style="font-size:12px;color:var(--color-text)">Tools</strong></div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin-top:8px">';
    for (var i = 0; i < data.tools.length; i++) {
      var t = data.tools[i];
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--color-bg-light);border:1px solid var(--color-border-light);border-radius:var(--radius)">';
      html += '<span style="font-size:12px;color:var(--color-text)">' + esc(t.name) + '</span>';
      html += '<label class="toggle-switch" style="margin:0"><input type="checkbox" ' + (t.enabled ? 'checked' : '') + ' onchange="toggleMcpTool(\'' + esc(t.name) + '\',this.checked)"><span class="toggle-slider"></span></label>';
      html += '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
  } catch (e) {
    console.error('Failed to load MCP tools:', e);
  }
}

async function toggleMcpTool(name, enabled) {
  try {
    await fetch(API + '/api/settings/mcp-server-tools', {
      method: 'PUT', headers: CSRF_HEADERS,
      body: JSON.stringify({ tool: name, enabled: enabled })
    });
  } catch (e) {
    toast('Failed to update tool', 'error');
  }
}

