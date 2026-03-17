# n8n-library — Proposed Improvements

## High-Impact Features

### 1. Notifications Center (Bell Icon)
- Real-time in-app notifications for: ticket assignments, status changes, execution failures, KB article feedback
- Use Server-Sent Events (SSE) — lightweight, no new dependency needed
- Notification preferences per user (email + in-app toggles)
- Unread badge count in the nav

### 2. Dashboard / Home Panel
- A landing page with at-a-glance widgets: recent failed executions, open tickets assigned to you, popular KB articles, AI conversation shortcuts
- Replaces the current "jump into Library" default with something actionable
- Role-aware: admin sees system health, editor sees template stats, viewer sees KB highlights

### 3. Scheduled Reports & Alerts
- Configurable alerts: "notify me if execution failure rate > 20% in 1 hour"
- Scheduled email digests (daily/weekly) with execution stats, open tickets, KB engagement
- Extends existing SMTP + AI summary generation capabilities

### 4. Audit Log
- Track who changed what across the system (template edits, ticket updates, settings changes, user management)
- Useful for compliance and debugging in team environments
- Generalize the existing `ticket_activity` pattern to a global `audit_log` table

---

## UX Improvements

### 5. Keyboard Shortcuts
- `Ctrl+K` / `Cmd+K` for a quick-search command palette (search across templates, tickets, KB articles)
- Panel switching shortcuts (`1`-`7` when not in an input)

### 6. Bulk Operations
- Batch activate/deactivate workflows
- Bulk ticket status changes (close multiple resolved tickets)
- Batch template import/export (JSON)

### 7. Drag-and-Drop KB Article Ordering
- Currently `sort_order` exists on categories but articles rely on timestamps
- Let editors drag articles to reorder within categories

### 8. Inline Execution Retry
- From the monitoring panel, allow retrying a failed execution directly
- n8n API supports this — just needs a "Retry" button on failed execution cards

---

## Technical Improvements

### 9. WebSocket / SSE for Live Updates
- Currently monitoring relies on polling (manual or interval refresh)
- SSE would give real-time execution status updates without polling overhead
- Also supports the notifications feature (item 1)

### 10. Service Worker + Offline Shell
- Cache the static assets (JS, CSS, fonts) with a service worker
- The app loads instantly even on slow connections
- Not full offline — just an app shell cache for the SPA

### 11. Client-Side Routing (History API)
- Currently panel switching is JS-only with no URL changes
- Using `history.pushState` would enable:
  - Deep-linking to a specific ticket or article
  - Browser back/forward working naturally
  - Shareable URLs
- No framework needed — a lightweight router (~50 lines) would work

### 12. Search Index Improvements
- Extend PostgreSQL full-text search from KB to templates and tickets
- Unified search endpoint (`/api/search?q=...`) that returns results across all modules
- Powers the command palette (item 5) and AI tool use

### 13. Rate Limiting Refinement
- Login and forgot-password have rate limiting, but other write endpoints don't
- Add per-user rate limits on ticket creation, AI chat, and public endpoints
- Prevent abuse of the AI provider budget

---

## Nice-to-Haves

### 14. Template Version History
- Like KB articles, track template edits over time with diff view

### 15. Webhook Integrations
- Outbound webhooks on events (ticket created, execution failed) for Slack/Teams/Discord

### 16. Export/Import Settings
- Backup and restore the full configuration (instances, SMTP, branding, AI config) as JSON

### 17. Two-Factor Authentication (TOTP)
- Adds a security layer for admin accounts using `otplib`

---

## Recommended Priority Order

| Priority | Feature                         | Effort | Impact |
|----------|---------------------------------|--------|--------|
| 1        | Dashboard / Home Panel          | Medium | High   |
| 2        | Client-Side Routing (deep links)| Low    | High   |
| 3        | Inline Execution Retry          | Low    | Medium |
| 4        | Notifications + SSE             | Medium | High   |
| 5        | Command Palette (Ctrl+K)        | Low    | Medium |
| 6        | Unified Search                  | Medium | Medium |
| 7        | Audit Log                       | Medium | Medium |
| 8        | Scheduled Alerts                | Medium | High   |
