// Inject custom CSS + Font Awesome into n8n's template browser
(function() {
  // Derive base URL from this script's src so CSS loads from the library host, not n8n's origin
  var scriptSrc = document.currentScript && document.currentScript.src;
  var baseUrl = scriptSrc ? scriptSrc.replace(/\/[^/]*$/, '') : '';

  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = baseUrl + '/n8n-custom.css';
  document.head.appendChild(link);

  if (!document.querySelector('link[href*="font-awesome"]')) {
    var fa = document.createElement('link');
    fa.rel = 'stylesheet';
    fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css';
    document.head.appendChild(fa);
  }
})();

// Template detail page: back button + unified info box
(function() {
  var lastUrl = '';
  var dataCache = {};
  var nodeCreds = null;

  // Fetch node credential map once
  fetch('/api/node-creds').then(function(r) { return r.json(); }).then(function(d) {
    nodeCreds = d;
  }).catch(function() { nodeCreds = {}; });

  function isDetailPage() {
    return /\/templates\/(\d+)$/.test(window.location.pathname);
  }

  function getTemplateId() {
    var m = window.location.pathname.match(/\/templates\/(\d+)$/);
    return m ? m[1] : null;
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function renderNodeIcon(node) {
    if (node.iconData && node.iconData.type === 'file' && node.iconData.fileBuffer) {
      return '<img src="' + node.iconData.fileBuffer + '" alt="" class="n8n-custom-node-icon-img">';
    }
    var fa = 'question';
    if (node.iconData && node.iconData.type === 'icon' && node.iconData.icon) {
      fa = node.iconData.icon;
    } else if (node.icon && node.icon.startsWith('fa:')) {
      fa = node.icon.substring(3);
    }
    return '<i class="fa fa-' + fa + '"></i>';
  }

  function simpleMd(text) {
    if (!text) return '';
    var s = escHtml(text);
    // bold
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // italic
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // links [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // line breaks
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  function injectInfoBox(data) {
    if (document.getElementById('n8n-custom-info-box')) return;

    var contentRow = document.querySelector('[class*="_content_1t3tp"]:not([class*="_contentContainer"])');
    if (!contentRow) return;

    var wf = data.workflow || data;

    // Hide the original markdown and templateCard
    var markdown = contentRow.querySelector('[class*="_markdown_1t3tp"]');
    var card = contentRow.querySelector('[class*="_templateCard_1t3tp"]');
    if (markdown) markdown.style.display = 'none';
    if (card) card.style.display = 'none';

    // Build unified box
    var box = document.createElement('div');
    box.id = 'n8n-custom-info-box';

    // --- Section 1: Title & Meta + Use Template button ---
    var tid = getTemplateId();
    var header = '<div class="ncib-header">';
    header += '<div class="ncib-header-row">';
    header += '<h1 class="ncib-title">' + escHtml(wf.name) + '</h1>';
    header += '<a href="/templates/' + tid + '/setup" class="ncib-use-btn">Use template</a>';
    header += '</div>';
    header += '<div class="ncib-meta">';
    if (wf.user && wf.user.name) {
      header += '<span class="ncib-meta-item"><i class="fa fa-user"></i> ' + escHtml(wf.user.name) + '</span>';
    }
    if (wf.createdAt) {
      var d = new Date(wf.createdAt);
      header += '<span class="ncib-meta-item"><i class="fa fa-calendar"></i> ' + d.toLocaleDateString() + '</span>';
    }
    if (wf.categories && wf.categories.length) {
      var cats = wf.categories.map(function(c) { return escHtml(c.name); }).join(', ');
      header += '<span class="ncib-meta-item"><i class="fa fa-folder-o"></i> ' + cats + '</span>';
    }
    var nodeCount = wf.nodes ? wf.nodes.length : 0;
    header += '<span class="ncib-meta-item"><i class="fa fa-cubes"></i> ' + nodeCount + ' nodes</span>';
    // Estimated setup time: 2 + uniqueNodesNeedingCreds * 3 (matches n8n's display)
    // Each node type that requires credentials counts as 1 credential setup
    // (n8n filters to displayable creds per node, typically 1 per node type)
    var nodesWithCreds = {};
    var mappedNodes = wf.nodes || [];
    if (nodeCreds) {
      for (var ci = 0; ci < mappedNodes.length; ci++) {
        var nodeType = mappedNodes[ci].name || '';
        if (nodeCreds[nodeType] && !nodesWithCreds[nodeType]) {
          nodesWithCreds[nodeType] = true;
        }
      }
    }
    var credCount = Object.keys(nodesWithCreds).length;
    var setupMins = 2 + credCount * 3;
    header += '<span class="ncib-meta-item"><i class="fa fa-clock-o"></i> ~' + setupMins + ' min setup</span>';
    header += '</div></div>';

    // --- Section 2: Description ---
    var desc = '<div class="ncib-section">';
    desc += '<h2 class="ncib-section-title">Workflow Description</h2>';
    desc += '<div class="ncib-description">' + simpleMd(wf.description) + '</div>';
    desc += '</div>';

    // --- Section 3: Nodes ---
    var nodes = wf.nodes || [];
    var seen = {};
    var unique = [];
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].name || nodes[i].displayName;
      if (!seen[key]) { seen[key] = true; unique.push(nodes[i]); }
    }

    var nodesHtml = '<div class="ncib-section">';
    nodesHtml += '<h2 class="ncib-section-title">Nodes in this workflow</h2>';
    nodesHtml += '<div class="ncib-nodes-grid">';
    for (var j = 0; j < unique.length; j++) {
      var n = unique[j];
      var label = n.displayName || (n.defaults && n.defaults.name) || n.name || '';
      nodesHtml += '<div class="ncib-node-chip">';
      nodesHtml += '<div class="ncib-node-icon">' + renderNodeIcon(n) + '</div>';
      nodesHtml += '<span class="ncib-node-label">' + escHtml(label) + '</span>';
      nodesHtml += '</div>';
    }
    nodesHtml += '</div></div>';

    box.innerHTML = header + desc + nodesHtml;
    contentRow.appendChild(box);
  }

  function cleanup() {
    var btn = document.getElementById('n8n-custom-back-btn');
    if (btn) btn.remove();
    var box = document.getElementById('n8n-custom-info-box');
    if (box) box.remove();
    // Restore hidden elements
    document.querySelectorAll('[class*="_markdown_1t3tp"], [class*="_templateCard_1t3tp"]').forEach(function(el) {
      el.style.display = '';
    });
  }

  function sync() {
    var url = window.location.href;
    if (url === lastUrl) return;
    lastUrl = url;
    cleanup();

    if (!isDetailPage()) return;

    // Back button
    var btn = document.createElement('button');
    btn.id = 'n8n-custom-back-btn';
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg> Back to templates';
    btn.onclick = function(e) {
      e.preventDefault();
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = '/templates/';
      }
    };
    document.body.appendChild(btn);

    // Fetch + inject
    var tid = getTemplateId();
    if (!tid) return;

    if (dataCache[tid]) {
      injectInfoBox(dataCache[tid]);
    } else {
      fetch('/templates/workflows/' + tid)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          dataCache[tid] = data;
          if (getTemplateId() === tid) injectInfoBox(data);
        })
        .catch(function() {});
    }
  }

  // MutationObserver for when Vue finishes rendering
  var debounce = null;
  var observer = new MutationObserver(function() {
    if (!isDetailPage()) return;
    if (document.getElementById('n8n-custom-info-box')) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(function() {
      var tid = getTemplateId();
      if (tid && dataCache[tid]) injectInfoBox(dataCache[tid]);
    }, 150);
  });

  function start() {
    var root = document.getElementById('app') || document.body;
    observer.observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  var origPush = history.pushState;
  history.pushState = function() { origPush.apply(this, arguments); setTimeout(sync, 50); };
  var origReplace = history.replaceState;
  history.replaceState = function() { origReplace.apply(this, arguments); setTimeout(sync, 50); };
  window.addEventListener('popstate', function() { setTimeout(sync, 50); });
  setInterval(sync, 400);
  if (document.body) sync(); else document.addEventListener('DOMContentLoaded', sync);
})();

