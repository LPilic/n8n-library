// --- n8n Tag Manager ---
let n8nTagsCache = [];
let n8nTagWorkflows = [];

async function loadN8nTags() {
  var el = document.getElementById('tagsContent');
  el.innerHTML = '<div class="loading">Loading tags...</div>';
  try {
    var url = API + '/api/tags';
    if (typeof activeInstanceId !== 'undefined' && activeInstanceId) url += '?instance_id=' + activeInstanceId;
    var res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load');
    var data = await res.json();
    n8nTagsCache = data.data || [];
    renderN8nTags();
    loadTagWorkflows();
  } catch (err) {
    el.innerHTML = '<div class="kb-empty"><h3>Failed to load tags</h3><p>' + esc(err.message) + '</p></div>';
  }
}

async function loadTagWorkflows() {
  // Load workflows to show tag assignments
  try {
    var url = API + '/api/monitoring/workflows';
    if (typeof activeInstanceId !== 'undefined' && activeInstanceId) url += '?instance_id=' + activeInstanceId;
    var res = await fetch(url);
    if (!res.ok) return;
    var data = await res.json();
    n8nTagWorkflows = data.data || data || [];
    renderTagWorkflowCounts();
  } catch (e) {}
}

function renderTagWorkflowCounts() {
  // Count workflows per tag
  var counts = {};
  for (var i = 0; i < n8nTagWorkflows.length; i++) {
    var wf = n8nTagWorkflows[i];
    var tags = wf.tags || [];
    for (var j = 0; j < tags.length; j++) {
      var t = tags[j];
      var tid = t.id || t;
      counts[tid] = (counts[tid] || 0) + 1;
    }
  }
  // Update counts in the table
  for (var k = 0; k < n8nTagsCache.length; k++) {
    var tag = n8nTagsCache[k];
    var countEl = document.getElementById('tagCount-' + tag.id);
    if (countEl) countEl.textContent = counts[tag.id] || 0;
  }
}

