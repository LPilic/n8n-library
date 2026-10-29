# n8n-library Improvement Plan

## Lessons Learned from Failed Session (2026-04-06)

The following changes were attempted, deployed, and reverted because they caused:
1. **Workflow previews broken** — stripping `nodes` from monitoring workflows endpoint removed data needed for node flow previews in the Workflows tab
2. **Heavy server load** — `fetchAllWorkflows()` takes 4.5 minutes for 2292 workflows. Changes that triggered this call more frequently (shorter cache TTLs, new endpoints calling it) caused 47% CPU on production
3. **Dashboard/workflows hanging** — `getWorkflowNameMap()` with 30s cache repeatedly fetched all 2292 workflows, blocking the event loop
4. **Monitoring filters not displayed** — custom-select upgrade timing issue with sidebar filter selects
5. **`defer` on scripts** — while technically correct, added risk for no clear benefit since scripts were already at bottom of body

### Critical Constraint: 2292 workflows in n8n
The n8n `/api/v1/workflows` endpoint returns FULL workflow JSON (nodes, connections, settings, parameters) — roughly 50KB per workflow. Fetching all workflows = ~115MB of JSON across 9 pages, taking 4.5 minutes. ANY change that increases the frequency of `fetchAllWorkflows()` or `getWorkflowNameMap()` will spike CPU and block requests.

### What Was Safely Kept (committed as ccd0fa9)
Nothing from this session survived the revert. The codebase is back to the pre-session state.

---

## Improvement Plan — Revised

Each phase is designed to be independently deployable and testable. Changes are ordered from safest/highest-impact to riskiest.

---

### Phase 1: SMTP Settings Persistence (Bug Fix)

**Problem**: SMTP settings saved via UI are lost on container restart. `lib/email.js` only reads env vars at startup, ignoring DB-stored settings.

**Fix** (`lib/email.js`, lines 12-23):
After the env var check, add an async DB lookup:
```js
} else {
  pool.query("SELECT key, value FROM settings WHERE key LIKE 'smtp_%'")
    .then(({ rows }) => {
      if (rows.length > 0) {
        const s = {};
        for (const r of rows) s[r.key] = r.value;
        if (s.smtp_host) {
          rebuildTransport(s);
          console.log('SMTP restored from database settings');
        }
      }
    })
    .catch(() => {});
}
```

**Verification**: Restart container, check logs for "SMTP restored from database settings".

**Risk**: None — only runs when no SMTP env vars are set.

---

### Phase 2: Daily Summary Workflow Names (Bug Fix)

**Problem**: Daily summary emails show workflow IDs (e.g., "xmcQe7KMSThRnhKM") instead of names because `/api/v1/executions` list endpoint doesn't include `workflowData.name`.

**Fix** (`lib/ai-providers.js`, line 4 and 318-320):
1. Add `getWorkflowNameMap` to the import from `./n8n-api`
2. In `generateDailySummary()`, fetch the name map in parallel:
```js
const [data, wfMap] = await Promise.all([
  n8nApiFetch('/api/v1/executions?limit=250'),
  getWorkflowNameMap(),
]);
```
3. Replace `ex.workflowData?.name || ex.workflowId` with `wfMap[ex.workflowId] || ex.workflowId`

**CAUTION**: `getWorkflowNameMap()` fetches all 2292 workflows on cache miss (4.5 min). This is acceptable for daily summary since it runs once per day via cron. The 30s cache means if monitoring has recently warmed the cache, this call is instant.

**Verification**: Trigger daily summary manually, check email for workflow names.

**Risk**: Low — runs once per day, uses existing cache.

---

### Phase 3: Security Fixes (Backend Only)

These are backend-only changes that don't affect the frontend or n8n API call patterns.

#### 3a. Alert engine wrong argument (`lib/alert-engine.js:66`)
```js
// BEFORE (broken — {} passed as instanceId):
const allData = await n8nApiFetch(urlAll, {}, inst.id);
// AFTER:
const allData = await n8nApiFetch(urlAll, inst.id);
```

#### 3b. Session invalidation LIKE pattern (`routes/auth.js:130`)
```js
// BEFORE (matches substring user IDs — user 12 matches 123):
DELETE FROM session WHERE sess::text LIKE '%"id":' || $1 || '%'
// AFTER:
DELETE FROM session WHERE (sess->'user'->>'id')::int = $1
```

