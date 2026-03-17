// --- Knowledge Base ---
let currentKbPage = 1;
let currentKbArticle = null;
let kbCategoriesCache = [];
let kbTagsCache = [];
let kbEditingId = null;
let kbAttachments = [];
let kbActiveTag = '';
let kbSelectedTags = [];

function renderContent(content) {
  if (!content) return '';
  var html = typeof content === 'string' ? content : '';
  // Convert Quill 2.x code blocks to <pre><code> before sanitizing
  var tmp = document.createElement('div');
  tmp.innerHTML = html;
  tmp.querySelectorAll('.ql-code-block-container').forEach(function(container) {
    var lang = '';
    var lines = [];
    container.querySelectorAll('.ql-code-block').forEach(function(line) {
      if (!lang && line.dataset.language && line.dataset.language !== 'plain') lang = line.dataset.language;
      lines.push(line.textContent);
    });
    var pre = document.createElement('pre');
    var code = document.createElement('code');
    if (lang) code.className = 'language-' + lang;
    code.textContent = lines.join('\n');
    pre.appendChild(code);
    container.replaceWith(pre);
  });
  html = tmp.innerHTML;
  if (typeof DOMPurify !== 'undefined') {
    html = DOMPurify.sanitize(html, { ADD_TAGS: ['iframe','span'], ADD_ATTR: ['target','rel','class','spellcheck'], FORBID_TAGS: ['style'] });
  } else {
    html = esc(html || '').replace(/\n/g, '<br>');
  }
  // Strip Quill-specific classes that cause CSS leaks (ql-indent-*, ql-direction-*, ql-ui, etc.)
  // Keep ql-align-* and ql-video as we handle those in CSS
  var tmp2 = document.createElement('div');
  tmp2.innerHTML = html;
  tmp2.querySelectorAll('[class]').forEach(function(el) {
    var classes = el.className.split(/\s+/).filter(function(c) {
      if (!c.startsWith('ql-')) return true;
      return c.startsWith('ql-align') || c === 'ql-video';
    });
    el.className = classes.join(' ');
    if (!el.className) el.removeAttribute('class');
  });
  return tmp2.innerHTML;
}
function renderMarkdown(s) { return renderContent(s); }

function timeAgoKb(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return d.toLocaleDateString();
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function debounce(fn, delay) {
  var timer;
  return function() {
    var ctx = this, args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function() { fn.apply(ctx, args); }, delay);
  };
}

const debouncedLoadKbArticles = debounce(() => loadKbArticles(), 300);

