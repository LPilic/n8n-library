const API = window.location.origin;
const CSRF_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
let allCategories = [];
let n8nWorkflowsCache = [];
let currentUser = null;

// --- Theme ---
function setThemeMode(mode) {
  localStorage.setItem('theme_mode', mode);
  applyTheme(mode);
  // Re-apply branding (dark mode skips surface colors, light mode applies them)
  if (typeof _cachedBranding !== 'undefined') applyBranding(_cachedBranding);
  // Update toggle buttons
  document.querySelectorAll('.theme-toggle-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-theme-val') === mode);
  });
  updateBrandPreview();
}

function applyTheme(mode) {
  var dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function initTheme() {
  var mode = localStorage.getItem('theme_mode') || 'system';
  applyTheme(mode);
  document.querySelectorAll('.theme-toggle-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-theme-val') === mode);
  });
  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
    var current = localStorage.getItem('theme_mode') || 'system';
    if (current === 'system') {
      applyTheme('system');
      if (typeof _cachedBranding !== 'undefined') applyBranding(_cachedBranding);
    }
  });
}

// --- Auth ---
async function checkAuth() {
  try {
    const res = await fetch(`${API}/api/auth/me`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    currentUser = data.user;
    showApp();
  } catch {
    currentUser = null;
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-overlay').style.display = 'flex';
  document.getElementById('appSidebar').style.display = 'none';
  document.getElementById('appMain').style.display = 'none';
  document.getElementById('mobileNav').style.display = 'none';
  showLoginForm();
}

function showApp() {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('appSidebar').style.display = '';
  document.getElementById('appMain').style.display = '';
  document.getElementById('mobileNav').style.display = '';

  // Set role class on body
  document.body.className = 'role-' + currentUser.role;

  // User badge
  document.getElementById('userBadge').style.display = '';
  document.getElementById('userAvatar').textContent = (currentUser.username || currentUser.email).charAt(0).toUpperCase();
  document.getElementById('userDisplayName').textContent = currentUser.username || currentUser.email;
  document.getElementById('userRoleBadge').textContent = currentUser.role;

  // Init app
  loadSettings();
  loadLibrary();
  updateOpenTicketBadge();
  checkAiStatus();

  // Check for ticket deep link
  const ticketParam = new URLSearchParams(window.location.search).get('ticket');
  if (ticketParam) {
    switchPanel('tickets');
    setTimeout(() => openTicketDetail(parseInt(ticketParam)), 300);
    window.history.replaceState({}, '', window.location.pathname);
  }
}

function showLoginForm() {
  document.getElementById('loginForm').style.display = '';
  document.getElementById('forgotForm').style.display = 'none';
  document.getElementById('resetForm').style.display = 'none';
  document.getElementById('loginError').textContent = '';
  setTimeout(() => document.getElementById('loginEmail').focus(), 50);
}

function showForgotPassword() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('forgotForm').style.display = '';
  document.getElementById('resetForm').style.display = 'none';
  document.getElementById('forgotError').textContent = '';
  document.getElementById('forgotSuccess').textContent = '';
  document.getElementById('forgotEmail').value = document.getElementById('loginEmail').value;
  setTimeout(() => document.getElementById('forgotEmail').focus(), 50);
}

function showResetForm(token) {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('forgotForm').style.display = 'none';
  document.getElementById('resetForm').style.display = '';
  document.getElementById('resetError').textContent = '';
  document.getElementById('resetSuccess').textContent = '';
  document.getElementById('resetForm').dataset.token = token;
  setTimeout(() => document.getElementById('resetPass').focus(), 50);
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPass').value;
  if (!email || !password) return;
  document.getElementById('loginError').textContent = '';
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json();
      document.getElementById('loginError').textContent = data.error || 'Login failed';
      return;
    }
    await checkAuth();
  } catch (e) {
    document.getElementById('loginError').textContent = 'Connection error';
  }
}

async function doForgotPassword() {
  const email = document.getElementById('forgotEmail').value.trim();
  if (!email) return;
  document.getElementById('forgotError').textContent = '';
  document.getElementById('forgotSuccess').textContent = '';
  try {
    const res = await fetch(`${API}/api/auth/forgot-password`, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) {
      document.getElementById('forgotError').textContent = data.error || 'Request failed';
      return;
    }
    document.getElementById('forgotSuccess').textContent = data.message;
  } catch (e) {
    document.getElementById('forgotError').textContent = 'Connection error';
  }
}

