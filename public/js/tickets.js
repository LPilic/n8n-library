// --- Service Desk ---
let ticketCategories = [];
let assignableUsers = [];
let currentTicketPage = 1;
let currentTicketDetail = null;

function kpiClick(field, value) {
  const sel = document.getElementById(field);
  sel.value = sel.value === value ? '' : value;
  if (typeof syncCustomSelect === 'function') syncCustomSelect(sel);
  loadTickets();
  loadTicketStats();
}

function restoreTicketListView() {
  const ticketPanel = document.getElementById('panel-tickets');
  const panelSidebar = ticketPanel.querySelector('.ticket-panel-sidebar');
  const panelToolbar = ticketPanel.querySelector('.toolbar');
  if (panelSidebar) panelSidebar.style.display = '';
  if (panelToolbar) panelToolbar.style.display = '';
}

let _ticketSearchTimer;
function debouncedLoadTickets() {
  clearTimeout(_ticketSearchTimer);
  _ticketSearchTimer = setTimeout(loadTickets, 300);
}

async function updateOpenTicketBadge() {
  try {
    const res = await fetch(`${API}/api/tickets?status=open`);
    if (!res.ok) return;
    const data = await res.json();
    const count = data.total || 0;
    const ids = ['ticketNavBadge', 'mobileTicketBadge'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (count > 0) { el.textContent = count; el.style.display = ''; }
      else el.style.display = 'none';
    }
  } catch (e) { /* ignore */ }
}

async function loadTickets(page) {
  if (page) currentTicketPage = page;
  const status = document.getElementById('ticketFilterStatus').value;
  const priority = document.getElementById('ticketFilterPriority').value;
  const mine = document.getElementById('ticketFilterMine').checked;
  const search = document.getElementById('ticketSearch').value.trim();

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (priority) params.set('priority', priority);
  if (mine) params.set('mine', 'true');
  if (search) params.set('search', search);
  params.set('page', currentTicketPage);

  try {
    const res = await fetch(`${API}/api/tickets?${params}`);
    if (!res.ok) return;
    const data = await res.json();
    renderTicketList(data);

    // Update badge
    updateOpenTicketBadge();
  } catch (e) {
    console.warn('Failed to load tickets');
  }
}

function renderTicketList(data) {
  const { tickets, total, page, pages } = data;
  const container = document.getElementById('ticketsContent');
  if (tickets.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No tickets found</p></div>';
    return;
  }

  let html = `<div class="users-card"><table class="tickets-table">
    <thead><tr>
      <th>#</th><th>Title</th><th>Status</th><th>Priority</th><th>Category</th><th>Assignee</th><th>Created</th>
    </tr></thead><tbody>`;

  for (const t of tickets) {
    const statusLabel = (t.status || '').replace(/_/g, ' ');
    html += `<tr onclick="openTicketDetail(${t.id})">
      <td><span class="ticket-id">#${t.id}</span></td>
      <td><span class="ticket-title-cell">${esc(t.title)}</span>${t.comment_count > 0 ? `<span class="ticket-comment-count"><i class="fa fa-comment-o"></i> ${t.comment_count}</span>` : ''}</td>
      <td><span class="ticket-badge badge-${t.status}">${esc(statusLabel)}</span></td>
      <td><span class="ticket-badge badge-${t.priority}">${esc(t.priority)}</span></td>
      <td class="ticket-meta">${esc(t.category_name || '—')}</td>
      <td class="ticket-meta">${esc(t.assignee_name || 'Unassigned')}</td>
      <td class="ticket-meta">${timeAgo(t.created_at)}</td>
    </tr>`;
  }
  html += '</tbody></table></div>';

  if (pages > 1) {
    html += '<div class="ticket-pagination">';
    for (let p = 1; p <= pages; p++) {
      html += `<button class="${p === page ? 'active' : ''}" onclick="loadTickets(${p})">${p}</button>`;
    }
    html += '</div>';
  }
  html += `<div style="text-align:center;font-size:12px;color:var(--color-text-muted);padding:4px 0">${total} ticket${total !== 1 ? 's' : ''}</div>`;
  container.innerHTML = html;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return d.toLocaleDateString();
}

