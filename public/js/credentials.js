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

var _credSearchTimer;
function debouncedRenderCreds() {
  clearTimeout(_credSearchTimer);
  _credSearchTimer = setTimeout(renderCredentials, 300);
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (document.getElementById('credProvisionModal').classList.contains('active')) closeModal('credProvisionModal');
    else if (document.getElementById('credStoreModal').classList.contains('active')) closeCredStoreModal();
    else if (document.getElementById('transferCredModal').classList.contains('active')) document.getElementById('transferCredModal').classList.remove('active');
    else if (document.getElementById('credModal').classList.contains('active')) closeCredModal();
  }
});

// --- Credential Store Tab ---

var credStoreCache = [];
var credStoreCurrentType = '';
var credStoreSchema = null;
var credStoreEditingId = null;

function switchCredTab(tab) {
  document.querySelectorAll('.cred-tab').forEach(function(t) { t.classList.remove('active'); });
  event.target.classList.add('active');
  var instTab = document.getElementById('credTabInstance');
  var storeTab = document.getElementById('credTabStore');
  var actions = document.getElementById('credToolbarActions');
  if (tab === 'store') {
    instTab.style.display = 'none';
    storeTab.style.display = '';
    actions.innerHTML = '<button class="btn btn-primary admin-only" onclick="openCredStoreModal()">+ New Template</button>';
    loadCredStore();
  } else {
    instTab.style.display = '';
    storeTab.style.display = 'none';
    actions.innerHTML = '<input type="text" class="search-input" placeholder="Search name, type or owner..." id="credentialSearchInput" oninput="debouncedRenderCreds()">' +
      '<button class="btn btn-primary admin-only" onclick="openCreateCredential()">+ New Credential</button>';
  }
}

async function loadCredStore() {
  var el = document.getElementById('credStoreContent');
  el.innerHTML = '<div class="loading">Loading credential store...</div>';
  try {
    var results = await Promise.all([
      fetch(API + '/api/credential-store').then(function(r) { return r.ok ? r.json() : []; }),
      fetch(API + '/api/credentials/my-provisions').then(function(r) { return r.ok ? r.json() : []; }),
      (currentUser && ['admin', 'editor'].includes(currentUser.role))
        ? fetch(API + '/api/credentials/audit').then(function(r) { return r.ok ? r.json() : []; })
        : Promise.resolve([])
    ]);
    credStoreCache = results[0];
    renderCredStore(results[1], results[2]);
  } catch (err) {
    el.innerHTML = '<div class="kb-empty"><h3>Failed to load credential store</h3><p>' + esc(err.message) + '</p></div>';
  }
}