async function doResetPassword() {
  const password = document.getElementById('resetPass').value;
  const confirm = document.getElementById('resetPassConfirm').value;
  const token = document.getElementById('resetForm').dataset.token;
  document.getElementById('resetError').textContent = '';
  document.getElementById('resetSuccess').textContent = '';
  if (!password) return;
  if (password !== confirm) {
    document.getElementById('resetError').textContent = 'Passwords do not match';
    return;
  }
  if (password.length < 8) {
    document.getElementById('resetError').textContent = 'Password must be at least 8 characters';
    return;
  }
  try {
    const res = await fetch(`${API}/api/auth/reset-password`, {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      document.getElementById('resetError').textContent = data.error || 'Reset failed';
      return;
    }
    document.getElementById('resetSuccess').textContent = data.message;
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
  } catch (e) {
    document.getElementById('resetError').textContent = 'Connection error';
  }
}

async function doLogout() {
  await fetch(`${API}/api/auth/logout`, { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  currentUser = null;
  showLogin();
}

// Enter key on login forms
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  document.getElementById('loginPass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('loginEmail').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('loginPass').focus();
  });
  document.getElementById('forgotEmail').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doForgotPassword();
  });
  document.getElementById('resetPassConfirm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doResetPassword();
  });
});


// --- Branding / Design ---
const BRAND_DEFAULTS = {
  brand_primary: '#ff6d5a', brand_primary_hover: '#e0523f',
  brand_bg: '#f5f5f5', brand_sidebar: '#ffffff', brand_card: '#ffffff',
  brand_text: '#525356', brand_text_dark: '#1f2229',
  brand_logo: '', brand_app_name: '',
};

let currentBrandLogo = '';

function updateBrandPreview() {
  var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  var primary = document.getElementById('brandPrimary').value || '#ff6d5a';
  var primaryHover = document.getElementById('brandPrimaryHover').value || '#e0523f';
  var bg, sidebar, card, text, textDark;
  if (isDark) {
    bg = '#161618'; sidebar = '#131315'; card = '#1e1e21'; text = '#c0c0c8'; textDark = '#e8e8ee';
  } else {
    bg = document.getElementById('brandBg').value || '#f5f5f5';
    sidebar = document.getElementById('brandSidebar').value || '#ffffff';
    card = document.getElementById('brandCard').value || '#ffffff';
    text = document.getElementById('brandText').value || '#525356';
    textDark = document.getElementById('brandTextDark').value || '#1f2229';
  }
  var appName = document.getElementById('brandAppName').value || 'n8n Library Manager';
  var logo = currentBrandLogo || '';

  var logoHtml = logo
    ? '<img src="' + logo + '" style="max-height:22px;max-width:80px">'
    : '<div style="width:22px;height:22px;border-radius:4px;background:' + primary + '"></div>';

  var el = document.getElementById('brandPreview');
  el.innerHTML = '<div style="display:flex;height:360px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;font-size:11px;border-radius:6px;overflow:hidden">'
    // Sidebar
    + '<div style="width:52px;background:' + sidebar + ';border-right:1px solid ' + bg + ';display:flex;flex-direction:column;align-items:center;padding:10px 0;gap:6px">'
      + '<div style="margin-bottom:8px">' + logoHtml + '</div>'
      + '<div style="width:32px;height:32px;border-radius:6px;background:' + primary + '18;display:flex;align-items:center;justify-content:center"><div style="width:14px;height:14px;border-radius:3px;background:' + primary + '"></div></div>'
      + '<div style="width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center"><div style="width:14px;height:2px;background:' + text + ';opacity:0.3;border-radius:1px"></div></div>'
      + '<div style="width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center"><div style="width:14px;height:2px;background:' + text + ';opacity:0.3;border-radius:1px"></div></div>'
      + '<div style="width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center"><div style="width:14px;height:2px;background:' + text + ';opacity:0.3;border-radius:1px"></div></div>'
    + '</div>'
    // Main content
    + '<div style="flex:1;background:' + bg + ';display:flex;flex-direction:column;overflow:hidden">'
      // Toolbar
      + '<div style="padding:10px 14px;background:' + card + ';border-bottom:1px solid ' + bg + ';display:flex;align-items:center;gap:8px">'
        + '<span style="font-weight:700;font-size:12px;color:' + textDark + '">' + appName + '</span>'
        + '<div style="margin-left:auto;padding:4px 10px;background:' + primary + ';color:#fff;border-radius:4px;font-size:10px;font-weight:600">Button</div>'
      + '</div>'
      // Content area
      + '<div style="flex:1;padding:12px 14px;display:flex;flex-direction:column;gap:8px;overflow:hidden">'
        // Cards
        + '<div style="background:' + card + ';border-radius:6px;padding:10px 12px;box-shadow:0 1px 2px rgba(0,0,0,0.04)">'
          + '<div style="font-weight:600;color:' + textDark + ';margin-bottom:4px;font-size:11px">Sample Workflow</div>'
          + '<div style="color:' + text + ';font-size:10px">This is how text looks on a card background</div>'
          + '<div style="margin-top:6px;display:flex;gap:4px">'
            + '<span style="padding:2px 6px;background:' + primary + '18;color:' + primary + ';border-radius:3px;font-size:9px;font-weight:600">Active</span>'
            + '<span style="padding:2px 6px;background:' + (isDark ? '#0d2818' : '#dcfce7') + ';color:' + (isDark ? '#4ade80' : '#16a34a') + ';border-radius:3px;font-size:9px">Success</span>'
          + '</div>'
        + '</div>'
        + '<div style="background:' + card + ';border-radius:6px;padding:10px 12px;box-shadow:0 1px 2px rgba(0,0,0,0.04)">'
          + '<div style="font-weight:600;color:' + textDark + ';margin-bottom:4px;font-size:11px">Another Item</div>'
          + '<div style="color:' + text + ';font-size:10px">Secondary text and muted content preview</div>'
          + '<div style="margin-top:6px;display:flex;gap:4px">'
            + '<span style="padding:2px 6px;background:' + (isDark ? '#2d1212' : '#fff1f1') + ';color:' + (isDark ? '#f87171' : '#ef4444') + ';border-radius:3px;font-size:9px">Error</span>'
          + '</div>'
        + '</div>'
        + '<div style="background:' + card + ';border-radius:6px;padding:10px 12px;box-shadow:0 1px 2px rgba(0,0,0,0.04)">'
          + '<div style="font-weight:600;color:' + textDark + ';margin-bottom:4px;font-size:11px">Third Card</div>'
          + '<div style="color:' + text + ';font-size:10px">Showing color contrast on card elements</div>'
          + '<div style="margin-top:6px"><a href="#" onclick="return false" style="color:' + primary + ';text-decoration:none;font-size:10px;font-weight:600">View details &rarr;</a></div>'
        + '</div>'
      + '</div>'
    + '</div>'
  + '</div>';
}

