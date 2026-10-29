# Monitoring & Observability — Feature Parity Plan

## Documentation Source
https://n8nlib.pilic.work/docs.html — Pages 4 (Monitoring Dashboard), 39 (Observability & Metrics), 10 (Alerts), 18 (Monitoring API), 8 (Multi-Instance)

## Current State
React monitoring covers ~35-40% of legacy features. The page is a minimal skeleton.

---

## Phase 1 — Stats Bar Completion + Auto-Refresh

### Missing KPI cards
| Card | Legacy Line | API Field | Priority |
|------|-------------|-----------|----------|
| Waiting count (clickable filter) | 174–177 | `stats.counts.waiting` | HIGH |
| Avg Duration | 192–195 | `stats.avgDurationMs` | HIGH |
| Total Executions | 196–200 | `stats.total` | HIGH |
| Total Workflows (separate from Active) | 189–191 | `stats.totalWorkflows` | MEDIUM |
| Daily Summary button (admin) | 202–208 | `POST /api/monitoring/daily-summary` | LOW |

### Auto-Refresh Dropdown
- Legacy: `monitoring.js:105–124` — Off/10s/30s/60s/2m/5m dropdown
- React currently: hard-coded 30s `refetchInterval` on stats only
- Add dropdown control that sets `refetchInterval` on both stats and executions queries

### Manual Refresh Button
- Legacy: triggered from toolbar
- Add button next to auto-refresh dropdown

### Stats Error State
- Legacy: `monitoring.js:142–144` — "Could not reach n8n API" card
- React: silently returns undefined

### Verification
- [ ] All 6+ KPI cards render with data
- [ ] Auto-refresh dropdown changes interval
- [ ] Manual refresh button re-fetches
- [ ] Error state shows when n8n is unreachable

---

## Phase 2 — Execution List Enhancements

### Missing columns
- Execution ID column (`#id`)
- Sort executions by started time

### Pagination
- Legacy: `monitoring.js:430–461, 500–559` — cursor-based with Load More + page controls
- React: fetches 50 with no pagination
- Add: "Load More" button using cursor from API response
- Add: "Showing 1–50 of N" range indicator

### Execution mini-KPI row
- Legacy: `monitoring.js:472–492` — Success/Error/Running/Avg Duration above the table
- Shows totals for the current filtered view

### Charts (Chart.js)
- **Execution Timeline**: stacked bar chart, last 24h by hour (`monitoring.js:570–632`)
- **Status Distribution**: doughnut chart (`monitoring.js:634–673`)
- Install `react-chartjs-2` + `chart.js`
- Render above execution table

### Error state for execution list
- Legacy: `monitoring.js:425–427`
- Show error message instead of empty state

### Verification
- [ ] ID column visible in table
- [ ] "Load More" button loads next page
- [ ] Range indicator shows "1–50 of N"
- [ ] Two charts render above table
- [ ] Error state shows on fetch failure

---

## Phase 3 — Execution Detail Enhancements

### Missing metadata
- Execution ID in header: `"Execution #id"`
- Finished/Stopped timestamp (absolute format)
- Legacy shows `toLocaleString()` not relative time

### Missing buttons
- **Stop button** for running/waiting executions on detail page
- **Open in n8n** button — links to `{n8nUrl}/execution/{id}`
- **AI Analyze Error** button — calls `/api/ai/analyze-error`
  - Shows analysis in a container below the header
  - Includes related KB articles

### Missing sections
- **Global error block** — shows `resultData.error` message prominently above node timeline
- **Linked tickets** — fetches tickets linked to this execution
- **AI Analysis container** — rendered HTML from AI analysis

### Node timeline improvements
- Sort nodes by `startTime` (legacy: `monitoring.js:790`)
- Show per-node execution time (duration in ms)
- Node output data preview: item count + JSON sample
- Collapsible output data (`toggleNodeData`)

### Confirmation dialogs
- Retry: wrap in `appConfirm` before calling API
- Stop: add stop button + wrap in `appConfirm`

### Report Issue enhancement
- Legacy: `monitoring.js:911–995` — opens ticket modal with:
  - Pre-filled title: "Workflow failed: {name}"
  - Pre-filled priority: high
  - HTML description with failed node + error + AI analysis
  - Execution context panel in sidebar
- React currently: just navigates to `/tickets?from_execution=id`
- Enhancement: open a modal or pass more data via state/URL

