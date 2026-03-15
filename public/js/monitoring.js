// --- Monitoring Dashboard ---
var monAutoRefreshInterval = null;
var monWorkflowCache = [];
var monViewingDetail = false;

// Append instance_id to a URL
function monUrl(path) {
  var sep = path.indexOf('?') === -1 ? '?' : '&';
  var ip = typeof getActiveInstanceParam === 'function' ? getActiveInstanceParam() : '';
  return API + path + (ip ? sep + ip : '');
}

function startMonAutoRefresh() {
  stopMonAutoRefresh();
  var dd = document.getElementById('monRefreshDropdown');
  var sec = dd ? parseInt(dd.getAttribute('data-value') || '30', 10) : 30;
  if (sec > 0) {
    monAutoRefreshInterval = setInterval(function() {
      if (document.getElementById('panel-monitoring').classList.contains('active') && !monViewingDetail) {
        loadMonitoringData();
      }
    }, sec * 1000);
  }
}

function stopMonAutoRefresh() {
  if (monAutoRefreshInterval) { clearInterval(monAutoRefreshInterval); monAutoRefreshInterval = null; }
}

function setMonRefreshInterval() {
  startMonAutoRefresh();
}

async function loadMonitoringData(reset) {
  loadMonitoringStats();
  if (reset) loadMonitoringWorkflows();
  if (!monViewingDetail && reset) {
    loadMonitoringExecutions(true);
  }
}

async function loadMonitoringStats() {
  var container = document.getElementById('monStatsContainer');
  try {
    var res = await fetch(monUrl('/api/monitoring/stats'));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var s = await res.json();
    renderMonitoringStats(s, container);
  } catch (e) {
    container.innerHTML = '<div class="ticket-kpi-card"><div class="kpi-header">Error</div><div style="padding:16px;font-size:13px;color:var(--color-danger)">Could not reach n8n API.<br>Check n8n connection settings.</div></div>';
  }
}

function renderMonitoringStats(s, container) {
  var healthClass = s.health || 'unknown';
  var healthLabel = s.health === 'healthy' ? 'n8n is running' : s.health === 'unhealthy' ? 'n8n is unhealthy' : 'n8n unreachable';
  var avgDur = s.avgDurationMs > 0 ? formatDuration(s.avgDurationMs) : '—';

  container.innerHTML =
    '<div class="ticket-kpi-card">' +
      '<div class="kpi-header">Instance Health</div>' +
      '<div style="padding:14px 16px;display:flex;align-items:center;gap:10px">' +
        '<span class="mon-health-dot ' + healthClass + '"></span>' +
        '<span style="font-weight:600;font-size:13px">' + esc(healthLabel) + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="ticket-kpi-card kpi-status">' +
      '<div class="kpi-header">Executions (Last 250)</div>' +
      '<div class="kpi-item" onclick="setMonFilter(\'success\')">' +
        '<span class="kpi-label"><span class="kpi-dot" style="background:var(--color-success)"></span>Success</span>' +
        '<span class="kpi-value">' + (s.counts.success || 0) + '</span>' +
      '</div>' +
      '<div class="kpi-item" onclick="setMonFilter(\'error\')">' +
        '<span class="kpi-label"><span class="kpi-dot" style="background:var(--color-danger)"></span>Error</span>' +
        '<span class="kpi-value" style="color:' + (s.counts.error > 0 ? 'var(--color-danger)' : '') + '">' + (s.counts.error || 0) + '</span>' +
      '</div>' +
      '<div class="kpi-item" onclick="setMonFilter(\'running\')">' +
        '<span class="kpi-label"><span class="kpi-dot" style="background:var(--color-primary)"></span>Running</span>' +
        '<span class="kpi-value">' + (s.counts.running || 0) + '</span>' +
      '</div>' +
      '<div class="kpi-item" onclick="setMonFilter(\'waiting\')">' +
        '<span class="kpi-label"><span class="kpi-dot" style="background:#e65100"></span>Waiting</span>' +
        '<span class="kpi-value">' + (s.counts.waiting || 0) + '</span>' +
      '</div>' +
      '<div class="kpi-big">' +
        '<div class="kpi-big-value">' + (s.successRate || 0) + '%</div>' +
        '<div class="kpi-big-label">Success Rate</div>' +
      '</div>' +
    '</div>' +
    '<div class="ticket-kpi-card kpi-overview">' +
      '<div class="kpi-header">Overview</div>' +
      '<div class="kpi-big">' +
        '<div class="kpi-big-value" style="color:var(--color-primary)">' + (s.activeWorkflows || 0) + '</div>' +
        '<div class="kpi-big-label">Active Workflows</div>' +
      '</div>' +
      '<div class="kpi-item">' +
        '<span class="kpi-label">Total Workflows</span>' +
        '<span class="kpi-value">' + (s.totalWorkflows || 0) + '</span>' +
      '</div>' +
      '<div class="kpi-item">' +
        '<span class="kpi-label">Avg Duration</span>' +
        '<span class="kpi-value" style="font-size:13px">' + avgDur + '</span>' +
      '</div>' +
      '<div class="kpi-item">' +
        '<span class="kpi-label">Total Executions</span>' +
        '<span class="kpi-value">' + (s.total || 0) + '</span>' +
      '</div>' +
    '</div>' +
    (currentUser && currentUser.role === 'admin' ?
      '<div class="ticket-kpi-card">' +
        '<div class="kpi-header">Actions</div>' +
        '<div style="padding:12px 16px;display:flex;flex-direction:column;gap:8px">' +
          '<button class="btn btn-secondary btn-sm" onclick="sendDailySummary()" style="width:100%;justify-content:center"><i class="fa fa-envelope"></i> Send Daily Summary</button>' +
        '</div>' +
      '</div>' : '');
}

