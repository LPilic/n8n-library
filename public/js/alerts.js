// --- Scheduled Alerts ---
var alertsData = [];
var alertRecipients = [];
var alertUsersCache = [];

async function loadAlerts() {
  var container = document.getElementById('alertsList');
  if (!container) return;
  try {
    var res = await fetch(API + '/api/alerts', { headers: CSRF_HEADERS });
    if (!res.ok) return;
    var data = await res.json();
    alertsData = data.alerts || [];
    renderAlertsList(container);
  } catch (e) {
    container.innerHTML = '<p style="color:var(--color-text-muted);font-size:13px">Failed to load alerts.</p>';
  }
}

function renderAlertsList(container) {
  if (alertsData.length === 0) {
    container.innerHTML = '<p style="color:var(--color-text-muted);font-size:13px;padding:8px 0">No alerts configured. Create one to get notified about important events.</p>';
    return;
  }

  var condLabels = {
    execution_failure_rate: 'Failure rate',
    execution_failure_count: 'Failure count',
    open_tickets_threshold: 'Open tickets',
    ticket_sla_breach: 'SLA breach',
    n8n_unreachable: 'n8n unreachable',
  };

  var html = '<div style="display:flex;flex-direction:column;gap:8px">';
  for (var i = 0; i < alertsData.length; i++) {
    var a = alertsData[i];
    var cond = condLabels[a.condition] || a.condition;
    var config = a.config || {};
    var detail = alertConfigSummary(a.condition, config);
    var recipients = (a.recipients || []).length;
    var lastFired = a.last_fired_at ? 'Last fired: ' + new Date(a.last_fired_at).toLocaleString() : 'Never fired';

    html += '<div style="border:1px solid var(--color-border);border-radius:var(--radius);padding:12px 16px;background:var(--color-card);display:flex;align-items:center;gap:12px">';
    html += '<div style="flex:1;min-width:0">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">';
    html += '<span style="font-weight:600;font-size:14px;color:var(--color-text-dark)">' + esc(a.name) + '</span>';
    html += '<span class="audit-type-badge" style="font-size:10px">' + esc(cond) + '</span>';
    if (!a.enabled) html += '<span style="font-size:10px;color:var(--color-text-xmuted);background:var(--color-bg);padding:1px 6px;border-radius:8px">Paused</span>';
    html += '</div>';
    html += '<div style="font-size:12px;color:var(--color-text-muted)">' + esc(detail) + ' &middot; ' + recipients + ' recipient(s) &middot; ' + esc(lastFired) + '</div>';
    html += '</div>';
    html += '<div style="display:flex;gap:4px;flex-shrink:0">';
    html += '<button class="btn btn-secondary btn-sm" onclick="toggleAlert(' + a.id + ',' + !a.enabled + ')" title="' + (a.enabled ? 'Pause' : 'Enable') + '">';
    html += a.enabled ? '<i class="fa fa-pause"></i>' : '<i class="fa fa-play"></i>';
    html += '</button>';
    html += '<button class="btn btn-secondary btn-sm" onclick="editAlert(' + a.id + ')" title="Edit"><i class="fa fa-pencil"></i></button>';
    html += '<button class="btn btn-secondary btn-sm" onclick="deleteAlert(' + a.id + ',\'' + esc(a.name) + '\')" title="Delete" style="color:var(--color-danger)"><i class="fa fa-trash"></i></button>';
    html += '</div></div>';
  }
  html += '</div>';
  container.innerHTML = html;
}

function alertConfigSummary(condition, config) {
  if (condition === 'execution_failure_rate') {
    return 'Rate >= ' + (config.threshold || 20) + '% in ' + (config.window_minutes || 60) + 'min';
  }
  if (condition === 'execution_failure_count') {
    return 'Count >= ' + (config.threshold || 5) + ' in ' + (config.window_minutes || 60) + 'min';
  }
  if (condition === 'open_tickets_threshold') {
    return 'Open tickets >= ' + (config.threshold || 10);
  }
  if (condition === 'ticket_sla_breach') {
    return 'Unresolved > ' + (config.hours || 24) + 'h';
  }
  if (condition === 'n8n_unreachable') {
    return 'Health check fails';
  }
  return '';
}