async function loadKbArticles(page) {
  currentKbPage = page || 1;
  currentKbArticle = null;
  // Restore panel-level URL when returning to article list
  if (window.location.pathname.startsWith('/kb/')) {
    history.replaceState({ panel: 'kb' }, '', '/kb');
  }
  const q = document.getElementById('kbSearch')?.value || '';
  const category = document.getElementById('kbFilterCategory')?.value || '';
  const status = document.getElementById('kbFilterStatus')?.value || '';
  const sort = document.getElementById('kbFilterSort')?.value || '';
  const tag = kbActiveTag || '';

  let url = `${API}/api/kb/articles?page=${currentKbPage}&limit=25`;
  if (q) url += `&q=${encodeURIComponent(q)}`;
  if (category) url += `&category=${category}`;
  if (status) url += `&status=${status}`;
  if (sort) url += `&sort=${sort}`;
  if (tag) url += `&tag=${encodeURIComponent(tag)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    renderKbArticleList(data);
  } catch (err) {
    document.getElementById('kbContent').innerHTML = '<p style="color:red">Failed to load articles</p>';
  }
}

function renderKbArticleList(data) {
  const el = document.getElementById('kbContent');
  const isWriter = currentUser && (currentUser.role === 'admin' || currentUser.role === 'editor');

  if (!data.articles || data.articles.length === 0) {
    el.innerHTML = `<div class="kb-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
      <h3>No articles found</h3>
      <p>${isWriter ? 'Create your first knowledge base article.' : 'No published articles yet.'}</p>
    </div>`;
    return;
  }

  let html = `<div class="users-card"><table class="kb-articles-table">
    <thead><tr>
      <th>Title</th><th>Category</th>${isWriter ? '<th>Status</th>' : ''}<th>Author</th><th>Views</th><th>Updated</th>
    </tr></thead><tbody>`;

  for (const a of data.articles) {
    const statusLabel = a.status || 'draft';
    html += `<tr onclick="viewKbArticle(${a.id})">
      <td><span class="kb-article-title-cell">${a.is_pinned ? '<span class="kb-pin" title="Pinned"><svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" style="vertical-align:-1px"><path d="M16 2l-4 4-6-1-1 5 4 4-2 7 5-3 5 3-2-7 4-4-1-5z"/></svg></span>' : ''}${esc(a.title)}</span></td>
      <td>${a.category_name ? `<span class="kb-cat-badge">${esc(a.category_name)}</span>` : '<span class="kb-article-meta">—</span>'}</td>
      ${isWriter ? `<td><span class="kb-status-badge ${statusLabel}">${statusLabel}</span></td>` : ''}
      <td class="kb-article-meta">${esc(a.author_name || 'Unknown')}</td>
      <td class="kb-article-meta">${a.view_count || 0}</td>
      <td class="kb-article-meta">${timeAgoKb(a.updated_at)}</td>
    </tr>`;
  }
  html += '</tbody></table></div>';

  // Pagination
  if (data.pages > 1) {
    html += '<div class="ticket-pagination">';
    for (let i = 1; i <= data.pages; i++) {
      html += `<button class="${i === data.page ? 'active' : ''}" onclick="loadKbArticles(${i})">${i}</button>`;
    }
    html += '</div>';
  }
  html += `<div style="text-align:center;font-size:12px;color:var(--color-text-muted);padding:4px 0">${data.total} article${data.total !== 1 ? 's' : ''}</div>`;

  el.innerHTML = html;
  // Show sidebar
  document.getElementById('kbSidebar').style.display = '';
}

async function viewKbArticle(idOrSlug) {
  try {
    const res = await fetch(`${API}/api/kb/articles/${idOrSlug}`);
    if (!res.ok) throw new Error('Not found');
    const article = await res.json();
    currentKbArticle = article;
    // Update URL for deep linking
    history.replaceState({ panel: 'kb', detail: article.slug || article.id }, '', '/kb/' + (article.slug || article.id));
    renderKbArticleReader(article);
  } catch (err) {
    toast('Article not found', 'error');
  }
}

function renderKbArticleReader(article) {
  const el = document.getElementById('kbContent');
  const isWriter = currentUser && (currentUser.role === 'admin' || currentUser.role === 'editor');
  const isAdmin = currentUser && currentUser.role === 'admin';

  const tags = (article.tags || []).filter(Boolean).map(t => `<span class="kb-tag-pill" onclick="filterKbByTag('${esc(t.slug)}');loadKbArticles()">${esc(t.name)}</span>`).join('');
  const attachments = (article.attachments || []).filter(Boolean);

  let actionsHtml = '';
  if (isWriter) {
    actionsHtml = `<div class="kb-reader-actions">
      <button onclick="openKbArticleModal(${article.id})">Edit</button>
      <button onclick="toggleKbPin(${article.id}, ${!article.is_pinned})">${article.is_pinned ? 'Unpin' : 'Pin'}</button>
      ${isAdmin ? `<button onclick="toggleKbFeature(${article.id}, ${!article.is_featured})">${article.is_featured ? 'Unfeature' : 'Feature'}</button>` : ''}
      <button onclick="openKbVersionHistory(${article.id})">History</button>
      ${isAdmin ? `<button onclick="deleteKbArticle(${article.id})" style="color:#dc2626">Delete</button>` : ''}
    </div>`;
  }

  let attachHtml = '';
  if (attachments.length) {
    attachHtml = '<div class="kb-attachments"><h4>Attachments</h4>';
    for (const att of attachments) {
      attachHtml += `<div class="kb-att-item">
        <a href="/uploads/kb/${esc(att.filename)}" target="_blank">${esc(att.original_name)}</a>
        <span class="kb-att-size">${formatBytes(att.size_bytes)}</span>
      </div>`;
    }
    attachHtml += '</div>';
  }

  const fbYesClass = article.user_feedback === true ? ' active' : '';
  const fbNoClass = article.user_feedback === false ? ' active' : '';

  el.innerHTML = `
    <button class="kb-reader-back" onclick="loadKbArticles(${currentKbPage})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
      Back to articles
    </button>
    <div class="kb-reader-card">
      <div class="kb-reader-header">
        <div class="kb-reader-title">${esc(article.title)}</div>
        <div class="kb-reader-meta">
          ${article.category_name ? `<span class="kb-cat-badge">${esc(article.category_name)}</span>` : ''}
          ${article.status !== 'published' ? `<span class="kb-status-badge ${article.status}">${article.status}</span>` : ''}
          <span class="kb-reader-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            ${esc(article.author_name || 'Unknown')}
          </span>
          <span class="kb-reader-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${timeAgoKb(article.updated_at)}
          </span>
          <span class="kb-reader-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            ${article.view_count} views
          </span>
        </div>
        ${tags ? `<div class="kb-reader-tags">${tags}</div>` : ''}
      </div>
      ${actionsHtml}
      <div class="kb-reader-body">${renderMarkdown(article.body)}</div>
      ${attachHtml}
      <div class="kb-feedback">
        <span class="kb-feedback-label">Was this helpful?</span>
        <button class="kb-feedback-btn kb-fb-yes${fbYesClass}" onclick="submitKbFeedback(${article.id}, true)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
          Yes <span class="kb-feedback-count">(${article.helpful_yes || 0})</span>
        </button>
        <button class="kb-feedback-btn kb-fb-no${fbNoClass}" onclick="submitKbFeedback(${article.id}, false)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>
          No <span class="kb-feedback-count">(${article.helpful_no || 0})</span>
        </button>
      </div>
    </div>
  `;
  // Hide sidebar when reading
  document.getElementById('kbSidebar').style.display = 'none';

  // Apply syntax highlighting to code blocks in the live DOM
  if (typeof hljs !== 'undefined') {
    el.querySelectorAll('.kb-reader-body pre').forEach(function(pre) {
      var code = pre.querySelector('code');
      if (!code) {
        code = document.createElement('code');
        code.textContent = pre.textContent;
        pre.textContent = '';
        pre.appendChild(code);
      }
      // Strip old hljs classes and re-highlight fresh
      code.classList.remove('hljs');
      code.removeAttribute('data-highlighted');
      try { hljs.highlightElement(code); } catch(e) {}
    });
  }
}

async function submitKbFeedback(articleId, helpful) {
  try {
    const res = await fetch(`${API}/api/kb/articles/${articleId}/feedback`, {
      method: 'POST', headers: CSRF_HEADERS,
      body: JSON.stringify({ helpful })
    });
    const data = await res.json();
    if (currentKbArticle && currentKbArticle.id === articleId) {
      currentKbArticle.helpful_yes = data.helpful_yes;
      currentKbArticle.helpful_no = data.helpful_no;
      currentKbArticle.user_feedback = data.user_feedback;
      renderKbArticleReader(currentKbArticle);
    }
  } catch (err) { toast('Failed to submit feedback', 'error'); }
}

async function toggleKbPin(id, pinned) {
  await fetch(`${API}/api/kb/articles/${id}/pin`, { method: 'PATCH', headers: CSRF_HEADERS, body: JSON.stringify({ pinned }) });
  if (currentKbArticle) { currentKbArticle.is_pinned = pinned; renderKbArticleReader(currentKbArticle); }
  toast(pinned ? 'Article pinned' : 'Article unpinned', 'success');
}

async function toggleKbFeature(id, featured) {
  await fetch(`${API}/api/kb/articles/${id}/feature`, { method: 'PATCH', headers: CSRF_HEADERS, body: JSON.stringify({ featured }) });
  if (currentKbArticle) { currentKbArticle.is_featured = featured; renderKbArticleReader(currentKbArticle); }
  toast(featured ? 'Article featured' : 'Article unfeatured', 'success');
}

async function deleteKbArticle(id) {
  if (!confirm('Delete this article permanently?')) return;
  await fetch(`${API}/api/kb/articles/${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  toast('Article deleted', 'success');
  loadKbArticles(currentKbPage);
}

// Categories
async function loadKbCategories() {
  try {
    const res = await fetch(`${API}/api/kb/categories`);
    kbCategoriesCache = await res.json();
    const sel = document.getElementById('kbFilterCategory');
    sel.innerHTML = '<option value="">All Categories</option>' +
      kbCategoriesCache.map(c => `<option value="${c.id}">${esc(c.name)} (${c.article_count})</option>`).join('');
    if (typeof refreshCustomSelect === 'function') refreshCustomSelect(sel);
  } catch (err) {}
}

// Tags
async function loadKbTags() {
  try {
    const res = await fetch(`${API}/api/kb/tags`);
    kbTagsCache = await res.json();
    const el = document.getElementById('kbTagCloud');
    if (!kbTagsCache.length) { el.innerHTML = ''; return; }
    const isWriter = currentUser && (currentUser.role === 'admin' || currentUser.role === 'editor');
    el.innerHTML = '<div class="ticket-kpi-card"><div class="kpi-header">Tags</div>' +
      kbTagsCache.map(t =>
        `<div class="kpi-item${kbActiveTag === t.slug ? ' active' : ''}" style="cursor:pointer">` +
        `<span class="kpi-label" onclick="filterKbByTag('${esc(t.slug)}')"><span class="kpi-dot" style="background:var(--color-primary)"></span>${esc(t.name)}</span>` +
        `<span style="display:flex;align-items:center"><span class="kpi-value">${t.article_count || 0}</span>` +
        (isWriter ? `<button class="kb-tag-delete" onclick="event.stopPropagation();deleteKbTag(${t.id},'${esc(t.name).replace(/'/g, "\\'")}')" title="Delete tag">&times;</button>` : '') +
        `</span></div>`
      ).join('') +
      '</div>';
  } catch (err) {}
}

function filterKbByTag(slug) {
  kbActiveTag = kbActiveTag === slug ? '' : slug;
  loadKbArticles();
  loadKbTags();
}

async function deleteKbTag(id, name) {
  if (!confirm('Delete tag "' + name + '"? It will be removed from all articles.')) return;
  try {
    const res = await fetch(`${API}/api/kb/tags/${id}`, { method: 'DELETE', headers: CSRF_HEADERS });
    if (!res.ok) throw new Error('Failed to delete tag');
    if (kbActiveTag) { kbActiveTag = ''; loadKbArticles(); }
    loadKbTags();
    toast('Tag deleted');
  } catch (err) { toast(err.message, 'error'); }
}

// Stats
async function loadKbStats() {
  try {
    const res = await fetch(`${API}/api/kb/stats`);
    const data = await res.json();
    const el = document.getElementById('kbStatsContainer');
    let html = '<div class="ticket-kpi-card"><div class="kpi-header">Overview</div>';
    html += `<div class="kpi-item"><span class="kpi-label">Published</span><span class="kpi-value">${data.total}</span></div>`;
    html += '</div>';
    if (data.popular && data.popular.length) {
      html += '<div class="ticket-kpi-card"><div class="kpi-header">Popular Articles</div>';
      for (const a of data.popular) {
        html += `<div class="kpi-item" style="cursor:pointer" onclick="viewKbArticle(${a.id})"><span class="kpi-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.title)}</span><span class="kpi-value">${a.view_count}</span></div>`;
      }
      html += '</div>';
    }
    el.innerHTML = html;
  } catch (err) {}
}

// Create/Edit modal
async function openKbArticleModal(id) {
  kbEditingId = id || null;
  kbAttachments = [];
  document.getElementById('kbModalTitle').textContent = id ? 'Edit Article' : 'New Article';
  document.getElementById('kbArtTitle').value = '';
  document.getElementById('kbArtExcerpt').value = '';
  kbSelectedTags = [];
  document.getElementById('kbTagInput').value = '';
  renderKbTagChips();
  hideKbTagSuggestions();
  document.getElementById('kbArtCategory').value = '';
  document.getElementById('kbArtStatus').value = 'draft';
  document.getElementById('kbArtPinned').checked = false;
  document.getElementById('kbArtFeatured').checked = false;
  document.getElementById('kbAttachmentsList').innerHTML = '';

  // Init editor for KB body
  initEditor('kbArtBody', { level: 'full', placeholder: 'Write your article...' });

  // Populate category dropdown
  const catSel = document.getElementById('kbArtCategory');
  catSel.innerHTML = '<option value="">None</option>' +
    kbCategoriesCache.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if (typeof refreshCustomSelect === 'function') refreshCustomSelect(catSel);

  if (id) {
    try {
      const res = await fetch(`${API}/api/kb/articles/${id}`);
      const a = await res.json();
      document.getElementById('kbArtTitle').value = a.title || '';
      setEditorData('kbArtBody', a.body || '');
      document.getElementById('kbArtExcerpt').value = a.excerpt || '';
      kbSelectedTags = (a.tags || []).filter(Boolean).map(t => t.name);
      renderKbTagChips();
      document.getElementById('kbArtCategory').value = a.category_id || '';
      if (typeof syncCustomSelect === 'function') syncCustomSelect(document.getElementById('kbArtCategory'));
      document.getElementById('kbArtStatus').value = a.status || 'draft';
      if (typeof syncCustomSelect === 'function') syncCustomSelect(document.getElementById('kbArtStatus'));
      document.getElementById('kbArtPinned').checked = !!a.is_pinned;
      document.getElementById('kbArtFeatured').checked = !!a.is_featured;

      // Show existing attachments
      kbAttachments = (a.attachments || []).filter(Boolean);
      renderKbAttachmentList();
    } catch (err) { toast('Failed to load article', 'error'); return; }
  }

  document.getElementById('kbArticleModal').classList.add('active');
}

function closeKbArticleModal() {
  document.getElementById('kbArticleModal').classList.remove('active');
  // Clean up orphaned Quill elements from body
  document.querySelectorAll('body > .ql-clipboard, body > .ql-tooltip').forEach(function(el) { el.remove(); });
}

async function saveKbArticle() {
  const title = document.getElementById('kbArtTitle').value.trim();
  if (!title) { toast('Title is required', 'error'); return; }

  const body = {
    title,
    body: getEditorHtml('kbArtBody'),
    excerpt: document.getElementById('kbArtExcerpt').value.trim(),
    category_id: document.getElementById('kbArtCategory').value || null,
    status: document.getElementById('kbArtStatus').value,
    is_pinned: document.getElementById('kbArtPinned').checked,
    is_featured: document.getElementById('kbArtFeatured').checked,
    tags: kbSelectedTags.filter(Boolean),
  };

  const btn = document.getElementById('kbSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    const url = kbEditingId ? `${API}/api/kb/articles/${kbEditingId}` : `${API}/api/kb/articles`;
    const method = kbEditingId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: CSRF_HEADERS, body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
    const article = await res.json();
    toast(kbEditingId ? 'Article updated' : 'Article created', 'success');
    closeKbArticleModal();
    if (kbEditingId) { viewKbArticle(article.id); } else { loadKbArticles(); }
    loadKbTags();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Article';
  }
}

// Tag input helpers
// kbSelectedTags declared earlier (near KB state vars)

function renderKbTagChips() {
  const wrap = document.getElementById('kbTagInputWrap');
  // Remove existing chips
  wrap.querySelectorAll('.kb-tag-chip').forEach(el => el.remove());
  const input = document.getElementById('kbTagInput');
  for (const tag of kbSelectedTags) {
    const chip = document.createElement('span');
    chip.className = 'kb-tag-chip';
    chip.innerHTML = esc(tag) + '<span class="kb-tag-remove" onclick="removeKbTag(\'' + esc(tag).replace(/'/g, "\\'") + '\')">&times;</span>';
    wrap.insertBefore(chip, input);
  }
  // Sync hidden input
  document.getElementById('kbArtTags').value = kbSelectedTags.join(',');
}

function addKbTag(name) {
  name = name.trim();
  if (!name || kbSelectedTags.includes(name)) return;
  kbSelectedTags.push(name);
  renderKbTagChips();
  document.getElementById('kbTagInput').value = '';
  hideKbTagSuggestions();
}

function removeKbTag(name) {
  kbSelectedTags = kbSelectedTags.filter(t => t !== name);
  renderKbTagChips();
}

function showKbTagSuggestions() {
  const input = document.getElementById('kbTagInput');
  const q = input.value.trim().toLowerCase();
  const box = document.getElementById('kbTagSuggestions');
  if (!q) { box.style.display = 'none'; return; }
  const matches = kbTagsCache.filter(t =>
    t.name.toLowerCase().includes(q) && !kbSelectedTags.includes(t.name)
  ).slice(0, 8);
  const exact = kbTagsCache.some(t => t.name.toLowerCase() === q);
  let html = matches.map(t =>
    `<div class="kb-tag-suggestion" onclick="addKbTag('${esc(t.name).replace(/'/g, "\\'")}')">${esc(t.name)}<span class="kb-tag-hint">${t.article_count || 0} articles</span></div>`
  ).join('');
  if (!exact && q.length > 0) {
    html += `<div class="kb-tag-suggestion" onclick="addKbTag('${esc(input.value.trim()).replace(/'/g, "\\'")}')" style="color:var(--color-primary)">Create "${esc(q)}"<span class="kb-tag-hint">new tag</span></div>`;
  }
  box.innerHTML = html;
  box.style.display = html ? '' : 'none';
}

function hideKbTagSuggestions() {
  document.getElementById('kbTagSuggestions').style.display = 'none';
}

function handleKbTagKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const v = e.target.value.trim();
    if (v) addKbTag(v);
  } else if (e.key === 'Backspace' && !e.target.value && kbSelectedTags.length) {
    kbSelectedTags.pop();
    renderKbTagChips();
  } else if (e.key === 'Escape') {
    hideKbTagSuggestions();
  }
}