function setMonFilter(status) {
  var sel = document.getElementById('monFilterStatus');
  sel.value = sel.value === status ? '' : status;
  loadMonitoringExecutions(true);
}

var monCurrentTab = 'executions';

function switchMonTab(tab) {
  monCurrentTab = tab;
  document.querySelectorAll('.mon-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.mon-tab-panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelector('.mon-tab-panel#monTab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
  event.target.closest('.mon-tab').classList.add('active');
  // Show/hide execution filters
  var filters = document.getElementById('monToolbarFilters');
  if (filters) filters.style.display = tab === 'executions' ? '' : 'none';
  if (tab === 'workflows') renderWorkflowCards();
}

async function loadMonitoringWorkflows() {
  try {
    var res = await fetch(monUrl('/api/monitoring/workflows'));
    if (!res.ok) return;
    var data = await res.json();
    monWorkflowCache = data.data || [];
    // Update filter dropdown
    var sel = document.getElementById('monFilterWorkflow');
    var current = sel.value;
    sel.innerHTML = '<option value="">All Workflows</option>';
    monWorkflowCache.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
    for (var i = 0; i < monWorkflowCache.length; i++) {
      var wf = monWorkflowCache[i];
      var opt = document.createElement('option');
      opt.value = wf.id;
      opt.textContent = wf.name;
      sel.appendChild(opt);
    }
    sel.value = current;
    refreshCustomSelect(sel);
    // If on workflows tab, re-render cards (skip if user is typing in search)
    var monSearch = document.getElementById('monWfSearch');
    if (monCurrentTab === 'workflows' && !(monSearch && monSearch === document.activeElement)) renderWorkflowCards();
  } catch (e) {}
}

var monWfFilter = 'all'; // 'all', 'active', 'inactive'
var monWfSearchTerm = '';

function setMonWfFilter(f) {
  monWfFilter = f;
  // Update button active states without full re-render
  document.querySelectorAll('.mon-wf-filter-btn').forEach(function(btn) {
    var btnFilter = btn.textContent.trim().toLowerCase();
    btn.classList.toggle('active', btnFilter === f);
  });
  renderWorkflowCardGrid();
}

function onMonWfSearch(val) {
  monWfSearchTerm = (val || '').toLowerCase().trim();
  renderWorkflowCardGrid();
}

function renderWorkflowCards() {
  var container = document.getElementById('monWorkflowsContent');
  if (!container) return;

  var activeCount = monWorkflowCache.filter(function(w) { return w.active; }).length;
  var inactiveCount = monWorkflowCache.length - activeCount;

  // KPI row
  var html = '<div class="mon-kpi-row" style="margin-bottom:14px">';
  html += '<div class="mon-kpi-card"><div class="mon-kpi-number">' + monWorkflowCache.length + '</div><div class="mon-kpi-label">Total</div></div>';
  html += '<div class="mon-kpi-card"><div class="mon-kpi-number" style="color:var(--color-success)">' + activeCount + '</div><div class="mon-kpi-label">Active</div></div>';
  html += '<div class="mon-kpi-card"><div class="mon-kpi-number" style="color:var(--color-text-muted)">' + inactiveCount + '</div><div class="mon-kpi-label">Inactive</div></div>';
  html += '</div>';

  // Search + filter bar
  html += '<div class="mon-wf-search">';
  html += '<input type="text" id="monWfSearch" placeholder="Search workflows..." value="' + esc(monWfSearchTerm) + '" oninput="onMonWfSearch(this.value)">';
  html += '<button class="mon-wf-filter-btn' + (monWfFilter === 'all' ? ' active' : '') + '" onclick="setMonWfFilter(\'all\')">All</button>';
  html += '<button class="mon-wf-filter-btn' + (monWfFilter === 'active' ? ' active' : '') + '" onclick="setMonWfFilter(\'active\')">Active</button>';
  html += '<button class="mon-wf-filter-btn' + (monWfFilter === 'inactive' ? ' active' : '') + '" onclick="setMonWfFilter(\'inactive\')">Inactive</button>';
  html += '</div>';

  // Grid container (updated separately by renderWorkflowCardGrid)
  html += '<div id="monWfCardGrid"></div>';

  container.innerHTML = html;
  renderWorkflowCardGrid();
}

function renderWorkflowCardGrid() {
  var gridEl = document.getElementById('monWfCardGrid');
  if (!gridEl) return;

  var wfs = monWorkflowCache.slice();
  if (monWfFilter === 'active') wfs = wfs.filter(function(w) { return w.active; });
  else if (monWfFilter === 'inactive') wfs = wfs.filter(function(w) { return !w.active; });
  if (monWfSearchTerm) {
    wfs = wfs.filter(function(w) { return (w.name || '').toLowerCase().indexOf(monWfSearchTerm) !== -1; });
  }

  if (wfs.length === 0) {
    gridEl.innerHTML = '<div style="padding:48px;text-align:center;color:var(--color-text-muted)"><p style="font-weight:600">No workflows found</p></div>';
    return;
  }

  var s = getSettings();
  var n8nUrl = s.n8nUrl ? s.n8nUrl.replace(/\/+$/, '') : '';
  var html = '<div class="card-grid">';
  for (var i = 0; i < wfs.length; i++) {
    var wf = wfs[i];
    var isActive = wf.active;
    var nodeCount = (wf.nodes || []).length;
    var tags = wf.tags || [];
    var updated = wf.updatedAt ? timeAgo(wf.updatedAt) : '—';

    html += '<div class="card">';

    // Node flow preview — click opens preview modal (like template library)
    html += '<div class="node-flow" onclick="openPreview(\'' + esc(wf.id) + '\',\'monitoring\')">';
    html += buildNodeFlow(wf.nodes || []);
    html += '<span class="node-flow-preview">Preview</span>';
    html += '</div>';

    // Header with name and active toggle (only for activatable workflows)
    var canActivate = (wf.nodes || []).some(function(n) {
      var t = (n.type || '').toLowerCase();
      if (t.indexOf('manualtrigger') !== -1 || t.indexOf('executeworkflowtrigger') !== -1) return false;
      return t.indexOf('trigger') !== -1 || t.indexOf('schedule') !== -1 || t.indexOf('webhook') !== -1;
    });
    html += '<div class="card-header">';
    html += '<div class="card-title">' + esc(wf.name) + '</div>';
    if (canActivate) {
      html += '<label class="mon-wf-toggle" onclick="event.stopPropagation()" title="' + (isActive ? 'Active — click to deactivate' : 'Inactive — click to activate') + '">';
      html += '<input type="checkbox" ' + (isActive ? 'checked' : '') + ' onchange="toggleWorkflowActive(\'' + esc(wf.id) + '\',this.checked)">';
      html += '<span class="mon-wf-toggle-slider"></span>';
      html += '</label>';
    }
    html += '</div>';

    // Meta info
    html += '<div class="card-meta">';
    html += '<span class="tag">' + nodeCount + ' nodes</span>';
    html += '<span class="tag">Updated ' + updated + '</span>';
    for (var j = 0; j < tags.length && j < 2; j++) {
      html += '<span class="tag">' + esc(tags[j].name || tags[j]) + '</span>';
    }
    html += '</div>';

    // Actions
    html += '<div class="card-actions">';
    if (n8nUrl) {
      html += '<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();window.open(\'' + esc(n8nUrl) + '/workflow/' + esc(wf.id) + '\',\'_blank\')"><i class="fa fa-external-link"></i> Edit</button>';
    }
    if (aiEnabled) {
      html += '<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();aiDescribeWorkflow(\'' + esc(wf.id) + '\')">&#10024; Describe</button>';
      html += '<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();generateWorkflowDocs(\'' + esc(wf.id) + '\',\'monitoring\')" style="font-size:11px">&#10024; Docs</button>';
    }
    html += '</div>';

    html += '</div>';
  }
  html += '</div>';
  gridEl.innerHTML = html;
}

async function toggleWorkflowActive(wfId, active) {
  try {
    var res = await fetch(monUrl('/api/monitoring/workflows/' + wfId + '/activate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ active: active })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    showToast(active ? 'Workflow activated' : 'Workflow deactivated', 'success');
    // Update cached workflow list
    var wf = (monWorkflowCache || []).find(function(w) { return w.id == wfId; });
    if (wf) wf.active = active;
  } catch (e) {
    showToast('Failed to toggle workflow: ' + e.message, 'error');
    // Revert the checkbox
    var cb = document.querySelector('.mon-wf-toggle input[onchange*="' + wfId + '"]');
    if (cb) cb.checked = !active;
  }
}

var monExecCursor = null;
var monExecAllData = [];
var monExecPage = 0;
var monExecPerPage = 50;

async function loadMonitoringExecutions(reset) {
  var container = document.getElementById('monitoringContent');
  if (reset) { monExecCursor = null; monExecAllData = []; monExecPage = 0; }
  try {
    var params = [];
    var status = document.getElementById('monFilterStatus').value;
    var wfId = document.getElementById('monFilterWorkflow').value;
    if (status) params.push('status=' + status);
    if (wfId) params.push('workflowId=' + wfId);
    params.push('limit=250');
    if (monExecCursor) params.push('cursor=' + encodeURIComponent(monExecCursor));
    container.innerHTML = '<div class="loading">Loading executions...</div>';
    var ip = typeof getActiveInstanceParam === 'function' ? getActiveInstanceParam() : '';
    if (ip) params.push(ip);
    var res = await fetch(API + '/api/monitoring/executions?' + params.join('&'));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    monExecAllData = data.data || [];
    monExecCursor = data.nextCursor || null;
    renderMonitoringExecutions(monExecAllData, container);
  } catch (e) {
    container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--color-text-muted)">Could not load executions.<br>' + esc(e.message) + '</div>';
  }
}

function monExecGoToPage(page) {
  var maxPage = Math.max(0, Math.ceil(monExecAllData.length / monExecPerPage) - 1);
  monExecPage = Math.max(0, Math.min(page, maxPage));
  var container = document.getElementById('monitoringContent');
  if (container) renderMonitoringExecutions(monExecAllData, container);
}

async function monExecLoadMore() {
  if (!monExecCursor) return;
  var container = document.getElementById('monitoringContent');
  try {
    var params = [];
    var status = document.getElementById('monFilterStatus').value;
    var wfId = document.getElementById('monFilterWorkflow').value;
    if (status) params.push('status=' + status);
    if (wfId) params.push('workflowId=' + wfId);
    params.push('limit=250');
    params.push('cursor=' + encodeURIComponent(monExecCursor));
    var ip2 = typeof getActiveInstanceParam === 'function' ? getActiveInstanceParam() : '';
    if (ip2) params.push(ip2);
    var res = await fetch(API + '/api/monitoring/executions?' + params.join('&'));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    var newExecs = data.data || [];
    monExecAllData = monExecAllData.concat(newExecs);
    monExecCursor = data.nextCursor || null;
    monExecPage = Math.max(0, Math.ceil(monExecAllData.length / monExecPerPage) - 1);
    renderMonitoringExecutions(monExecAllData, container);
  } catch (e) {
    showToast('Failed to load more: ' + e.message, 'error');
  }
}

function renderMonitoringExecutions(executions, container) {
  if (executions.length === 0) {
    container.innerHTML = '<div style="padding:48px;text-align:center;color:var(--color-text-muted)">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px;opacity:0.4"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' +
      '<p style="font-weight:600;font-size:15px;margin-bottom:4px">No executions found</p>' +
      '<p style="font-size:13px">Try changing the filters or wait for workflows to run.</p></div>';
    return;
  }

  // Build KPI row at top
  var kpiHtml = '<div class="mon-kpi-row">';
  var successCount = 0, errorCount = 0, runningCount = 0, totalDur = 0, durCount = 0;
  for (var i = 0; i < executions.length; i++) {
    var ex = executions[i];
    if (ex.status === 'success') successCount++;
    else if (ex.status === 'error') errorCount++;
    else if (ex.status === 'running') runningCount++;
    if (ex.startedAt && ex.stoppedAt) {
      var d = new Date(ex.stoppedAt) - new Date(ex.startedAt);
      if (d > 0) { totalDur += d; durCount++; }
    }
  }
  kpiHtml += '<div class="mon-kpi-card"><div class="mon-kpi-number">' + executions.length + '</div><div class="mon-kpi-label">Shown</div></div>';
  kpiHtml += '<div class="mon-kpi-card"><div class="mon-kpi-number" style="color:var(--color-success)">' + successCount + '</div><div class="mon-kpi-label">Success</div></div>';
  kpiHtml += '<div class="mon-kpi-card"><div class="mon-kpi-number" style="color:var(--color-danger)">' + errorCount + '</div><div class="mon-kpi-label">Errors</div></div>';
  kpiHtml += '<div class="mon-kpi-card"><div class="mon-kpi-number" style="color:var(--color-primary)">' + runningCount + '</div><div class="mon-kpi-label">Running</div></div>';
  kpiHtml += '<div class="mon-kpi-card"><div class="mon-kpi-number">' + (durCount > 0 ? formatDuration(Math.round(totalDur / durCount)) : '—') + '</div><div class="mon-kpi-label">Avg Duration</div></div>';
  kpiHtml += '</div>';

  // Charts row
  var chartsHtml = '<div class="mon-charts-row">' +
    '<div class="mon-chart-card"><h4>Execution Timeline</h4><canvas id="monTimelineChart"></canvas></div>' +
    '<div class="mon-chart-card"><h4>Status Distribution</h4><canvas id="monStatusChart"></canvas></div>' +
  '</div>';

  // Paginate
  var perPage = monExecPerPage || 50;
  var curPage = parseInt(monExecPage, 10) || 0;
  var totalPages = Math.max(1, Math.ceil(executions.length / perPage));
  if (curPage >= totalPages) curPage = totalPages - 1;
  if (curPage < 0) curPage = 0;
  monExecPage = curPage;
  var startIdx = curPage * perPage;
  var pageExecs = executions.slice(startIdx, startIdx + perPage);

  // Build execution table (KB-style)
  var html = kpiHtml + chartsHtml + '<div class="users-card"><table class="kb-articles-table">' +
    '<thead><tr><th>Workflow</th><th>Status</th><th>ID</th><th>Started</th><th>Duration</th><th>Mode</th><th style="width:40px"></th></tr></thead><tbody>';

  for (var i = 0; i < pageExecs.length; i++) {
    var ex = pageExecs[i];
    var wfName = ex.workflowData ? ex.workflowData.name : (ex.workflowName || 'Unknown');
    var statusClass = ex.status || 'unknown';
    var statusLabel = ex.status ? ex.status.charAt(0).toUpperCase() + ex.status.slice(1) : 'Unknown';
    var started = ex.startedAt ? timeAgo(ex.startedAt) : '—';
    var duration = '—';
    if (ex.startedAt && ex.stoppedAt) {
      duration = formatDuration(new Date(ex.stoppedAt) - new Date(ex.startedAt));
    } else if (ex.status === 'running' && ex.startedAt) {
      duration = formatDuration(Date.now() - new Date(ex.startedAt)) + '...';
    }
    var mode = ex.mode || '—';
    var wfId = ex.workflowId || (ex.workflowData ? ex.workflowData.id : '');

    html += '<tr onclick="openExecution(\'' + esc(String(ex.id)) + '\',\'' + esc(String(wfId)) + '\')">' +
      '<td><span class="kb-article-title-cell">' + esc(wfName) + '</span></td>' +
      '<td><span class="ticket-badge badge-' + statusClass + '">' + esc(statusLabel) + '</span></td>' +
      '<td class="kb-article-meta">#' + esc(String(ex.id)) + '</td>' +
      '<td class="kb-article-meta">' + started + '</td>' +
      '<td class="kb-article-meta">' + duration + '</td>' +
      '<td class="kb-article-meta">' + esc(mode) + '</td>' +
      '<td style="text-align:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6"><polyline points="9 18 15 12 9 6"/></svg></td>' +
    '</tr>';
  }
  html += '</tbody></table></div>';

  // Pagination controls
  html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;font-size:13px;color:var(--color-text-muted)">';
  html += '<span>Showing ' + (startIdx + 1) + '–' + Math.min(startIdx + perPage, executions.length) + ' of ' + executions.length + ' executions' + (monExecCursor ? ' (more available)' : '') + '</span>';
  html += '<div style="display:flex;gap:6px;align-items:center">';
  if (curPage > 0) {
    html += '<button class="btn btn-secondary btn-sm" onclick="monExecGoToPage(0)"><i class="fa fa-angle-double-left"></i></button>';
    html += '<button class="btn btn-secondary btn-sm" onclick="monExecGoToPage(' + (curPage - 1) + ')"><i class="fa fa-angle-left"></i></button>';
  }
  html += '<span style="padding:0 8px">Page ' + (curPage + 1) + ' / ' + totalPages + '</span>';
  if (curPage < totalPages - 1) {
    html += '<button class="btn btn-secondary btn-sm" onclick="monExecGoToPage(' + (curPage + 1) + ')"><i class="fa fa-angle-right"></i></button>';
    html += '<button class="btn btn-secondary btn-sm" onclick="monExecGoToPage(' + (totalPages - 1) + ')"><i class="fa fa-angle-double-right"></i></button>';
  }
  if (monExecCursor) {
    html += '<button class="btn btn-primary btn-sm" style="margin-left:8px" onclick="monExecLoadMore()"><i class="fa fa-plus"></i> Load More</button>';
  }
  html += '</div></div>';

  container.innerHTML = html;

  // Render charts after DOM is updated
  renderMonCharts(executions, successCount, errorCount, runningCount);
}

var monTimelineChartInstance = null;
var monStatusChartInstance = null;

function renderMonCharts(executions, successCount, errorCount, runningCount) {
  if (typeof Chart === 'undefined') return;

  // --- Timeline chart: executions grouped by hour ---
  var timelineCanvas = document.getElementById('monTimelineChart');
  if (!timelineCanvas) return;

  // Group executions by hour buckets (last 24 hours)
  var now = new Date();
  var hours = {};
  for (var h = 23; h >= 0; h--) {
    var d = new Date(now);
    d.setHours(d.getHours() - h, 0, 0, 0);
    var key = d.toISOString().slice(0, 13);
    hours[key] = { success: 0, error: 0, other: 0, label: d.getHours() + ':00' };
  }

  for (var i = 0; i < executions.length; i++) {
    var ex = executions[i];
    if (!ex.startedAt) continue;
    var key = new Date(ex.startedAt).toISOString().slice(0, 13);
    if (hours[key]) {
      if (ex.status === 'success') hours[key].success++;
      else if (ex.status === 'error') hours[key].error++;
      else hours[key].other++;
    }
  }

  var labels = [];
  var successData = [];
  var errorData = [];
  var otherData = [];
  var keys = Object.keys(hours).sort();
  for (var i = 0; i < keys.length; i++) {
    var b = hours[keys[i]];
    labels.push(b.label);
    successData.push(b.success);
    errorData.push(b.error);
    otherData.push(b.other);
  }

  if (monTimelineChartInstance) monTimelineChartInstance.destroy();
  var cs = getComputedStyle(document.documentElement);
  monTimelineChartInstance = new Chart(timelineCanvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Success', data: successData, backgroundColor: cs.getPropertyValue('--color-success').trim() || '#10b981', borderRadius: 3 },
        { label: 'Error', data: errorData, backgroundColor: cs.getPropertyValue('--color-danger').trim() || '#ef4444', borderRadius: 3 },
        { label: 'Other', data: otherData, backgroundColor: '#94a3b8', borderRadius: 3 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16, font: { size: 11 } } } },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
        y: { stacked: true, beginAtZero: true, ticks: { font: { size: 10 }, stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.05)' } }
      }
    }
  });

  // --- Status donut chart ---
  var statusCanvas = document.getElementById('monStatusChart');
  if (!statusCanvas) return;

  var waitingCount = 0, canceledCount = 0;
  for (var i = 0; i < executions.length; i++) {
    if (executions[i].status === 'waiting') waitingCount++;
    else if (executions[i].status === 'canceled') canceledCount++;
  }
  var otherCount = executions.length - successCount - errorCount - runningCount - waitingCount - canceledCount;
  if (otherCount < 0) otherCount = 0;

  var donutLabels = [];
  var donutData = [];
  var donutColors = [];
  if (successCount > 0) { donutLabels.push('Success'); donutData.push(successCount); donutColors.push(cs.getPropertyValue('--color-success').trim() || '#10b981'); }
  if (errorCount > 0) { donutLabels.push('Error'); donutData.push(errorCount); donutColors.push(cs.getPropertyValue('--color-danger').trim() || '#ef4444'); }
  if (runningCount > 0) { donutLabels.push('Running'); donutData.push(runningCount); donutColors.push(cs.getPropertyValue('--color-primary').trim() || '#6366f1'); }
  if (waitingCount > 0) { donutLabels.push('Waiting'); donutData.push(waitingCount); donutColors.push('#e65100'); }
  if (canceledCount > 0) { donutLabels.push('Canceled'); donutData.push(canceledCount); donutColors.push('#94a3b8'); }
  if (otherCount > 0) { donutLabels.push('Other'); donutData.push(otherCount); donutColors.push('#cbd5e1'); }

  if (donutData.length === 0) { donutLabels.push('None'); donutData.push(1); donutColors.push('#e2e8f0'); }

  if (monStatusChartInstance) monStatusChartInstance.destroy();
  monStatusChartInstance = new Chart(statusCanvas, {
    type: 'doughnut',
    data: {
      labels: donutLabels,
      datasets: [{ data: donutData, backgroundColor: donutColors, borderWidth: 2, borderColor: cs.getPropertyValue('--color-card').trim() || '#fff' }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } }
      }
    }
  });
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '—';
  if (ms < 1000) return ms + 'ms';
  var secs = Math.floor(ms / 1000);
  if (secs < 60) return secs + 's';
  var mins = Math.floor(secs / 60);
  var remSecs = secs % 60;
  if (mins < 60) return mins + 'm ' + remSecs + 's';
  var hours = Math.floor(mins / 60);
  var remMins = mins % 60;
  return hours + 'h ' + remMins + 'm';
}