// Support ticket widget — floating button + modal
(function() {
  var ticketCategories = [];
  var n8nUser = null;

  function init() {
    // Place support button beneath categories in templates sidebar
    function placeSupportButton() {
      if (document.getElementById('n8n-support-btn')) return; // already placed

      // Only show on the templates page
      if (!location.pathname.startsWith('/templates')) return;

      // Find the filters/categories sidebar
      var filters = document.querySelector('[class*="_filters_n14ka"]');
      if (!filters) return;

      var btn = document.createElement('button');
      btn.id = 'n8n-support-btn';
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Support';
      btn.title = 'Submit a support ticket';
      btn.onclick = openTicketModal;
      filters.appendChild(btn);
    }

    // Try placing immediately, then observe for route changes (SPA)
    placeSupportButton();
    var observer = new MutationObserver(function() {
      // Remove button if we navigate away from templates
      var existing = document.getElementById('n8n-support-btn');
      if (existing && !location.pathname.startsWith('/templates')) {
        existing.remove();
      }
      placeSupportButton();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Fetch categories
    fetch('/api/public/ticket-categories')
      .then(function(r) { return r.json(); })
      .then(function(d) { ticketCategories = d; })
      .catch(function() {});

    // Get current n8n user from the app's Pinia stores
    function tryGetN8nUser() {
      try {
        // n8n uses Pinia — look for the users store in the Vue app
        var app = document.getElementById('app');
        if (app && app.__vue_app__) {
          var pinia = app.__vue_app__.config.globalProperties.$pinia;
          if (pinia) {
            var stores = pinia._s;
            // Try users store (stores user data after login)
            var usersStore = stores.get('users');
            if (usersStore && usersStore.currentUser && usersStore.currentUser.email) {
              var u = usersStore.currentUser;
              return { id: u.id, firstName: u.firstName || '', lastName: u.lastName || '', email: u.email };
            }
          }
        }
      } catch (e) { console.log('[n8n-support] Could not read Pinia store:', e.message); }
      return null;
    }
    // Try immediately then retry a few times (store may not be ready yet)
    n8nUser = tryGetN8nUser();
    if (!n8nUser) {
      var attempts = 0;
      var iv = setInterval(function() {
        n8nUser = tryGetN8nUser();
        attempts++;
        if (n8nUser) { console.log('[n8n-support] User loaded from store:', n8nUser.email); clearInterval(iv); }
        else if (attempts >= 10) { console.log('[n8n-support] Could not load user from store'); clearInterval(iv); }
      }, 1000);
    } else {
      console.log('[n8n-support] User loaded from store:', n8nUser.email);
    }
  }

  // --- Quill editor for ticket description ---
  var ntmQuill = null;

  function loadQuillAssets(cb) {
    // Check if Quill is already loaded
    if (typeof Quill !== 'undefined') { cb(); return; }
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css';
    document.head.appendChild(css);
    var hljsCss = document.createElement('link');
    hljsCss.rel = 'stylesheet';
    hljsCss.href = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github.min.css';
    document.head.appendChild(hljsCss);
    var hljsScript = document.createElement('script');
    hljsScript.src = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js';
    hljsScript.onload = function() {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js';
      script.onload = cb;
      document.head.appendChild(script);
    };
    document.head.appendChild(hljsScript);
  }

  function initNtmQuill() {
    var el = document.getElementById('ntm-desc');
    if (!el || ntmQuill) return;
    var modules = {
      toolbar: [
        [{ header: [2, 3, false] }],
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['blockquote', 'code-block'],
        ['link'],
        ['clean']
      ]
    };
    if (typeof hljs !== 'undefined') {
      try { modules.syntax = { hljs: hljs }; } catch(e) {}
    }
    try {
      ntmQuill = new Quill('#ntm-desc', {
        theme: 'snow',
        placeholder: 'Describe your issue...',
        modules: modules
      });
    } catch(e) {
      delete modules.syntax;
      ntmQuill = new Quill('#ntm-desc', {
        theme: 'snow',
        placeholder: 'Describe your issue...',
        modules: modules
      });
    }
  }

  function getNtmDescHtml() {
    if (ntmQuill) {
      var html = ntmQuill.root.innerHTML;
      if (html === '<p><br></p>' || html === '<p></p>') return '';
      return html;
    }
    return '';
  }

  // --- Image upload ---
  var uploadedImages = [];

  function handleImageSelect(e) {
    var files = e.target.files;
    if (!files || !files.length) return;
    for (var i = 0; i < files.length; i++) {
      uploadImage(files[i]);
    }
    e.target.value = '';
  }

  function uploadImage(file) {
    if (!file.type.match(/^image\/(png|jpe?g|gif|webp)$/)) {
      alert('Unsupported format. Use PNG, JPG, GIF, or WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image too large (max 5MB).');
      return;
    }

    var reader = new FileReader();
    reader.onload = function() {
      var base64 = reader.result;
      // Show uploading preview
      var preview = addImagePreview(file.name, null, true);

      fetch('/api/public/ticket-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 })
      })
      .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
      .then(function(result) {
        if (!result.ok) {
          preview.remove();
          alert(result.data.error || 'Upload failed');
          return;
        }
        var url = result.data.url;
        uploadedImages.push(url);
        updateImagePreview(preview, file.name, url);
        // Insert image into Quill editor
        if (ntmQuill) {
          var range = ntmQuill.getSelection(true);
          ntmQuill.insertEmbed(range ? range.index : ntmQuill.getLength(), 'image', url);
        }
      })
      .catch(function() {
        preview.remove();
        alert('Upload failed. Please try again.');
      });
    };
    reader.readAsDataURL(file);
  }

  function addImagePreview(name, url, loading) {
    var container = document.getElementById('ntm-attachments');
    var item = document.createElement('div');
    item.className = 'ntm-attachment' + (loading ? ' ntm-uploading' : '');
    item.innerHTML = loading
      ? '<span class="ntm-att-spinner"></span><span class="ntm-att-name">' + escHtml(name) + '</span>'
      : '<img src="' + url + '" class="ntm-att-thumb"><span class="ntm-att-name">' + escHtml(name) + '</span><button class="ntm-att-remove" title="Remove">&times;</button>';
    container.appendChild(item);
    return item;
  }

  function updateImagePreview(el, name, url) {
    el.className = 'ntm-attachment';
    el.innerHTML = '<img src="' + url + '" class="ntm-att-thumb"><span class="ntm-att-name">' + escHtml(name) + '</span><button class="ntm-att-remove" title="Remove">&times;</button>';
    el.querySelector('.ntm-att-remove').onclick = function() {
      var idx = uploadedImages.indexOf(url);
      if (idx !== -1) uploadedImages.splice(idx, 1);
      el.remove();
    };
  }

  // --- Dropzone setup ---
  function setupDropzone() {
    var zone = document.getElementById('ntm-dropzone');
    if (!zone) return;

    zone.addEventListener('dragover', function(e) {
      e.preventDefault();
      zone.classList.add('ntm-dropzone-active');
    });
    zone.addEventListener('dragleave', function() {
      zone.classList.remove('ntm-dropzone-active');
    });
    zone.addEventListener('drop', function(e) {
      e.preventDefault();
      zone.classList.remove('ntm-dropzone-active');
      var files = e.dataTransfer.files;
      for (var i = 0; i < files.length; i++) {
        if (files[i].type.match(/^image\//)) uploadImage(files[i]);
      }
    });
  }

  // Paste handled by Quill editor init above

  function openTicketModal() {
    if (document.getElementById('n8n-ticket-overlay')) return;

    if (!n8nUser) {
      alert('You must be logged in to n8n to submit a support ticket.');
      return;
    }

    uploadedImages = [];

    var overlay = document.createElement('div');
    overlay.id = 'n8n-ticket-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) closeTicketModal(); };

    var catOptions = '<option value="">— Select —</option>';
    for (var i = 0; i < ticketCategories.length; i++) {
      catOptions += '<option value="' + ticketCategories[i].id + '">' + escHtml(ticketCategories[i].name) + '</option>';
    }

    var userName = [n8nUser.firstName, n8nUser.lastName].filter(Boolean).join(' ') || n8nUser.email;
    var userEmail = n8nUser.email || '';

    var modal = document.createElement('div');
    modal.id = 'n8n-ticket-modal';
    modal.innerHTML =
      '<div class="ntm-header">' +
        '<h2>Submit a Support Ticket</h2>' +
        '<button class="ntm-close" onclick="document.getElementById(\'n8n-ticket-overlay\').remove()">&times;</button>' +
      '</div>' +
      '<div class="ntm-body">' +
        '<div class="ntm-user-info">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
          '<span>Submitting as <strong>' + escHtml(userName) + '</strong> (' + escHtml(userEmail) + ')</span>' +
        '</div>' +
        '<div class="ntm-field"><label>Subject *</label><input type="text" id="ntm-title" placeholder="Brief description of your issue"></div>' +
        '<div class="ntm-row">' +
          '<div class="ntm-field ntm-half"><label>Category</label><select id="ntm-category">' + catOptions + '</select></div>' +
          '<div class="ntm-field ntm-half"><label>Priority</label>' +
            '<select id="ntm-priority">' +
              '<option value="low">Low</option>' +
              '<option value="medium" selected>Medium</option>' +
              '<option value="high">High</option>' +
              '<option value="critical">Critical</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="ntm-field">' +
          '<label>Description</label>' +
          '<div class="ntm-quill-wrap"><div id="ntm-desc"></div></div>' +
          '<div class="ntm-dropzone" id="ntm-dropzone">' +
            '<input type="file" id="ntm-image-input" accept="image/png,image/jpeg,image/gif,image/webp" multiple>' +
            '<div class="ntm-dropzone-content">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
              '<span>Drop images here or <em>browse</em></span>' +
            '</div>' +
          '</div>' +
          '<div class="ntm-attachments" id="ntm-attachments"></div>' +
        '</div>' +
      '</div>' +
      '<div class="ntm-footer">' +
        '<button class="ntm-btn ntm-btn-cancel" onclick="document.getElementById(\'n8n-ticket-overlay\').remove()">Cancel</button>' +
        '<button class="ntm-btn ntm-btn-submit" id="ntm-submit">Submit Ticket</button>' +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.getElementById('ntm-submit').onclick = submitTicket;
    document.getElementById('ntm-image-input').onchange = handleImageSelect;
    document.getElementById('ntm-title').focus();
    setupDropzone();

    // Init Quill editor
    ntmQuill = null;
    loadQuillAssets(function() {
      initNtmQuill();
      // Paste image support on Quill editor
      if (ntmQuill) {
        ntmQuill.root.addEventListener('paste', function(e) {
          var items = e.clipboardData && e.clipboardData.items;
          if (!items) return;
          for (var i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image/') === 0) {
              e.preventDefault();
              uploadImage(items[i].getAsFile());
              return;
            }
          }
        });
      }
    });
  }

  function closeTicketModal() {
    var overlay = document.getElementById('n8n-ticket-overlay');
    if (overlay) overlay.remove();
    uploadedImages = [];
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function submitTicket() {
    var title = document.getElementById('ntm-title').value.trim();
    var desc = getNtmDescHtml();
    var category = document.getElementById('ntm-category').value;
    var priority = document.getElementById('ntm-priority').value;
    var btn = document.getElementById('ntm-submit');

    if (!title) return alert('Please enter a subject.');

    btn.disabled = true;
    btn.textContent = 'Submitting...';

    fetch('/api/public/ticket', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title,
        description: desc,
        category_id: category || undefined,
        priority: priority,
        n8nUserId: n8nUser ? n8nUser.id : undefined,
        n8nEmail: n8nUser ? n8nUser.email : undefined,
        n8nFirstName: n8nUser ? n8nUser.firstName : undefined,
        n8nLastName: n8nUser ? n8nUser.lastName : undefined
      })
    })
    .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
    .then(function(result) {
      if (!result.ok) {
        alert(result.data.error || 'Failed to submit ticket');
        btn.disabled = false;
        btn.textContent = 'Submit Ticket';
        return;
      }
      var userEmail = n8nUser ? n8nUser.email : '';
      var modal = document.getElementById('n8n-ticket-modal');
      modal.innerHTML =
        '<div class="ntm-success">' +
          '<div class="ntm-success-icon">&#10003;</div>' +
          '<h2>Ticket Submitted!</h2>' +
          '<p>Your ticket <strong>#' + result.data.ticketId + '</strong> has been created. Our team will get back to you at <strong>' + escHtml(userEmail) + '</strong>.</p>' +
          '<button class="ntm-btn ntm-btn-submit" onclick="document.getElementById(\'n8n-ticket-overlay\').remove()">Close</button>' +
        '</div>';
    })
    .catch(function() {
      alert('Network error. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Submit Ticket';
    });
  }

  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);
})();
