// --- n8n Credentials Manager ---
var credentialsCache = [];
var credProjectsCache = [];
var credTypesCache = [];
var allCredTypesCache = [];

async function loadCredentials() {
  var el = document.getElementById('credentialsContent');
  el.innerHTML = '<div class="loading">Loading credentials...</div>';
  try {
    var url = API + '/api/credentials';
    if (typeof activeInstanceId !== 'undefined' && activeInstanceId) url += '?instance_id=' + activeInstanceId;
    var res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load');
    var data = await res.json();
    credentialsCache = data.data || [];
    // Collect unique types
    var typeSet = {};
    for (var i = 0; i < credentialsCache.length; i++) {
      typeSet[credentialsCache[i].type] = (typeSet[credentialsCache[i].type] || 0) + 1;
    }
    credTypesCache = Object.keys(typeSet).sort();
    populateCredFilters(typeSet);
    renderCredentials();
    loadCredProjects();
    if (!allCredTypesCache.length) loadAllCredTypes();
  } catch (err) {
    el.innerHTML = '<div class="kb-empty"><h3>Failed to load credentials</h3><p>' + esc(err.message) + '</p></div>';
  }
}

async function loadAllCredTypes() {
  try {
    var res = await fetch(API + '/api/credentials/types');
    if (res.ok) allCredTypesCache = await res.json();
  } catch (e) {}
}

async function loadCredProjects() {
  try {
    var url = API + '/api/credentials/projects';
    if (typeof activeInstanceId !== 'undefined' && activeInstanceId) url += '?instance_id=' + activeInstanceId;
    var res = await fetch(url);
    if (res.ok) { var data = await res.json(); credProjectsCache = data.data || []; }
  } catch (e) {}
}

var credTypeFilterValue = '';
var credOwnerFilterValue = '';

function onCredTypeFilterChange(sel) {
  credTypeFilterValue = typeof sel === 'string' ? sel : sel.value;
  renderCredentials();
}

function populateCredFilters(typeSet) {
  // Type filter
  var typeSelect = document.getElementById('credentialTypeFilter');
  if (typeSelect) {
    var prevType = credTypeFilterValue;
    typeSelect.innerHTML = '<option value="">All Types</option>';
    for (var i = 0; i < credTypesCache.length; i++) {
      var t = credTypesCache[i];
      typeSelect.innerHTML += '<option value="' + esc(t) + '">' + esc(formatCredType(t)) + ' (' + typeSet[t] + ')</option>';
    }
    if (prevType) typeSelect.value = prevType;
    if (typeof refreshCustomSelect === 'function') refreshCustomSelect(typeSelect);
  }
  // Owner filter
  var ownerSet = {};
  for (var i = 0; i < credentialsCache.length; i++) {
    var o = getCredOwner(credentialsCache[i]);
    if (o) ownerSet[o] = (ownerSet[o] || 0) + 1;
  }
  var ownerSelect = document.getElementById('credentialOwnerFilter');
  if (ownerSelect) {
    var prevOwner = credOwnerFilterValue;
    ownerSelect.innerHTML = '<option value="">All Owners</option>';
    var owners = Object.keys(ownerSet).sort();
    for (var i = 0; i < owners.length; i++) {
      ownerSelect.innerHTML += '<option value="' + esc(owners[i]) + '">' + esc(owners[i]) + ' (' + ownerSet[owners[i]] + ')</option>';
    }
    if (prevOwner) ownerSelect.value = prevOwner;
    if (typeof refreshCustomSelect === 'function') refreshCustomSelect(ownerSelect);
  }
  // Stats
  renderCredStats(typeSet);
}

