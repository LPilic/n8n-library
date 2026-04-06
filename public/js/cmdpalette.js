// --- Command Palette (Ctrl+K / Cmd+K) ---
let cmdOpen = false;
let cmdResults = [];
let cmdSelected = 0;
let cmdDebounce = null;

// Panel navigation items (always shown when query is empty)
const CMD_PANELS = [
  { title: 'Dashboard', type: 'panel', panel: 'dashboard', icon: 'th-large' },
  { title: 'Template Library', type: 'panel', panel: 'library', icon: 'book' },
  { title: 'Workflows', type: 'panel', panel: 'n8n', icon: 'clipboard' },
  { title: 'Service Desk', type: 'panel', panel: 'tickets', icon: 'bookmark' },
  { title: 'Knowledge Base', type: 'panel', panel: 'kb', icon: 'book' },
  { title: 'Monitoring', type: 'panel', panel: 'monitoring', icon: 'heartbeat' },
  { title: 'Observability', type: 'panel', panel: 'observability', icon: 'th' },
  { title: 'Settings', type: 'panel', panel: 'settings', icon: 'cog' },
];

function openCmdPalette() {
  cmdOpen = true;
  cmdSelected = 0;
  var overlay = document.getElementById('cmdOverlay');
  overlay.style.display = 'flex';
  var input = document.getElementById('cmdInput');
  input.value = '';
  input.focus();
  renderCmdResults(CMD_PANELS);
}

function closeCmdPalette() {
  cmdOpen = false;
  document.getElementById('cmdOverlay').style.display = 'none';
}

function onCmdInput() {
  var q = document.getElementById('cmdInput').value.trim();
  if (cmdDebounce) clearTimeout(cmdDebounce);

  if (!q) {
    cmdSelected = 0;
    renderCmdResults(CMD_PANELS);
    return;
  }

  // Filter panels by query
  var filtered = CMD_PANELS.filter(function(p) {
    return p.title.toLowerCase().includes(q.toLowerCase());
  });

  // Debounce API search
  cmdDebounce = setTimeout(function() {
    searchCmd(q, filtered);
  }, 200);

  // Show panel matches immediately
  renderCmdResults(filtered);
}

async function searchCmd(q, panelResults) {
  try {
    var res = await fetch(API + '/api/search?q=' + encodeURIComponent(q), { headers: CSRF_HEADERS });
    if (!res.ok) return;
    var data = await res.json();
    cmdResults = panelResults.concat(data.results || []);
    cmdSelected = Math.min(cmdSelected, cmdResults.length - 1);
    if (cmdOpen) renderCmdResults(cmdResults);
  } catch {}
}

function renderCmdResults(results) {
  cmdResults = results;
  var list = document.getElementById('cmdResults');
  if (!results.length) {
    list.innerHTML = '<div class="cmd-empty">No results</div>';
    return;
  }
  var html = '';
  var lastType = '';
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var section = r.type === 'panel' ? 'Navigate' : r.type === 'template' ? 'Templates' : r.type === 'ticket' ? 'Tickets' : r.type === 'article' ? 'Knowledge Base' : '';
    if (section !== lastType) {
      html += '<div class="cmd-section">' + section + '</div>';
      lastType = section;
    }
    var cls = i === cmdSelected ? 'cmd-item active' : 'cmd-item';
    var icon = cmdIcon(r);
    var badge = '';
    if (r.type === 'ticket' && r.status) {
      badge = '<span class="ticket-badge badge-' + r.status + '" style="font-size:10px;margin-left:8px">' + r.status.replace(/_/g, ' ') + '</span>';
    }
    html += '<div class="' + cls + '" data-idx="' + i + '" onmouseenter="cmdSelect(' + i + ')" onclick="cmdExecute(' + i + ')">';
    html += '<div class="cmd-item-icon">' + icon + '</div>';
    html += '<span class="cmd-item-title">' + escCmd(r.title) + '</span>';
    html += badge;
    html += '<span class="cmd-item-type">' + escCmd(r.type) + '</span>';
    html += '</div>';
  }
  list.innerHTML = html;
  // Scroll active into view
  var active = list.querySelector('.cmd-item.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function cmdIcon(r) {
  if (r.type === 'panel') return '<i class="fa fa-' + (r.icon || 'circle') + '"></i>';
  if (r.type === 'template') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>';
  if (r.type === 'ticket') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M15 5H9a2 2 0 0 0-2 2v12l5-3 5 3V7a2 2 0 0 0-2-2z"/></svg>';
  if (r.type === 'article') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  return '<i class="fa fa-search"></i>';
}

function cmdSelect(idx) {
  cmdSelected = idx;
  var items = document.querySelectorAll('#cmdResults .cmd-item');
  items.forEach(function(el, i) {
    el.classList.toggle('active', i === idx);
  });
}

function cmdExecute(idx) {
  var r = cmdResults[idx];
  if (!r) return;
  closeCmdPalette();

  if (r.type === 'panel') {
    switchPanel(r.panel);
  } else if (r.type === 'ticket') {
    switchPanel('tickets');
    var id = r.id;
    setTimeout(function() { openTicketDetail(id); }, 200);
  } else if (r.type === 'article') {
    switchPanel('kb');
    var slug = r.link ? r.link.replace('/kb/', '') : r.id;
    setTimeout(function() { viewKbArticle(slug); }, 200);
  } else if (r.type === 'template') {
    switchPanel('library');
  }
}

function onCmdKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    cmdSelected = Math.min(cmdSelected + 1, cmdResults.length - 1);
    renderCmdHighlight();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    cmdSelected = Math.max(cmdSelected - 1, 0);
    renderCmdHighlight();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    cmdExecute(cmdSelected);
  } else if (e.key === 'Escape') {
    closeCmdPalette();
  }
}

function renderCmdHighlight() {
  var items = document.querySelectorAll('#cmdResults .cmd-item');
  items.forEach(function(el, i) {
    el.classList.toggle('active', i === cmdSelected);
  });
  var active = document.querySelector('#cmdResults .cmd-item.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function escCmd(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Global keyboard shortcut
document.addEventListener('keydown', function(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    if (cmdOpen) closeCmdPalette();
    else if (currentUser) openCmdPalette();
  }
});