#### 3c. CORS credentials on API key routes (`server.js:169-171`)
Remove `Access-Control-Allow-Credentials: true` and change origin to `*` for the API key CORS block. API key auth doesn't need cookies.

#### 3d. Ollama SSRF (`lib/ai-providers.js:117-118`)
Add `if (baseUrl && !validateExternalUrl(baseUrl)) throw new Error('Invalid Ollama base URL');` before the Ollama fetch. `validateExternalUrl` is already imported.

#### 3e. SQL string interpolation in tools (`lib/tools.js:81,129`)
Change `LIMIT ${limit}` to `LIMIT $${idx}` with parameterized value in both `search_tickets` and `search_kb_articles`.

#### 3f. Webhook SSRF (`routes/webhooks.js:21,40`)
Import `isPrivateUrl` from `lib/helpers` and add `if (isPrivateUrl(url)) return res.status(400).json(...)` on create and update.

**Verification**: grep for `LIKE '%"id":'`, `LIMIT \${`, `Allow-Credentials.*true` to confirm fixes applied.

**Risk**: Low — backend-only, no n8n API calls added.

---

### Phase 4: CSS Variable Fixes (Frontend Only)

Add missing CSS variables to `:root` in `public/css/base.css`. These are used across the app but only defined in dark theme, causing silent failures in light mode.

Add to `:root` (light theme) block:
```css
--color-bg-alt: #f3f4f6;
--color-bg-hover: #f0f0f2;
--color-muted: #7e8186;
--color-surface: #ffffff;
--color-primary-rgb: 255,109,90;
--shadow-md: 0 4px 12px rgba(0,0,0,0.08);
```

Add to `[data-theme="dark"]` block:
```css
--color-bg-hover: #2c2c30;
--color-surface: #1e1e21;
--color-primary-rgb: 255,109,90;
--shadow-md: 0 4px 12px rgba(0,0,0,0.3);
```
(Note: `--color-muted` and `--color-bg-alt` already exist in dark theme)

Also fix:
- `kb.css:45`: Change `rgba(59,130,246,0.15)` to `rgba(255,109,90,0.15)` (focus ring is blue instead of coral)
- Remove global `select { display: none !important }` (base.css ~line 747) — the scoped `.custom-select select` rule already handles hiding native selects inside wrappers. The global rule breaks selects in modals and settings forms.

**DO NOT**: Add `defer` to script tags, change HTML structure, move inline styles, or touch accessibility/semantic HTML. Those changes were reverted and should be done separately with careful testing.

**Verification**: Check light mode — KB article metadata should be visible, prompt textarea should have coral focus ring, hover states should work.

**Risk**: Low — CSS-only changes, no JS or backend.

---

### Phase 5: Monitoring Tab — SSE Execution Reset Fix

**Problem**: SSE stream broadcasts 50 executions every 15 seconds. `renderMonExecutionsFromSse()` overwrites `monExecAllData` with those 50, losing any data the user loaded via "Load More".

**Fix** (`public/js/monitoring.js:58-68`):
Add guard: `if (monExecAllData.length > executions.length) return;`

**Verification**: Load monitoring, click "Load More", wait 30+ seconds — list should not reset.

**Risk**: Low — single line addition, read-only guard.

---

### Phase 6: Reduce n8n API Load (CAREFUL — Caused Issues Before)

The SSE push loop and stats endpoint make heavy n8n API calls. These changes reduce load WITHOUT changing cache structures or data shapes.

#### 6a. SSE push: reduce execution fetch from 250 to 50
In `routes/monitoring.js` SSE push loop (~line 424):
```js
// BEFORE:
const data = await n8nApiFetch('/api/v1/executions?limit=250', inst.id);
// AFTER:
const data = await n8nApiFetch('/api/v1/executions?limit=50', inst.id);
```
Only 50 executions are broadcast anyway (`.slice(0, 50)`), so fetching 250 is waste.

#### 6b. SSE push: slow from 15s to 30s
Change `}, 15000);` to `}, 30000);` in the push interval.

#### 6c. Metrics collector: slow from 20s to 60s
Change `setInterval(() => collectMetricsSnapshot(inst.id), 20000)` to `60000` (both occurrences).

#### 6d. Workflow name map cache: 30s to 5 minutes
In `lib/n8n-api.js:83`, change `< 30000` to `< 300000`.