// Close suggestions on outside click
document.addEventListener('click', function(e) {
  if (!e.target.closest('#kbTagInputWrap') && !e.target.closest('#kbTagSuggestions')) {
    hideKbTagSuggestions();
  }
});

// Editor toolbar — handled by Quill Snow theme

// Attachments
function renderKbAttachmentList() {
  const el = document.getElementById('kbAttachmentsList');
  if (!kbAttachments.length) { el.innerHTML = ''; return; }
  el.innerHTML = kbAttachments.map(att => `<div class="kb-att-item">
    <a href="/uploads/kb/${esc(att.filename)}" target="_blank">${esc(att.original_name)}</a>
    <span class="kb-att-size">${formatBytes(att.size_bytes)}</span>
    ${kbEditingId ? `<button class="btn" style="padding:2px 8px;font-size:11px" onclick="deleteKbAttachment(${kbEditingId},${att.id})">Remove</button>` : ''}
  </div>`).join('');
}

async function handleKbAttachmentUpload(input) {
  if (!kbEditingId) { toast('Save the article first, then add attachments', 'info'); input.value = ''; return; }
  for (const file of input.files) {
    const reader = new FileReader();
    reader.onload = async function() {
      const base64 = reader.result.split(',')[1];
      try {
        const res = await fetch(`${API}/api/kb/articles/${kbEditingId}/attachments`, {
          method: 'POST', headers: CSRF_HEADERS,
          body: JSON.stringify({ data: base64, filename: file.name, mime_type: file.type })
        });
        if (!res.ok) throw new Error('Upload failed');
        const att = await res.json();
        kbAttachments.push(att);
        renderKbAttachmentList();
        toast('File uploaded', 'success');
      } catch (err) { toast(err.message, 'error'); }
    };
    reader.readAsDataURL(file);
  }
  input.value = '';
}

