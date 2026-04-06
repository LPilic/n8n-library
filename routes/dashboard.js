const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../lib/middleware');
const { n8nApiFetch, getWorkflowNameMap, enrichExecutions, getInstanceConfig, getAllInstances } = require('../lib/n8n-api');

const router = express.Router();

router.get('/api/dashboard', requireAuth, async (req, res) => {
  const user = req.user;
  const role = user.role;
  const isWriter = role === 'admin' || role === 'editor';

  try {
    const result = {};

    // --- Tickets summary (all roles) ---
    const ticketQueries = [
      pool.query("SELECT status, COUNT(*)::int AS count FROM tickets GROUP BY status"),
      pool.query("SELECT priority, COUNT(*)::int AS count FROM tickets WHERE status NOT IN ('closed','resolved') GROUP BY priority"),
      pool.query(
        "SELECT id, title, status, priority, created_at FROM tickets WHERE assigned_to = $1 AND status NOT IN ('closed','resolved') ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC LIMIT 5",
        [user.id]
      ),
      pool.query(
        "SELECT id, title, status, priority, created_at FROM tickets WHERE status NOT IN ('closed','resolved') ORDER BY created_at DESC LIMIT 5"
      ),
    ];

    // --- KB summary (all roles) ---
    const kbQueries = [
      pool.query("SELECT COUNT(*)::int AS total FROM kb_articles WHERE status = 'published'"),
      pool.query("SELECT id, title, view_count, helpful_yes, helpful_no FROM kb_articles WHERE status = 'published' ORDER BY view_count DESC LIMIT 5"),
      pool.query("SELECT id, title, created_at FROM kb_articles WHERE status = 'published' ORDER BY created_at DESC LIMIT 5"),
    ];

    // --- Templates count ---
    const templateQuery = pool.query("SELECT COUNT(*)::int AS total FROM templates");

    const [
      ticketsByStatus, ticketsByPriority, myTickets, recentTickets,
      kbTotal, kbPopular, kbRecent,
      templateCount,
    ] = await Promise.all([
      ...ticketQueries, ...kbQueries, templateQuery,
    ]);

    // Ticket stats
    const statusMap = {};
    for (const r of ticketsByStatus.rows) statusMap[r.status] = r.count;
    const openCount = (statusMap.open || 0) + (statusMap.in_progress || 0) + (statusMap.waiting || 0);

    result.tickets = {
      byStatus: statusMap,
      byPriority: ticketsByPriority.rows.reduce((m, r) => { m[r.priority] = r.count; return m; }, {}),
      openCount,
      myTickets: myTickets.rows,
      recentTickets: recentTickets.rows,
    };

    // KB stats
    result.kb = {
      totalPublished: kbTotal.rows[0]?.total || 0,
      popular: kbPopular.rows,
      recent: kbRecent.rows,
    };

    // Template count
    result.templates = { total: templateCount.rows[0]?.total || 0 };

    // --- Execution stats (editors/admins only) ---
    if (isWriter) {
      try {
        const instances = await getAllInstances();
        result.instances = instances.map(i => ({ id: i.id, name: i.name, is_default: i.is_default }));

        // Allow selecting a specific instance via query param
        const requestedId = req.query.instance_id ? parseInt(req.query.instance_id, 10) : null;
        const selectedInst = requestedId
          ? instances.find(i => i.id === requestedId)
          : instances.find(i => i.is_default) || instances[0];

        if (selectedInst) {
          result.selectedInstance = selectedInst.id;
          // Fetch executions and workflow names in parallel; timeout name map to avoid
          // blocking dashboard for large instances (2000+ workflows)
          const wfMapPromise = Promise.race([
            getWorkflowNameMap(selectedInst.id),
            new Promise(resolve => setTimeout(() => resolve({}), 5000)),
          ]);
          const [execData, wfMap] = await Promise.all([
            n8nApiFetch('/api/v1/executions?limit=20', selectedInst.id),
            wfMapPromise,
          ]);
          if (execData.data) {
            enrichExecutions(execData.data, wfMap);
            const execs = execData.data;
            const failed = execs.filter(e => e.status === 'error');
            const succeeded = execs.filter(e => e.status === 'success');
            result.executions = {
              recent: execs.slice(0, 8),
              failedCount: failed.length,
              successCount: succeeded.length,
              total: execs.length,
              successRate: execs.length > 0 ? Math.round((succeeded.length / execs.length) * 100) : 0,
            };
          }
          // n8n health
          try {
            const base = selectedInst.internal_url.replace(/\/+$/, '');
            const start = Date.now();
            const r = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(3000) });
            result.n8nHealth = { status: r.ok ? 'healthy' : 'unhealthy', latencyMs: Date.now() - start };
          } catch {
            result.n8nHealth = { status: 'unreachable', latencyMs: 0 };
          }
        }
      } catch {
        result.executions = null;
        result.n8nHealth = { status: 'unreachable', latencyMs: 0 };
      }
    }

    result.user = { username: user.username, role: user.role };
    res.json(result);
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

module.exports = router;