let _cachedBranding = {};
async function loadBranding() {
  try {
    const res = await fetch(`${API}/api/settings/branding`);
    if (!res.ok) return;
    const data = await res.json();
    _cachedBranding = data;
    applyBranding(data);

    // Populate form fields if admin
    if (currentUser && currentUser.role === 'admin') {
      populateBrandingForm(data);
    }
  } catch (e) {
    console.warn('Could not load branding');
  }
}

function applyBranding(data) {
  const r = document.documentElement.style;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  // Primary/accent colors always apply (both themes)
  if (data.brand_primary) {
    r.setProperty('--color-primary', data.brand_primary);
    if (isDark) {
      r.setProperty('--color-primary-light', data.brand_primary + '22');
      r.setProperty('--color-primary-light-hover', data.brand_primary + '33');
    } else {
      r.setProperty('--color-primary-light', data.brand_primary + '18');
      r.setProperty('--color-primary-light-hover', data.brand_primary + '28');
    }
    r.setProperty('--color-input-focus', data.brand_primary);
  }
  if (data.brand_primary_hover) r.setProperty('--color-primary-hover', data.brand_primary_hover);

  // Background/surface/text colors only apply in light mode
  // In dark mode, the [data-theme="dark"] CSS rules handle these
  if (!isDark) {
    if (data.brand_bg) r.setProperty('--color-bg', data.brand_bg);
    if (data.brand_sidebar) r.setProperty('--color-sidebar', data.brand_sidebar);
    if (data.brand_card) {
      r.setProperty('--color-card', data.brand_card);
      r.setProperty('--color-card-hover', data.brand_card);
      r.setProperty('--color-bg-light', data.brand_card);
      r.setProperty('--color-input-bg', data.brand_card);
    }
    if (data.brand_text) r.setProperty('--color-text', data.brand_text);
    if (data.brand_text_dark) r.setProperty('--color-text-dark', data.brand_text_dark);
  } else {
    // Clear any previously set inline overrides so dark CSS takes effect
    r.removeProperty('--color-bg');
    r.removeProperty('--color-bg-light');
    r.removeProperty('--color-sidebar');
    r.removeProperty('--color-card');
    r.removeProperty('--color-card-hover');
    r.removeProperty('--color-input-bg');
    r.removeProperty('--color-text');
    r.removeProperty('--color-text-dark');
  }

  // Logo
  const sidebarLogo = document.getElementById('sidebarLogo');
  const sidebarBrandSpan = document.getElementById('sidebarBrandSpan');
  const loginLogo = document.getElementById('loginLogo');

  if (data.brand_logo) {
    sidebarLogo.src = data.brand_logo;
    sidebarLogo.style.display = '';
    sidebarBrandSpan.style.display = 'none';
    loginLogo.src = data.brand_logo;
    loginLogo.style.display = '';
    document.querySelectorAll('.branded-login-logo').forEach(img => {
      img.src = data.brand_logo;
      img.style.display = '';
    });
    document.querySelectorAll('.login-brand-span').forEach(el => el.style.display = 'none');
  } else {
    sidebarLogo.style.display = 'none';
    sidebarBrandSpan.style.display = '';
    loginLogo.style.display = 'none';
    document.querySelectorAll('.branded-login-logo').forEach(img => img.style.display = 'none');
    document.querySelectorAll('.login-brand-span').forEach(el => el.style.display = '');
  }

  // App name
  if (data.brand_app_name) {
    document.getElementById('sidebarAppName').textContent = data.brand_app_name;
    document.querySelectorAll('.login-app-name').forEach(el => el.textContent = data.brand_app_name);
    document.title = data.brand_app_name;
  } else {
    document.getElementById('sidebarAppName').textContent = 'Library Manager';
    document.querySelectorAll('.login-app-name').forEach(el => el.textContent = 'Library');
    document.title = 'n8n Template Library Manager';
  }
}