function renderCredStats(typeSet) {
  var el = document.getElementById('credentialStatsContainer');
  if (!el) return;
  var sortedTypes = Object.keys(typeSet).sort(function(a, b) { return typeSet[b] - typeSet[a]; });
  var html = '<div class="ticket-kpi-card"><div class="kpi-header">Overview</div>';
  html += '<div class="kpi-item"><span class="kpi-label">Total credentials</span><span class="kpi-value">' + credentialsCache.length + '</span></div>';
  html += '<div class="kpi-item"><span class="kpi-label">Unique types</span><span class="kpi-value">' + sortedTypes.length + '</span></div>';
  html += '</div>';
  if (sortedTypes.length > 0) {
    html += '<div class="ticket-kpi-card"><div class="kpi-header">Top Types</div>';
    for (var i = 0; i < Math.min(8, sortedTypes.length); i++) {
      var t = sortedTypes[i];
      html += '<div class="kpi-item" style="cursor:pointer" onclick="credTypeFilterValue=\'' + esc(t) + '\';var s=document.getElementById(\'credentialTypeFilter\');if(s){s.value=\'' + esc(t) + '\';if(typeof refreshCustomSelect===\'function\')refreshCustomSelect(s);}renderCredentials()">';
      html += '<span class="kpi-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(formatCredType(t)) + '</span>';
      html += '<span class="kpi-value">' + typeSet[t] + '</span></div>';
    }
    html += '</div>';
  }
  el.innerHTML = html;
}