function renderCredStore(myProvisions, auditLog) {
  var el = document.getElementById('credStoreContent');
  var isAdmin = currentUser && currentUser.role === 'admin';
  var isStaff = currentUser && ['admin', 'editor'].includes(currentUser.role);

  if (credStoreCache.length === 0 && (!myProvisions || myProvisions.length === 0)) {
    el.innerHTML = '<div class="kb-empty">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
      '<h3>No credential templates</h3>' +
      '<p>Create templates to let users provision credentials without seeing shared secrets.</p>' +
      (isAdmin ? '<button class="btn btn-primary" onclick="openCredStoreModal()" style="margin-top:12px">+ New Template</button>' : '') +
      '</div>';
    return;
  }

  var html = '';

  // Template cards
  if (credStoreCache.length > 0) {
    html += '<div class="cred-store-grid">';
    for (var i = 0; i < credStoreCache.length; i++) {
      var t = credStoreCache[i];
      var roles = (t.allowed_roles || []).map(function(r) {
        return '<span class="kb-cat-badge">' + esc(r) + '</span>';
      }).join('');

      html += '<div class="cred-store-card" onclick="openProvisionModal(' + t.id + ')">' +
        '<div class="cred-store-card-title">' + esc(t.name) + '</div>' +
        '<div class="cred-store-card-type"><code class="cred-type-badge">' + esc(formatCredType(t.credential_type)) + '</code></div>' +
        (t.description ? '<div class="cred-store-card-desc">' + esc(t.description) + '</div>' : '') +
        '<div class="cred-store-card-meta">' + roles +
          (t.instance_name ? '<span class="kb-cat-badge" style="background:var(--color-bg)">' + esc(t.instance_name) + '</span>' : '') +
          '<span style="font-size:11px;color:var(--color-text-xmuted);margin-left:auto">by ' + esc(t.creator_name || 'unknown') + '</span>' +
        '</div>' +
        (isAdmin ? '<div style="display:flex;gap:6px;margin-top:12px;border-top:1px solid var(--color-border);padding-top:10px">' +
          '<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();editCredStoreTemplate(' + t.id + ')" style="font-size:11px">Edit</button>' +
          '<button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteCredStoreTemplate(' + t.id + ',\'' + esc(t.name).replace(/'/g, "\\'") + '\')" style="font-size:11px">Delete</button>' +
        '</div>' : '') +
      '</div>';
    }
    html += '</div>';
  }

  // My provisioning history
  if (myProvisions && myProvisions.length > 0) {
    html += '<div style="padding:0 20px 20px">';
    html += '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--color-text-muted);margin:24px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--color-border-light)">My Provisioned Credentials</div>';
    html += '<div class="users-card"><table class="kb-articles-table"><thead><tr><th>Credential</th><th>Type</th><th>Template</th><th>Instance</th><th>Date</th></tr></thead><tbody>';
    for (var j = 0; j < myProvisions.length; j++) {
      var p = myProvisions[j];
      html += '<tr>' +
        '<td>' + esc(p.credential_name || '—') + '</td>' +
        '<td><code class="cred-type-badge">' + esc(formatCredType(p.credential_type || '')) + '</code></td>' +
        '<td class="kb-article-meta">' + esc((p.detail || '').replace(/^User .+ provisioned from template "/, '').replace(/"$/, '') || '—') + '</td>' +
        '<td class="kb-article-meta">' + esc(p.instance_name || '—') + '</td>' +
        '<td class="kb-article-meta">' + new Date(p.created_at).toLocaleDateString() + '</td>' +
      '</tr>';
    }
    html += '</tbody></table></div></div>';
  }

  // Audit log (staff only)
  if (isStaff && auditLog && auditLog.length > 0) {
    html += '<div style="padding:0 20px 20px">';
    html += '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--color-text-muted);margin:24px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--color-border-light)">Recent Activity</div>';
    html += '<div style="max-height:300px;overflow-y:auto">';
    for (var k = 0; k < Math.min(25, auditLog.length); k++) {
      var a = auditLog[k];
      var actionColor = a.action === 'deleted' ? 'var(--color-danger)' :
        a.action === 'provisioned' ? 'var(--color-success)' :
        a.action === 'created' || a.action === 'template_created' ? 'var(--color-primary)' : 'var(--color-text-muted)';
      var actionLabel = (a.action || '').replace(/_/g, ' ');
      html += '<div class="activity-item" style="padding:8px 0;border-bottom:1px solid var(--color-border-light);font-size:13px">' +
        '<strong>' + esc(a.username || 'system') + '</strong> ' +
        '<span style="color:' + actionColor + ';font-weight:500">' + esc(actionLabel) + '</span> ' +
        (a.credential_name ? esc(a.credential_name) : '') +
        '<span class="activity-time" style="float:right;font-size:11px;color:var(--color-text-xmuted)">' + timeAgo(a.created_at) + '</span>' +
      '</div>';
    }
    html += '</div></div>';
  }

  el.innerHTML = html;
}

// --- Create/Edit Template Modal ---

function openCredStoreModal() {
  credStoreEditingId = null;
  credStoreCurrentType = '';
  credStoreSchema = null;
  document.getElementById('credStoreModalTitle').textContent = 'New Credential Template';
  document.getElementById('credStoreEditId').value = '';
  document.getElementById('credStoreName').value = '';
  document.getElementById('credStoreDesc').value = '';
  document.getElementById('credStoreTypeStep').style.display = '';
  document.getElementById('credStoreFieldsStep').style.display = 'none';
  document.getElementById('credStoreSchemaFields').innerHTML = '';
  document.getElementById('credStoreRoleEditor').checked = true;
  document.getElementById('credStoreRoleViewer').checked = true;
  // Populate instance selector
  var instSel = document.getElementById('credStoreInstance');
  instSel.innerHTML = '<option value="">Default</option>';
  if (typeof instancesCache !== 'undefined') {
    for (var i = 0; i < instancesCache.length; i++) {
      instSel.innerHTML += '<option value="' + instancesCache[i].id + '">' + esc(instancesCache[i].name) + '</option>';
    }
  }
  filterStoreCredTypes();
  document.getElementById('credStoreModal').classList.add('active');
  setTimeout(function() { document.getElementById('credStoreTypeSearch').value = ''; document.getElementById('credStoreTypeSearch').focus(); }, 100);
}

function filterStoreCredTypes() {
  var q = (document.getElementById('credStoreTypeSearch')?.value || '').toLowerCase();
  var el = document.getElementById('credStoreTypeList');
  var source = allCredTypesCache.length ? allCredTypesCache : credTypesCache.map(function(t) { return { name: t, displayName: formatCredType(t) }; });
  var filtered = source.filter(function(t) {
    if (!q) return true;
    return t.name.toLowerCase().includes(q) || t.displayName.toLowerCase().includes(q);
  });
  if (filtered.length > 50) filtered = filtered.slice(0, 50);
  if (filtered.length === 0) {
    el.innerHTML = '<div class="cred-type-empty">No matching types. Press Enter for custom type.</div>';
    return;
  }
  var showHint = !q && source.length > 50;
  el.innerHTML = (showHint ? '<div class="cred-type-empty" style="padding:10px;font-size:12px">Showing first 50 of ' + source.length + '. Type to search...</div>' : '') +
    filtered.map(function(t) {
      return '<div class="cred-type-option" onclick="selectStoreCredType(\'' + esc(t.name) + '\')">' +
        '<span class="cred-type-option-name">' + esc(t.displayName) + '</span>' +
        '<code class="cred-type-option-id">' + esc(t.name) + '</code></div>';
    }).join('');
}

function selectStoreCredType(type) {
  credStoreCurrentType = type;
  var t = allCredTypesCache.find(function(x) { return x.name === type; });
  document.getElementById('credStoreTypeLabel').textContent = t ? t.displayName : formatCredType(type);
  document.getElementById('credStoreTypeStep').style.display = 'none';
  document.getElementById('credStoreFieldsStep').style.display = '';
  loadStoreSchema(type);
}

function credStoreBackToType() {
  document.getElementById('credStoreTypeStep').style.display = '';
  document.getElementById('credStoreFieldsStep').style.display = 'none';
  document.getElementById('credStoreSchemaFields').innerHTML = '';
  setTimeout(function() { document.getElementById('credStoreTypeSearch').focus(); }, 100);
}

async function loadStoreSchema(type) {
  var el = document.getElementById('credStoreSchemaFields');
  el.innerHTML = '<div class="loading" style="padding:12px">Loading schema...</div>';
  try {
    var url = API + '/api/credentials/schema/' + encodeURIComponent(type);
    if (typeof activeInstanceId !== 'undefined' && activeInstanceId) url += '?instance_id=' + activeInstanceId;
    var res = await fetch(url);
    if (!res.ok) throw new Error('Schema not found');
    credStoreSchema = await res.json();
    renderStoreSchemaFields(credStoreSchema);
  } catch (e) {
    credStoreSchema = null;
    el.innerHTML = '<div style="font-size:13px;color:var(--color-text-muted);margin-bottom:12px">Could not load schema. Enter shared data as JSON.</div>' +
      '<textarea class="form-input cred-json-input" id="credStoreJsonData" rows="6" placeholder=\'{"clientId": "...", "clientSecret": "..."}\'></textarea>';
  }
}

function renderStoreSchemaFields(schema) {
  var el = document.getElementById('credStoreSchemaFields');
  var props = schema.properties || {};
  var required = schema.required || [];
  var keys = Object.keys(props).filter(function(k) {
    var p = props[k];
    if (p.type === 'notice') return false;
    if (k === 'oauthTokenData' || k === 'notice') return false;
    return true;
  });

  if (keys.length === 0) {
    el.innerHTML = '<div style="font-size:13px;color:var(--color-text-muted);margin-bottom:12px">No schema fields. Enter as JSON.</div>' +
      '<textarea class="form-input cred-json-input" id="credStoreJsonData" rows="6" placeholder=\'{"key": "value"}\'></textarea>';
    return;
  }

  var html = '';
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var p = props[k];
    var isReq = required.includes(k);
    var label = camelToLabel(k);
    var isSens = isSensitiveField(k);

    html += '<div class="cred-store-field-row">';
    html += '<div class="form-group">';
    html += '<label class="form-label">' + esc(label) + (isReq ? ' <span style="color:var(--color-danger)">*</span>' : '') + '</label>';

    if (p.type === 'boolean') {
      html += '<label class="cred-toggle"><input type="checkbox" class="cred-store-field" data-key="' + esc(k) + '" data-type="boolean"> ' + esc(label) + '</label>';
    } else {
      var inputType = isSens ? 'password' : 'text';
      html += '<div class="cred-input-wrap">';
      html += '<input type="' + inputType + '" class="form-input cred-store-field" data-key="' + esc(k) + '" placeholder="' + esc(p.type || 'string') + '">';
      if (isSens) {
        html += '<button type="button" class="cred-toggle-vis" onclick="toggleCredFieldVis(this)" title="Show/hide">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>';
      }
      html += '</div>';
    }
    html += '</div>';
    html += '<label class="cred-userfield-check"><input type="checkbox" class="cred-store-userfield" data-key="' + esc(k) + '"> User field</label>';
    html += '</div>';
  }
  el.innerHTML = html;
}

