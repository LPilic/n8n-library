// --- Security Audit Dashboard ---
var securityAuditData = null;

async function loadSecurityAudit() {
  var el = document.getElementById('securityContent');
  el.innerHTML = '<div class="loading">Running security audit...</div>';
  try {
    var url = API + '/api/security/audit';
    var body = {};
    if (typeof activeInstanceId !== 'undefined' && activeInstanceId) body.instance_id = activeInstanceId;
    var res = await fetch(url, { method: 'POST', headers: CSRF_HEADERS, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('Audit failed');
    securityAuditData = await res.json();
    renderSecurityAudit();
  } catch (err) {
    el.innerHTML = '<div class="kb-empty"><h3>Audit failed</h3><p>' + esc(err.message) + '</p></div>';
  }
}

function renderSecurityAudit() {
  var el = document.getElementById('securityContent');
  if (!securityAuditData) return;

  var reports = [];
  var totalIssues = 0;
  var passedChecks = 0;
  var categories = Object.keys(securityAuditData);

  for (var i = 0; i < categories.length; i++) {
    var catKey = categories[i];
    var report = securityAuditData[catKey];
    if (!report || !report.sections) continue;
    var issueCount = 0;
    for (var j = 0; j < report.sections.length; j++) {
      var section = report.sections[j];
      // settings sections have no location array
      if (section.location) issueCount += section.location.length;
      else if (section.settings) issueCount += 0; // info only
    }
    totalIssues += issueCount;
    if (issueCount === 0) passedChecks++;
    reports.push({ key: catKey, risk: report.risk || catKey, sections: report.sections, issueCount: issueCount });
  }

  // Sort: most issues first
  reports.sort(function(a, b) { return b.issueCount - a.issueCount; });

  // Summary
  var riskLevel = totalIssues === 0 ? 'healthy' : totalIssues < 10 ? 'warning' : 'critical';
  var riskColor = riskLevel === 'healthy' ? 'var(--color-success)' : riskLevel === 'warning' ? '#f59e0b' : 'var(--color-danger)';
  var riskLabel = riskLevel === 'healthy' ? 'Healthy' : riskLevel === 'warning' ? 'Needs Attention' : 'Critical';

  var html = '<div class="mon-kpi-row">';
  html += '<div class="mon-kpi-card"><div class="mon-kpi-number" style="color:' + riskColor + ';font-size:18px">' + esc(riskLabel) + '</div><div class="mon-kpi-label">Overall Status</div></div>';
  html += '<div class="mon-kpi-card"><div class="mon-kpi-number">' + totalIssues + '</div><div class="mon-kpi-label">Total Findings</div></div>';
  html += '<div class="mon-kpi-card"><div class="mon-kpi-number">' + reports.length + '</div><div class="mon-kpi-label">Categories</div></div>';
  html += '<div class="mon-kpi-card"><div class="mon-kpi-number" style="color:var(--color-success)">' + passedChecks + '</div><div class="mon-kpi-label">Clean Categories</div></div>';
  html += '</div>';

  // Category cards
  for (var i = 0; i < reports.length; i++) {
    var r = reports[i];
    var catIcon = getCategoryIcon(r.risk);
    var catColor = r.issueCount === 0 ? 'var(--color-success)' : r.issueCount < 5 ? '#f59e0b' : 'var(--color-danger)';
    var catName = r.key.replace(' Risk Report', '');

    html += '<div class="security-category">';
    html += '<div class="security-category-header" onclick="toggleSecurityCategory(this)">';
    html += '<div style="display:flex;align-items:center;gap:10px">';
    html += '<span class="security-cat-icon">' + catIcon + '</span>';
    html += '<div><div class="security-cat-name">' + esc(catName) + '</div>';
    html += '<div style="font-size:12px;color:var(--color-text-muted)">' + r.sections.length + ' check' + (r.sections.length !== 1 ? 's' : '') + ' performed</div></div>';
    html += '</div>';
    html += '<div style="display:flex;align-items:center;gap:10px">';
    if (r.issueCount === 0) {
      html += '<span class="security-badge security-badge-pass">Passed</span>';
    } else {
      html += '<span class="security-badge security-badge-fail">' + r.issueCount + ' finding' + (r.issueCount !== 1 ? 's' : '') + '</span>';
    }
    html += '<svg class="security-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="6 9 12 15 18 9"/></svg>';
    html += '</div></div>';

    html += '<div class="security-category-body" style="display:none">';
    for (var j = 0; j < r.sections.length; j++) {
      var s = r.sections[j];
      var items = s.location || [];
      var hasSettings = !!s.settings;
      var sectionSeverity = items.length === 0 && !hasSettings ? 'pass' : items.length < 3 ? 'low' : items.length < 10 ? 'medium' : 'high';

      html += '<div class="security-section">';
      html += '<div class="security-section-header">';
      html += '<div class="security-section-title">' + esc(s.title) + '</div>';
      if (items.length > 0) {
        html += '<span class="security-section-count security-sev-' + sectionSeverity + '">' + items.length + '</span>';
      } else if (!hasSettings) {
        html += '<span class="security-section-count security-sev-pass">0</span>';
      }
      html += '</div>';
      html += '<div class="security-section-desc">' + esc(s.description) + '</div>';
      if (s.recommendation) {
        html += '<div class="security-recommendation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="flex-shrink:0;margin-top:1px"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span>' + esc(s.recommendation) + '</span></div>';
      }

      // Render items based on kind
      if (items.length > 0) {
        html += renderAuditItems(items);
      }

      // Render settings (instance report)
      if (hasSettings) {
        html += renderAuditSettings(s.settings);
      }

      // Render next versions (instance outdated)
      if (s.nextVersions && s.nextVersions.length > 0) {
        html += renderAuditVersions(s.nextVersions);
      }

      html += '</div>';
    }
    html += '</div></div>';
  }

  el.innerHTML = html;
}

function renderAuditItems(items) {
  var html = '<div class="security-items">';
  var grouped = {};
  for (var i = 0; i < items.length; i++) {
    var kind = items[i].kind || 'other';
    if (!grouped[kind]) grouped[kind] = [];
    grouped[kind].push(items[i]);
  }

  var kinds = Object.keys(grouped);
  for (var k = 0; k < kinds.length; k++) {
    var kind = kinds[k];
    var list = grouped[kind];
    html += '<div class="security-item-group">';
    html += '<div class="security-item-group-label">' + esc(kind) + 's (' + list.length + ')</div>';
    html += '<div class="security-item-list">';
    var showMax = 8;
    for (var i = 0; i < Math.min(list.length, showMax); i++) {
      html += renderSingleItem(list[i]);
    }
    if (list.length > showMax) {
      html += '<div class="security-item security-item-more" onclick="this.parentElement.classList.toggle(\'expanded\');this.textContent=this.parentElement.classList.contains(\'expanded\')?\'Show less\':\'+ ' + (list.length - showMax) + ' more\'">+ ' + (list.length - showMax) + ' more</div>';
      for (var i = showMax; i < list.length; i++) {
        html += renderSingleItem(list[i]);
      }
    }
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}

function renderSingleItem(item) {
  var html = '<div class="security-item">';
  if (item.kind === 'credential') {
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" class="security-item-icon"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
    html += '<span class="security-item-name">' + esc(item.name) + '</span>';
  } else if (item.kind === 'node') {
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" class="security-item-icon"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>';
    html += '<span class="security-item-name">' + esc(item.nodeName || '') + '</span>';
    html += '<span class="security-item-detail">' + esc(item.workflowName || '') + '</span>';
    if (item.nodeType) html += '<code class="security-item-type">' + esc(item.nodeType.replace('n8n-nodes-base.', '')) + '</code>';
  } else if (item.kind === 'community') {
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" class="security-item-icon"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>';
    var typeName = (item.nodeType || '').split('.').pop();
    html += '<span class="security-item-name">' + esc(typeName) + '</span>';
    html += '<code class="security-item-type">' + esc(item.nodeType || '') + '</code>';
  } else if (item.kind === 'custom') {
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" class="security-item-icon"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>';
    var fileName = (item.filePath || '').split('/').pop();
    html += '<span class="security-item-name">' + esc(fileName) + '</span>';
    html += '<code class="security-item-type">' + esc(item.nodeType || '') + '</code>';
  } else {
    html += '<span class="security-item-name">' + esc(item.name || item.id || JSON.stringify(item)) + '</span>';
  }
  html += '</div>';
  return html;
}

function renderAuditSettings(settings) {
  var html = '<div class="security-settings-grid">';
  var groups = Object.keys(settings);
  for (var g = 0; g < groups.length; g++) {
    var group = groups[g];
    var entries = settings[group];
    html += '<div class="security-settings-group">';
    html += '<div class="security-settings-group-title">' + esc(group) + '</div>';
    var keys = Object.keys(entries);
    for (var k = 0; k < keys.length; k++) {
      var val = entries[keys[k]];
      var isGood = val === false || val === 'none' || val === true;
      if (keys[k] === 'communityPackagesEnabled' || keys[k] === 'publicApiEnabled') isGood = undefined; // neutral
      if (keys[k] === 'diagnosticsEnabled') isGood = val === false;
      if (keys[k] === 'versionNotificationsEnabled') isGood = val === true;
      html += '<div class="security-setting-row">';
      html += '<span class="security-setting-key">' + esc(keys[k]) + '</span>';
      if (typeof val === 'boolean') {
        html += '<span class="security-setting-val security-val-' + (val ? 'on' : 'off') + '">' + (val ? 'Enabled' : 'Disabled') + '</span>';
      } else {
        html += '<span class="security-setting-val">' + esc(String(val)) + '</span>';
      }
      html += '</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderAuditVersions(versions) {
  var html = '<div class="security-versions">';
  html += '<div class="security-item-group-label">Available updates</div>';
  for (var i = 0; i < versions.length; i++) {
    var v = versions[i];
    html += '<div class="security-version-row">';
    html += '<div class="security-version-name">' + esc(v.name) + '</div>';
    html += '<div class="security-version-meta">' + new Date(v.createdAt).toLocaleDateString() + '</div>';
    if (v.description) html += '<div class="security-version-desc">' + v.description + '</div>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function toggleSecurityCategory(header) {
  var body = header.nextElementSibling;
  var chevron = header.querySelector('.security-chevron');
  if (body.style.display === 'none') {
    body.style.display = '';
    chevron.style.transform = 'rotate(180deg)';
  } else {
    body.style.display = 'none';
    chevron.style.transform = '';
  }
}

function getCategoryIcon(risk) {
  switch (risk) {
    case 'credentials': return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
    case 'database': return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>';
    case 'nodes': return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
    case 'filesystem': return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
    case 'instance': return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>';
    default: return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
  }
}