function renderCredentials() {
  var el = document.getElementById('credentialsContent');
  var q = (document.getElementById('credentialSearchInput')?.value || '').toLowerCase();
  credOwnerFilterValue = document.getElementById('credentialOwnerFilter')?.value || '';

  var filtered = credentialsCache.filter(function(c) {
    if (credTypeFilterValue && c.type !== credTypeFilterValue) return false;
    if (credOwnerFilterValue && getCredOwner(c) !== credOwnerFilterValue) return false;
    if (q) {
      var owner = getCredOwner(c).toLowerCase();
      var type = (c.type || '').toLowerCase();
      var typeName = formatCredType(c.type).toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !type.includes(q) && !typeName.includes(q) && !owner.includes(q)) return false;
    }
    return true;
  });

  if (credentialsCache.length === 0) {
    el.innerHTML = '<div class="kb-empty">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
      '<h3>No credentials</h3><p>No credentials found on this n8n instance.</p></div>';
    return;
  }

  var html = '<div class="users-card"><table class="kb-articles-table">' +
    '<thead><tr><th>Name</th><th>Type</th><th>Owner</th><th>Created</th><th style="width:180px">Actions</th></tr></thead><tbody>';

  for (var i = 0; i < filtered.length; i++) {
    var c = filtered[i];
    var owner = getCredOwner(c);
    html += '<tr>' +
      '<td><span class="kb-article-title-cell">' + esc(c.name) + '</span></td>' +
      '<td><code class="cred-type-badge">' + esc(formatCredType(c.type)) + '</code></td>' +
      '<td class="kb-article-meta">' + esc(owner) + '</td>' +
      '<td class="kb-article-meta">' + new Date(c.createdAt).toLocaleDateString() + '</td>' +
      '<td><div style="display:flex;gap:4px;white-space:nowrap">' +
        '<button class="btn btn-secondary btn-sm" onclick="openEditCredential(\'' + esc(c.id) + '\')" style="font-size:11px">Edit</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="openTransferCredential(\'' + esc(c.id) + '\',\'' + esc(c.name).replace(/'/g, "\\'") + '\')" style="font-size:11px">Transfer</button>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteCredential(\'' + esc(c.id) + '\',\'' + esc(c.name).replace(/'/g, "\\'") + '\')" style="font-size:11px">Delete</button>' +
      '</div></td>' +
    '</tr>';
  }
  html += '</tbody></table></div>';
  html += '<div style="text-align:center;font-size:12px;color:var(--color-text-muted);padding:4px 0">' + filtered.length + ' credential' + (filtered.length !== 1 ? 's' : '') + '</div>';
  el.innerHTML = html;
}

function getCredOwner(c) {
  if (!c.shared || !c.shared.length) return '';
  var ownerEntry = c.shared.find(function(s) { return s.role && s.role.includes('owner'); });
  var name = ownerEntry ? (ownerEntry.name || '') : (c.shared[0].name || '');
  return name.split('<')[0].trim();
}

function formatCredType(type) {
  if (!type) return 'Unknown';
  return type.replace(/Api$/, ' API').replace(/OAuth2$/, ' OAuth2').replace(/([A-Z])/g, ' $1').replace(/^ /, '').trim();
}

// --- Create / Edit Modal ---

var credEditingId = null;
var credCurrentSchema = null;

function openCreateCredential() {
  credEditingId = null;
  credCurrentSchema = null;
  document.getElementById('credModalTitle').textContent = 'New Credential';
  document.getElementById('credName').value = '';
  document.getElementById('credTypeRow').style.display = '';
  document.getElementById('credTypeSearchInput').value = '';
  document.getElementById('credTypeSelected').textContent = '';
  document.getElementById('credTypeSelected').removeAttribute('data-type');
  document.getElementById('credSchemaFields').innerHTML = '';
  document.getElementById('credTypeStep').style.display = '';
  document.getElementById('credFieldsStep').style.display = 'none';
  filterCredTypes();
  document.getElementById('credModal').classList.add('active');
  setTimeout(function() { document.getElementById('credTypeSearchInput').focus(); }, 100);
}

function openEditCredential(id) {
  var c = credentialsCache.find(function(x) { return x.id === id; });
  if (!c) return toast('Credential not found', 'error');
  credEditingId = c.id;
  document.getElementById('credModalTitle').textContent = 'Edit: ' + c.name;
  document.getElementById('credName').value = c.name;
  document.getElementById('credTypeRow').style.display = 'none';
  document.getElementById('credTypeSelected').textContent = formatCredType(c.type);
  document.getElementById('credTypeSelected').setAttribute('data-type', c.type);
  document.getElementById('credTypeStep').style.display = 'none';
  document.getElementById('credFieldsStep').style.display = '';
  loadCredSchemaAndRender(c.type, true);
  document.getElementById('credModal').classList.add('active');
}

function filterCredTypes() {
  var q = (document.getElementById('credTypeSearchInput')?.value || '').toLowerCase();
  var el = document.getElementById('credTypeList');
  // Use full types list (387 types from n8n), fall back to types from existing credentials
  var source = allCredTypesCache.length ? allCredTypesCache : credTypesCache.map(function(t) { return { name: t, displayName: formatCredType(t) }; });
  var filtered = source.filter(function(t) {
    if (!q) return true;
    return t.name.toLowerCase().includes(q) || t.displayName.toLowerCase().includes(q);
  });
  if (filtered.length > 50) filtered = filtered.slice(0, 50); // limit for performance
  if (filtered.length === 0) {
    el.innerHTML = '<div class="cred-type-empty">No matching types found. Type a custom type name and press Enter.</div>';
    return;
  }
  var showHint = !q && source.length > 50;
  el.innerHTML = (showHint ? '<div class="cred-type-empty" style="padding:10px;font-size:12px">Showing first 50 of ' + source.length + ' types. Type to search...</div>' : '') +
    filtered.map(function(t) {
      return '<div class="cred-type-option" onclick="selectCredType(\'' + esc(t.name) + '\')">' +
        '<span class="cred-type-option-name">' + esc(t.displayName) + '</span>' +
        '<code class="cred-type-option-id">' + esc(t.name) + '</code>' +
        '</div>';
    }).join('');
}

function selectCredType(type) {
  var t = allCredTypesCache.find(function(x) { return x.name === type; });
  document.getElementById('credTypeSelected').textContent = t ? t.displayName : formatCredType(type);
  document.getElementById('credTypeSelected').setAttribute('data-type', type);
  document.getElementById('credTypeStep').style.display = 'none';
  document.getElementById('credFieldsStep').style.display = '';
  loadCredSchemaAndRender(type, false);
}

function credTypeKeydown(e) {
  if (e.key === 'Enter') {
    var v = e.target.value.trim();
    if (v) selectCredType(v);
  }
}

function changeCredType() {
  document.getElementById('credTypeStep').style.display = '';
  document.getElementById('credFieldsStep').style.display = 'none';
  document.getElementById('credSchemaFields').innerHTML = '';
  setTimeout(function() { document.getElementById('credTypeSearchInput').focus(); }, 100);
}

async function loadCredSchemaAndRender(type, isEdit) {
  var el = document.getElementById('credSchemaFields');
  el.innerHTML = '<div class="loading" style="padding:12px">Loading fields...</div>';
  try {
    var url = API + '/api/credentials/schema/' + encodeURIComponent(type);
    if (typeof activeInstanceId !== 'undefined' && activeInstanceId) url += '?instance_id=' + activeInstanceId;
    var res = await fetch(url);
    if (!res.ok) throw new Error('Schema not found');
    credCurrentSchema = await res.json();
    renderCredForm(credCurrentSchema, isEdit);
  } catch (e) {
    credCurrentSchema = null;
    el.innerHTML = '<div style="margin-bottom:12px;font-size:13px;color:var(--color-text-muted)">Could not load schema for this type. Enter data as JSON.</div>' +
      '<textarea class="form-input cred-json-input" id="credDataJson" rows="6" placeholder=\'{"key": "value"}\'></textarea>';
  }
}

function renderCredForm(schema, isEdit) {
  var el = document.getElementById('credSchemaFields');
  var props = schema.properties || {};
  var required = schema.required || [];
  var keys = Object.keys(props).filter(function(k) {
    var p = props[k];
    // Hide notice fields and internal oauth fields
    if (p.type === 'notice') return false;
    if (k === 'oauthTokenData' || k === 'notice') return false;
    return true;
  });

  if (keys.length === 0) {
    el.innerHTML = '<div style="margin-bottom:12px;font-size:13px;color:var(--color-text-muted)">No fields. Enter data as JSON.</div>' +
      '<textarea class="form-input cred-json-input" id="credDataJson" rows="6" placeholder=\'{"key": "value"}\'></textarea>';
    return;
  }

  var html = '';
  if (isEdit) {
    html += '<div class="cred-edit-notice">Secret values are hidden by n8n. Leave fields empty to keep current values. Only fill fields you want to change.</div>';
  }

  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var p = props[k];
    var isReq = required.includes(k);
    var label = camelToLabel(k);

    html += '<div class="cred-field-group">';
    html += '<label class="form-label">' + esc(label) + (isReq && !isEdit ? ' <span style="color:var(--color-danger)">*</span>' : '') + '</label>';

    if (p.type === 'boolean') {
      html += '<label class="cred-toggle"><input type="checkbox" class="cred-field" data-key="' + esc(k) + '" data-type="boolean"> ' + esc(label) + '</label>';
    } else if (p.type === 'json') {
      html += '<textarea class="form-input cred-field cred-json-input" data-key="' + esc(k) + '" data-type="json" rows="3" placeholder="{}"></textarea>';
    } else {
      var inputType = isSensitiveField(k) ? 'password' : 'text';
      var placeholder = isEdit ? 'Leave empty to keep current' : (p.type || 'string');
      html += '<div class="cred-input-wrap">';
      html += '<input type="' + inputType + '" class="form-input cred-field" data-key="' + esc(k) + '" placeholder="' + esc(placeholder) + '">';
      if (inputType === 'password') {
        html += '<button type="button" class="cred-toggle-vis" onclick="toggleCredFieldVis(this)" title="Show/hide">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>';
      }
      html += '</div>';
    }
    html += '</div>';
  }
  el.innerHTML = html;
}

function isSensitiveField(key) {
  var lower = key.toLowerCase();
  return lower.includes('password') || lower.includes('secret') || lower.includes('token') ||
    lower.includes('key') || lower.includes('apikey') || lower.includes('accesstoken') || lower === 'value';
}

function camelToLabel(str) {
  return str.replace(/([A-Z])/g, ' $1').replace(/^./, function(c) { return c.toUpperCase(); }).trim();
}

function toggleCredFieldVis(btn) {
  var input = btn.parentElement.querySelector('input');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function collectCredData() {
  var fields = document.querySelectorAll('#credSchemaFields .cred-field');
  if (fields.length > 0) {
    var data = {};
    fields.forEach(function(f) {
      var key = f.getAttribute('data-key');
      var type = f.getAttribute('data-type');
      if (type === 'boolean') {
        if (f.checked) data[key] = true;
      } else if (type === 'json') {
        if (f.value.trim()) { try { data[key] = JSON.parse(f.value); } catch (e) {} }
      } else {
        if (f.value) data[key] = f.value;
      }
    });
    return Object.keys(data).length > 0 ? data : null;
  }
  var jsonEl = document.getElementById('credDataJson');
  if (jsonEl && jsonEl.value.trim()) {
    try { return JSON.parse(jsonEl.value); }
    catch (e) { toast('Invalid JSON', 'error'); return undefined; }
  }
  return null;
}

async function saveCredential() {
  var name = document.getElementById('credName').value.trim();
  var type = document.getElementById('credTypeSelected').getAttribute('data-type');
  if (!name) return toast('Name is required', 'error');

  var btn = document.getElementById('credSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    if (credEditingId) {
      var body = { name: name };
      var data = collectCredData();
      if (data === undefined) return; // JSON parse error
      if (data) body.data = data;
      var url = API + '/api/credentials/' + encodeURIComponent(credEditingId);
      if (typeof activeInstanceId !== 'undefined' && activeInstanceId) url += '?instance_id=' + activeInstanceId;
      var res = await fetch(url, { method: 'PATCH', headers: CSRF_HEADERS, body: JSON.stringify(body) });
      if (!res.ok) { var err = await res.json().catch(function() { return {}; }); throw new Error(err.error || 'Update failed'); }
      toast('Credential updated', 'success');
    } else {
      if (!type) return toast('Select a credential type', 'error');
      var data = collectCredData();
      if (data === undefined) return;
      if (!data) return toast('Fill in the credential fields', 'error');
      var body = { name: name, type: type, data: data };
      if (typeof activeInstanceId !== 'undefined' && activeInstanceId) body.instance_id = activeInstanceId;
      var res = await fetch(API + '/api/credentials', { method: 'POST', headers: CSRF_HEADERS, body: JSON.stringify(body) });
      if (!res.ok) { var err = await res.json().catch(function() { return {}; }); throw new Error(err.error || 'Create failed'); }
      toast('Credential created', 'success');
    }
    closeCredModal();
    loadCredentials();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
}

function closeCredModal() {
  document.getElementById('credModal').classList.remove('active');
  credEditingId = null;
  credCurrentSchema = null;
}

// --- Delete ---
async function deleteCredential(id, name) {
  if (!confirm('Delete credential "' + name + '"?\n\nWorkflows using this credential will break.')) return;
  try {
    var url = API + '/api/credentials/' + encodeURIComponent(id);
    if (typeof activeInstanceId !== 'undefined' && activeInstanceId) url += '?instance_id=' + activeInstanceId;
    var res = await fetch(url, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (!res.ok) throw new Error('Delete failed');
    toast('Credential deleted', 'success');
    loadCredentials();
  } catch (e) { toast(e.message, 'error'); }
}

// --- Transfer ---
function openTransferCredential(id, name) {
  document.getElementById('transferCredName').textContent = name;
  document.getElementById('transferCredId').value = id;
  var sel = document.getElementById('transferProjectSelect');
  sel.innerHTML = '<option value="">Select project...</option>';
  for (var i = 0; i < credProjectsCache.length; i++) {
    var p = credProjectsCache[i];
    sel.innerHTML += '<option value="' + esc(p.id) + '">' + esc(p.name) + ' (' + esc(p.type) + ')</option>';
  }
  document.getElementById('transferCredModal').classList.add('active');
}

async function transferCredential() {
  var id = document.getElementById('transferCredId').value;
  var projectId = document.getElementById('transferProjectSelect').value;
  if (!projectId) return toast('Select a project', 'error');
  try {
    var url = API + '/api/credentials/' + encodeURIComponent(id) + '/transfer';
    if (typeof activeInstanceId !== 'undefined' && activeInstanceId) url += '?instance_id=' + activeInstanceId;
    var res = await fetch(url, { method: 'PUT', headers: CSRF_HEADERS, body: JSON.stringify({ destinationProjectId: projectId }) });
    if (!res.ok) { var err = await res.json().catch(function() { return {}; }); throw new Error(err.error || 'Transfer failed'); }
    toast('Credential transferred', 'success');
    document.getElementById('transferCredModal').classList.remove('active');
    loadCredentials();
  } catch (e) { toast(e.message, 'error'); }
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (document.getElementById('transferCredModal').classList.contains('active')) document.getElementById('transferCredModal').classList.remove('active');
    else if (document.getElementById('credModal').classList.contains('active')) closeCredModal();
  }
});
