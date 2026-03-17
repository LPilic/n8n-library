// --- n8n API proxy ---
async function n8nApi(path) {
  const s = getSettings();
  if (!s.n8nUrl || !s.apiKey) throw new Error('Configure n8n connection first');
  const res = await fetch(`${API}/api/n8n-proxy`, {
    method: 'POST',
    headers: CSRF_HEADERS,
    body: JSON.stringify({ n8nUrl: s.n8nUrl, apiKey: s.apiKey, path }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}


// --- Library ---
async function loadLibrary() {
  const search = document.getElementById('librarySearch').value;
  const container = document.getElementById('libraryContent');
  container.innerHTML = '<div class="loading">Loading...</div>';
  try {
    const res = await fetch(`${API}/templates/search?search=${encodeURIComponent(search)}&rows=100&page=1`);
    const data = await res.json();
    document.getElementById('libraryCount').textContent = `${data.totalWorkflows} template${data.totalWorkflows !== 1 ? 's' : ''}`;

    if (data.workflows.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No templates yet</p><p style="font-size:13px">Import workflows from your n8n instance</p></div>';
      return;
    }

    container.innerHTML = '<div class="card-grid">' + data.workflows.map(w => `
      <div class="card">
        <div class="node-flow" id="lib-preview-${w.id}" onclick="openPreview(${w.id}, 'library')">
          ${buildNodeFlow(w.nodes || [])}
          <span class="node-flow-preview">Preview</span>
        </div>
        <div class="card-header">
          <div class="card-title">${esc(w.name)}</div>
          <span class="card-id">#${w.id}</span>
        </div>
        <div class="card-desc">${md(w.description) || '<span style="color:var(--color-text-xmuted)">No description</span>'}</div>
        <div class="card-meta">
          ${(w.categories || []).map(c => `<span class="tag">${esc(c.name)}</span>`).join('')}
        </div>
        <div class="card-actions">
          <button class="btn btn-secondary btn-sm write-only" onclick="editTemplate(${w.id})">Edit</button>
          <button class="btn btn-secondary btn-sm write-only" onclick="openVersionHistory(${w.id})" style="font-size:11px"><i class="fa fa-history"></i> History</button>
          <button class="btn btn-secondary btn-sm write-only ai-gen-btn" onclick="generateWorkflowDocs(${w.id}, 'library')" style="font-size:11px">&#10024; Docs</button>
          <button class="btn btn-danger btn-sm admin-only" onclick="deleteTemplate(${w.id})">Delete</button>
        </div>
      </div>
    `).join('') + '</div>';

    // Pre-cache workflow data for preview modals
    loadLibraryPreviews(data.workflows.map(w => w.id));
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>Error loading templates</p><p style="font-size:13px">${esc(e.message)}</p></div>`;
  }
}

async function editTemplate(id) {
  // Fetch metadata and full workflow in parallel
  const [metaRes, wfRes] = await Promise.all([
    fetch(`${API}/templates/workflows/${id}`).then(r => r.json()),
    fetch(`${API}/workflows/templates/${id}`).then(r => r.json()),
    loadAllCategories(),
  ]);

  const t = metaRes.workflow;
  const wf = wfRes.workflow || {};

  document.getElementById('editTemplateId').value = id;
  document.getElementById('editName').value = t.name;
  initEditor('editDescription', { placeholder: 'Template description...' });
  setEditorData('editDescription', t.description || '');
  document.getElementById('editModalTitle').textContent = 'Edit Template #' + id;

  // Render workflow preview
  const previewBody = document.getElementById('editPreviewBody');
  previewBody.innerHTML = '';
  const demo = document.createElement('n8n-demo');
  demo.setAttribute('workflow', JSON.stringify({ nodes: wf.nodes || [], connections: wf.connections || {} }));
  previewBody.appendChild(demo);

  // Store workflow data for docs generation
  window._editWorkflowData = wf;
  window._editWorkflowName = t.name;
  var docsBtn = document.getElementById('editGenDocsBtn');
  if (docsBtn && window.aiConfigured) docsBtn.style.display = '';

  const currentCats = (t.categories || []).map(c => c.name);
  renderCategoryCheckboxes('editCategories', currentCats);
  openModal('editModal');
}

async function saveTemplate() {
  const id = document.getElementById('editTemplateId').value;
  const name = document.getElementById('editName').value;
  const description = getEditorHtml('editDescription');
  const categories = getCheckedCategories('editCategories');

  await fetch(`${API}/api/templates/${id}`, {
    method: 'PUT',
    headers: CSRF_HEADERS,
    body: JSON.stringify({ name, description, categories }),
  });
  closeModal('editModal');
  toast('Template updated', 'success');
  loadLibrary();
}

async function deleteTemplate(id) {
  var ok = await appConfirm('Delete this template?', { danger: true, okLabel: 'Delete' });
  if (!ok) return;
  await fetch(`${API}/api/templates/${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  toast('Template deleted', 'success');
  loadLibrary();
}

// --- n8n Workflows ---
async function loadN8nWorkflows() {
  const container = document.getElementById('n8nContent');
  const s = getSettings();
  if (!s.n8nUrl || !s.apiKey) {
    container.innerHTML = '<div class="empty-state"><p>Connect to n8n first</p><p style="font-size:13px">Go to Settings to configure your n8n connection</p></div>';
    return;
  }

  container.innerHTML = '<div class="loading">Loading workflows from n8n...</div>';
  try {
    const allWorkflows = [];
    let cursor = '';
    let hasMore = true;
    while (hasMore) {
      const path = cursor
        ? `/api/v1/workflows?limit=100&cursor=${cursor}`
        : '/api/v1/workflows?limit=100';
      const res = await n8nApi(path);
      allWorkflows.push(...(res.data || []));
      cursor = res.nextCursor || '';
      hasMore = !!cursor;
    }
    n8nWorkflowsCache = allWorkflows;
    n8nFilteredCache = allWorkflows;
    n8nCurrentPage = 1;
    document.getElementById('n8nCount').textContent = `${allWorkflows.length} workflow${allWorkflows.length !== 1 ? 's' : ''}`;
    renderN8nWorkflows();
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>Failed to load workflows</p><p style="font-size:13px">${esc(e.message)}</p></div>`;
  }
}

let n8nCurrentPage = 1;
let n8nFilteredCache = [];
const N8N_PER_PAGE = 20;

function filterN8nWorkflows() {
  const q = document.getElementById('n8nSearch').value.toLowerCase();
  n8nFilteredCache = n8nWorkflowsCache.filter(w =>
    w.name.toLowerCase().includes(q)
  );
  n8nCurrentPage = 1;
  document.getElementById('n8nCount').textContent = `${n8nFilteredCache.length} workflow${n8nFilteredCache.length !== 1 ? 's' : ''}`;
  renderN8nWorkflows();
}

function goToN8nPage(page) {
  n8nCurrentPage = page;
  renderN8nWorkflows();
  document.getElementById('n8nContent').scrollTo({ top: 0, behavior: 'smooth' });
}

function renderN8nWorkflows() {
  const workflows = n8nFilteredCache;
  const container = document.getElementById('n8nContent');
  if (workflows.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No workflows found</p></div>';
    return;
  }

  const totalPages = Math.ceil(workflows.length / N8N_PER_PAGE);
  if (n8nCurrentPage > totalPages) n8nCurrentPage = totalPages;
  const start = (n8nCurrentPage - 1) * N8N_PER_PAGE;
  const page = workflows.slice(start, start + N8N_PER_PAGE);

  const cards = page.map(w => {
    const nodeCount = (w.nodes || []).length;
    return `
      <div class="card">
        <div class="node-flow" onclick="openPreview('${w.id}', 'n8n')">
          ${buildNodeFlow(w.nodes || [])}
          <span class="node-flow-preview">Preview</span>
        </div>
        <div class="card-header">
          <div class="card-title">${esc(w.name)}</div>
          <span class="card-id">${w.active ? '&#9679; Active' : '&#9675; Inactive'}</span>
        </div>
        <div class="node-count">${nodeCount} nodes &middot; Updated ${new Date(w.updatedAt).toLocaleDateString()}</div>
        <div class="card-actions">
          <button class="btn btn-success btn-sm" onclick="importWorkflow('${w.id}')">Import to Library</button>
          ${aiEnabled ? `<button class="btn btn-secondary btn-sm ai-gen-btn" onclick="aiRenameN8nWorkflow('${w.id}')" style="font-size:11px">&#10024; Rename</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Pagination controls
  let paginationHtml = '';
  if (totalPages > 1) {
    paginationHtml = '<div class="pagination">';
    paginationHtml += `<button ${n8nCurrentPage === 1 ? 'disabled' : ''} onclick="goToN8nPage(${n8nCurrentPage - 1})">&lsaquo; Prev</button>`;

    const maxButtons = 7;
    let startPage = Math.max(1, n8nCurrentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if (endPage - startPage < maxButtons - 1) startPage = Math.max(1, endPage - maxButtons + 1);

    if (startPage > 1) {
      paginationHtml += `<button onclick="goToN8nPage(1)">1</button>`;
      if (startPage > 2) paginationHtml += `<span class="pagination-info">&hellip;</span>`;
    }
    for (let i = startPage; i <= endPage; i++) {
      paginationHtml += `<button class="${i === n8nCurrentPage ? 'active' : ''}" onclick="goToN8nPage(${i})">${i}</button>`;
    }
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) paginationHtml += `<span class="pagination-info">&hellip;</span>`;
      paginationHtml += `<button onclick="goToN8nPage(${totalPages})">${totalPages}</button>`;
    }

    paginationHtml += `<button ${n8nCurrentPage === totalPages ? 'disabled' : ''} onclick="goToN8nPage(${n8nCurrentPage + 1})">Next &rsaquo;</button>`;
    paginationHtml += `<span class="pagination-info">${start + 1}&ndash;${Math.min(start + N8N_PER_PAGE, workflows.length)} of ${workflows.length}</span>`;
    paginationHtml += '</div>';
  }

  container.innerHTML = '<div class="card-grid">' + cards + '</div>' + paginationHtml;
}

async function importWorkflow(id) {
  try {
    const res = await n8nApi(`/api/v1/workflows/${id}`);
    await loadAllCategories();

    document.getElementById('importWorkflowData').value = JSON.stringify(res);
    document.getElementById('importName').value = res.name || '';
    initEditor('importDescription', { placeholder: 'Template description...' });
    document.getElementById('importModalTitle').textContent = 'Import: ' + (res.name || 'Workflow');
    renderCategoryCheckboxes('importCategories', []);

    // Show AI generate buttons if configured
    var aiBtn = document.getElementById('aiGenImportDesc');
    if (aiBtn) aiBtn.style.display = aiEnabled ? '' : 'none';
    var aiNameBtn = document.getElementById('aiGenImportName');
    if (aiNameBtn) aiNameBtn.style.display = aiEnabled ? '' : 'none';

    // Render workflow preview
    const previewBody = document.getElementById('importPreviewBody');
    previewBody.innerHTML = '';
    const demo = document.createElement('n8n-demo');
    demo.setAttribute('workflow', JSON.stringify({ nodes: res.nodes || [], connections: res.connections || {} }));
    previewBody.appendChild(demo);

    openModal('importModal');
  } catch (e) {
    toast('Failed to fetch workflow: ' + e.message, 'error');
  }
}

async function confirmImport() {
  const workflow = JSON.parse(document.getElementById('importWorkflowData').value);
  const name = document.getElementById('importName').value;
  const description = getEditorHtml('importDescription');
  const categories = getCheckedCategories('importCategories');

  const body = {
    name,
    description,
    categories,
    workflow: {
      nodes: workflow.nodes || [],
      connections: workflow.connections || {},
      settings: workflow.settings || {},
      pinData: workflow.pinData || {},
    },
  };

  const res = await fetch(`${API}/api/templates`, {
    method: 'POST',
    headers: CSRF_HEADERS,
    body: JSON.stringify(body),
  });

  if (res.ok) {
    closeModal('importModal');
    toast('Workflow imported as template!', 'success');
    loadLibrary();
  } else {
    const err = await res.json();
    toast('Import failed: ' + (err.error || 'Unknown error'), 'error');
  }
}


// --- Category checkboxes ---
function renderCategoryCheckboxes(containerId, selected) {
  const container = document.getElementById(containerId);
  container.innerHTML = allCategories.map(c => {
    const checked = selected.includes(c.name);
    return `<label class="checkbox-tag ${checked ? 'checked' : ''}">
      <input type="checkbox" value="${esc(c.name)}" ${checked ? 'checked' : ''} onchange="this.parentElement.classList.toggle('checked', this.checked)">${esc(c.name)}
    </label>`;
  }).join('');
}

function getCheckedCategories(containerId) {
  return [...document.querySelectorAll(`#${containerId} input:checked`)].map(i => i.value);
}


// --- Node Icon Map & Flow Builder ---
const libraryWorkflowCache = {};

// Icon lookup loaded from server (node-icons.json extracted from n8n)
let NODE_ICON_DATA = {};
fetch(`${API}/api/node-icons`).then(r => r.json()).then(d => {
  NODE_ICON_DATA = d;
  console.log(`Loaded ${Object.keys(d).length} node icon definitions`);
}).catch(() => console.warn('Could not load node icon data'));

const TRIGGER_KW = ['trigger','webhook','cron','schedule','start','event','formTrigger','chatTrigger'];

function _isTrigger(n) {
  const g = (n.group || '').toLowerCase();
  if (g.includes('trigger')) return true;
  const s = ((n.type||'')+(n.name||'')).toLowerCase();
  return TRIGGER_KW.some(k => s.includes(k));
}

// Render the icon HTML for a node (supports iconData from template metadata or lookup)
function renderNodeIconHtml(node) {
  // 1. If node already has iconData (from template metadata)
  let iconData = node.iconData;
  let icon = node.icon;

  // 2. Fallback: look up by node type from the server-provided map
  if (!iconData || (!iconData.fileBuffer && iconData.icon === 'question')) {
    const nodeType = node.type || node.name || '';
    const lookup = NODE_ICON_DATA[nodeType];
    if (lookup) {
      iconData = lookup.iconData;
      icon = lookup.icon;
    }
  }

  // Render based on iconData type
  if (iconData && iconData.type === 'file' && iconData.fileBuffer) {
    if (/^data:image\//i.test(iconData.fileBuffer)) {
      return `<img src="${iconData.fileBuffer}" alt="">`;
    }
    return `<i class="fa fa-cog fa-icon"></i>`;
  }
  if (iconData && iconData.type === 'icon' && iconData.icon && iconData.icon !== 'question') {
    return `<i class="fa fa-${iconData.icon} fa-icon"></i>`;
  }
  if (icon && icon.startsWith('fa:')) {
    return `<i class="fa fa-${icon.replace('fa:', '')} fa-icon"></i>`;
  }

  // Final fallback: generic icon
  return `<i class="fa fa-cog fa-icon"></i>`;
}

function getNodeLabel(node) {
  const name = node.displayName || node.name || node.type?.split('.').pop() || '?';
  return name.length > 16 ? name.slice(0, 14) + '\u2026' : name;
}

function buildNodeFlow(nodes) {
  if (!nodes.length) return '<span style="color:var(--color-text-xmuted);font-size:12px">No nodes</span>';

  // Sort: triggers first, then by x position
  const sorted = [...nodes].sort((a, b) => {
    const at = _isTrigger(a) ? 0 : 1;
    const bt = _isTrigger(b) ? 0 : 1;
    if (at !== bt) return at - bt;
    return (a.position?.[0] || 0) - (b.position?.[0] || 0);
  });

  const MAX_SHOW = 8;
  const show = sorted.slice(0, MAX_SHOW);
  const remaining = nodes.length - MAX_SHOW;

  let html = '';
  show.forEach((node, i) => {
    const trigger = _isTrigger(node);
    html += `<div class="node-icon-badge${trigger ? ' trigger' : ''}">`;
    html += `<span class="ni">${renderNodeIconHtml(node)}</span>`;
    html += `${esc(getNodeLabel(node))}`;
    html += `</div>`;
    if (i < show.length - 1) {
      html += `<span class="node-flow-arrow">\u{2192}</span>`;
    }
  });

  if (remaining > 0) {
    html += `<span class="node-flow-more">+${remaining} more</span>`;
  }

  return html;
}

// --- Library previews (fetch workflow to get nodes) ---

async function loadLibraryPreviews(templateIds) {
  await Promise.all(templateIds.map(id => loadLibraryPreview(id)));
}

async function loadLibraryPreview(templateId) {
  try {
    const res = await fetch(`${API}/workflows/templates/${templateId}`);
    const data = await res.json();
    const wf = data.workflow || {};
    libraryWorkflowCache[templateId] = wf;
  } catch {}
}

// --- Full preview modal uses <n8n-demo> ---

async function openPreview(id, source) {
  let wfData, title;
  if (source === 'library') {
    let wf = libraryWorkflowCache[id];
    if (!wf) {
      try {
        const res = await fetch(`${API}/workflows/templates/${id}`);
        const data = await res.json();
        wf = data.workflow || {};
        libraryWorkflowCache[id] = wf;
      } catch { return; }
    }
    wfData = { nodes: wf.nodes || [], connections: wf.connections || {}, settings: wf.settings || {}, pinData: wf.pinData || {} };
    title = wf.name || `Template #${id}`;
  } else if (source === 'monitoring') {
    const wf = (typeof monWorkflowCache !== 'undefined' ? monWorkflowCache : []).find(w => w.id === id || w.id === String(id));
    if (!wf) return;
    wfData = { nodes: wf.nodes || [], connections: wf.connections || {}, settings: wf.settings || {}, pinData: wf.pinData || {} };
    title = wf.name || `Workflow ${id}`;
  } else {
    const wf = n8nWorkflowsCache.find(w => w.id === id || w.id === String(id));
    if (!wf) return;
    wfData = { nodes: wf.nodes || [], connections: wf.connections || {}, settings: wf.settings || {}, pinData: wf.pinData || {} };
    title = wf.name || `Workflow ${id}`;
  }
  document.getElementById('previewModalTitle').textContent = title;
  const body = document.getElementById('previewModalBody');
  body.innerHTML = '';
  const demo = document.createElement('n8n-demo');
  demo.setAttribute('workflow', JSON.stringify(wfData));
  demo.setAttribute('frame', 'true');
  body.appendChild(demo);
  openModal('previewModal');
}

function closePreview() {
  document.getElementById('previewModal').classList.remove('active');
  document.getElementById('previewModalBody').innerHTML = '';
}