async function deleteKbAttachment(articleId, attachId) {
  await fetch(`${API}/api/kb/articles/${articleId}/attachments/${attachId}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
  kbAttachments = kbAttachments.filter(a => a.id !== attachId);
  renderKbAttachmentList();
}

// Version history
async function openKbVersionHistory(articleId) {
  try {
    const res = await fetch(`${API}/api/kb/articles/${articleId}/versions`);
    const versions = await res.json();
    const el = document.getElementById('kbVersionList');
    if (!versions.length) { el.innerHTML = '<p>No version history.</p>'; }
    else {
      el.innerHTML = versions.map(v => `<div class="kb-version-row">
        <div class="kb-version-info">
          <div class="kb-version-date">${esc(v.title)}</div>
          <div class="kb-version-by">${esc(v.edited_by_name || 'Unknown')} &middot; ${timeAgoKb(v.created_at)}</div>
          ${v.version_note ? `<div class="kb-version-note">${esc(v.version_note)}</div>` : ''}
        </div>
        <div class="kb-version-actions">
          <button class="btn" onclick="restoreKbVersion(${articleId},${v.id})">Restore</button>
        </div>
      </div>`).join('');
    }
    document.getElementById('kbVersionModal').classList.add('active');
  } catch (err) { toast('Failed to load versions', 'error'); }
}

async function restoreKbVersion(articleId, versionId) {
  if (!confirm('Restore this version? Current content will be saved as a version.')) return;
  try {
    await fetch(`${API}/api/kb/articles/${articleId}/restore/${versionId}`, { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    toast('Version restored', 'success');
    document.getElementById('kbVersionModal').classList.remove('active');
    viewKbArticle(articleId);
  } catch (err) { toast('Restore failed', 'error'); }
}

// Dropzone drag/drop
document.addEventListener('DOMContentLoaded', function() {
  const dz = document.getElementById('kbDropzone');
  if (dz) {
    dz.addEventListener('dragover', function(e) { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', function() { dz.classList.remove('dragover'); });
    dz.addEventListener('drop', function(e) {
      e.preventDefault(); dz.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        const input = dz.querySelector('input[type="file"]');
        input.files = e.dataTransfer.files;
        handleKbAttachmentUpload(input);
      }
    });
  }
});

// Close modals on Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (document.getElementById('kbVersionModal').classList.contains('active')) document.getElementById('kbVersionModal').classList.remove('active');
    else if (document.getElementById('kbArticleModal').classList.contains('active')) closeKbArticleModal();
  }
});

// --- Image Lightbox ---
function openImageLightbox(src) {
  var lb = document.getElementById('imgLightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'imgLightbox';
    lb.className = 'img-lightbox';
    lb.innerHTML = '<button class="img-lightbox-close" onclick="closeImageLightbox()">&times;</button><img>';
    lb.onclick = function(e) { if (e.target === lb) closeImageLightbox(); };
    document.body.appendChild(lb);
  }
  lb.querySelector('img').src = src;
  lb.style.display = 'flex';
  requestAnimationFrame(function() { lb.classList.add('active'); });
}

function closeImageLightbox() {
  var lb = document.getElementById('imgLightbox');
  if (!lb) return;
  lb.classList.remove('active');
  setTimeout(function() { lb.style.display = 'none'; }, 200);
}

// Delegate click on images inside ticket descriptions, comments, and KB reader
document.addEventListener('click', function(e) {
  var img = e.target;
  if (img.tagName !== 'IMG') return;
  if (img.closest('.ticket-detail-desc') || img.closest('.comment-text') || img.closest('.kb-reader-body')) {
    e.preventDefault();
    openImageLightbox(img.src);
  }
});

// Close lightbox on Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    var lb = document.getElementById('imgLightbox');
    if (lb && lb.classList.contains('active')) closeImageLightbox();
  }
});

