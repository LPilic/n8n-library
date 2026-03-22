// --- n8n Variables Manager ---
let variablesCache = [];
let variableSearch = '';

async function loadVariables() {
  var el = document.getElementById('variablesContent');
  el.innerHTML = '<div class="loading">Loading variables...</div>';
  try {
    var url = API + '/api/variables';
    if (typeof activeInstanceId !== 'undefined' && activeInstanceId) url += '?instance_id=' + activeInstanceId;
    var res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load');
    var data = await res.json();
    variablesCache = data.data || [];
    renderVariables();
  } catch (err) {
    el.innerHTML = '<div class="kb-empty"><h3>Failed to load variables</h3><p>' + esc(err.message) + '</p></div>';
  }
}

function renderVariables() {
  var el = document.getElementById('variablesContent');
  var q = (document.getElementById('variableSearchInput')?.value || '').toLowerCase();
  var filtered = variablesCache.filter(function(v) {
    return !q || v.key.toLowerCase().includes(q) || (v.value || '').toLowerCase().includes(q);
  });

  if (variablesCache.length === 0) {
    el.innerHTML = '<div class="kb-empty">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>' +
      '<h3>No variables</h3>' +
      '<p>Variables let you store values accessible in n8n expressions via <code>$vars.KEY</code></p>' +
      '</div>';
    return;
  }

  var html = '<div class="users-card"><table class="kb-articles-table">' +
    '<thead><tr><th>Key</th><th>Value</th><th>Usage</th><th style="width:120px">Actions</th></tr></thead><tbody>';

  for (var i = 0; i < filtered.length; i++) {
    var v = filtered[i];
    var masked = v.value || '';
    if (masked.length > 80) masked = masked.substring(0, 80) + '...';
    html += '<tr>' +
      '<td><code style="font-size:13px;font-weight:600">' + esc(v.key) + '</code></td>' +
      '<td class="kb-article-meta" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(v.value || '') + '">' + esc(masked) + '</td>' +
      '<td class="kb-article-meta"><code style="font-size:11px;color:var(--color-text-muted)">$vars.' + esc(v.key) + '</code></td>' +
      '<td>' +
        '<button class="btn btn-secondary btn-sm admin-only" onclick="openEditVariable(\'' + esc(v.id) + '\')" style="font-size:11px">Edit</button> ' +
        '<button class="btn btn-danger btn-sm admin-only" onclick="deleteVariable(\'' + esc(v.id) + '\',\'' + esc(v.key).replace(/'/g, "\\'") + '\')" style="font-size:11px">Delete</button>' +
      '</td>' +
    '</tr>';
  }
  html += '</tbody></table></div>';
  html += '<div style="text-align:center;font-size:12px;color:var(--color-text-muted);padding:4px 0">' + filtered.length + ' variable' + (filtered.length !== 1 ? 's' : '') + (q && filtered.length !== variablesCache.length ? ' (filtered from ' + variablesCache.length + ')' : '') + '</div>';
  el.innerHTML = html;
}

function openCreateVariable() {
  document.getElementById('variableModalTitle').textContent = 'New Variable';
  document.getElementById('variableKey').value = '';
  document.getElementById('variableValue').value = '';
  document.getElementById('variableKey').removeAttribute('data-id');
  document.getElementById('variableModal').classList.add('active');
  setTimeout(function() { document.getElementById('variableKey').focus(); }, 100);
}

function openEditVariable(id) {
  var v = variablesCache.find(function(x) { return x.id === id || String(x.id) === id; });
  if (!v) return toast('Variable not found', 'error');
  document.getElementById('variableModalTitle').textContent = 'Edit Variable';
  document.getElementById('variableKey').value = v.key;
  document.getElementById('variableValue').value = v.value || '';
  document.getElementById('variableKey').setAttribute('data-id', v.id);
  document.getElementById('variableModal').classList.add('active');
  setTimeout(function() { document.getElementById('variableValue').focus(); }, 100);
}

function closeVariableModal() {
  document.getElementById('variableModal').classList.remove('active');
}

async function saveVariable() {
  var key = document.getElementById('variableKey').value.trim();
  var value = document.getElementById('variableValue').value;
  var id = document.getElementById('variableKey').getAttribute('data-id');
  if (!key) return toast('Key is required', 'error');

  var btn = document.getElementById('variableSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    var url, method;
    var body = { key: key, value: value };
    if (typeof activeInstanceId !== 'undefined' && activeInstanceId) body.instance_id = activeInstanceId;
    if (id) {
      url = API + '/api/variables/' + encodeURIComponent(id);
      if (typeof activeInstanceId !== 'undefined' && activeInstanceId) url += '?instance_id=' + activeInstanceId;
      method = 'PUT';
    } else {
      url = API + '/api/variables';
      method = 'POST';
    }
    var res = await fetch(url, { method: method, headers: CSRF_HEADERS, body: JSON.stringify(body) });
    if (!res.ok) {
      var err = await res.json().catch(function() { return {}; });
      throw new Error(err.error || 'Failed to save');
    }
    toast(id ? 'Variable updated' : 'Variable created', 'success');
    closeVariableModal();
    loadVariables();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
}

async function deleteVariable(id, key) {
  if (!confirm('Delete variable "' + key + '"? Workflows using $vars.' + key + ' will break.')) return;
  try {
    var url = API + '/api/variables/' + encodeURIComponent(id);
    if (typeof activeInstanceId !== 'undefined' && activeInstanceId) url += '?instance_id=' + activeInstanceId;
    var res = await fetch(url, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (!res.ok) throw new Error('Delete failed');
    toast('Variable deleted', 'success');
    loadVariables();
  } catch (e) { toast(e.message, 'error'); }
}

// Close modal on Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && document.getElementById('variableModal').classList.contains('active')) {
    closeVariableModal();
  }
});