function openAlertForm(alertObj) {
  document.getElementById('alertFormWrap').style.display = '';
  document.getElementById('alertEditId').value = alertObj ? alertObj.id : '';
  document.getElementById('alertName').value = alertObj ? alertObj.name : '';
  document.getElementById('alertCondition').value = alertObj ? alertObj.condition : '';
  document.getElementById('alertCooldown').value = alertObj ? alertObj.cooldown_minutes : 30;
  alertRecipients = alertObj ? (alertObj.recipients || []).slice() : [];
  onAlertConditionChange(alertObj ? alertObj.config : null);
  loadAlertUsers();
}

function cancelAlertForm() {
  document.getElementById('alertFormWrap').style.display = 'none';
}

function onAlertConditionChange(existingConfig) {
  var cond = document.getElementById('alertCondition').value;
  var container = document.getElementById('alertConfigFields');
  var config = existingConfig || {};

  if (cond === 'execution_failure_rate') {
    container.innerHTML =
      '<div class="form-group"><label>Failure rate threshold (%)</label>' +
      '<input type="number" class="form-input" id="alertThreshold" value="' + (config.threshold || 20) + '" min="1" max="100" style="width:120px"></div>' +
      '<div class="form-group"><label>Time window (minutes)</label>' +
      '<input type="number" class="form-input" id="alertWindow" value="' + (config.window_minutes || 60) + '" min="5" style="width:120px"></div>';
  } else if (cond === 'execution_failure_count') {
    container.innerHTML =
      '<div class="form-group"><label>Failure count threshold</label>' +
      '<input type="number" class="form-input" id="alertThreshold" value="' + (config.threshold || 5) + '" min="1" style="width:120px"></div>' +
      '<div class="form-group"><label>Time window (minutes)</label>' +
      '<input type="number" class="form-input" id="alertWindow" value="' + (config.window_minutes || 60) + '" min="5" style="width:120px"></div>';
  } else if (cond === 'open_tickets_threshold') {
    container.innerHTML =
      '<div class="form-group"><label>Open tickets threshold</label>' +
      '<input type="number" class="form-input" id="alertThreshold" value="' + (config.threshold || 10) + '" min="1" style="width:120px"></div>';
  } else if (cond === 'ticket_sla_breach') {
    container.innerHTML =
      '<div class="form-group"><label>Hours before SLA breach</label>' +
      '<input type="number" class="form-input" id="alertHours" value="' + (config.hours || 24) + '" min="1" style="width:120px"></div>';
  } else if (cond === 'n8n_unreachable') {
    container.innerHTML = '<p style="font-size:12px;color:var(--color-text-muted);padding:4px 0">Checks all configured n8n instances for reachability.</p>';
  } else {
    container.innerHTML = '';
  }
}

function getAlertConfig() {
  var cond = document.getElementById('alertCondition').value;
  var config = {};
  if (cond === 'execution_failure_rate' || cond === 'execution_failure_count') {
    var th = document.getElementById('alertThreshold');
    var win = document.getElementById('alertWindow');
    if (th) config.threshold = parseInt(th.value, 10) || 5;
    if (win) config.window_minutes = parseInt(win.value, 10) || 60;
  } else if (cond === 'open_tickets_threshold') {
    var th2 = document.getElementById('alertThreshold');
    if (th2) config.threshold = parseInt(th2.value, 10) || 10;
  } else if (cond === 'ticket_sla_breach') {
    var hrs = document.getElementById('alertHours');
    if (hrs) config.hours = parseInt(hrs.value, 10) || 24;
  }
  return config;
}

async function loadAlertUsers() {
  if (alertUsersCache.length > 0) {
    renderAlertRecipientUI();
    return;
  }
  try {
    var res = await fetch(API + '/api/users');
    if (!res.ok) return;
    var data = await res.json();
    alertUsersCache = data.users || [];
    renderAlertRecipientUI();
  } catch (e) {
    console.error('[alerts] loadAlertUsers error:', e);
  }
}

function renderAlertRecipientUI() {
  renderAlertRecipientPills();
  renderAlertUserDropdown();
}

function renderAlertRecipientPills() {
  var container = document.getElementById('alertRecipientPills');
  if (!container) return;
  if (alertRecipients.length === 0) {
    container.innerHTML = '';
    return;
  }
  var html = '';
  for (var i = 0; i < alertRecipients.length; i++) {
    var r = alertRecipients[i];
    html += '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px 3px 10px;background:var(--color-primary-light);color:var(--color-primary);border-radius:10px;font-size:12px;font-weight:500">';
    html += esc(r.name || r.email);
    html += '<button onclick="removeAlertRecipient(' + i + ')" style="background:none;border:none;color:var(--color-primary);cursor:pointer;font-size:14px;padding:0 2px;line-height:1">&times;</button>';
    html += '</span>';
  }
  container.innerHTML = html;
}