function openExecution(id, workflowId) {
  monViewingDetail = true;
  loadExecutionDetail(id);
}

var currentExecDetail = null;

async function loadExecutionDetail(id) {
  var container = document.getElementById('monitoringContent');
  container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--color-text-muted)">Loading execution...</div>';
  try {
    var res = await fetch(monUrl('/api/monitoring/executions/' + encodeURIComponent(id)));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var ex = await res.json();
    currentExecDetail = ex;
    var wfName = ex.workflowName || (ex.workflowData ? ex.workflowData.name : 'Unknown');
    var wfId = ex.workflowId || '';
    var statusClass = ex.status || 'unknown';
    var started = ex.startedAt ? new Date(ex.startedAt).toLocaleString() : '—';
    var stopped = ex.stoppedAt ? new Date(ex.stoppedAt).toLocaleString() : '—';
    var duration = (ex.startedAt && ex.stoppedAt) ? formatDuration(new Date(ex.stoppedAt) - new Date(ex.startedAt)) : '—';

    // Header
    var html = '<div style="padding:20px">';
    html += '<div class="mon-detail-header">';
    html += '<button class="btn" onclick="monViewingDetail=false;loadMonitoringData(true)" style="padding:4px 10px"><i class="fa fa-arrow-left"></i></button>';
    html += '<h3 style="margin:0">Execution #' + esc(String(id)) + '</h3>';
    html += '<span class="ticket-badge badge-' + statusClass + '">' + esc(ex.status || 'unknown') + '</span>';
    html += '<div class="mon-detail-actions">';
    if (ex.status === 'error') {
      html += '<button class="btn btn-primary" onclick="reportIssueFromExecution()"><i class="fa fa-ticket"></i> Report Issue</button>';
      if (aiEnabled) {
        html += '<button class="btn btn-secondary" onclick="aiAnalyzeError(\'' + esc(String(id)) + '\')">&#10024; Analyze Error</button>';
      }
    }
    var s = getSettings();
    if (s.n8nUrl && wfId) {
      html += '<button class="btn btn-secondary" onclick="window.open(\'' + esc(s.n8nUrl.replace(/\/+$/, '')) + '/workflow/' + esc(wfId) + '/executions/' + esc(String(id)) + '\',\'_blank\')"><i class="fa fa-external-link"></i> Open in n8n</button>';
    }
    html += '</div></div>';

    // KPI grid
    html += '<div class="mon-detail-grid">';
    html += '<div class="mon-kpi-card"><div class="mon-kpi-label">Workflow</div><div style="font-weight:600;font-size:14px;margin-top:4px">' + esc(wfName) + '</div></div>';
    html += '<div class="mon-kpi-card"><div class="mon-kpi-label">Started</div><div style="font-weight:600;font-size:14px;margin-top:4px">' + started + '</div></div>';
    html += '<div class="mon-kpi-card"><div class="mon-kpi-label">Finished</div><div style="font-weight:600;font-size:14px;margin-top:4px">' + stopped + '</div></div>';
    html += '<div class="mon-kpi-card"><div class="mon-kpi-label">Duration</div><div style="font-weight:600;font-size:14px;margin-top:4px">' + duration + '</div></div>';
    html += '<div class="mon-kpi-card"><div class="mon-kpi-label">Mode</div><div style="font-weight:600;font-size:14px;margin-top:4px">' + esc(ex.mode || '—') + '</div></div>';
    html += '</div>';

    // Global error
    if (ex.data && ex.data.resultData && ex.data.resultData.error) {
      var err = ex.data.resultData.error;
      var errText = err.message || err.description || JSON.stringify(err);
      html += '<div class="mon-exec-error" style="margin-bottom:16px"><strong>Error:</strong> ' + esc(errText) + '</div>';
    }

    // AI Analysis container (populated by aiAnalyzeError)
    if (ex.status === 'error' && aiEnabled) {
      html += '<div id="aiAnalysisContainer"></div>';
    }

    // Linked tickets
    if (ex.linkedTickets && ex.linkedTickets.length > 0) {
      html += '<div class="mon-chart-card" style="margin-bottom:16px"><h4>Linked Tickets</h4>';
      for (var i = 0; i < ex.linkedTickets.length; i++) {
        var lt = ex.linkedTickets[i];
        html += '<div class="linked-exec-item" onclick="switchPanel(\'tickets\');setTimeout(function(){openTicketDetail(' + lt.ticket_id + ')},300)">';
        html += '<span class="ticket-badge badge-' + esc(lt.status) + '" style="font-size:10px">' + esc(lt.status.replace(/_/g, ' ')) + '</span>';
        html += '<span class="linked-exec-wf">#' + lt.ticket_id + ' — ' + esc(lt.title) + '</span>';
        html += '</div>';
      }
      html += '</div>';
    }

    // Node execution timeline
    html += '<div class="mon-chart-card"><h4>Node Execution Timeline</h4>';
    var runData = (ex.data && ex.data.resultData) ? ex.data.resultData.runData : null;
    if (runData && Object.keys(runData).length > 0) {
      // Sort nodes by startTime
      var nodes = [];
      for (var nodeName in runData) {
        var runs = runData[nodeName];
        if (runs && runs.length > 0) {
          var run = runs[0];
          nodes.push({
            name: nodeName,
            startTime: run.startTime || 0,
            executionTime: run.executionTime || 0,
            status: run.executionStatus || 'unknown',
            error: run.error,
            data: run.data
          });
        }
      }
      nodes.sort(function(a, b) { return a.startTime - b.startTime; });

      html += '<div class="mon-node-timeline">';
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var nClass = node.status === 'error' ? ' error' : (node.status === 'running' ? ' running' : '');
        html += '<div class="mon-node-item' + nClass + '" onclick="toggleNodeData(this)">';
        html += '<div class="mon-node-header">';
        html += '<span class="mon-node-name">' + esc(node.name) + '</span>';
        html += '<span class="ticket-badge badge-' + (node.status === 'success' ? 'success' : node.status === 'error' ? 'error' : 'running') + '" style="font-size:10px">' + esc(node.status) + '</span>';
        html += '<span class="mon-node-time">' + formatDuration(node.executionTime) + '</span>';
        html += '</div>';

        if (node.error) {
          var nodeErr = node.error.message || node.error.description || JSON.stringify(node.error);
          html += '<div class="mon-node-error">' + esc(nodeErr) + '</div>';
        }

        // Output data preview
        if (node.data && node.data.main) {
          var preview = '';
          try {
            var items = node.data.main[0] || [];
            var count = items.length;
            if (count > 0) {
              preview = count + ' item' + (count > 1 ? 's' : '') + ' — ';
              var sample = JSON.stringify(items[0].json || {}, null, 2);
              if (sample.length > 500) sample = sample.slice(0, 500) + '...';
              preview += sample;
            }
          } catch(e) { preview = 'Data available'; }
          html += '<div class="mon-node-data">' + esc(preview) + '</div>';
        }

        html += '</div>';
      }
      html += '</div>';
    } else {
      html += '<div style="padding:16px;text-align:center;color:var(--color-text-muted);font-size:13px">No node execution data available</div>';
    }
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--color-danger)">Failed to load execution detail: ' + esc(e.message) + '</div>';
  }
}