async function saveCredStoreTemplate() {
  var name = document.getElementById('credStoreName').value.trim();
  if (!name) return toast('Name is required', 'error');

  var type = credStoreCurrentType;
  if (!type && !credStoreEditingId) return toast('Select a credential type', 'error');

  // Collect shared data
  var sharedData = {};
  var userFields = [];
  var storeFields = document.querySelectorAll('#credStoreSchemaFields .cred-store-field');
  if (storeFields.length > 0) {
    storeFields.forEach(function(f) {
      var key = f.getAttribute('data-key');
      var isUserField = document.querySelector('.cred-store-userfield[data-key="' + key + '"]');
      if (isUserField && isUserField.checked) {
        userFields.push(key);
      } else {
        if (f.getAttribute('data-type') === 'boolean') {
          if (f.checked) sharedData[key] = true;
        } else if (f.value) {
          sharedData[key] = f.value;
        }
      }
    });
  } else {
    var jsonEl = document.getElementById('credStoreJsonData');
    if (jsonEl && jsonEl.value.trim()) {
      try { sharedData = JSON.parse(jsonEl.value); }
      catch (e) { return toast('Invalid JSON', 'error'); }
    }
  }

  if (!credStoreEditingId && Object.keys(sharedData).length === 0) {
    return toast('Fill in at least one shared secret field', 'error');
  }

  var roles = ['admin'];
  if (document.getElementById('credStoreRoleEditor').checked) roles.push('editor');
  if (document.getElementById('credStoreRoleViewer').checked) roles.push('viewer');

  var instanceId = document.getElementById('credStoreInstance').value || null;
  var desc = document.getElementById('credStoreDesc').value.trim();

  var btn = document.getElementById('credStoreSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    var body = { name: name, description: desc, allowed_roles: roles, user_fields: userFields, instance_id: instanceId };
    if (Object.keys(sharedData).length > 0) body.shared_data = sharedData;
    if (!credStoreEditingId) {
      body.credential_type = type;
      if (!body.shared_data || Object.keys(body.shared_data).length === 0) {
        return toast('Fill in at least one shared secret', 'error');
      }
    }

    var url = credStoreEditingId ? API + '/api/credential-store/' + credStoreEditingId : API + '/api/credential-store';
    var method = credStoreEditingId ? 'PATCH' : 'POST';
    var res = await fetch(url, { method: method, headers: CSRF_HEADERS, body: JSON.stringify(body) });
    if (!res.ok) { var err = await res.json().catch(function() { return {}; }); throw new Error(err.error || 'Save failed'); }

    toast(credStoreEditingId ? 'Template updated' : 'Template created', 'success');
    closeCredStoreModal();
    loadCredStore();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Template';
  }
}

