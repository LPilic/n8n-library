// --- Prompt Versioning ---
let currentPromptsPage = 1;
let currentPrompt = null;
let promptEditingId = null;
let promptCategoriesCache = [];

function timeAgoPrompt(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return d.toLocaleDateString();
}

const debouncedLoadPrompts = debounce(() => loadPrompts(), 300);

// --- Load prompt list ---
async function loadPrompts(page) {
  currentPromptsPage = page || 1;
  currentPrompt = null;
  if (window.location.pathname.startsWith('/prompts/')) {
    history.replaceState({ panel: 'prompts' }, '', '/prompts');
  }
  const q = document.getElementById('promptSearch')?.value || '';
  const category = document.getElementById('promptFilterCategory')?.value || '';
  const status = document.getElementById('promptFilterStatus')?.value || '';
  const sort = document.getElementById('promptFilterSort')?.value || '';

  let url = `${API}/api/prompts?page=${currentPromptsPage}&limit=25`;
  if (q) url += `&q=${encodeURIComponent(q)}`;
  if (category) url += `&category=${encodeURIComponent(category)}`;
  if (status) url += `&status=${status}`;
  if (sort) url += `&sort=${sort}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    renderPromptList(data);
  } catch (err) {
    document.getElementById('promptContent').innerHTML = '<p style="color:red">Failed to load prompts</p>';
  }
}

function renderPromptList(data) {
  const el = document.getElementById('promptContent');
  const isWriter = currentUser && (currentUser.role === 'admin' || currentUser.role === 'editor');

  if (!data.prompts || data.prompts.length === 0) {
    el.innerHTML = `<div class="kb-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <h3>No prompts found</h3>
      <p>${isWriter ? 'Create your first prompt.' : 'No published prompts yet.'}</p>
    </div>`;
    return;
  }

  let html = `<div class="users-card"><table class="kb-articles-table">
    <thead><tr>
      <th>Name</th><th>Category</th>${isWriter ? '<th>Status</th>' : ''}<th>Version</th><th>Author</th><th>Updated</th>
    </tr></thead><tbody>`;

  for (const p of data.prompts) {
    const statusLabel = p.status || 'draft';
    html += `<tr onclick="viewPrompt(${p.id})">
      <td><span class="kb-article-title-cell">${esc(p.name)}</span></td>
      <td>${p.category ? `<span class="kb-cat-badge">${esc(p.category)}</span>` : '<span class="kb-article-meta">-</span>'}</td>
      ${isWriter ? `<td><span class="kb-status-badge ${statusLabel}">${statusLabel}</span></td>` : ''}
      <td class="kb-article-meta">v${p.current_version}</td>
      <td class="kb-article-meta">${esc(p.created_by_name || 'Unknown')}</td>
      <td class="kb-article-meta">${timeAgoPrompt(p.updated_at)}</td>
    </tr>`;
  }
  html += '</tbody></table></div>';

  if (data.pages > 1) {
    html += '<div class="ticket-pagination">';
    for (let i = 1; i <= data.pages; i++) {
      html += `<button class="${i === data.page ? 'active' : ''}" onclick="loadPrompts(${i})">${i}</button>`;
    }
    html += '</div>';
  }
  html += `<div style="text-align:center;font-size:12px;color:var(--color-text-muted);padding:4px 0">${data.total} prompt${data.total !== 1 ? 's' : ''}</div>`;
  el.innerHTML = html;
}

// --- View prompt detail ---
async function viewPrompt(id) {
  try {
    const res = await fetch(`${API}/api/prompts/${id}`);
    if (!res.ok) throw new Error('Not found');
    const prompt = await res.json();
    currentPrompt = prompt;
    history.replaceState({ panel: 'prompts', detail: prompt.id }, '', '/prompts/' + prompt.id);
    renderPromptDetail(prompt);
  } catch (err) {
    toast('Prompt not found', 'error');
  }
}

function renderPromptDetail(prompt) {
  const el = document.getElementById('promptContent');
  const isWriter = currentUser && (currentUser.role === 'admin' || currentUser.role === 'editor');
  const isAdmin = currentUser && currentUser.role === 'admin';

  const tags = (prompt.tags || []).map(t => `<span class="kb-cat-badge">${esc(t)}</span>`).join(' ');
  const vars = (prompt.variables || []);
  let varsHtml = '';
  if (vars.length) {
    varsHtml = '<div class="prompt-variables"><strong>Variables:</strong> ' +
      vars.map(v => `<code>{{${esc(typeof v === 'string' ? v : v.name || v)}}}</code>`).join(' ') + '</div>';
  }

  let actionsHtml = '';
  if (isWriter) {
    actionsHtml = `<div class="kb-reader-actions">
      <button onclick="openPromptModal(${prompt.id})">Edit</button>
      <button onclick="openPromptVersionHistory(${prompt.id})">History</button>
      <button onclick="openPromptImprove(${prompt.id})">Improve with AI</button>
      ${isAdmin ? `<button onclick="deletePrompt(${prompt.id})" style="color:#dc2626">Delete</button>` : ''}
    </div>`;
  }

  // Escape content for display but preserve whitespace
  const contentDisplay = esc(prompt.content || '').replace(/\n/g, '<br>');

  el.innerHTML = `
    <button class="kb-reader-back" onclick="loadPrompts(${currentPromptsPage})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
      Back to prompts
    </button>
    <div class="kb-reader-card">
      <div class="kb-reader-header">
        <div class="kb-reader-title">${esc(prompt.name)}</div>
        <div class="kb-reader-meta">
          ${prompt.category ? `<span class="kb-cat-badge">${esc(prompt.category)}</span>` : ''}
          ${prompt.status !== 'published' ? `<span class="kb-status-badge ${prompt.status}">${prompt.status}</span>` : ''}
          <span class="kb-reader-meta-item">v${prompt.current_version}</span>
          <span class="kb-reader-meta-item">${esc(prompt.created_by_name || 'Unknown')}</span>
          <span class="kb-reader-meta-item">${timeAgoPrompt(prompt.updated_at)}</span>
        </div>
        ${tags ? `<div style="margin-top:8px">${tags}</div>` : ''}
      </div>
      ${actionsHtml}
      ${prompt.description ? `<div class="prompt-description">${esc(prompt.description)}</div>` : ''}
      ${varsHtml}
      <div class="prompt-content-block"><pre class="prompt-content-pre">${contentDisplay}</pre></div>
    </div>
  `;
}

// --- Create/Edit modal ---
async function openPromptModal(id) {
  promptEditingId = id || null;
  document.getElementById('promptModalTitle').textContent = id ? 'Edit Prompt' : 'New Prompt';
  document.getElementById('promptName').value = '';
  document.getElementById('promptDescription').value = '';
  document.getElementById('promptContentInput').value = '';
  document.getElementById('promptVariables').value = '';
  document.getElementById('promptCategory').value = '';
  document.getElementById('promptTags').value = '';
  document.getElementById('promptStatus').value = 'draft';
  document.getElementById('promptChangeNote').value = '';
  document.getElementById('promptChangeNoteGroup').style.display = id ? '' : 'none';

  // Populate category dropdown
  try {
    const res = await fetch(`${API}/api/prompts/categories`);
    promptCategoriesCache = await res.json();
  } catch (e) { promptCategoriesCache = []; }
  const catList = document.getElementById('promptCategoryList');
  catList.innerHTML = promptCategoriesCache.map(c => `<option value="${esc(c)}">`).join('');

  if (id) {
    try {
      const res = await fetch(`${API}/api/prompts/${id}`);
      const p = await res.json();
      document.getElementById('promptName').value = p.name || '';
      document.getElementById('promptDescription').value = p.description || '';
      document.getElementById('promptContentInput').value = p.content || '';
      document.getElementById('promptVariables').value = (p.variables || []).map(v => typeof v === 'string' ? v : v.name || v).join(', ');
      document.getElementById('promptTags').value = (p.tags || []).join(', ');
      document.getElementById('promptStatus').value = p.status || 'draft';
      document.getElementById('promptCategory').value = p.category || '';
    } catch (err) { toast('Failed to load prompt', 'error'); return; }
  }

  document.getElementById('promptModal').classList.add('active');
  // Focus name field
  setTimeout(() => document.getElementById('promptName').focus(), 100);
}

function closePromptModal() {
  document.getElementById('promptModal').classList.remove('active');
}

async function savePrompt() {
  const name = document.getElementById('promptName').value.trim();
  if (!name) { toast('Name is required', 'error'); return; }

  const content = document.getElementById('promptContentInput').value;
  const varsRaw = document.getElementById('promptVariables').value;
  const variables = varsRaw ? varsRaw.split(',').map(v => v.trim()).filter(Boolean) : [];
  const tagsRaw = document.getElementById('promptTags').value;
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  const body = {
    name,
    description: document.getElementById('promptDescription').value.trim(),
    content,
    variables,
    category: document.getElementById('promptCategory').value,
    tags,
    status: document.getElementById('promptStatus').value,
    change_note: document.getElementById('promptChangeNote')?.value || '',
  };

  const btn = document.getElementById('promptSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    const url = promptEditingId ? `${API}/api/prompts/${promptEditingId}` : `${API}/api/prompts`;
    const method = promptEditingId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: CSRF_HEADERS, body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
    const prompt = await res.json();
    toast(promptEditingId ? 'Prompt updated' : 'Prompt created', 'success');
    closePromptModal();
    if (promptEditingId) { viewPrompt(prompt.id); } else { loadPrompts(); }
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Prompt';
  }
}

// --- Delete ---
async function deletePrompt(id) {
  if (!confirm('Delete this prompt permanently?')) return;
  try {
    await fetch(`${API}/api/prompts/${id}`, { method: 'DELETE', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    toast('Prompt deleted', 'success');
    loadPrompts(currentPromptsPage);
  } catch (err) { toast('Delete failed', 'error'); }
}

// --- Version History ---
async function openPromptVersionHistory(promptId) {
  try {
    const res = await fetch(`${API}/api/prompts/${promptId}/versions`);
    const versions = await res.json();
    const el = document.getElementById('promptVersionList');

    if (!versions.length) {
      el.innerHTML = '<p>No version history.</p>';
    } else {
      el.innerHTML = `
        <div class="prompt-version-compare-bar" id="promptCompareBar" style="display:none">
          <button class="btn btn-primary" onclick="compareSelectedVersions(${promptId})">Compare Selected</button>
          <span id="promptCompareCount">0 selected</span>
        </div>` +
        versions.map(v => `<div class="kb-version-row">
          <label class="prompt-version-check">
            <input type="checkbox" value="${v.version}" onchange="updateCompareSelection()">
          </label>
          <div class="kb-version-info">
            <div class="kb-version-date">Version ${v.version}</div>
            <div class="kb-version-by">${esc(v.created_by_name || 'Unknown')} &middot; ${timeAgoPrompt(v.created_at)}</div>
            ${v.change_note ? `<div class="kb-version-note">${esc(v.change_note)}</div>` : ''}
          </div>
          <div class="kb-version-actions">
            ${v.version > 1 ? `<button class="btn" onclick="quickCompareVersion(${promptId}, ${v.version})">Diff</button>` : ''}
            <button class="btn" onclick="revertPromptVersion(${promptId}, ${v.version})">Restore</button>
          </div>
        </div>`).join('');
    }
    document.getElementById('promptVersionModal').classList.add('active');
  } catch (err) { toast('Failed to load versions', 'error'); }
}

function updateCompareSelection() {
  const checks = document.querySelectorAll('#promptVersionList input[type="checkbox"]:checked');
  const bar = document.getElementById('promptCompareBar');
  const countEl = document.getElementById('promptCompareCount');
  if (checks.length >= 2) {
    // Only allow 2 selections
    if (checks.length > 2) {
      checks[0].checked = false;
      updateCompareSelection();
      return;
    }
    bar.style.display = 'flex';
    countEl.textContent = '2 versions selected';
  } else {
    bar.style.display = checks.length > 0 ? 'flex' : 'none';
    countEl.textContent = checks.length + ' selected (pick 2)';
  }
}

async function compareSelectedVersions(promptId) {
  const checks = document.querySelectorAll('#promptVersionList input[type="checkbox"]:checked');
  if (checks.length !== 2) { toast('Select exactly 2 versions to compare', 'error'); return; }
  const versions = Array.from(checks).map(c => parseInt(c.value)).sort((a, b) => a - b);
  await showVersionDiff(promptId, versions[0], versions[1]);
}

async function quickCompareVersion(promptId, version) {
  await showVersionDiff(promptId, version - 1, version);
}

async function showVersionDiff(promptId, fromV, toV) {
  try {
    const res = await fetch(`${API}/api/prompts/${promptId}/diff?from=${fromV}&to=${toV}`);
    if (!res.ok) throw new Error('Failed to load diff');
    const data = await res.json();

    const diffHtml = computeWordDiff(data.from.content, data.to.content);

    const el = document.getElementById('promptDiffBody');
    el.innerHTML = `
      <div class="prompt-diff-header">
        <div class="prompt-diff-col">
          <strong>Version ${data.from.version}</strong>
          <span class="kb-version-by">${esc(data.from.created_by_name || 'Unknown')} &middot; ${timeAgoPrompt(data.from.created_at)}</span>
          ${data.from.change_note ? `<div class="kb-version-note">${esc(data.from.change_note)}</div>` : ''}
        </div>
        <div class="prompt-diff-col">
          <strong>Version ${data.to.version}</strong>
          <span class="kb-version-by">${esc(data.to.created_by_name || 'Unknown')} &middot; ${timeAgoPrompt(data.to.created_at)}</span>
          ${data.to.change_note ? `<div class="kb-version-note">${esc(data.to.change_note)}</div>` : ''}
        </div>
      </div>
      <div class="prompt-diff-content">${diffHtml}</div>
    `;

    document.getElementById('promptDiffModal').classList.add('active');
  } catch (err) { toast('Failed to load diff', 'error'); }
}

// --- Word-level diff algorithm ---
function computeWordDiff(oldText, newText) {
  const oldWords = tokenize(oldText);
  const newWords = tokenize(newText);
  const diff = diffArrays(oldWords, newWords);

  let html = '<pre class="prompt-diff-pre">';
  for (const part of diff) {
    const text = esc(part.value.join(''));
    if (part.added) {
      html += `<span class="diff-added">${text}</span>`;
    } else if (part.removed) {
      html += `<span class="diff-removed">${text}</span>`;
    } else {
      html += text;
    }
  }
  html += '</pre>';
  return html;
}

function tokenize(text) {
  // Split into words and whitespace tokens
  return text.match(/\S+|\s+/g) || [];
}

// Simple Myers-like diff for string arrays
function diffArrays(oldArr, newArr) {
  const oldLen = oldArr.length;
  const newLen = newArr.length;

  // Build LCS table
  const dp = Array(oldLen + 1).fill(null).map(() => Array(newLen + 1).fill(0));
  for (let i = 1; i <= oldLen; i++) {
    for (let j = 1; j <= newLen; j++) {
      if (oldArr[i - 1] === newArr[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to get diff
  const result = [];
  let i = oldLen, j = newLen;
  const parts = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldArr[i - 1] === newArr[j - 1]) {
      parts.unshift({ type: 'equal', value: oldArr[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      parts.unshift({ type: 'added', value: newArr[j - 1] });
      j--;
    } else {
      parts.unshift({ type: 'removed', value: oldArr[i - 1] });
      i--;
    }
  }

  // Merge consecutive same-type parts
  const merged = [];
  for (const p of parts) {
    if (merged.length && merged[merged.length - 1].type === p.type) {
      merged[merged.length - 1].value.push(p.value);
    } else {
      merged.push({ type: p.type, value: [p.value], added: p.type === 'added', removed: p.type === 'removed' });
    }
  }
  return merged;
}

// --- Revert version ---
async function revertPromptVersion(promptId, version) {
  if (!confirm(`Restore to version ${version}? This creates a new version with that content.`)) return;
  try {
    const res = await fetch(`${API}/api/prompts/${promptId}/revert/${version}`, {
      method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (!res.ok) throw new Error('Restore failed');
    toast('Version restored', 'success');
    document.getElementById('promptVersionModal').classList.remove('active');
    viewPrompt(promptId);
  } catch (err) { toast(err.message, 'error'); }
}

// --- AI Improve ---
async function openPromptImprove(promptId) {
  if (!currentPrompt) return;
  document.getElementById('promptImproveInstruction').value = '';
  document.getElementById('promptImproveResult').innerHTML = '';
  document.getElementById('promptImproveAcceptBtn').style.display = 'none';
  document.getElementById('promptImproveModal').classList.add('active');
}

async function runPromptImprove() {
  const instruction = document.getElementById('promptImproveInstruction').value.trim();
  const content = currentPrompt?.content;
  if (!content) { toast('No prompt content to improve', 'error'); return; }

  const btn = document.getElementById('promptImproveRunBtn');
  const resultEl = document.getElementById('promptImproveResult');
  btn.disabled = true; btn.textContent = 'Improving...';
  resultEl.innerHTML = '<p style="color:var(--color-text-muted)">Generating improvement...</p>';

  try {
    const res = await fetch(`${API}/api/prompts/${currentPrompt.id}/improve`, {
      method: 'POST', headers: CSRF_HEADERS,
      body: JSON.stringify({ content, instruction })
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
    const data = await res.json();

    // Show diff between current and improved
    const diffHtml = computeWordDiff(content, data.improved);

    resultEl.innerHTML = `
      <div class="prompt-improve-sections">
        <div class="prompt-improve-section">
          <h4>Changes (diff view)</h4>
          <div class="prompt-diff-content">${diffHtml}</div>
        </div>
        <div class="prompt-improve-section">
          <h4>Improved prompt</h4>
          <pre class="prompt-content-pre">${esc(data.improved)}</pre>
        </div>
      </div>
    `;
    // Store for accept
    document.getElementById('promptImproveAcceptBtn').style.display = '';
    document.getElementById('promptImproveAcceptBtn').onclick = function() {
      acceptImprovedPrompt(data.improved);
    };
  } catch (err) {
    resultEl.innerHTML = `<p style="color:#dc2626">${esc(err.message)}</p>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Improve';
  }
}