**DO NOT**:
- Strip `nodes` from the monitoring workflows endpoint (breaks workflow card previews)
- Change `fetchAllWorkflows` to return light data (other consumers need full data)
- Add new endpoints that call `fetchAllWorkflows`
- Change the workflow list cache structure or TTL (60s is already cached, 5min on the name map is enough)
- Remove `getWorkflowNameMap` from the SSE push loop (it uses the cache; with 5min TTL it won't re-fetch often)
- Change the stats endpoint to avoid `fetchAllWorkflows` (it needs active/total counts)

**Verification**: Check htop on production — `node server.js` should stay under 5% CPU after caches warm.

**Risk**: Medium — these changes directly affect the monitoring experience. Test thoroughly before deploying to production.

---

### Phase 7: Monitoring Filter Improvements (UI Only)

**Problem**: Workflow dropdown is hard to use with 2292 workflows. Need better search/filter.

**Approach**: Move filters to sidebar following the tickets/KB pattern. BUT:
- Keep the monitoring workflows endpoint returning FULL data (including nodes) — needed for workflow card previews
- All new filters should be CLIENT-SIDE only (filter `monExecAllData` after fetch) except `status` and `workflowId` which the n8n API supports natively
- Do NOT add new server endpoints or change existing ones

**Design**:
- Toolbar: search input (300ms debounce, client-side filter by workflow name)
- Sidebar filter card (below stats KPIs):
  - Status select (server-side via n8n API `status` param)
  - Mode select (client-side: webhook/trigger/manual/retry)
  - Searchable workflow picker list (client-side from `monWorkflowCache`)
  - Tag chips from `monWorkflowCache[].tags[]` (client-side)
  - Clear All button
- Ensure `upgradeSelects()` is called on the sidebar filter card when monitoring tab first loads

**Key implementation detail**: Maintain `monExecRawData` (unfiltered from API) and `monExecAllData` (filtered). Server-side filters (status, workflowId) go in the API call. Client-side filters (mode, search, tag) filter `monExecRawData` into `monExecAllData`.

**Risk**: Medium — UI-only but touches multiple functions. Test all filter combinations.

---

### Phase 8: Dashboard Loading Speed

**Problem**: Dashboard calls `getWorkflowNameMap()` which can block for 4.5 minutes on cache miss.

**Fix** (`routes/dashboard.js:84-87`):
Add a 5-second timeout race on the workflow name map:
```js
const wfMapPromise = Promise.race([
  getWorkflowNameMap(selectedInst.id),
  new Promise(resolve => setTimeout(() => resolve({}), 5000)),
]);
```

The dashboard loads immediately; workflow names may be missing on first load but appear after cache warms.

**DO NOT**: Change `loadN8nWorkflows()` in library.js — it fetches full workflow data via n8n-proxy for the node previews. With 2292 workflows this is inherently slow (~4.5 min). A progress indicator could be added but the fetch pattern should not change.

**Risk**: Low — only affects dashboard, graceful degradation.

---

### NOT Recommended (Caused Problems)

These changes from the failed session should NOT be re-attempted without significant rework:

1. **`defer` on script tags** — No measurable benefit, adds timing risk
2. **Semantic HTML changes** (`<nav>`, `<main>`, `<button>` nav items) — Requires CSS rework and testing across all panels
3. **Inline style extraction** — Moving 79 lines of CSS from `<style>` to base.css requires careful selector scoping
4. **Deduplicating `getInstanceBase`** — Moving to lib/n8n-api.js worked but was part of a batch that had to be reverted
5. **Deduplicating `timeAgo`/`escapeHtml`** — Worked in isolation but was part of reverted batch
6. **Parallel KB stats queries** — Correct optimization but part of reverted batch
7. **Bulk email template query** — Correct optimization but part of reverted batch
8. **User lookup cache in server.js** — Correct optimization but part of reverted batch
9. **`getDisabledTools` cache in mcp-server.js** — Correct optimization but part of reverted batch
10. **Stripping nodes from workflow endpoint** — Breaks workflow card previews. Cannot be done without a separate light endpoint that the filters use while keeping the full endpoint for the workflow cards.

Items 4-9 were individually correct but deployed as one large batch, making it impossible to isolate which change caused issues. If re-attempted, deploy each as a separate commit with production testing between deploys.
