// --- Observability Dashboard ---

var obsCharts = {};
var obsRefreshInterval = null;
var obsLastMetrics = null;

function startObsAutoRefresh() {
  stopObsAutoRefresh();
  var dd = document.getElementById('obsRefreshDropdown');
  var sec = dd ? parseInt(dd.getAttribute('data-value') || '20', 10) : 20;
  if (sec > 0) {
    obsRefreshInterval = setInterval(function() {
      if (document.getElementById('panel-observability').classList.contains('active')) {
        loadObservability();
      }
    }, sec * 1000);
  }
}
function stopObsAutoRefresh() {
  if (obsRefreshInterval) { clearInterval(obsRefreshInterval); obsRefreshInterval = null; }
}
function setObsRefreshInterval() {
  startObsAutoRefresh();
}

async function loadObservability() {
  try {
    var ip = typeof getActiveInstanceParam === 'function' ? getActiveInstanceParam() : '';
    var sep = ip ? '?' + ip : '';
    var [metricsRes, historyRes] = await Promise.all([
      fetch(API + '/api/monitoring/metrics' + sep, { headers: CSRF_HEADERS }),
      fetch(API + '/api/monitoring/metrics/history' + sep, { headers: CSRF_HEADERS }),
    ]);
    if (!metricsRes.ok || !historyRes.ok) throw new Error('Failed to load metrics');
    var metrics = await metricsRes.json();
    var history = await historyRes.json();
    obsLastMetrics = metrics;
    renderObsKpis(metrics);
    renderObsCharts(history);
    renderObsRaw(metrics);
    loadObsWorkers();
    document.getElementById('obsLastUpdate').textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    document.getElementById('obsKpiRow').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--color-text-muted)">Failed to load metrics. Is n8n running?</div>';
  }
}

function obsMetricVal(metrics, name) {
  var arr = metrics[name];
  if (!arr || !arr.length) return 0;
  return arr[0].value;
}

function fmtBytes(b) {
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
  if (b >= 1048576) return (b / 1048576).toFixed(0) + ' MB';
  if (b >= 1024) return (b / 1024).toFixed(0) + ' KB';
  return b + ' B';
}