async function loadTicketStats() {
  const container = document.getElementById('ticketStatsContainer');
  if (!currentUser || !['admin', 'editor'].includes(currentUser.role)) {
    container.innerHTML = '';
    return;
  }
  try {
    const res = await fetch(`${API}/api/tickets/stats`);
    if (!res.ok) return;
    const data = await res.json();

    const sm = {};
    for (const s of data.byStatus) sm[s.status] = s.count;
    const pm = {};
    for (const p of data.byPriority) pm[p.priority] = p.count;
    const total = Object.values(sm).reduce((a, b) => a + b, 0);
    const openCount = (sm.open || 0) + (sm.in_progress || 0) + (sm.waiting || 0);
    const activeFilter = document.getElementById('ticketFilterStatus').value;

    container.innerHTML = `
      <div class="ticket-kpi-card kpi-status">
        <div class="kpi-header">By Status</div>
        <div class="kpi-item${activeFilter === 'open' ? ' active' : ''}" onclick="kpiClick('ticketFilterStatus','open')">
          <span class="kpi-label"><span class="kpi-dot" style="background:var(--color-primary)"></span>Open</span>
          <span class="kpi-value">${sm.open || 0}</span>
        </div>
        <div class="kpi-item${activeFilter === 'in_progress' ? ' active' : ''}" onclick="kpiClick('ticketFilterStatus','in_progress')">
          <span class="kpi-label"><span class="kpi-dot" style="background:var(--color-warning)"></span>In Progress</span>
          <span class="kpi-value">${sm.in_progress || 0}</span>
        </div>
        <div class="kpi-item${activeFilter === 'waiting' ? ' active' : ''}" onclick="kpiClick('ticketFilterStatus','waiting')">
          <span class="kpi-label"><span class="kpi-dot" style="background:var(--color-text-muted)"></span>Waiting</span>
          <span class="kpi-value">${sm.waiting || 0}</span>
        </div>
        <div class="kpi-item${activeFilter === 'resolved' ? ' active' : ''}" onclick="kpiClick('ticketFilterStatus','resolved')">
          <span class="kpi-label"><span class="kpi-dot" style="background:var(--color-success)"></span>Resolved</span>
          <span class="kpi-value">${sm.resolved || 0}</span>
        </div>
        <div class="kpi-item${activeFilter === 'closed' ? ' active' : ''}" onclick="kpiClick('ticketFilterStatus','closed')">
          <span class="kpi-label"><span class="kpi-dot" style="background:var(--color-text-xmuted)"></span>Closed</span>
          <span class="kpi-value">${sm.closed || 0}</span>
        </div>
      </div>
      <div class="ticket-kpi-card kpi-overview">
        <div class="kpi-header">Overview</div>
        <div class="kpi-big">
          <div class="kpi-big-value" style="color:var(--color-primary)">${openCount}</div>
          <div class="kpi-big-label">Active Tickets</div>
        </div>
        <div class="kpi-item">
          <span class="kpi-label">Unassigned</span>
          <span class="kpi-value" style="color:var(--color-warning)">${data.unassigned}</span>
        </div>
        <div class="kpi-item">
          <span class="kpi-label">Total</span>
          <span class="kpi-value">${total}</span>
        </div>
        <div class="kpi-item">
          <span class="kpi-label">Avg Resolution</span>
          <span class="kpi-value" style="font-size:13px">${data.avgResolutionHours ? data.avgResolutionHours + 'h' : '—'}</span>
        </div>
      </div>
      <div class="ticket-kpi-card kpi-priority">
        <div class="kpi-header">By Priority</div>
        <div class="kpi-item" onclick="kpiClick('ticketFilterPriority','critical')">
          <span class="kpi-label"><span class="kpi-dot" style="background:var(--color-danger)"></span>Critical</span>
          <span class="kpi-value">${pm.critical || 0}</span>
        </div>
        <div class="kpi-item" onclick="kpiClick('ticketFilterPriority','high')">
          <span class="kpi-label"><span class="kpi-dot" style="background:#e65100"></span>High</span>
          <span class="kpi-value">${pm.high || 0}</span>
        </div>
        <div class="kpi-item" onclick="kpiClick('ticketFilterPriority','medium')">
          <span class="kpi-label"><span class="kpi-dot" style="background:#1565c0"></span>Medium</span>
          <span class="kpi-value">${pm.medium || 0}</span>
        </div>
        <div class="kpi-item" onclick="kpiClick('ticketFilterPriority','low')">
          <span class="kpi-label"><span class="kpi-dot" style="background:var(--color-text-muted)"></span>Low</span>
          <span class="kpi-value">${pm.low || 0}</span>
        </div>
      </div>`;
  } catch (e) {
    console.warn('Failed to load ticket stats');
  }
}