function toggleNodeData(el) {
  var d = el.querySelector('.mon-node-data');
  if (d) d.classList.toggle('open');
}

async function reportIssueFromExecution() {
  if (!currentExecDetail) return;
  var ex = currentExecDetail;
  var wfName = ex.workflowName || (ex.workflowData ? ex.workflowData.name : 'Unknown');

  // Build description from execution data
  var errMsg = '';
  if (ex.data && ex.data.resultData && ex.data.resultData.error) {
    var err = ex.data.resultData.error;
    errMsg = err.message || err.description || JSON.stringify(err);
  }
  // Find the failed node
  var failedNode = '';
  var runData = (ex.data && ex.data.resultData) ? ex.data.resultData.runData : {};
  for (var nodeName in runData) {
    var runs = runData[nodeName];
    if (runs && runs[0] && runs[0].executionStatus === 'error') {
      failedNode = nodeName;
      if (runs[0].error) {
        errMsg = runs[0].error.message || runs[0].error.description || errMsg;
      }
      break;
    }
  }

  // Build description with execution context
  var descParts = [];
  if (failedNode) descParts.push('<p>Failed node: <strong>' + escapeHtml(failedNode) + '</strong></p>');
  if (errMsg) descParts.push('<p>Error: ' + escapeHtml(errMsg) + '</p>');
  if (lastAiAnalysis) descParts.push('<p><strong>AI Analysis:</strong></p><p>' + escapeHtml(lastAiAnalysis) + '</p>');
  var desc = descParts.join('');

  // Open ticket modal with pre-filled data
  await Promise.all([loadTicketCategories(), loadAssignableUsers()]);
  populateTicketDropdowns();
  document.getElementById('ticketEditId').value = '';
  document.getElementById('ticketTitle').value = 'Workflow failed: ' + wfName;
  document.getElementById('ticketPriority').value = 'high';
  if (typeof syncCustomSelect === 'function') syncCustomSelect(document.getElementById('ticketPriority'));
  document.getElementById('ticketCategory').value = '';
  if (typeof syncCustomSelect === 'function') syncCustomSelect(document.getElementById('ticketCategory'));
  document.getElementById('ticketAssignee').value = '';
  if (typeof syncCustomSelect === 'function') syncCustomSelect(document.getElementById('ticketAssignee'));
  document.getElementById('ticketAttachments').innerHTML = '';
  document.getElementById('ticketModalTitle').textContent = 'Report Execution Issue';
  document.getElementById('ticketSaveBtn').textContent = 'Create Ticket';

  // Store execution context for sidebar (not in description)
  window._pendingExecLink = {
    execution_id: String(ex.id),
    workflow_id: ex.workflowId || '',
    workflow_name: wfName,
    status: ex.status
  };
  window._pendingExecutionData = {
    workflow_name: wfName,
    execution_id: String(ex.id),
    execution_status: ex.status,
    started_at: ex.startedAt || null,
    failed_node: failedNode || null,
    error_message: errMsg || null,
    ai_analysis: lastAiAnalysis || null,
  };

  // Show execution context panel in modal
  var ctxEl = document.getElementById('ticketExecContext');
  var ctxBody = document.getElementById('ticketExecContextBody');
  var ctxHtml = '';
  ctxHtml += '<span style="color:var(--color-text-muted)">Workflow:</span><span>' + escapeHtml(wfName) + '</span>';
  ctxHtml += '<span style="color:var(--color-text-muted)">Execution:</span><span>#' + escapeHtml(String(ex.id)) + '</span>';
  ctxHtml += '<span style="color:var(--color-text-muted)">Status:</span><span style="color:var(--color-error)">' + escapeHtml(ex.status || 'unknown') + '</span>';
  if (ex.startedAt) ctxHtml += '<span style="color:var(--color-text-muted)">Time:</span><span>' + new Date(ex.startedAt).toLocaleString() + '</span>';
  if (failedNode) ctxHtml += '<span style="color:var(--color-text-muted)">Failed Node:</span><span style="color:var(--color-error)">' + escapeHtml(failedNode) + '</span>';
  if (errMsg) ctxHtml += '<span style="color:var(--color-text-muted)">Error:</span><span style="word-break:break-word">' + escapeHtml(errMsg) + '</span>';
  ctxBody.innerHTML = ctxHtml;
  ctxEl.style.display = 'block';

  initEditor('ticketDescription', { level: 'compact', placeholder: 'Add any additional details...' });
  openModal('ticketModal');
  setupTicketDescDragDrop();
  // Set description after editor init
  setTimeout(function() {
    setEditorData('ticketDescription', desc);
  }, 300);
}
