// --- Dashboard ---
let dashboardLoaded = false;
let _dashSelectedInstance = null;

async function loadDashboard(instanceId) {
  const container = document.getElementById('dashboardContent');
  if (!container) return;
  container.innerHTML = '<div class="loading">Loading dashboard...</div>';

  try {
    let url = `${API}/api/dashboard`;
    const id = instanceId || _dashSelectedInstance;
    if (id) url += '?instance_id=' + id;
    const res = await fetch(url, { headers: CSRF_HEADERS });
    if (!res.ok) throw new Error('Failed to load');
    const data = await res.json();
    dashboardLoaded = true;
    if (data.selectedInstance) _dashSelectedInstance = data.selectedInstance;
    renderDashboard(data, container);
  } catch (err) {
    container.innerHTML = '<div class="loading" style="color:var(--color-danger)">Failed to load dashboard</div>';
  }
}

function switchDashInstance(instanceId) {
  _dashSelectedInstance = parseInt(instanceId, 10);
  loadDashboard(_dashSelectedInstance);
}

function renderDashboard(data, container) {
  const isWriter = data.user && (data.user.role === 'admin' || data.user.role === 'editor');
  let html = '';

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  html += `<div class="dash-greeting"><h2>${greeting}, ${escapeHtml(data.user.username)}</h2><span class="dash-greeting-sub">Here's what's happening across your n8n environment</span></div>`;

  // Instance selector (if multiple instances)
  if (isWriter && data.instances && data.instances.length > 1) {
    html += '<div class="dash-instance-switcher">';
    html += '<label style="font-size:12px;font-weight:600;color:var(--color-text-muted);margin-right:8px">Instance:</label>';
    html += '<select class="form-input" style="width:auto;display:inline-block;font-size:13px;padding:4px 10px" onchange="switchDashInstance(this.value)">';
    for (const inst of data.instances) {
      const sel = inst.id === data.selectedInstance ? ' selected' : '';
      html += `<option value="${inst.id}"${sel}>${escapeHtml(inst.name)}${inst.is_default ? ' (default)' : ''}</option>`;
    }
    html += '</select></div>';
  }

  // KPI row
  html += '<div class="dash-kpi-row">';

  // n8n health (writers only)
  if (isWriter && data.n8nHealth) {
    const hStatus = data.n8nHealth.status;
    const hColor = hStatus === 'healthy' ? 'var(--color-success)' : hStatus === 'unhealthy' ? 'var(--color-warning)' : 'var(--color-danger)';
    const hLabel = hStatus === 'healthy' ? 'Healthy' : hStatus === 'unhealthy' ? 'Unhealthy' : 'Unreachable';
    html += `<div class="dash-kpi" onclick="switchPanel('monitoring')">
      <div class="dash-kpi-icon" style="background:${hColor}20;color:${hColor}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
      <div class="dash-kpi-body"><div class="dash-kpi-value" style="color:${hColor}">${hLabel}</div><div class="dash-kpi-label">${data.instances && data.instances.length > 1 && data.selectedInstance ? escapeHtml((data.instances.find(i=>i.id===data.selectedInstance)||{}).name||'n8n') : 'n8n Instance'}${data.n8nHealth.latencyMs ? ' &middot; ' + data.n8nHealth.latencyMs + 'ms' : ''}</div></div>
    </div>`;
  }

  // Open tickets
  html += `<div class="dash-kpi" onclick="switchPanel('tickets')">
    <div class="dash-kpi-icon" style="background:var(--color-primary-light);color:var(--color-primary)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M15 5H9a2 2 0 0 0-2 2v12l5-3 5 3V7a2 2 0 0 0-2-2z"/></svg></div>
    <div class="dash-kpi-body"><div class="dash-kpi-value">${data.tickets.openCount}</div><div class="dash-kpi-label">Open Tickets</div></div>
  </div>`;

  // KB articles
  html += `<div class="dash-kpi" onclick="switchPanel('kb')">
    <div class="dash-kpi-icon" style="background:#e0f2fe;color:#0284c7"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div>
    <div class="dash-kpi-body"><div class="dash-kpi-value">${data.kb.totalPublished}</div><div class="dash-kpi-label">Published Articles</div></div>
  </div>`;

  // Templates
  html += `<div class="dash-kpi" onclick="switchPanel('library')">
    <div class="dash-kpi-icon" style="background:#fef3c7;color:#d97706"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg></div>
    <div class="dash-kpi-body"><div class="dash-kpi-value">${data.templates.total}</div><div class="dash-kpi-label">Templates</div></div>
  </div>`;

  // Execution success rate (writers only)
  if (isWriter && data.executions) {
    const rateColor = data.executions.successRate >= 80 ? 'var(--color-success)' : data.executions.successRate >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';
    html += `<div class="dash-kpi" onclick="switchPanel('monitoring')">
      <div class="dash-kpi-icon" style="background:var(--color-success-light);color:var(--color-success)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polyline points="20 6 9 17 4 12"/></svg></div>
      <div class="dash-kpi-body"><div class="dash-kpi-value" style="color:${rateColor}">${data.executions.successRate}%</div><div class="dash-kpi-label">Success Rate (last ${data.executions.total})</div></div>
    </div>`;
  }

  html += '</div>'; // end kpi row

  // Two-column layout
  html += '<div class="dash-grid">';

  // --- Left column ---
  html += '<div class="dash-col">';

  // My assigned tickets
  if (data.tickets.myTickets.length > 0) {
    html += '<div class="dash-card"><div class="dash-card-header"><h3>My Tickets</h3><button class="btn btn-secondary btn-sm" onclick="switchPanel(\'tickets\')">View All</button></div>';
    html += '<div class="dash-card-list">';
    for (const t of data.tickets.myTickets) {
      html += `<div class="dash-card-item" onclick="switchPanel('tickets');setTimeout(()=>openTicketDetail(${t.id}),200)">
        <span class="ticket-badge badge-${t.priority}" style="font-size:10px">${t.priority}</span>
        <span class="dash-item-title">${escapeHtml(t.title)}</span>
        <span class="ticket-badge badge-${t.status}" style="font-size:10px">${t.status.replace('_',' ')}</span>
      </div>`;
    }
    html += '</div></div>';
  }

  // Recent failed executions (writers only)
  if (isWriter && data.executions && data.executions.recent) {
    const failed = data.executions.recent.filter(e => e.status === 'error');
    if (failed.length > 0) {
      html += '<div class="dash-card dash-card-danger"><div class="dash-card-header"><h3>Recent Failures</h3><button class="btn btn-secondary btn-sm" onclick="switchPanel(\'monitoring\')">View All</button></div>';
      html += '<div class="dash-card-list">';
      for (const e of failed.slice(0, 5)) {
        const name = e.workflowName || 'Workflow #' + e.workflowId;
        const time = formatDashTime(e.stoppedAt || e.startedAt);
        html += `<div class="dash-card-item" onclick="switchPanel('monitoring');setTimeout(()=>loadExecutionDetail('${e.id}'),300)">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" stroke-width="2" width="14" height="14" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span class="dash-item-title">${escapeHtml(name)}</span>
          <span class="dash-item-meta">${time}</span>
        </div>`;
      }
      html += '</div></div>';
    }
  }

  // Ticket status breakdown
  const statuses = data.tickets.byStatus;
  if (Object.keys(statuses).length > 0) {
    html += '<div class="dash-card"><div class="dash-card-header"><h3>Tickets by Status</h3></div>';
    html += '<div class="dash-status-bars">';
    const statusOrder = ['open', 'in_progress', 'waiting', 'resolved', 'closed'];
    const statusColors = { open: 'var(--color-primary)', in_progress: 'var(--color-warning)', waiting: 'var(--color-text-muted)', resolved: 'var(--color-success)', closed: 'var(--color-text-xmuted)' };
    const maxCount = Math.max(...Object.values(statuses), 1);
    for (const s of statusOrder) {
      const count = statuses[s] || 0;
      if (count === 0) continue;
      const pct = Math.max((count / maxCount) * 100, 8);
      html += `<div class="dash-status-row">
        <span class="dash-status-label">${s.replace('_', ' ')}</span>
        <div class="dash-status-track"><div class="dash-status-fill" style="width:${pct}%;background:${statusColors[s] || 'var(--color-text-muted)'}"></div></div>
        <span class="dash-status-count">${count}</span>
      </div>`;
    }
    html += '</div></div>';
  }

  html += '</div>'; // end left col

  // --- Right column ---
  html += '<div class="dash-col">';

  // Recent executions (writers only)
  if (isWriter && data.executions && data.executions.recent.length > 0) {
    html += '<div class="dash-card"><div class="dash-card-header"><h3>Recent Executions</h3><button class="btn btn-secondary btn-sm" onclick="switchPanel(\'monitoring\')">View All</button></div>';
    html += '<div class="dash-card-list">';
    for (const e of data.executions.recent.slice(0, 6)) {
      const name = e.workflowName || 'Workflow #' + e.workflowId;
      const time = formatDashTime(e.stoppedAt || e.startedAt);
      const statusIcon = e.status === 'success'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2" width="14" height="14" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>'
        : e.status === 'error'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" stroke-width="2" width="14" height="14" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" stroke-width="2" width="14" height="14" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
      html += `<div class="dash-card-item" onclick="switchPanel('monitoring');setTimeout(()=>loadExecutionDetail('${e.id}'),300)">
        ${statusIcon}
        <span class="dash-item-title">${escapeHtml(name)}</span>
        <span class="dash-item-meta">${time}</span>
      </div>`;
    }
    html += '</div></div>';
  }

  // Popular KB articles
  if (data.kb.popular.length > 0) {
    html += '<div class="dash-card"><div class="dash-card-header"><h3>Popular Articles</h3><button class="btn btn-secondary btn-sm" onclick="switchPanel(\'kb\')">View All</button></div>';
    html += '<div class="dash-card-list">';
    for (const a of data.kb.popular) {
      html += `<div class="dash-card-item" onclick="switchPanel('kb');setTimeout(()=>viewKbArticle(${a.id}),200)">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" stroke-width="2" width="14" height="14" style="flex-shrink:0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span class="dash-item-title">${escapeHtml(a.title)}</span>
        <span class="dash-item-meta">${a.view_count} views</span>
      </div>`;
    }
    html += '</div></div>';
  }

  // Recent tickets
  if (data.tickets.recentTickets.length > 0) {
    html += '<div class="dash-card"><div class="dash-card-header"><h3>Recent Tickets</h3><button class="btn btn-secondary btn-sm" onclick="switchPanel(\'tickets\')">View All</button></div>';
    html += '<div class="dash-card-list">';
    for (const t of data.tickets.recentTickets) {
      const time = formatDashTime(t.created_at);
      html += `<div class="dash-card-item" onclick="switchPanel('tickets');setTimeout(()=>openTicketDetail(${t.id}),200)">
        <span class="ticket-badge badge-${t.priority}" style="font-size:10px">${t.priority}</span>
        <span class="dash-item-title">${escapeHtml(t.title)}</span>
        <span class="dash-item-meta">${time}</span>
      </div>`;
    }
    html += '</div></div>';
  }

  html += '</div>'; // end right col
  html += '</div>'; // end grid

  container.innerHTML = html;
  if (typeof upgradeSelects === 'function') upgradeSelects(container);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDashTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
  return d.toLocaleDateString();
}