function closeCredStoreModal() {
  document.getElementById('credStoreModal').classList.remove('active');
  credStoreEditingId = null;
  credStoreSchema = null;
  credStoreCurrentType = '';
}

async function editCredStoreTemplate(id) {
  var tpl = credStoreCache.find(function(t) { return t.id === id; });
  if (!tpl) return;
  credStoreEditingId = id;
  credStoreCurrentType = tpl.credential_type;
  document.getElementById('credStoreModalTitle').textContent = 'Edit: ' + tpl.name;
  document.getElementById('credStoreEditId').value = id;
  document.getElementById('credStoreName').value = tpl.name;
  document.getElementById('credStoreDesc').value = tpl.description || '';
  document.getElementById('credStoreTypeStep').style.display = 'none';
  document.getElementById('credStoreFieldsStep').style.display = '';
  var t = allCredTypesCache.find(function(x) { return x.name === tpl.credential_type; });
  document.getElementById('credStoreTypeLabel').textContent = t ? t.displayName : formatCredType(tpl.credential_type);
  document.getElementById('credStoreRoleEditor').checked = (tpl.allowed_roles || []).includes('editor');
  document.getElementById('credStoreRoleViewer').checked = (tpl.allowed_roles || []).includes('viewer');
  // Instance
  var instSel = document.getElementById('credStoreInstance');
  instSel.innerHTML = '<option value="">Default</option>';
  if (typeof instancesCache !== 'undefined') {
    for (var i = 0; i < instancesCache.length; i++) {
      var sel = instancesCache[i].id === tpl.instance_id ? ' selected' : '';
      instSel.innerHTML += '<option value="' + instancesCache[i].id + '"' + sel + '>' + esc(instancesCache[i].name) + '</option>';
    }
  }
  // Load schema and mark user fields
  await loadStoreSchema(tpl.credential_type);
  // After schema loads, check user_fields checkboxes and add notice for existing secrets
  setTimeout(function() {
    var userFields = tpl.user_fields || [];
    userFields.forEach(function(f) {
      var cb = document.querySelector('.cred-store-userfield[data-key="' + f + '"]');
      if (cb) cb.checked = true;
    });
    // Add edit notice
    var fieldsEl = document.getElementById('credStoreSchemaFields');
    if (fieldsEl && fieldsEl.firstChild) {
      var notice = document.createElement('div');
      notice.className = 'cred-edit-notice';
      notice.textContent = 'Existing secret values are encrypted and hidden. Leave fields empty to keep current values. Only fill fields you want to change.';
      fieldsEl.insertBefore(notice, fieldsEl.firstChild);
    }
  }, 200);
  document.getElementById('credStoreModal').classList.add('active');
}

