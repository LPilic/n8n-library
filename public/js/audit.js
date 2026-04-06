// --- Audit Log ---
var auditPage = 0;
var auditPerPage = 50;
var auditDebounceTimer = null;

function debouncedLoadAudit() {
  if (auditDebounceTimer) clearTimeout(auditDebounceTimer);
  auditDebounceTimer = setTimeout(function() { loadAuditLog(); }, 300);
}

async function loadAuditLog(page) {
  auditPage = page || 0;
  var container = document.getElementById('auditContent');
  if (!container) return;
  container.innerHTML = '<div class="loading">Loading audit log...</div>';

  var entityType = document.getElementById('auditFilterEntity').value;
  var search = (document.getElementById('auditSearch').value || '').trim();
  var params = ['limit=' + auditPerPage, 'offset=' + (auditPage * auditPerPage)];
  if (entityType) params.push('entity_type=' + encodeURIComponent(entityType));
  if (search) params.push('search=' + encodeURIComponent(search));

  try {
    var res = await fetch(API + '/api/audit-log?' + params.join('&'), { headers: CSRF_HEADERS });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    renderAuditLog(data, container);
  } catch (err) {
    container.innerHTML = '<div class="loading" style="color:var(--color-danger)">Failed to load audit log</div>';
  }
}

function renderAuditLog(data, container) {
  var entries = data.entries || [];
  var total = data.total || 0;

  if (entries.length === 0) {
    container.innerHTML = '<div style="padding:48px;text-align:center;color:var(--color-text-muted)">' +
      '<p style="font-weight:600;font-size:15px;margin-bottom:4px">No audit entries found</p>' +
      '<p style="font-size:13px">Actions will appear here as users interact with the system.</p></div>';
    return;
  }

  var html = '<div class="users-card"><table class="kb-articles-table">';
  html += '<thead><tr><th>Time</th><th>User</th><th>Action</th><th>Type</th><th>ID</th><th>Details</th></tr></thead><tbody>';

  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var time = e.created_at ? new Date(e.created_at).toLocaleString() : '';
    var actionClass = e.action === 'deleted' ? 'color:var(--color-danger)' : e.action === 'created' ? 'color:var(--color-success)' : '';
    var link = auditLink(e);

    html += '<tr' + (link ? ' onclick="' + link + '" style="cursor:pointer"' : '') + '>';
    html += '<td class="kb-article-meta">' + esc(time) + '</td>';
    html += '<td><span style="font-weight:600">' + esc(e.username) + '</span></td>';
    html += '<td><span style="font-weight:600;text-transform:capitalize;' + actionClass + '">' + esc(e.action) + '</span></td>';
    html += '<td><span class="audit-type-badge audit-type-' + esc(e.entity_type) + '">' + esc(e.entity_type) + '</span></td>';
    html += '<td class="kb-article-meta">' + esc(e.entity_id || '') + '</td>';
    html += '<td class="kb-article-meta" style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(e.details || '') + '</td>';
    html += '</tr>';
  }
  html += '</tbody></table></div>';

  // Pagination
  var totalPages = Math.max(1, Math.ceil(total / auditPerPage));
  html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;font-size:13px;color:var(--color-text-muted)">';
  html += '<span>' + total + ' entries</span>';
  html += '<div style="display:flex;gap:6px;align-items:center">';
  if (auditPage > 0) {
    html += '<button class="btn btn-secondary btn-sm" onclick="loadAuditLog(0)"><i class="fa fa-angle-double-left"></i></button>';
    html += '<button class="btn btn-secondary btn-sm" onclick="loadAuditLog(' + (auditPage - 1) + ')"><i class="fa fa-angle-left"></i></button>';
  }
  html += '<span style="padding:0 8px">Page ' + (auditPage + 1) + ' / ' + totalPages + '</span>';
  if (auditPage < totalPages - 1) {
    html += '<button class="btn btn-secondary btn-sm" onclick="loadAuditLog(' + (auditPage + 1) + ')"><i class="fa fa-angle-right"></i></button>';
    html += '<button class="btn btn-secondary btn-sm" onclick="loadAuditLog(' + (totalPages - 1) + ')"><i class="fa fa-angle-double-right"></i></button>';
  }
  html += '</div></div>';

  container.innerHTML = html;
}

function auditLink(entry) {
  if (entry.entity_type === 'ticket' && entry.entity_id && entry.action !== 'deleted') {
    return "switchPanel('tickets');setTimeout(function(){openTicketDetail(" + parseInt(entry.entity_id) + ")},200)";
  }
  if (entry.entity_type === 'article' && entry.entity_id && entry.action !== 'deleted') {
    return "switchPanel('kb');setTimeout(function(){viewKbArticle(" + parseInt(entry.entity_id) + ")},200)";
  }
  return '';
}