function renderN8nTags() {
  var el = document.getElementById('tagsContent');
  var q = (document.getElementById('tagSearchInput')?.value || '').toLowerCase();
  var filtered = n8nTagsCache.filter(function(t) {
    return !q || t.name.toLowerCase().includes(q);
  });

  if (n8nTagsCache.length === 0) {
    el.innerHTML = '<div class="kb-empty">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M9 5H2v7l6.29 6.29c.94.94 2.48.94 3.42 0l4.58-4.58c.94-.94.94-2.48 0-3.42L9 5Z"/><path d="M6 9.01V9"/></svg>' +
      '<h3>No tags</h3>' +
      '<p>Create tags to organize your n8n workflows.</p>' +
      '</div>';
    return;
  }

  var html = '<div class="users-card"><table class="kb-articles-table">' +
    '<thead><tr><th>Tag</th><th>Workflows</th><th>Created</th><th style="width:150px">Actions</th></tr></thead><tbody>';

  for (var i = 0; i < filtered.length; i++) {
    var t = filtered[i];
    html += '<tr>' +
      '<td><span class="kb-cat-badge" style="font-size:13px">' + esc(t.name) + '</span></td>' +
      '<td class="kb-article-meta"><span id="tagCount-' + esc(t.id) + '">...</span> workflows</td>' +
      '<td class="kb-article-meta">' + new Date(t.createdAt).toLocaleDateString() + '</td>' +
      '<td>' +
        '<button class="btn btn-secondary btn-sm" onclick="openTagWorkflows(\'' + esc(t.id) + '\',\'' + esc(t.name).replace(/'/g, "\\'") + '\')" style="font-size:11px">Workflows</button> ' +
        '<button class="btn btn-secondary btn-sm admin-only" onclick="openEditTag(\'' + esc(t.id) + '\')" style="font-size:11px">Rename</button> ' +
        '<button class="btn btn-danger btn-sm admin-only" onclick="deleteTag(\'' + esc(t.id) + '\',\'' + esc(t.name).replace(/'/g, "\\'") + '\')" style="font-size:11px">Delete</button>' +
      '</td>' +
    '</tr>';
  }
  html += '</tbody></table></div>';
  html += '<div style="text-align:center;font-size:12px;color:var(--color-text-muted);padding:4px 0">' + filtered.length + ' tag' + (filtered.length !== 1 ? 's' : '') + '</div>';
  el.innerHTML = html;
}

// --- Tag CRUD ---
function openCreateTag() {
  document.getElementById('tagModalTitle').textContent = 'New Tag';
  document.getElementById('tagNameInput').value = '';
  document.getElementById('tagNameInput').removeAttribute('data-id');
  document.getElementById('tagModal').classList.add('active');
  setTimeout(function() { document.getElementById('tagNameInput').focus(); }, 100);
}

function openEditTag(id) {
  var t = n8nTagsCache.find(function(x) { return x.id === id; });
  if (!t) return;
  document.getElementById('tagModalTitle').textContent = 'Rename Tag';
  document.getElementById('tagNameInput').value = t.name;
  document.getElementById('tagNameInput').setAttribute('data-id', t.id);
  document.getElementById('tagModal').classList.add('active');
  setTimeout(function() { document.getElementById('tagNameInput').focus(); }, 100);
}

function closeTagModal() {
  document.getElementById('tagModal').classList.remove('active');
}

async function saveTag() {
  var name = document.getElementById('tagNameInput').value.trim();
  var id = document.getElementById('tagNameInput').getAttribute('data-id');
  if (!name) return toast('Name is required', 'error');

  var btn = document.getElementById('tagSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    var body = { name: name };
    if (typeof activeInstanceId !== 'undefined' && activeInstanceId) body.instance_id = activeInstanceId;
    var url, method;
    if (id) {
      url = API + '/api/tags/' + encodeURIComponent(id);
      if (typeof activeInstanceId !== 'undefined' && activeInstanceId) url += '?instance_id=' + activeInstanceId;
      method = 'PUT';
    } else {
      url = API + '/api/tags';
      method = 'POST';
    }
    var res = await fetch(url, { method: method, headers: CSRF_HEADERS, body: JSON.stringify(body) });
    if (!res.ok) {
      var err = await res.json().catch(function() { return {}; });
      throw new Error(err.error || 'Failed to save');
    }
    toast(id ? 'Tag renamed' : 'Tag created', 'success');
    closeTagModal();
    loadN8nTags();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
}

async function deleteTag(id, name) {
  if (!confirm('Delete tag "' + name + '"? It will be removed from all workflows.')) return;
  try {
    var url = API + '/api/tags/' + encodeURIComponent(id);
    if (typeof activeInstanceId !== 'undefined' && activeInstanceId) url += '?instance_id=' + activeInstanceId;
    var res = await fetch(url, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (!res.ok) throw new Error('Delete failed');
    toast('Tag deleted', 'success');
    loadN8nTags();
  } catch (e) { toast(e.message, 'error'); }
}

// --- Workflow tag assignment ---
function openTagWorkflows(tagId, tagName) {
  var el = document.getElementById('tagWorkflowsBody');
  document.getElementById('tagWorkflowsTitle').textContent = 'Workflows tagged "' + tagName + '"';

  var tagged = n8nTagWorkflows.filter(function(wf) {
    return (wf.tags || []).some(function(t) { return (t.id || t) === tagId; });
  });
  var untagged = n8nTagWorkflows.filter(function(wf) {
    return !(wf.tags || []).some(function(t) { return (t.id || t) === tagId; });
  });

  var html = '';
  if (tagged.length) {
    html += '<div style="margin-bottom:16px"><strong>Tagged</strong> (' + tagged.length + ')</div>';
    html += tagged.map(function(wf) {
      return '<div class="tag-wf-row">' +
        '<span>' + esc(wf.name) + '</span>' +
        '<button class="btn btn-danger btn-sm" onclick="removeTagFromWorkflow(\'' + esc(tagId) + '\',\'' + esc(wf.id) + '\',\'' + esc(tagName).replace(/'/g, "\\'") + '\')" style="font-size:11px">Remove</button>' +
        '</div>';
    }).join('');
  } else {
    html += '<p style="color:var(--color-text-muted)">No workflows have this tag.</p>';
  }

  if (untagged.length) {
    html += '<div style="margin:16px 0 8px;border-top:1px solid var(--color-border);padding-top:12px"><strong>Add to workflow</strong></div>';
    html += '<select id="tagAddWorkflowSelect" class="form-input" style="margin-bottom:8px"><option value="">Select a workflow...</option>';
    html += untagged.map(function(wf) { return '<option value="' + esc(wf.id) + '">' + esc(wf.name) + '</option>'; }).join('');
    html += '</select>';
    html += '<button class="btn btn-primary btn-sm" onclick="addTagToWorkflow(\'' + esc(tagId) + '\',\'' + esc(tagName).replace(/'/g, "\\'") + '\')">Add Tag</button>';
  }

  el.innerHTML = html;
  document.getElementById('tagWorkflowsModal').classList.add('active');
}

async function addTagToWorkflow(tagId, tagName) {
  var sel = document.getElementById('tagAddWorkflowSelect');
  var wfId = sel.value;
  if (!wfId) return toast('Select a workflow', 'error');

  var wf = n8nTagWorkflows.find(function(w) { return w.id === wfId; });
  var currentTagIds = (wf.tags || []).map(function(t) { return t.id || t; });
  currentTagIds.push(tagId);

  try {
    var url = API + '/api/tags/workflow/' + encodeURIComponent(wfId);
    if (typeof activeInstanceId !== 'undefined' && activeInstanceId) url += '?instance_id=' + activeInstanceId;
    var res = await fetch(url, {
      method: 'PUT', headers: CSRF_HEADERS,
      body: JSON.stringify({ tagIds: currentTagIds }),
    });
    if (!res.ok) throw new Error('Failed to update');
    toast('Tag added to workflow', 'success');
    // Update local cache
    if (wf) wf.tags = (wf.tags || []).concat([{ id: tagId, name: tagName }]);
    openTagWorkflows(tagId, tagName);
    renderTagWorkflowCounts();
  } catch (e) { toast(e.message, 'error'); }
}

async function removeTagFromWorkflow(tagId, wfId, tagName) {
  var wf = n8nTagWorkflows.find(function(w) { return w.id === wfId; });
  var currentTagIds = (wf.tags || []).map(function(t) { return t.id || t; }).filter(function(id) { return id !== tagId; });

  try {
    var url = API + '/api/tags/workflow/' + encodeURIComponent(wfId);
    if (typeof activeInstanceId !== 'undefined' && activeInstanceId) url += '?instance_id=' + activeInstanceId;
    var res = await fetch(url, {
      method: 'PUT', headers: CSRF_HEADERS,
      body: JSON.stringify({ tagIds: currentTagIds }),
    });
    if (!res.ok) throw new Error('Failed to update');
    toast('Tag removed from workflow', 'success');
    if (wf) wf.tags = (wf.tags || []).filter(function(t) { return (t.id || t) !== tagId; });
    openTagWorkflows(tagId, tagName);
    renderTagWorkflowCounts();
  } catch (e) { toast(e.message, 'error'); }
}

// Close modals on Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (document.getElementById('tagWorkflowsModal').classList.contains('active')) {
      document.getElementById('tagWorkflowsModal').classList.remove('active');
    } else if (document.getElementById('tagModal').classList.contains('active')) {
      closeTagModal();
    }
  }
});