async function deleteCredStoreTemplate(id, name) {
  if (!confirm('Delete credential template "' + name + '"?\n\nUsers will no longer be able to provision from this template.')) return;
  try {
    var res = await fetch(API + '/api/credential-store/' + id, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (!res.ok) throw new Error('Delete failed');
    toast('Template deleted', 'success');
    loadCredStore();
  } catch (e) { toast(e.message, 'error'); }
}

// --- Provision Modal ---

async function openProvisionModal(id) {
  var tpl = credStoreCache.find(function(t) { return t.id === id; });
  if (!tpl) return;
  document.getElementById('credProvisionTplId').value = id;
  document.getElementById('credProvisionTitle').textContent = 'Create: ' + tpl.name;
  document.getElementById('credProvisionName').value = tpl.name + ' - ' + (currentUser ? currentUser.username : '');

  // Info section
  var info = '<div style="margin-bottom:4px"><code class="cred-type-badge">' + esc(formatCredType(tpl.credential_type)) + '</code></div>';
  if (tpl.description) info += '<p style="font-size:13px;color:var(--color-text-muted);margin:0">' + esc(tpl.description) + '</p>';
  document.getElementById('credProvisionInfo').innerHTML = info;

  // Render user fields
  var fieldsEl = document.getElementById('credProvisionFields');
  var userFields = tpl.user_fields || [];
  if (userFields.length === 0) {
    fieldsEl.innerHTML = '<div style="font-size:13px;color:var(--color-text-muted);padding:8px 0">No additional fields required — all data is pre-configured.</div>';
  } else {
    // Try to load schema for labels
    var schema = null;
    try {
      var url = API + '/api/credentials/schema/' + encodeURIComponent(tpl.credential_type);
      if (typeof activeInstanceId !== 'undefined' && activeInstanceId) url += '?instance_id=' + activeInstanceId;
      var res = await fetch(url);
      if (res.ok) schema = await res.json();
    } catch (e) {}

    var html = '<p style="font-size:12px;color:var(--color-text-muted);margin-bottom:12px">Fill in the fields below. Shared secrets are pre-configured by your admin.</p>';
    for (var i = 0; i < userFields.length; i++) {
      var k = userFields[i];
      var label = camelToLabel(k);
      var prop = schema && schema.properties && schema.properties[k];
      var isSens = isSensitiveField(k);
      var inputType = isSens ? 'password' : 'text';
      var placeholder = prop && prop.type ? prop.type : 'string';
      html += '<div class="form-group">';
      html += '<label class="form-label">' + esc(label) + '</label>';
      html += '<div class="cred-input-wrap">';
      html += '<input type="' + inputType + '" class="form-input cred-provision-field" data-key="' + esc(k) + '" placeholder="' + esc(placeholder) + '">';
      if (isSens) {
        html += '<button type="button" class="cred-toggle-vis" onclick="toggleCredFieldVis(this)" title="Show/hide">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>';
      }
      html += '</div></div>';
    }
    fieldsEl.innerHTML = html;
  }

  document.getElementById('credProvisionModal').classList.add('active');
}

async function provisionCredential() {
  var tplId = document.getElementById('credProvisionTplId').value;
  var name = document.getElementById('credProvisionName').value.trim();
  if (!name) return toast('Name is required', 'error');

  var data = {};
  document.querySelectorAll('#credProvisionFields .cred-provision-field').forEach(function(f) {
    if (f.value) data[f.getAttribute('data-key')] = f.value;
  });

  var btn = document.getElementById('credProvisionBtn');
  btn.disabled = true; btn.textContent = 'Creating...';

  try {
    var body = { name: name, data: data };
    if (typeof activeInstanceId !== 'undefined' && activeInstanceId) body.instance_id = activeInstanceId;
    var res = await fetch(API + '/api/credential-store/' + tplId + '/provision', {
      method: 'POST', headers: CSRF_HEADERS, body: JSON.stringify(body)
    });
    if (!res.ok) { var err = await res.json().catch(function() { return {}; }); throw new Error(err.error || 'Provisioning failed'); }
    var result = await res.json();
    toast('Credential created in n8n (ID: ' + result.credentialId + ')', 'success');
    closeModal('credProvisionModal');
    // If on instance tab, refresh
    if (document.getElementById('credTabInstance').style.display !== 'none') loadCredentials();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Create in n8n';
  }
}