function acceptImprovedPrompt(improvedContent) {
  document.getElementById('promptImproveModal').classList.remove('active');
  // Open the edit modal with improved content pre-filled
  openPromptModal(currentPrompt.id).then(() => {
    document.getElementById('promptContentInput').value = improvedContent;
    document.getElementById('promptChangeNote').value = 'AI-improved prompt';
  });
}

// --- Load categories for filters ---
async function loadPromptCategories() {
  try {
    const res = await fetch(`${API}/api/prompts/categories`);
    promptCategoriesCache = await res.json();
    const sel = document.getElementById('promptFilterCategory');
    if (sel) {
      sel.innerHTML = '<option value="">All Categories</option>' +
        promptCategoriesCache.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    }
  } catch (e) {}
}

// --- Close modals on Escape ---
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (document.getElementById('promptDiffModal').classList.contains('active')) {
      document.getElementById('promptDiffModal').classList.remove('active');
    } else if (document.getElementById('promptImproveModal').classList.contains('active')) {
      document.getElementById('promptImproveModal').classList.remove('active');
    } else if (document.getElementById('promptVersionModal').classList.contains('active')) {
      document.getElementById('promptVersionModal').classList.remove('active');
    } else if (document.getElementById('promptModal').classList.contains('active')) {
      closePromptModal();
    }
  }
});