function populateBrandingForm(data) {
  const fields = [
    ['brandPrimary', 'brand_primary'], ['brandPrimaryHover', 'brand_primary_hover'],
    ['brandBg', 'brand_bg'], ['brandSidebar', 'brand_sidebar'], ['brandCard', 'brand_card'],
    ['brandText', 'brand_text'], ['brandTextDark', 'brand_text_dark'],
  ];
  for (const [elId, key] of fields) {
    const val = data[key] || BRAND_DEFAULTS[key];
    document.getElementById(elId).value = val;
    document.getElementById(elId + 'Hex').value = val;
  }
  document.getElementById('brandAppName').value = data.brand_app_name || '';

  currentBrandLogo = data.brand_logo || '';
  renderLogoPreview();
  updateBrandPreview();
}

function renderLogoPreview() {
  const container = document.getElementById('logoPreviewContainer');
  if (currentBrandLogo) {
    container.innerHTML = `<img src="${currentBrandLogo}" alt="Logo"><div class="upload-hint">Click to replace</div><button class="remove-logo" onclick="event.stopPropagation();removeLogo()" title="Remove logo">&times;</button>`;
  } else {
    container.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-xmuted)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg><div class="upload-hint">Click to upload a logo (PNG, JPG, SVG)</div>`;
  }
}

function handleLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Please select an image file', 'error'); return; }
  if (file.size > 2 * 1024 * 1024) { toast('Logo must be under 2MB', 'error'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    currentBrandLogo = e.target.result;
    renderLogoPreview();
    updateBrandPreview();
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function removeLogo() {
  currentBrandLogo = '';
  renderLogoPreview();
  updateBrandPreview();
}

async function saveBranding() {
  const body = {
    brand_logo: currentBrandLogo,
    brand_app_name: document.getElementById('brandAppName').value.trim(),
    brand_primary: document.getElementById('brandPrimary').value,
    brand_primary_hover: document.getElementById('brandPrimaryHover').value,
    brand_bg: document.getElementById('brandBg').value,
    brand_sidebar: document.getElementById('brandSidebar').value,
    brand_card: document.getElementById('brandCard').value,
    brand_text: document.getElementById('brandText').value,
    brand_text_dark: document.getElementById('brandTextDark').value,
  };
  try {
    const res = await fetch(`${API}/api/settings/branding`, {
      method: 'PUT',
      headers: CSRF_HEADERS,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      return toast(data.error || 'Failed to save', 'error');
    }
    toast('Branding saved', 'success');
    applyBranding(body);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function resetBranding() {
  if (!confirm('Reset all branding to defaults?')) return;
  const body = {};
  for (const key of Object.keys(BRAND_DEFAULTS)) body[key] = '';
  try {
    const res = await fetch(`${API}/api/settings/branding`, {
      method: 'PUT',
      headers: CSRF_HEADERS,
      body: JSON.stringify(body),
    });
    if (!res.ok) return toast('Failed to reset', 'error');
    toast('Branding reset to defaults', 'success');
    // Clear CSS overrides
    const r = document.documentElement.style;
    ['--color-primary','--color-primary-hover','--color-primary-light','--color-primary-light-hover',
     '--color-input-focus','--color-bg','--color-sidebar','--color-card','--color-card-hover',
     '--color-bg-light','--color-input-bg','--color-text','--color-text-dark'].forEach(p => r.removeProperty(p));
    currentBrandLogo = '';
    applyBranding({});
    populateBrandingForm(BRAND_DEFAULTS);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

// --- Connection ---
function updateConnectionStatus() {
  var dot = document.getElementById('connDot');
  var label = document.getElementById('connLabel');
  if (!dot || !label) return;
  if (typeof instancesCache !== 'undefined' && instancesCache.length > 0 && typeof activeInstanceId !== 'undefined' && activeInstanceId) {
    var inst = instancesCache.find(function(i) { return i.id === activeInstanceId; });
    if (inst) {
      dot.className = 'connection-dot connected';
      dot.style.background = inst.color || '';
      label.textContent = inst.name;
      return;
    }
  }
  var s = typeof getSettings === 'function' ? getSettings() : {};
  var connected = s.n8nUrl && s.apiKey;
  dot.className = 'connection-dot ' + (connected ? 'connected' : 'disconnected');
  dot.style.background = '';
  label.textContent = connected ? 'Connected' : 'n8n not connected';
}


// --- Navigation ---
const MORE_PANELS = ['kb', 'monitoring', 'observability', 'ai', 'categories', 'settings', 'users'];

function toggleSidebar() {
  var sb = document.getElementById('appSidebar');
  var collapsed = sb.classList.toggle('collapsed');
  // Flip the toggle icon
  var icon = document.getElementById('sidebarToggleIcon');
  if (icon) {
    icon.style.transform = collapsed ? 'rotate(180deg)' : '';
  }
  // Persist preference
  try { localStorage.setItem('sidebarCollapsed', collapsed ? '1' : ''); } catch(e) {}
}

// Restore sidebar state on load
(function() {
  try {
    if (localStorage.getItem('sidebarCollapsed') === '1') {
      var sb = document.getElementById('appSidebar');
      if (sb) {
        sb.classList.add('collapsed');
        var icon = document.getElementById('sidebarToggleIcon');
        if (icon) icon.style.transform = 'rotate(180deg)';
      }
    }
  } catch(e) {}
})();

function switchPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.mobile-nav button').forEach(b => {
    b.classList.remove('active');
    b.classList.remove('more-active');
  });
  document.getElementById('panel-' + name).classList.add('active');
  document.querySelectorAll(`[data-panel="${name}"]`).forEach(el => el.classList.add('active'));

  // Highlight "More" button if the active panel is in the overflow menu
  const moreBtn = document.getElementById('mobileMoreBtn');
  if (moreBtn && MORE_PANELS.includes(name)) moreBtn.classList.add('more-active');

  if (name === 'library') loadLibrary();
  if (name === 'n8n') loadN8nWorkflows();
  if (name === 'categories') loadCategories();
  if (name === 'users') loadUsers();
  if (name === 'tickets') { loadTickets(); loadTicketStats(); }
  if (name === 'kb') { loadKbArticles(); loadKbCategories(); loadKbTags(); loadKbStats(); }
  if (name === 'monitoring') { loadMonitoringData(true); startMonAutoRefresh(); }
  else { stopMonAutoRefresh(); }
  if (name === 'observability') { loadObservability(); startObsAutoRefresh(); }
  else { stopObsAutoRefresh(); }
  if (name === 'ai') { loadAiSettings(); loadAiPrompts(); loadMcpServers(); }
}

function toggleMobileMore() {
  const menu = document.getElementById('mobileMoreMenu');
  menu.classList.toggle('open');
}

// Close more menu when tapping outside
document.addEventListener('click', function(e) {
  const menu = document.getElementById('mobileMoreMenu');
  const btn = document.getElementById('mobileMoreBtn');
  if (menu && menu.classList.contains('open') && !menu.contains(e.target) && !btn.contains(e.target)) {
    menu.classList.remove('open');
  }
});


// --- Font Awesome Icon Picker ---
const FA_ICONS = [
  // General
  'folder','folder-open','tag','tags','bookmark','star','star-o','heart','heart-o','flag','flag-o',
  'bell','bell-o','certificate','trophy','diamond','thumb-tack','bullseye','crosshairs',
  // Business
  'briefcase','building','building-o','bank','money','dollar','euro','credit-card','shopping-cart',
  'shopping-bag','handshake-o','line-chart','bar-chart','pie-chart','area-chart','calculator',
  // Tech
  'code','terminal','desktop','laptop','tablet','mobile','server','database','cloud','cloud-upload',
  'cloud-download','wifi','plug','microchip','usb','keyboard-o','mouse-pointer','bug','code-fork',
  // Communication
  'envelope','envelope-o','inbox','comment','comment-o','comments','comments-o','phone','fax',
  'paper-plane','paper-plane-o','bullhorn','rss','podcast','at','slack','send','send-o',
  // Media
  'camera','video-camera','picture-o','image','film','music','headphones','microphone','play',
  'play-circle','pause','stop','volume-up','youtube-play','file-video-o','file-audio-o',
  // Files
  'file','file-o','file-text','file-text-o','file-pdf-o','file-word-o','file-excel-o',
  'file-powerpoint-o','file-image-o','file-archive-o','file-code-o','files-o','clipboard','paste',
  // Editing
  'pencil','pencil-square','pencil-square-o','paint-brush','eraser','eyedropper','scissors','cut',
  'copy','save','floppy-o','edit','undo','repeat','trash','trash-o',
  // Navigation
  'home','search','map-marker','map','map-o','map-pin','map-signs','compass','location-arrow',
  'globe','street-view','road','rocket','space-shuttle','anchor','ship',
  // People
  'user','user-o','users','user-plus','user-circle','user-circle-o','user-secret','id-card',
  'id-card-o','address-book','address-book-o','group','male','female','child','wheelchair',
  // Security
  'lock','unlock','unlock-alt','key','shield','eye','eye-slash','ban','exclamation-triangle',
  'exclamation-circle','check-circle','check-circle-o','times-circle','times-circle-o',
  // Misc
  'cog','cogs','wrench','sliders','magic','bolt','lightbulb-o','plug','battery-full',
  'fire','leaf','tree','recycle','paw','cube','cubes','puzzle-piece','gamepad',
  'flask','graduation-cap','book','newspaper-o','university','legal','balance-scale',
  'ambulance','medkit','stethoscope','hospital-o','thermometer','bath',
  // Arrows
  'arrow-right','arrow-left','arrow-up','arrow-down','arrows','exchange','random','refresh',
  'sync','share','share-alt','external-link','expand','compress','plus','minus','check','times',
  // Social / Brand
  'github','gitlab','bitbucket','aws','docker','linux','windows','apple','android','chrome',
  'firefox','edge','safari','opera','html5','css3','js','python','java',
];

function toggleIconPicker() {
  const picker = document.getElementById('iconPicker');
  if (picker.style.display === 'none') {
    picker.style.display = 'block';
    document.getElementById('iconSearch').value = '';
    renderIconGrid();
    document.getElementById('iconSearch').focus();
    setTimeout(() => document.addEventListener('click', closeIconPickerOutside), 0);
  } else {
    picker.style.display = 'none';
    document.removeEventListener('click', closeIconPickerOutside);
  }
}

function closeIconPickerOutside(e) {
  const wrap = document.querySelector('.emoji-picker-wrap');
  if (!wrap.contains(e.target)) {
    document.getElementById('iconPicker').style.display = 'none';
    document.removeEventListener('click', closeIconPickerOutside);
  }
}

function renderIconGrid() {
  const q = (document.getElementById('iconSearch')?.value || '').toLowerCase();
  const filtered = q ? FA_ICONS.filter(name => name.includes(q)) : FA_ICONS;
  const grid = document.getElementById('iconGrid');
  grid.innerHTML = '';
  filtered.forEach(name => {
    const span = document.createElement('span');
    span.innerHTML = `<i class="fa fa-${name}"></i>`;
    span.title = name;
    span.addEventListener('click', () => selectIcon(name));
    grid.appendChild(span);
  });
}

function filterIcons() { renderIconGrid(); }

function selectIcon(name) {
  document.getElementById('catEditIcon').value = name;
  document.getElementById('catEditIconPreview').className = 'fa fa-' + name;
  document.getElementById('iconPicker').style.display = 'none';
  document.removeEventListener('click', closeIconPickerOutside);
}


// --- Custom select dropdown (replaces native <select>) ---

function upgradeSelects(container) {
  var root = container || document;
  root.querySelectorAll('select').forEach(function(sel) {
    if (sel.dataset.upgraded) return;
    sel.dataset.upgraded = '1';

    var wrapper = document.createElement('div');
    wrapper.className = 'custom-select';
    // Preserve inline styles for width
    var inlineStyle = sel.getAttribute('style') || '';
    if (inlineStyle.indexOf('width:auto') !== -1 || inlineStyle.indexOf('min-width') !== -1) {
      wrapper.classList.add('cs-inline');
    }
    // Transfer role-visibility classes to wrapper
    if (sel.classList.contains('write-only')) wrapper.classList.add('write-only');
    if (sel.classList.contains('admin-only')) wrapper.classList.add('admin-only');

    // Build trigger
    var trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    var labelSpan = document.createElement('span');
    labelSpan.className = 'cs-label';
    var selectedOpt = sel.options[sel.selectedIndex];
    labelSpan.textContent = selectedOpt ? selectedOpt.textContent : '';
    var arrow = document.createElement('span');
    arrow.className = 'cs-arrow';
    trigger.appendChild(labelSpan);
    trigger.appendChild(arrow);

    // Build menu
    var menu = document.createElement('div');
    menu.className = 'custom-select-menu';
    for (var i = 0; i < sel.options.length; i++) {
      var opt = sel.options[i];
      var item = document.createElement('div');
      item.className = 'custom-select-option' + (i === sel.selectedIndex ? ' selected' : '');
      item.setAttribute('data-value', opt.value);
      item.innerHTML = '<span>' + escapeHtml(opt.textContent) + '</span><span class="cs-check">&#10003;</span>';
      item.addEventListener('click', (function(w, s, m, l) {
        return function(e) {
          e.stopPropagation();
          var val = this.getAttribute('data-value');
          s.value = val;
          l.textContent = this.querySelector('span').textContent;
          m.querySelectorAll('.custom-select-option').forEach(function(o) { o.classList.remove('selected'); });
          this.classList.add('selected');
          w.classList.remove('open');
          // Trigger change event on the hidden select
          s.dispatchEvent(new Event('change', { bubbles: true }));
        };
      })(wrapper, sel, menu, labelSpan));
      menu.appendChild(item);
    }

    // Toggle on click
    trigger.addEventListener('click', function(e) {
      e.stopPropagation();
      var wasOpen = wrapper.classList.contains('open');
      closeAllCustomSelects();
      if (!wasOpen) wrapper.classList.add('open');
    });

    // Insert wrapper
    sel.parentNode.insertBefore(wrapper, sel);
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);
    wrapper.appendChild(sel);
  });
}

function closeAllCustomSelects() {
  document.querySelectorAll('.custom-select.open').forEach(function(d) { d.classList.remove('open'); });
}

// Sync custom select display when the hidden <select>'s value changes programmatically
function syncCustomSelect(selectEl) {
  if (!selectEl || !selectEl.dataset.upgraded) return;
  var wrapper = selectEl.closest('.custom-select');
  if (!wrapper) return;
  var label = wrapper.querySelector('.cs-label');
  var menu = wrapper.querySelector('.custom-select-menu');
  if (label) {
    var opt = selectEl.options[selectEl.selectedIndex];
    label.textContent = opt ? opt.textContent : '';
  }
  if (menu) {
    menu.querySelectorAll('.custom-select-option').forEach(function(o) {
      o.classList.toggle('selected', o.getAttribute('data-value') === selectEl.value);
    });
  }
}

// Refresh the options in a custom select (for dynamically populated selects)
function refreshCustomSelect(selectEl) {
  if (!selectEl) return;
  var wrapper = selectEl.closest('.custom-select');
  if (!wrapper) { upgradeSelects(selectEl.parentNode); return; }
  var menu = wrapper.querySelector('.custom-select-menu');
  var label = wrapper.querySelector('.cs-label');
  if (!menu) return;
  menu.innerHTML = '';
  for (var i = 0; i < selectEl.options.length; i++) {
    var opt = selectEl.options[i];
    var item = document.createElement('div');
    item.className = 'custom-select-option' + (i === selectEl.selectedIndex ? ' selected' : '');
    item.setAttribute('data-value', opt.value);
    item.innerHTML = '<span>' + escapeHtml(opt.textContent) + '</span><span class="cs-check">&#10003;</span>';
    item.addEventListener('click', (function(w, s, m, l) {
      return function(e) {
        e.stopPropagation();
        var val = this.getAttribute('data-value');
        s.value = val;
        l.textContent = this.querySelector('span').textContent;
        m.querySelectorAll('.custom-select-option').forEach(function(o) { o.classList.remove('selected'); });
        this.classList.add('selected');
        w.classList.remove('open');
        s.dispatchEvent(new Event('change', { bubbles: true }));
      };
    })(wrapper, selectEl, menu, label));
    menu.appendChild(item);
  }
  if (label) {
    var selOpt = selectEl.options[selectEl.selectedIndex];
    label.textContent = selOpt ? selOpt.textContent : '';
  }
}

// Close on outside click
document.addEventListener('click', function(e) {
  if (!e.target.closest('.custom-select') && !e.target.closest('.refresh-dropdown')) {
    closeAllCustomSelects();
    document.querySelectorAll('.refresh-dropdown.open').forEach(function(d) { d.classList.remove('open'); });
  }
});

// Upgrade all selects on page load
document.addEventListener('DOMContentLoaded', function() { upgradeSelects(); });

// --- Custom refresh dropdown ---
function toggleRefreshDropdown(dropdownId) {
  var dd = document.getElementById(dropdownId);
  if (!dd) return;
  var wasOpen = dd.classList.contains('open');
  // Close all open dropdowns first
  document.querySelectorAll('.refresh-dropdown.open').forEach(function(d) { d.classList.remove('open'); });
  if (!wasOpen) dd.classList.add('open');
}

function selectRefreshInterval(dropdownId, itemEl) {
  var dd = document.getElementById(dropdownId);
  if (!dd) return;
  var value = itemEl.getAttribute('data-value');
  var label = itemEl.textContent.replace('✓', '').trim();
  // Update active state
  dd.querySelectorAll('.refresh-dropdown-item').forEach(function(el) { el.classList.remove('active'); });
  itemEl.classList.add('active');
  // Update trigger label
  dd.querySelector('.rd-label').textContent = label;
  // Close dropdown
  dd.classList.remove('open');
  // Store value as data attribute
  dd.setAttribute('data-value', value);
  // Trigger the appropriate handler
  if (dropdownId === 'monRefreshDropdown') setMonRefreshInterval();
  if (dropdownId === 'obsRefreshDropdown') setObsRefreshInterval();
}

// Close refresh dropdowns on outside click
document.addEventListener('click', function(e) {
  if (!e.target.closest('.refresh-dropdown')) {
    document.querySelectorAll('.refresh-dropdown.open').forEach(function(d) { d.classList.remove('open'); });
  }
});

// --- Modal ---
function openModal(id) {
  document.getElementById(id).classList.add('active');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  if (id === 'editModal') {
    const p = document.getElementById('editPreviewBody');
    if (p) p.innerHTML = '';
  }
  if (id === 'importModal') {
    const p = document.getElementById('importPreviewBody');
    if (p) p.innerHTML = '';
  }
}

// --- Toast ---
function toast(msg, type = 'success') {
  const container = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}


// --- Quill editor management ---
var quillEditors = {};

function initQuill(containerId, opts) {
  var el = document.getElementById(containerId);
  if (!el) { console.error('initQuill: element not found:', containerId); return null; }
  // Destroy previous instance — remove old Quill toolbar and container, recreate the div
  if (quillEditors[containerId]) {
    delete quillEditors[containerId];
    // Clean up orphaned Quill elements from body
    document.querySelectorAll('body > .ql-clipboard, body > .ql-tooltip').forEach(function(el) { el.remove(); });
  }
  var wrap = el.closest('.quill-wrap');
  if (wrap) {
    // Quill adds .ql-toolbar and .ql-container as children of wrap; clean them all out
    wrap.innerHTML = '<div id="' + containerId + '"></div>';
    el = document.getElementById(containerId);
  } else {
    el.innerHTML = '';
  }
  var placeholder = (opts && opts.placeholder) || 'Write something...';
  var level = (opts && (opts.level || opts.toolbar)) || 'compact';
  var toolbarOptions;
  if (level === 'full') {
    toolbarOptions = [
      [{ header: [1, 2, 3, 4, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['blockquote', 'code-block'],
      ['link', 'image'],
      [{ color: [] }, { background: [] }],
      ['clean']
    ];
  } else if (level === 'mini') {
    toolbarOptions = [
      ['bold', 'italic', 'underline'],
      ['link', 'code-block'],
      ['clean']
    ];
  } else {
    toolbarOptions = [
      [{ header: [2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['blockquote', 'code-block'],
      ['link'],
      ['clean']
    ];
  }
  var modules = { toolbar: toolbarOptions };
  if (typeof hljs !== 'undefined') {
    modules.syntax = { hljs: hljs };
  }
  var q;
  try {
    q = new Quill('#' + containerId, {
      theme: 'snow',
      placeholder: placeholder,
      modules: modules
    });
  } catch(e) {
    console.warn('Quill init with syntax failed, retrying without:', e);
    delete modules.syntax;
    q = new Quill('#' + containerId, {
      theme: 'snow',
      placeholder: placeholder,
      modules: modules
    });
  }
  quillEditors[containerId] = q;
  return q;
}

function getQuillHtml(containerId) {
  var q = quillEditors[containerId];
  if (!q) return '';
  var html = q.root.innerHTML;
  if (html === '<p><br></p>' || html === '<p></p>') return '';
  return html;
}

function setQuillHtml(containerId, html) {
  var q = quillEditors[containerId];
  if (!q) return;
  if (!html) { q.setText(''); return; }
  q.root.innerHTML = html;
}

// Backward-compat aliases
function initEditor(containerId, opts) { return initQuill(containerId, opts); }
function getEditorHtml(containerId) { return getQuillHtml(containerId); }
function setEditorData(containerId, data) { return setQuillHtml(containerId, data); }
function setEditorContent(containerId, html) { return setQuillHtml(containerId, html); }
function escapeHtml(s) { return esc(s); }

// --- Util ---
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML.replace(/'/g, '&#39;');
}

function md(s) {
  if (!s) return '';
  // If HTML, sanitize and return
  if (s.trim().startsWith('<') || s.includes('</')) {
    return typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(s, { FORBID_TAGS: ['style'] }) : s;
  }
  // Legacy markdown rendering for old content
  let h = esc(s);
  h = h.replace(/```\n?([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/^### (.+)$/gm, '<strong style="font-size:13px">$1</strong>');
  h = h.replace(/^## (.+)$/gm, '<strong style="font-size:14px">$1</strong>');
  h = h.replace(/^# (.+)$/gm, '<strong style="font-size:15px">$1</strong>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/__(.+?)__/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
  h = h.replace(/_(.+?)_/g, '<em>$1</em>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(m, text, url) {
    if (/^\s*(javascript|data|vbscript)\s*:/i.test(url)) return text;
    return '<a href="' + url + '" target="_blank" rel="noopener">' + text + '</a>';
  });
  h = h.replace(/^- (.+)$/gm, '<li>$1</li>');
  h = h.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  h = h.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  h = h.replace(/\n/g, '<br>');
  h = h.replace(/<br>(<\/?(?:ul|ol|li|pre|h[1-6]))/g, '$1');
  h = h.replace(/(<\/(?:ul|ol|li|pre|h[1-6])>)<br>/g, '$1');
  return h;
}

// --- Keyboard shortcuts ---
function isModalOpen(id) {
  return document.getElementById(id).classList.contains('active');
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (isModalOpen('previewModal')) closePreview();
    else if (isModalOpen('ticketDetailModal')) closeModal('ticketDetailModal');
    else if (isModalOpen('ticketModal')) closeModal('ticketModal');
    else if (isModalOpen('editModal')) closeModal('editModal');
    else if (isModalOpen('importModal')) closeModal('importModal');
    else if (isModalOpen('categoryModal')) closeModal('categoryModal');
    else if (isModalOpen('userModal')) closeModal('userModal');
  }
});

// --- Init ---
// Load branding early so login screen is styled
loadBranding();
// Check for password reset token in URL
const urlParams = new URLSearchParams(window.location.search);
const resetToken = urlParams.get('reset');
if (resetToken) {
  document.getElementById('login-overlay').style.display = 'flex';
  showResetForm(resetToken);
} else {
  checkAuth();
}