### Verification
- [ ] Execution ID in header
- [ ] Stop button works on running executions
- [ ] "Open in n8n" links correctly
- [ ] AI Analyze Error shows analysis
- [ ] Linked tickets section shows
- [ ] Node output data expandable
- [ ] Per-node execution time shown
- [ ] Retry/Stop have confirmation dialogs

---

## Phase 4 — Workflow Tab Enhancements

### Missing features
| Feature | Legacy Line | Priority |
|---------|-------------|----------|
| Workflow tab KPI row (Total/Active/Inactive counts) | 283–287 | HIGH |
| Search input (live filter) | 270–273, 291 | HIGH |
| Active/Inactive/All filter buttons | 260–268, 292–295 | HIGH |
| Node flow preview on cards (click → preview modal) | 333–336 | HIGH |
| Active toggle switch (POST activate/deactivate) | 346–351, 380–398 | HIGH |
| Updated timestamp on cards | 357 | MEDIUM |
| Tags display on cards (max 2) | 358–360 | MEDIUM |
| Edit button → opens n8n workflow editor URL | 365–367 | MEDIUM |
| AI Describe button | 369 | LOW |
| AI Docs button | 370 | LOW |
| Alphabetical sort | 241 | LOW |

### Implementation
- Add search input above grid
- Add filter buttons row (All / Active / Inactive with counts)
- Add NodeFlow component to workflow cards
- Add active toggle switch (calls `POST /api/monitoring/workflows/:id/activate` with `{active: true/false}`)
- Add PreviewModal on card click
- Add updated timestamp and tags

### Verification
- [ ] Search filters workflows by name
- [ ] Active/Inactive filter buttons work
- [ ] Node flow preview on cards
- [ ] Click card → preview modal
- [ ] Active toggle switch works
- [ ] Tags and updated time shown

---

## Phase 5 — Instance Switcher + SSE Guards

### Instance Switcher
- Legacy: `monitoring.js:77–103` — dropdown populated from `instancesCache`
- All API calls append `?instance_id=X`
- SSE reconnects when instance changes
- Add: instance dropdown in toolbar, stored in state
- Pass `instance_id` to all queries and SSE URL

### SSE Guards
- `monViewingDetail` flag: suppress SSE list updates while viewing execution detail
- Legacy: `monitoring.js:4, 15, 21, 59, 111, 130`
- React: add a ref or state that the detail page sets, SSE handler checks

### SSE Disconnect on teardown
- Verify `useSse` hook closes EventSource on unmount
- Add explicit cleanup if needed

### Stop All Running
- Legacy: `monitoring.js:886–909`
- Button visible only when `running > 0`
- Calls `POST /api/monitoring/executions/stop` with `{ids: [...]}`
- Add to toolbar with confirmation dialog

### Verification
- [ ] Instance dropdown switches all data
- [ ] SSE reconnects on instance change
- [ ] Detail view suppresses list SSE updates
- [ ] Stop All Running button works
- [ ] SSE disconnects on page leave

---

## Phase 6 — Observability Improvements (from docs)

### Documentation says:
- KPI sub-labels: Node.js version, leader/follower role, FD counts, heap used/total, p99 lag
- Color thresholds: Memory RSS (>2GB danger, >1GB warning), Queue (>50 danger, >10 warning)
- Interactive Chart.js charts (not SVG bars): CPU, Memory, Heap, Event Loop, Queue Jobs, Active Resources
- Worker cards: status icon, Ready badge, full metrics grid, "No metrics" fallback
- AI Report button + markdown render
- "Updated at" timestamp
- Instance parameter on all fetches
- Raw metrics: label tags, K/M value formatting, total count

### Priority for this phase
- Replace SVG bar sparklines with Chart.js line charts (install `chart.js` + `react-chartjs-2`)
- Add KPI sub-labels
- Add color thresholds
- Enhance worker cards
- Add AI Report button
- Add missing charts (Queue Jobs, Active Resources)

### Verification
- [ ] 6 interactive Chart.js charts
- [ ] KPI sub-labels show
- [ ] Worker cards show full metrics
- [ ] AI Report generates and renders

---

## Summary — Priority Order

| Phase | Effort | Impact | Features |
|-------|--------|--------|----------|
| 1 | Small | High | Complete stats bar, auto-refresh, error state |
| 2 | Medium | High | Execution pagination, charts, mini-KPI |
| 3 | Large | High | Execution detail: stop, AI, linked tickets, node data |
| 4 | Medium | High | Workflow tab: search, filters, toggle, preview |
| 5 | Medium | Medium | Instance switcher, SSE guards, Stop All |
| 6 | Large | Medium | Observability: Chart.js, worker cards, AI report |
