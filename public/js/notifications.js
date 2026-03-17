// --- Notifications ---
let notifSse = null;
let notifUnreadCount = 0;
let notifData = [];
let notifOpen = false;

function initNotifications() {
  loadNotifications();
  connectNotifSse();
}

function connectNotifSse() {
  if (notifSse) { notifSse.close(); notifSse = null; }
  notifSse = new EventSource(API + '/api/notifications/stream');
  notifSse.addEventListener('notification', function(e) {
    try {
      const notif = JSON.parse(e.data);
      notifData.unshift(notif);
      notifUnreadCount++;
      updateNotifBadge();
      if (notifOpen) renderNotifDropdown();
    } catch {}
  });
  notifSse.addEventListener('read-all', function() {
    notifUnreadCount = 0;
    notifData.forEach(function(n) { n.read = true; });
    updateNotifBadge();
    if (notifOpen) renderNotifDropdown();
  });
  notifSse.onerror = function() {
    // Reconnect after 5s
    notifSse.close();
    notifSse = null;
    setTimeout(connectNotifSse, 5000);
  };
}

async function loadNotifications() {
  try {
    const res = await fetch(API + '/api/notifications', { headers: CSRF_HEADERS });
    if (!res.ok) return;
    const data = await res.json();
    notifData = data.notifications || [];
    notifUnreadCount = data.unreadCount || 0;
    updateNotifBadge();
  } catch {}
}

function updateNotifBadge() {
  var badge = document.getElementById('notifBadge');
  var mobileBadge = document.getElementById('notifBadgeMobile');
  if (badge) {
    badge.textContent = notifUnreadCount;
    badge.style.display = notifUnreadCount > 0 ? '' : 'none';
  }
  if (mobileBadge) {
    mobileBadge.textContent = notifUnreadCount;
    mobileBadge.style.display = notifUnreadCount > 0 ? '' : 'none';
  }
}

function toggleNotifDropdown() {
  var dd = document.getElementById('notifDropdown');
  if (!dd) return;
  notifOpen = !notifOpen;
  dd.style.display = notifOpen ? '' : 'none';
  if (notifOpen) renderNotifDropdown();
}

function renderNotifDropdown() {
  var dd = document.getElementById('notifDropdown');
  if (!dd) return;
  var html = '<div class="notif-header"><span>Notifications</span>';
  if (notifUnreadCount > 0) {
    html += '<button onclick="markAllNotifsRead()">Mark all read</button>';
  }
  html += '</div>';

  if (notifData.length === 0) {
    html += '<div class="notif-empty">No notifications</div>';
  } else {
    html += '<div class="notif-list">';
    for (var i = 0; i < Math.min(notifData.length, 20); i++) {
      var n = notifData[i];
      var cls = n.read ? 'notif-item read' : 'notif-item';
      var icon = notifIcon(n.type);
      var time = formatNotifTime(n.created_at);
      html += '<div class="' + cls + '" onclick="clickNotif(' + n.id + ',\'' + escNotif(n.link) + '\',' + !n.read + ')">';
      html += '<div class="notif-icon">' + icon + '</div>';
      html += '<div class="notif-body"><div class="notif-title">' + escNotif(n.title) + '</div>';
      html += '<div class="notif-text">' + escNotif(n.body) + '</div>';
      html += '<div class="notif-time">' + time + '</div></div>';
      if (!n.read) html += '<div class="notif-dot"></div>';
      html += '</div>';
    }
    html += '</div>';
  }
  dd.innerHTML = html;
}

function notifIcon(type) {
  switch (type) {
    case 'assignment': return '<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" width="16" height="16"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>';
    case 'status_change': return '<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" stroke-width="2" width="16" height="16"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';
    case 'comment': return '<svg viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2" width="16" height="16"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    case 'new_ticket': return '<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2" width="16" height="16"><path d="M15 5H9a2 2 0 0 0-2 2v12l5-3 5 3V7a2 2 0 0 0-2-2z"/></svg>';
    default: return '<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  }
}

async function clickNotif(id, link, markRead) {
  toggleNotifDropdown();
  if (markRead) {
    try {
      await fetch(API + '/api/notifications/' + id + '/read', { method: 'PUT', headers: CSRF_HEADERS });
      var n = notifData.find(function(x) { return x.id === id; });
      if (n) n.read = true;
      notifUnreadCount = Math.max(0, notifUnreadCount - 1);
      updateNotifBadge();
    } catch {}
  }
  if (link) {
    // Parse link like /tickets/123
    var parts = link.replace(/^\//, '').split('/');
    var panel = parts[0];
    var detail = parts[1];
    if (panel) {
      switchPanel(panel);
      if (detail) {
        setTimeout(function() {
          if (panel === 'tickets') openTicketDetail(parseInt(detail));
          else if (panel === 'kb') viewKbArticle(detail);
          else if (panel === 'monitoring') loadExecutionDetail(detail);
        }, 300);
      }
    }
  }
}

async function markAllNotifsRead() {
  try {
    await fetch(API + '/api/notifications/read-all', { method: 'PUT', headers: CSRF_HEADERS });
    notifUnreadCount = 0;
    notifData.forEach(function(n) { n.read = true; });
    updateNotifBadge();
    renderNotifDropdown();
  } catch {}
}

function escNotif(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatNotifTime(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  var diff = Date.now() - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
  return d.toLocaleDateString();
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  if (!notifOpen) return;
  var dd = document.getElementById('notifDropdown');
  var btn = document.getElementById('notifBtn');
  var btnM = document.getElementById('notifBtnMobile');
  if (dd && !dd.contains(e.target) && btn && !btn.contains(e.target) && (!btnM || !btnM.contains(e.target))) {
    notifOpen = false;
    dd.style.display = 'none';
  }
});

function disconnectNotifSse() {
  if (notifSse) { notifSse.close(); notifSse = null; }
}