async function loadTicketCategories() {
  try {
    const res = await fetch(`${API}/api/ticket-categories`);
    if (!res.ok) return;
    ticketCategories = await res.json();
  } catch (e) { /* ignore */ }
}

async function loadAssignableUsers() {
  try {
    const res = await fetch(`${API}/api/tickets/assignable-users`);
    if (!res.ok) return;
    assignableUsers = await res.json();
  } catch (e) { /* ignore */ }
}

function populateTicketDropdowns() {
  const catSel = document.getElementById('ticketCategory');
  catSel.innerHTML = '<option value="">None</option>' + ticketCategories.map(c =>
    `<option value="${c.id}">${esc(c.name)}</option>`
  ).join('');
  refreshCustomSelect(catSel);

  const assignSel = document.getElementById('ticketAssignee');
  assignSel.innerHTML = '<option value="">Unassigned</option>' + assignableUsers.map(u =>
    `<option value="${u.id}">${esc(u.username)} (${esc(u.email)})</option>`
  ).join('');
  refreshCustomSelect(assignSel);
}

// --- Ticket image upload ---
function handleTicketImageUpload(input) {
  const files = input.files;
  if (!files || !files.length) return;
  for (const file of files) uploadTicketImage(file);
  input.value = '';
}

function uploadTicketImage(file) {
  if (!file.type.match(/^image\/(png|jpe?g|gif|webp)$/)) return toast('Unsupported image format', 'error');
  if (file.size > 5 * 1024 * 1024) return toast('Image too large (max 5MB)', 'error');

  const container = document.getElementById('ticketAttachments');
  const item = document.createElement('div');
  item.className = 'ticket-att uploading';
  item.innerHTML = `<span class="ticket-att-spinner"></span><span class="ticket-att-name">${esc(file.name)}</span>`;
  container.appendChild(item);

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const res = await fetch(`${API}/api/public/ticket-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: reader.result })
      });
      const data = await res.json();
      if (!res.ok) { item.remove(); return toast(data.error || 'Upload failed', 'error'); }

      item.className = 'ticket-att';
      item.innerHTML = `<img src="${data.url}" alt=""><span class="ticket-att-name">${esc(file.name)}</span><button class="ticket-att-remove" onclick="this.parentElement.remove()" title="Remove">&times;</button>`;

      // Image is shown in attachments list; optionally embed in editor
      var q = quillEditors['ticketDescription'];
      if (q) {
        var range = q.getSelection(true);
        q.insertEmbed(range ? range.index : q.getLength(), 'image', data.url);
      }
    } catch (e) {
      item.remove();
      toast('Upload failed', 'error');
    }
  };
  reader.readAsDataURL(file);
}

// Setup dropzone drag/drop highlight + paste on textarea
function setupTicketDescDragDrop() {
  const zone = document.getElementById('ticketDropzone');
  const ta = document.getElementById('ticketDescription');
  if (!zone || zone._ddSetup) return;
  zone._ddSetup = true;

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('active'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('active'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('active');
    for (const file of e.dataTransfer.files) {
      if (file.type.match(/^image\//)) uploadTicketImage(file);
    }
  });

  // Allow paste images in editor area
  var editorEl = document.querySelector('#ticketDescription .ql-editor');
  if (editorEl) {
    editorEl.addEventListener('paste', function(e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image/') === 0) {
          uploadTicketImage(items[i].getAsFile());
          return;
        }
      }
    });
  }
}

async function openCreateTicketModal() {
  await Promise.all([loadTicketCategories(), loadAssignableUsers()]);
  populateTicketDropdowns();
  document.getElementById('ticketEditId').value = '';
  document.getElementById('ticketTitle').value = '';
  initEditor('ticketDescription', { level: 'compact', placeholder: 'Describe the issue in detail...' });
  document.getElementById('ticketPriority').value = 'medium';
  if (typeof syncCustomSelect === 'function') syncCustomSelect(document.getElementById('ticketPriority'));
  document.getElementById('ticketCategory').value = '';
  if (typeof syncCustomSelect === 'function') syncCustomSelect(document.getElementById('ticketCategory'));
  document.getElementById('ticketAssignee').value = '';
  if (typeof syncCustomSelect === 'function') syncCustomSelect(document.getElementById('ticketAssignee'));
  document.getElementById('ticketAttachments').innerHTML = '';
  document.getElementById('ticketModalTitle').textContent = 'New Ticket';
  document.getElementById('ticketSaveBtn').textContent = 'Create Ticket';
  document.getElementById('ticketExecContext').style.display = 'none';
  window._pendingExecutionData = null;
  window._pendingExecLink = null;
  openModal('ticketModal');
  setupTicketDescDragDrop();
}

async function saveTicket() {
  const title = document.getElementById('ticketTitle').value.trim();
  if (!title) return toast('Title is required', 'error');

  const body = {
    title,
    description: getEditorHtml('ticketDescription'),
    priority: document.getElementById('ticketPriority').value,
    category_id: document.getElementById('ticketCategory').value || null,
    assigned_to: document.getElementById('ticketAssignee').value || null,
  };

  // Attach execution data if reporting from monitoring
  if (window._pendingExecutionData) {
    body.execution_data = window._pendingExecutionData;
  }

  try {
    const res = await fetch(`${API}/api/tickets`, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      return toast(data.error || 'Failed to create ticket', 'error');
    }
    const created = await res.json();
    // Link execution if this ticket was created from monitoring
    if (window._pendingExecLink && created.id) {
      try {
        await fetch(`${API}/api/tickets/${created.id}/executions`, {
          method: 'POST',
          headers: CSRF_HEADERS,
          body: JSON.stringify(window._pendingExecLink),
        });
      } catch (e) {}
      window._pendingExecLink = null;
    }
    window._pendingExecutionData = null;
    toast('Ticket created', 'success');
    closeModal('ticketModal');
    loadTickets();
    loadTicketStats();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function openTicketDetail(id) {
  try {
    const res = await fetch(`${API}/api/tickets/${id}`);
    if (!res.ok) return toast('Failed to load ticket', 'error');
    const ticket = await res.json();
    currentTicketDetail = ticket;

    await Promise.all([loadTicketCategories(), loadAssignableUsers()]);

    const isStaff = currentUser && ['admin', 'editor'].includes(currentUser.role);
    const statusLabel = (ticket.status || '').replace(/_/g, ' ');

    // Header badges
    document.getElementById('ticketDetailTitle').textContent = `#${ticket.id} — ${ticket.title}`;
    document.getElementById('ticketDeleteBtn').style.display = (currentUser && currentUser.role === 'admin') ? '' : 'none';
    const sBadge = document.getElementById('ticketDetailStatusBadge');
    sBadge.className = `ticket-badge badge-${ticket.status}`;
    sBadge.textContent = statusLabel;
    const pBadge = document.getElementById('ticketDetailPriorityBadge');
    pBadge.className = `ticket-badge badge-${ticket.priority}`;
    pBadge.textContent = ticket.priority;

    // --- Sidebar ---
    let sb = '<div class="ticket-detail-sidebar">';
    sb += '<div class="sidebar-section-title">Details</div>';

    // Status
    sb += '<div class="detail-field"><label>Status</label>';
    if (isStaff) {
      sb += `<select class="form-input" onchange="updateTicketField(${ticket.id},'status',this.value)">
        ${['open','in_progress','waiting','resolved','closed'].map(s =>
          `<option value="${s}" ${s === ticket.status ? 'selected' : ''}>${s.replace(/_/g,' ')}</option>`
        ).join('')}</select>`;
    } else {
      sb += `<span class="ticket-badge badge-${ticket.status}">${esc(statusLabel)}</span>`;
    }
    sb += '</div>';

    // Priority
    sb += '<div class="detail-field"><label>Priority</label>';
    if (isStaff) {
      sb += `<select class="form-input" onchange="updateTicketField(${ticket.id},'priority',this.value)">
        ${['low','medium','high','critical'].map(p =>
          `<option value="${p}" ${p === ticket.priority ? 'selected' : ''}>${p}</option>`
        ).join('')}</select>`;
    } else {
      sb += `<span class="ticket-badge badge-${ticket.priority}">${esc(ticket.priority)}</span>`;
    }
    sb += '</div>';

    // Category
    sb += '<div class="detail-field"><label>Category</label>';
    if (isStaff) {
      sb += `<select class="form-input" onchange="updateTicketField(${ticket.id},'category_id',this.value)">
        <option value="">None</option>
        ${ticketCategories.map(c => `<option value="${c.id}" ${c.id === ticket.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>`;
    } else {
      sb += `<span class="detail-value">${esc(ticket.category_name || '—')}</span>`;
    }
    sb += '</div>';

    // Assignee
    sb += '<div class="detail-field"><label>Assignee</label>';
    if (isStaff) {
      sb += `<select class="form-input" onchange="updateTicketField(${ticket.id},'assigned_to',this.value)">
        <option value="">Unassigned</option>
        ${assignableUsers.map(u => `<option value="${u.id}" ${u.id === ticket.assigned_to ? 'selected' : ''}>${esc(u.username)}</option>`).join('')}
      </select>`;
    } else {
      sb += `<span class="detail-value">${esc(ticket.assignee_name || 'Unassigned')}</span>`;
    }
    sb += '</div>';

    sb += '<div class="sidebar-section-title" style="margin-top:24px">Information</div>';
    sb += `<div class="detail-field"><label>Created By</label><span class="detail-value">${esc(ticket.creator_name)}</span></div>`;
    sb += `<div class="detail-field"><label>Created</label><span class="detail-value" style="font-size:12px;color:var(--color-text-muted)">${new Date(ticket.created_at).toLocaleString()}</span></div>`;
    sb += `<div class="detail-field"><label>Updated</label><span class="detail-value" style="font-size:12px;color:var(--color-text-muted)">${new Date(ticket.updated_at).toLocaleString()}</span></div>`;

    // Linked Executions
    if (ticket.executions && ticket.executions.length > 0) {
      sb += '<div class="sidebar-section-title" style="margin-top:24px">Linked Executions</div>';
      for (const ex of ticket.executions) {
        const exStatus = ex.status || 'unknown';
        sb += `<div class="linked-exec-item" onclick="switchPanel('monitoring');setTimeout(function(){loadExecutionDetail('${esc(ex.execution_id)}')},300)">
          <span class="ticket-badge badge-${exStatus}" style="font-size:10px">${esc(exStatus)}</span>
          <span class="linked-exec-wf">${esc(ex.workflow_name || 'Execution')} #${esc(ex.execution_id)}</span>
          ${isStaff ? `<button class="btn" style="padding:2px 6px;font-size:10px" onclick="event.stopPropagation();unlinkExecution(${ticket.id},'${esc(ex.execution_id)}')" title="Unlink">&times;</button>` : ''}
        </div>`;
      }
    }

    // Execution Context (from monitoring → ticket creation)
    if (ticket.execution_data) {
      const ed = ticket.execution_data;
      sb += '<div class="sidebar-section-title" style="margin-top:24px">Execution Context</div>';
      if (ed.workflow_name) {
        sb += `<div class="detail-field"><label>Workflow</label><span class="detail-value">${esc(ed.workflow_name)}</span></div>`;
      }
      if (ed.execution_id) {
        sb += `<div class="detail-field"><label>Execution ID</label><span class="detail-value" style="cursor:pointer;color:var(--color-primary)" onclick="switchPanel('monitoring');setTimeout(function(){loadExecutionDetail('${esc(ed.execution_id)}')},300)">${esc(ed.execution_id)}</span></div>`;
      }
      if (ed.execution_status) {
        const estClass = ed.execution_status === 'error' ? 'badge-open' : ed.execution_status === 'success' ? 'badge-resolved' : 'badge-waiting';
        sb += `<div class="detail-field"><label>Status</label><span class="ticket-badge ${estClass}" style="font-size:11px">${esc(ed.execution_status)}</span></div>`;
      }
      if (ed.started_at) {
        sb += `<div class="detail-field"><label>Time</label><span class="detail-value" style="font-size:12px;color:var(--color-text-muted)">${new Date(ed.started_at).toLocaleString()}</span></div>`;
      }
      if (ed.failed_node) {
        sb += `<div class="detail-field"><label>Failed Node</label><span class="detail-value" style="color:var(--color-error)">${esc(ed.failed_node)}</span></div>`;
      }
      if (ed.error_message) {
        sb += `<div class="detail-field"><label>Error</label><span class="detail-value" style="font-size:12px;word-break:break-word">${esc(ed.error_message)}</span></div>`;
      }
    }

    sb += '</div>';

    // --- Tabs: Comments | Activity (shared between desktop modal and mobile inline) ---
    let tabs = `<div class="ticket-tabs">
      <button class="ticket-tab active" onclick="switchTicketTab('comments')">Comments<span class="ticket-tab-count">${ticket.comments.length}</span></button>
      <button class="ticket-tab" onclick="switchTicketTab('activity')">Activity<span class="ticket-tab-count">${ticket.activity.length}</span></button>
    </div>`;

    tabs += '<div class="ticket-tab-panel active" id="ticketTabComments">';
    if (ticket.comments.length === 0) {
      tabs += '<div style="text-align:center;color:var(--color-text-xmuted);padding:24px 0;font-size:13px">No comments yet</div>';
    }
    for (const c of ticket.comments) {
      const initial = (c.username || '?')[0].toUpperCase();
      const isInternal = c.is_internal ? ' internal' : '';
      tabs += `<div class="ticket-comment${isInternal}">
        <div class="comment-avatar">${initial}</div>
        <div class="comment-body">
          <div class="comment-header">
            <strong>${esc(c.username)}</strong>
            ${c.is_internal ? '<span class="ticket-badge" style="background:#fff8e1;color:#e65100;font-size:10px;padding:1px 6px">internal</span>' : ''}
            <span class="comment-time">${timeAgo(c.created_at)}</span>
          </div>
          <div class="comment-text">${md(c.body)}</div>
        </div>
      </div>`;
    }

    tabs += `<div class="comment-input-wrap">
      <div class="quill-wrap quill-sm" id="newCommentWrap">
        <div id="newComment"></div>
      </div>
      <div class="comment-actions">
        ${isStaff ? `<button class="btn btn-secondary" onclick="addComment(${ticket.id}, true)" title="Only visible to editors and admins">Internal Note</button>` : ''}
        <button class="btn btn-primary" onclick="addComment(${ticket.id})">Comment</button>
      </div>
    </div>`;
    tabs += '</div>';

    tabs += '<div class="ticket-tab-panel" id="ticketTabActivity">';
    if (ticket.activity.length === 0) {
      tabs += '<div style="text-align:center;color:var(--color-text-xmuted);padding:24px 0;font-size:13px">No activity</div>';
    }
    for (const a of ticket.activity) {
      let desc = '';
      if (a.action === 'created') desc = 'created this ticket';
      else if (a.action === 'status_changed') desc = `changed status from <strong>${esc((a.old_value||'').replace(/_/g,' '))}</strong> to <strong>${esc((a.new_value||'').replace(/_/g,' '))}</strong>`;
      else if (a.action === 'priority_changed') desc = `changed priority from <strong>${esc(a.old_value||'')}</strong> to <strong>${esc(a.new_value||'')}</strong>`;
      else if (a.action === 'assigned') desc = `reassigned from <strong>${esc(a.old_value||'Unassigned')}</strong> to <strong>${esc(a.new_value||'Unassigned')}</strong>`;
      else if (a.action === 'commented') desc = a.new_value || 'added a comment';
      else if (a.action === 'category_changed') desc = 'changed category';
      else if (a.action === 'title_changed') desc = `changed title to <strong>${esc(a.new_value||'')}</strong>`;
      else if (a.action === 'description_changed') desc = 'updated description';
      else desc = a.action;

      tabs += `<div class="activity-item"><strong>${esc(a.username)}</strong> ${desc} <span class="activity-time">${timeAgo(a.created_at)}</span></div>`;
    }
    tabs += '</div>';

    // --- Desktop main panel (wraps description + tabs) ---
    const descHtml = ticket.description ? `<div class="ticket-detail-desc">${md(ticket.description)}</div>` : '';
    let m = `<div class="ticket-detail-main">${descHtml}${tabs}</div>`;

    const isMobile = window.innerWidth <= 850;

    if (isMobile) {
      // Inline view (like KB reader) — replace ticket list content
      // Hide sidebar KPI cards and toolbar on mobile detail view
      const ticketPanel = document.getElementById('panel-tickets');
      const panelSidebar = ticketPanel.querySelector('.ticket-panel-sidebar');
      const panelToolbar = ticketPanel.querySelector('.toolbar');
      if (panelSidebar) panelSidebar.style.display = 'none';
      if (panelToolbar) panelToolbar.style.display = 'none';
      const container = document.getElementById('ticketsContent');
      const deleteBtn = (currentUser && currentUser.role === 'admin')
        ? `<button class="btn btn-danger btn-sm" onclick="deleteTicket()" style="margin-left:auto">Delete</button>` : '';
      container.innerHTML = `
        <button class="kb-reader-back" onclick="restoreTicketListView();loadTickets()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          Back to tickets
        </button>
        <div class="kb-reader-card">
          <div class="kb-reader-header">
            <div class="kb-reader-title">#${ticket.id} — ${esc(ticket.title)}</div>
            <div class="kb-reader-meta">
              <span class="ticket-badge badge-${ticket.status}">${esc(statusLabel)}</span>
              <span class="ticket-badge badge-${ticket.priority}">${esc(ticket.priority)}</span>
              ${deleteBtn}
            </div>
          </div>
          <div class="ticket-mobile-details">
            <div class="tmd-row">
              <div class="tmd-field"><label>Status</label>${isStaff
                ? `<select class="form-input" onchange="updateTicketField(${ticket.id},'status',this.value)">
                    ${['open','in_progress','waiting','resolved','closed'].map(s =>
                      `<option value="${s}" ${s === ticket.status ? 'selected' : ''}>${s.replace(/_/g,' ')}</option>`
                    ).join('')}</select>`
                : `<span class="ticket-badge badge-${ticket.status}">${esc(statusLabel)}</span>`}</div>
              <div class="tmd-field"><label>Priority</label>${isStaff
                ? `<select class="form-input" onchange="updateTicketField(${ticket.id},'priority',this.value)">
                    ${['low','medium','high','critical'].map(p =>
                      `<option value="${p}" ${p === ticket.priority ? 'selected' : ''}>${p}</option>`
                    ).join('')}</select>`
                : `<span class="ticket-badge badge-${ticket.priority}">${esc(ticket.priority)}</span>`}</div>
            </div>
            <div class="tmd-row">
              <div class="tmd-field"><label>Category</label>${isStaff
                ? `<select class="form-input" onchange="updateTicketField(${ticket.id},'category_id',this.value)">
                    <option value="">None</option>
                    ${ticketCategories.map(c => `<option value="${c.id}" ${c.id === ticket.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                  </select>`
                : `<span class="detail-value">${esc(ticket.category_name || '—')}</span>`}</div>
              <div class="tmd-field"><label>Assignee</label>${isStaff
                ? `<select class="form-input" onchange="updateTicketField(${ticket.id},'assigned_to',this.value)">
                    <option value="">Unassigned</option>
                    ${assignableUsers.map(u => `<option value="${u.id}" ${u.id === ticket.assigned_to ? 'selected' : ''}>${esc(u.username)}</option>`).join('')}
                  </select>`
                : `<span class="detail-value">${esc(ticket.assignee_name || 'Unassigned')}</span>`}</div>
            </div>
            <div class="tmd-meta">
              <span>By ${esc(ticket.creator_name)}</span>
              <span>${new Date(ticket.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          ${descHtml}
          ${tabs}
        </div>`;

      initEditor('newComment', { level: 'mini', placeholder: 'Write a comment...' });
      container.scrollTop = 0;
    } else {
      // Desktop — use modal
      document.getElementById('ticketDetailContent').innerHTML =
        `<div class="ticket-detail">${m}${sb}</div>`;

      initEditor('newComment', { level: 'mini', placeholder: 'Write a comment...' });
      openModal('ticketDetailModal');
    }
  } catch (e) {
    toast('Error loading ticket: ' + e.message, 'error');
  }
}

function switchTicketTab(tab) {
  document.querySelectorAll('.ticket-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.ticket-tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`.ticket-tab-panel#ticketTab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');
  event.target.closest('.ticket-tab').classList.add('active');
}

async function updateTicketField(id, field, value) {
  try {
    const res = await fetch(`${API}/api/tickets/${id}`, {
      method: 'PUT',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ [field]: value || null }),
    });
    if (!res.ok) {
      const data = await res.json();
      return toast(data.error || 'Update failed', 'error');
    }
    toast('Updated', 'success');
    // Refresh detail and list
    openTicketDetail(id);
    loadTickets();
    loadTicketStats();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function addComment(ticketId, internal) {
  const body = getEditorHtml('newComment');
  if (!body) return toast('Comment cannot be empty', 'error');

  try {
    const res = await fetch(`${API}/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ body, is_internal: !!internal }),
    });
    if (!res.ok) {
      const data = await res.json();
      return toast(data.error || 'Failed to add comment', 'error');
    }
    toast('Comment added', 'success');
    openTicketDetail(ticketId);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function unlinkExecution(ticketId, execId) {
  try {
    await fetch(`${API}/api/tickets/${ticketId}/executions/${execId}`, {
      method: 'DELETE',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    toast('Execution unlinked', 'success');
    openTicketDetail(ticketId);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function deleteTicket() {
  if (!currentTicketDetail) return;
  if (!confirm(`Delete ticket #${currentTicketDetail.id}?`)) return;
  try {
    const res = await fetch(`${API}/api/tickets/${currentTicketDetail.id}`, {
      method: 'DELETE',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!res.ok) {
      const data = await res.json();
      return toast(data.error || 'Delete failed', 'error');
    }
    toast('Ticket deleted', 'success');
    if (window.innerWidth <= 850) {
      restoreTicketListView();
    } else {
      closeModal('ticketDetailModal');
    }
    loadTickets();
    loadTicketStats();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