function fmtUptime(startSec) {
  var now = Date.now() / 1000;
  var diff = now - startSec;
  if (diff < 0) return '—';
  var d = Math.floor(diff / 86400);
  var h = Math.floor((diff % 86400) / 3600);
  var m = Math.floor((diff % 3600) / 60);
  if (d > 0) return d + 'd ' + h + 'h';
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

function renderObsKpis(metrics) {
  var memRss = obsMetricVal(metrics, 'n8n_process_resident_memory_bytes');
  var heapUsed = obsMetricVal(metrics, 'n8n_nodejs_heap_size_used_bytes');
  var heapTotal = obsMetricVal(metrics, 'n8n_nodejs_heap_size_total_bytes');
  var heapPct = heapTotal > 0 ? Math.round((heapUsed / heapTotal) * 100) : 0;
  var evtLag = obsMetricVal(metrics, 'n8n_nodejs_eventloop_lag_seconds') * 1000;
  var evtP99 = obsMetricVal(metrics, 'n8n_nodejs_eventloop_lag_p99_seconds') * 1000;
  var qWaiting = obsMetricVal(metrics, 'n8n_scaling_mode_queue_jobs_waiting');
  var qActive = obsMetricVal(metrics, 'n8n_scaling_mode_queue_jobs_active');
  var qCompleted = obsMetricVal(metrics, 'n8n_scaling_mode_queue_jobs_completed');
  var qFailed = obsMetricVal(metrics, 'n8n_scaling_mode_queue_jobs_failed');
  var activeWf = obsMetricVal(metrics, 'n8n_active_workflow_count');
  var startTime = obsMetricVal(metrics, 'n8n_process_start_time_seconds');
  var openFds = obsMetricVal(metrics, 'n8n_process_open_fds');
  var maxFds = obsMetricVal(metrics, 'n8n_process_max_fds');
  var isLeader = obsMetricVal(metrics, 'n8n_instance_role_leader');

  // n8n version
  var n8nVer = '—';
  var verArr = metrics['n8n_version_info'];
  if (verArr && verArr[0] && verArr[0].labels) n8nVer = verArr[0].labels.version || '—';
  var nodeVer = '—';
  var nodeVerArr = metrics['n8n_nodejs_version_info'];
  if (nodeVerArr && nodeVerArr[0] && nodeVerArr[0].labels) nodeVer = nodeVerArr[0].labels.version || '—';

  var memClass = memRss > 2147483648 ? 'obs-danger' : memRss > 1073741824 ? 'obs-warning' : 'obs-healthy';
  var heapClass = heapPct > 90 ? 'obs-danger' : heapPct > 75 ? 'obs-warning' : 'obs-healthy';
  var lagClass = evtLag > 100 ? 'obs-danger' : evtLag > 50 ? 'obs-warning' : 'obs-healthy';
  var qClass = qWaiting > 50 ? 'obs-danger' : qWaiting > 10 ? 'obs-warning' : 'obs-healthy';

  var html = '';
  html += '<div class="obs-kpi obs-healthy"><div class="obs-kpi-value" style="font-size:16px">' + esc(n8nVer) + '</div><div class="obs-kpi-label">n8n Version</div><div class="obs-kpi-sub">Node ' + esc(nodeVer) + '</div></div>';
  html += '<div class="obs-kpi obs-healthy"><div class="obs-kpi-value">' + fmtUptime(startTime) + '</div><div class="obs-kpi-label">Uptime</div><div class="obs-kpi-sub">' + (isLeader ? 'Leader' : 'Follower') + ' &middot; ' + activeWf + ' active workflows</div></div>';
  html += '<div class="obs-kpi ' + memClass + '"><div class="obs-kpi-value">' + fmtBytes(memRss) + '</div><div class="obs-kpi-label">Memory (RSS)</div><div class="obs-kpi-sub">FDs: ' + openFds + ' / ' + maxFds + '</div></div>';
  html += '<div class="obs-kpi ' + heapClass + '"><div class="obs-kpi-value">' + heapPct + '%</div><div class="obs-kpi-label">Heap Usage</div><div class="obs-kpi-sub">' + fmtBytes(heapUsed) + ' / ' + fmtBytes(heapTotal) + '</div></div>';
  html += '<div class="obs-kpi ' + lagClass + '"><div class="obs-kpi-value">' + evtLag.toFixed(1) + 'ms</div><div class="obs-kpi-label">Event Loop Lag</div><div class="obs-kpi-sub">p99: ' + evtP99.toFixed(1) + 'ms</div></div>';
  html += '<div class="obs-kpi ' + qClass + '"><div class="obs-kpi-value">' + qWaiting + ' / ' + qActive + '</div><div class="obs-kpi-label">Queue (Wait / Active)</div><div class="obs-kpi-sub">' + qCompleted + ' done, ' + qFailed + ' failed</div></div>';

  document.getElementById('obsKpiRow').innerHTML = html;
}

function renderObsCharts(history) {
  if (history.length === 0) return;

  var labels = history.map(function(s) {
    var d = new Date(s.timestamp);
    return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0') + ':' + d.getSeconds().toString().padStart(2,'0');
  });

  var chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
    scales: {
      x: { ticks: { maxTicksLimit: 10, font: { size: 10 } }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { font: { size: 10 } } },
    },
  };

  // CPU chart — show rate of change (delta between snapshots)
  var cpuDeltas = [];
  for (var i = 0; i < history.length; i++) {
    if (i === 0) cpuDeltas.push(0);
    else {
      var dt = (history[i].timestamp - history[i-1].timestamp) / 1000;
      cpuDeltas.push(dt > 0 ? ((history[i].cpu - history[i-1].cpu) / dt * 100) : 0);
    }
  }
  renderObsChart('obsCpuChart', 'line', labels, [
    { label: 'CPU %', data: cpuDeltas, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.3, pointRadius: 0 },
  ], { ...chartOpts, scales: { ...chartOpts.scales, y: { ...chartOpts.scales.y, ticks: { ...chartOpts.scales.y.ticks, callback: function(v) { return v.toFixed(0) + '%'; } } } } });

  // Memory chart
  renderObsChart('obsMemoryChart', 'line', labels, [
    { label: 'RSS', data: history.map(function(s) { return s.memoryRss / 1048576; }), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', fill: true, tension: 0.3, pointRadius: 0 },
  ], { ...chartOpts, scales: { ...chartOpts.scales, y: { ...chartOpts.scales.y, ticks: { ...chartOpts.scales.y.ticks, callback: function(v) { return v.toFixed(0) + ' MB'; } } } } });

  // Heap chart
  renderObsChart('obsHeapChart', 'line', labels, [
    { label: 'Used', data: history.map(function(s) { return s.heapUsed / 1048576; }), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.3, pointRadius: 0 },
    { label: 'Total', data: history.map(function(s) { return s.heapTotal / 1048576; }), borderColor: '#6b7280', borderDash: [4,4], fill: false, tension: 0.3, pointRadius: 0 },
  ], { ...chartOpts, scales: { ...chartOpts.scales, y: { ...chartOpts.scales.y, ticks: { ...chartOpts.scales.y.ticks, callback: function(v) { return v.toFixed(0) + ' MB'; } } } } });

  // Event loop lag
  renderObsChart('obsEventLoopChart', 'line', labels, [
    { label: 'Lag', data: history.map(function(s) { return s.eventLoopLag * 1000; }), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.3, pointRadius: 0 },
    { label: 'p99', data: history.map(function(s) { return s.eventLoopP99 * 1000; }), borderColor: '#f59e0b', borderDash: [4,4], fill: false, tension: 0.3, pointRadius: 0 },
  ], { ...chartOpts, scales: { ...chartOpts.scales, y: { ...chartOpts.scales.y, ticks: { ...chartOpts.scales.y.ticks, callback: function(v) { return v.toFixed(1) + 'ms'; } } } } });

  // Queue jobs
  renderObsChart('obsQueueChart', 'line', labels, [
    { label: 'Waiting', data: history.map(function(s) { return s.queueWaiting; }), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', fill: true, tension: 0.3, pointRadius: 0 },
    { label: 'Active', data: history.map(function(s) { return s.queueActive; }), borderColor: '#6366f1', fill: false, tension: 0.3, pointRadius: 0 },
    { label: 'Completed', data: history.map(function(s) { return s.queueCompleted; }), borderColor: '#10b981', fill: false, tension: 0.3, pointRadius: 0 },
    { label: 'Failed', data: history.map(function(s) { return s.queueFailed; }), borderColor: '#ef4444', fill: false, tension: 0.3, pointRadius: 0 },
  ], chartOpts);

  // Active resources
  renderObsChart('obsResourcesChart', 'line', labels, [
    { label: 'Handles', data: history.map(function(s) { return s.activeHandles; }), borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.1)', fill: true, tension: 0.3, pointRadius: 0 },
    { label: 'Requests', data: history.map(function(s) { return s.activeRequests; }), borderColor: '#06b6d4', fill: false, tension: 0.3, pointRadius: 0 },
  ], chartOpts);
}

function renderObsChart(canvasId, type, labels, datasets, options) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (obsCharts[canvasId]) {
    var chart = obsCharts[canvasId];
    chart.data.labels = labels;
    chart.data.datasets = datasets;
    chart.options = options;
    chart.update('none');
  } else {
    obsCharts[canvasId] = new Chart(canvas.getContext('2d'), { type: type, data: { labels: labels, datasets: datasets }, options: options });
  }
}

var obsRawMetricsData = null;

function renderObsRaw(metrics) {
  obsRawMetricsData = metrics;
  var countEl = document.getElementById('obsRawCount');
  var sortedKeys = Object.keys(metrics).sort();
  if (countEl) countEl.textContent = '(' + sortedKeys.length + ' metrics)';
  filterObsRawMetrics();
}

function filterObsRawMetrics() {
  var el = document.getElementById('obsRawMetrics');
  if (!el || !obsRawMetricsData) return;
  var query = (document.getElementById('obsRawSearch').value || '').toLowerCase().trim();
  var sortedKeys = Object.keys(obsRawMetricsData).sort();

  var html = '';
  var shown = 0;
  for (var key of sortedKeys) {
    if (query && key.toLowerCase().indexOf(query) === -1) continue;
    shown++;
    var entries = obsRawMetricsData[key];
    var hasLabels = entries.some(function(e) { return Object.keys(e.labels).length > 0; });
    var groupId = 'obs_m_' + key.replace(/[^a-zA-Z0-9_]/g, '_');

    html += '<div class="obs-metric-group">';
    if (hasLabels && entries.length > 1) {
      html += '<div class="obs-metric-name" onclick="toggleObsMetric(\'' + groupId + '\',this)">';
      html += '<span class="obs-toggle">&#9654;</span>';
      html += escapeHtml(key);
      html += '<span class="obs-raw-count">' + entries.length + ' series</span>';
      html += '</div>';
      html += '<div class="obs-metric-values" id="' + groupId + '">';
      for (var entry of entries) {
        var labelStr = Object.entries(entry.labels).map(function(e) { return e[0] + '=' + e[1]; }).join(', ');
        html += '<div class="obs-metric-row">';
        html += '<span class="obs-label-tags">' + escapeHtml(labelStr) + '</span>';
        html += '<span class="obs-metric-val">' + fmtMetricVal(entry.value) + '</span>';
        html += '</div>';
      }
      html += '</div>';
    } else {
      html += '<div class="obs-metric-row" style="padding:4px 0">';
      html += '<span class="obs-metric-name" style="cursor:default">' + escapeHtml(key);
      if (entries[0] && Object.keys(entries[0].labels).length > 0) {
        var labelStr = Object.entries(entries[0].labels).map(function(e) { return e[0] + '=' + e[1]; }).join(', ');
        html += ' <span class="obs-label-tags">{' + escapeHtml(labelStr) + '}</span>';
      }
      html += '</span>';
      html += '<span class="obs-metric-val">' + fmtMetricVal(entries[0] ? entries[0].value : 0) + '</span>';
      html += '</div>';
    }
    html += '</div>';
  }

  if (shown === 0) {
    html = '<div style="text-align:center;padding:20px;color:var(--color-text-muted);font-size:13px">No metrics matching "' + escapeHtml(query) + '"</div>';
  }
  el.innerHTML = html;
}

function toggleObsMetric(groupId, nameEl) {
  var valuesEl = document.getElementById(groupId);
  if (!valuesEl) return;
  var toggle = nameEl.querySelector('.obs-toggle');
  valuesEl.classList.toggle('open');
  if (toggle) toggle.classList.toggle('open');
}

function fmtMetricVal(v) {
  if (v === 0) return '0';
  if (Number.isInteger(v)) return v.toLocaleString();
  if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(2) + 'M';
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(2) + 'K';
  if (Math.abs(v) < 0.001) return v.toExponential(2);
  return v.toFixed(4);
}

// --- AI Performance Report ---

async function generateObsAiReport() {
  var card = document.getElementById('obsAiReportCard');
  var body = document.getElementById('obsAiReportBody');
  var btn = document.getElementById('obsAiReportBtn');
  var timeEl = document.getElementById('obsReportTime');

  card.style.display = '';
  btn.disabled = true;
  btn.innerHTML = '<span class="ai-spinner" style="display:inline-block;width:14px;height:14px;border:2px solid var(--color-border);border-top-color:#fff;border-radius:50%;animation:spin 0.6s linear infinite;vertical-align:-2px"></span> Generating...';
  body.innerHTML = '<div class="obs-report-loading"><div class="ai-spinner"></div>Analyzing instance metrics...</div>';
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  try {
    var reportBody = {};
    if (typeof activeInstanceId !== 'undefined' && activeInstanceId) reportBody.instance_id = activeInstanceId;
    var res = await fetch(API + '/api/ai/observability-report', {
      method: 'POST',
      headers: CSRF_HEADERS,
      body: JSON.stringify(reportBody),
    });
    if (!res.ok) {
      var err = await res.json().catch(function() { return {}; });
      throw new Error(err.error || 'Request failed');
    }
    var data = await res.json();
    body.innerHTML = renderObsReportMarkdown(data.report || 'No report generated.');
    timeEl.textContent = 'Generated ' + new Date().toLocaleTimeString();
  } catch (e) {
    body.innerHTML = '<div style="color:var(--color-danger);padding:12px 0">' +
      '<i class="fa fa-exclamation-triangle"></i> Failed to generate report: ' + escapeHtml(e.message) +
      '</div>';
    timeEl.textContent = '';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-magic"></i> AI Report';
  }
}

// --- Workers Section ---

async function loadObsWorkers() {
  var section = document.getElementById('obsWorkersSection');
  var row = document.getElementById('obsWorkersRow');
  if (!section || !row) return;
  try {
    var ip = typeof getActiveInstanceParam === 'function' ? getActiveInstanceParam() : '';
    var sep = ip ? '?' + ip : '';
    var res = await fetch(API + '/api/monitoring/workers' + sep, { headers: CSRF_HEADERS });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var workers = await res.json();
    if (!workers.length) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';
    renderObsWorkers(workers, row);
  } catch (e) {
    section.style.display = 'none';
  }
}

function renderObsWorkers(workers, container) {
  var html = '';
  for (var i = 0; i < workers.length; i++) {
    var w = workers[i];
    var statusClass = w.status === 'healthy' ? 'obs-healthy' : w.status === 'unhealthy' ? 'obs-warning' : 'obs-danger';
    var statusIcon = w.status === 'healthy' ? '&#10003;' : w.status === 'unhealthy' ? '&#9888;' : '&#10007;';
    var statusLabel = w.status === 'healthy' ? 'Healthy' : w.status === 'unhealthy' ? 'Unhealthy' : 'Unreachable';
    var readyBadge = w.ready ? '<span style="color:var(--color-success);font-size:11px">Ready</span>' : '<span style="color:var(--color-text-muted);font-size:11px">Not Ready</span>';

    html += '<div class="obs-worker-card ' + statusClass + '">';
    html += '<div class="obs-worker-header">';
    html += '<span class="obs-worker-status">' + statusIcon + '</span>';
    html += '<strong>' + esc(w.name) + '</strong>';
    html += '<span class="obs-worker-badge">' + statusLabel + '</span>';
    html += readyBadge;
    html += '</div>';

    if (w.metrics) {
      var m = w.metrics;
      var heapPct = m.heapTotal > 0 ? Math.round((m.heapUsed / m.heapTotal) * 100) : 0;
      var lagMs = (m.eventLoopLag * 1000).toFixed(1);
      var lagP99 = (m.eventLoopP99 * 1000).toFixed(1);

      html += '<div class="obs-worker-metrics">';
      html += '<div class="obs-worker-metric"><span class="obs-worker-metric-val">' + fmtUptime(m.uptime) + '</span><span class="obs-worker-metric-lbl">Uptime</span></div>';
      html += '<div class="obs-worker-metric"><span class="obs-worker-metric-val">' + fmtBytes(m.memoryRss) + '</span><span class="obs-worker-metric-lbl">Memory</span></div>';
      html += '<div class="obs-worker-metric"><span class="obs-worker-metric-val">' + heapPct + '%</span><span class="obs-worker-metric-lbl">Heap</span></div>';
      html += '<div class="obs-worker-metric"><span class="obs-worker-metric-val">' + lagMs + 'ms</span><span class="obs-worker-metric-lbl">EL Lag</span></div>';
      html += '<div class="obs-worker-metric"><span class="obs-worker-metric-val">' + m.queueActive + '</span><span class="obs-worker-metric-lbl">Active Jobs</span></div>';
      html += '<div class="obs-worker-metric"><span class="obs-worker-metric-val">' + m.queueCompleted + '</span><span class="obs-worker-metric-lbl">Completed</span></div>';
      html += '<div class="obs-worker-metric"><span class="obs-worker-metric-val" style="' + (m.queueFailed > 0 ? 'color:var(--color-danger)' : '') + '">' + m.queueFailed + '</span><span class="obs-worker-metric-lbl">Failed</span></div>';
      html += '<div class="obs-worker-metric"><span class="obs-worker-metric-val">' + esc(m.n8nVersion) + '</span><span class="obs-worker-metric-lbl">Version</span></div>';
      html += '</div>';
    } else if (w.status !== 'healthy') {
      html += '<div style="padding:8px 0;font-size:12px;color:var(--color-text-muted)">No metrics available — check worker URL and N8N_METRICS=true</div>';
    }
    html += '</div>';
  }
  container.innerHTML = html;
}

function renderObsReportMarkdown(md) {
  // Simple Markdown → HTML renderer for the report
  var html = md
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // H2
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    // H3
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    // Unordered list items
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    // Ordered list items
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Paragraphs — wrap consecutive non-tag lines
    .replace(/\n{2,}/g, '\n\n');

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  // Wrap remaining plain text in <p>
  var lines = html.split('\n\n');
  html = lines.map(function(block) {
    block = block.trim();
    if (!block) return '';
    if (block.startsWith('<h') || block.startsWith('<ul') || block.startsWith('<ol') || block.startsWith('<pre') || block.startsWith('<div')) return block;
    return '<p>' + block + '</p>';
  }).join('\n');

  if (typeof DOMPurify !== 'undefined') {
    html = DOMPurify.sanitize(html);
  }
  return html;
}