function renderAlertUserDropdown() {
  var wrap = document.getElementById('alertUserDropdownWrap');
  if (!wrap) return;
  var available = alertUsersCache.filter(function(u) {
    return !alertRecipients.some(function(r) { return r.id === u.id; });
  });
  if (available.length === 0 && alertUsersCache.length > 0) {
    wrap.innerHTML = '<span style="font-size:12px;color:var(--color-text-xmuted)">All users added</span>';
    return;
  }
  var html = '<div class="alert-user-dropdown" style="position:relative;display:inline-block">';
  html += '<button type="button" class="btn btn-secondary btn-sm" onclick="toggleAlertUserMenu()" id="alertUserMenuBtn" style="font-size:12px"><i class="fa fa-plus"></i> Add user</button>';
  html += '<div id="alertUserMenu" style="display:none;position:absolute;top:100%;left:0;margin-top:4px;min-width:240px;background:var(--color-card);border:1px solid var(--color-border);border-radius:var(--radius);box-shadow:var(--shadow-lg);z-index:200;max-height:200px;overflow-y:auto">';
  for (var i = 0; i < available.length; i++) {
    var u = available[i];
    html += '<div onclick="addAlertRecipientById(' + u.id + ')" style="padding:8px 12px;cursor:pointer;font-size:13px;color:var(--color-text);transition:background 0.1s;border-bottom:1px solid var(--color-border-light)" onmouseover="this.style.background=\'var(--color-card-hover)\'" onmouseout="this.style.background=\'none\'">';
    html += '<div style="font-weight:500">' + esc(u.username || u.email) + '</div>';
    html += '<div style="font-size:11px;color:var(--color-text-muted)">' + esc(u.email) + '</div>';
    html += '</div>';
  }
  html += '</div></div>';
  wrap.innerHTML = html;
}

function toggleAlertUserMenu() {
  var menu = document.getElementById('alertUserMenu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' ? '' : 'none';
}

function addAlertRecipientById(userId) {
  var user = alertUsersCache.find(function(u) { return u.id === userId; });
  if (!user) return;
  alertRecipients.push({ type: 'user', id: user.id, email: user.email, name: user.username || user.email });
  renderAlertRecipientUI();
}

function removeAlertRecipient(idx) {
  alertRecipients.splice(idx, 1);
  renderAlertRecipientUI();
}

async function saveAlert() {
  var name = document.getElementById('alertName').value.trim();
  var condition = document.getElementById('alertCondition').value;
  var cooldown = parseInt(document.getElementById('alertCooldown').value, 10) || 30;
  var editId = document.getElementById('alertEditId').value;

  if (!name || !condition) {
    toast('Name and condition are required', 'error');
    return;
  }
  if (alertRecipients.length === 0) {
    toast('At least one recipient is required', 'error');
    return;
  }

  var body = {
    name: name,
    condition: condition,
    config: getAlertConfig(),
    recipients: alertRecipients,
    cooldown_minutes: cooldown,
    enabled: true,
  };

  try {
    var url = editId ? API + '/api/alerts/' + editId : API + '/api/alerts';
    var method = editId ? 'PUT' : 'POST';
    var res = await fetch(url, {
      method: method,
      headers: CSRF_HEADERS,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      var err = await res.json();
      toast(err.error || 'Failed to save alert', 'error');
      return;
    }
    toast('Alert saved', 'success');
    cancelAlertForm();
    loadAlerts();
  } catch (e) {
    toast('Failed to save alert', 'error');
  }
}

function editAlert(id) {
  var alert = alertsData.find(function(a) { return a.id === id; });
  if (!alert) return;
  openAlertForm(alert);
}

async function toggleAlert(id, enabled) {
  try {
    var res = await fetch(API + '/api/alerts/' + id, {
      method: 'PUT',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ enabled: enabled }),
    });
    if (!res.ok) return;
    loadAlerts();
  } catch {}
}

async function deleteAlert(id, name) {
  var ok = await appConfirm('Delete alert "' + name + '"?', { title: 'Delete Alert', okLabel: 'Delete', danger: true });
  if (!ok) return;
  try {
    var res = await fetch(API + '/api/alerts/' + id, {
      method: 'DELETE',
      headers: CSRF_HEADERS,
    });
    if (!res.ok) return;
    toast('Alert deleted', 'success');
    loadAlerts();
  } catch {}
}
