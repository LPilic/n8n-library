# React Frontend Parity Plan — Legacy Feature Gap Analysis

## Gap Summary

**Total features audited:** ~350 across 18 pages
**Fully ported:** ~140 (40%)
**Partially ported:** ~60 (17%)
**Missing entirely:** ~150 (43%)

### Severity Distribution

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 3 | Entire subsystems missing (AI Chat, Settings, HITL Builder) |
| HIGH | ~40 | Core CRUD missing (KB create/edit, Prompt edit, Template edit) |
| MEDIUM | ~60 | Features degraded (no rich text, no charts, no icons) |
| LOW | ~50 | Polish items (animations, tooltips, mobile nav) |

---

## Phase 1 — UI Design Parity (Visual Match)

**Goal:** Make the React app look like the legacy app before adding missing features.

### 1A. Sidebar Fix
| Item | Legacy | React Current | Fix |
|------|--------|---------------|-----|
| Width | 230px / 60px collapsed | 224px / 56px | Change to `w-[230px]` / `w-[60px]` |
| Header height | 57px | 56px | Change to `h-[57px]` |
| Nav icon size | 18px | 16px | Change Lucide `size={18}` |
| Nav padding | `8px 12px` | `6px 8px` | Change to `py-2 px-3` |
| Nav border-radius | 6px | 4px (`rounded-sm`) | Change to `rounded-md` |
| Nav font-weight | 500 | 400 (default) | Add `font-medium` |
| Nav section labels | 10px uppercase dividers | Missing | Add section dividers between nav groups |
| Hover bg | `var(--color-bg)` (#f5f5f5) | `bg-card-hover` (#fafafa) | Change to `hover:bg-bg` |
| Active state | `bg-primary-light text-primary` | Same | OK |
| Collapse tooltip | CSS `::after` on hover | Missing | Add title attr (simplified) |
| Instance selector | Sidebar dropdown | Missing | Defer to Phase 5 |
| Connection status dot | Sidebar footer | Missing | Defer to Phase 5 |

### 1B. Card Design System
| Pattern | Legacy CSS | React Tailwind Fix |
|---------|-----------|-------------------|
| Card base | `border-radius: 8px; shadow-sm; hover: border-primary + shadow` | Add `rounded-lg shadow-sm hover:border-primary hover:shadow` |
| Card padding | `20px` | Varies — standardize to `p-5` |
| KPI card value | `font-size: 18–26px; font-weight: 800` | Currently `text-xl font-bold` — change to `text-xl font-extrabold` |
| KPI card label | `10–11px; uppercase; letter-spacing: 0.5–0.8px` | Add `uppercase tracking-wide` |
| Table header | `11px; 600; uppercase; letter-spacing: 0.5px` | Add `text-[11px] font-semibold uppercase tracking-wide` |
| Badge size | `11px; 600; padding: 3px 10px; border-radius: 10px` | Standardize badge component |

### 1C. Form Elements
| Element | Legacy | Fix |
|---------|--------|-----|
| Input height | `padding: 9px 12px; font-size: 14px` | Change from `py-1.5 px-3 text-sm` to `py-2 px-3 text-sm` |
| Input focus | `border-primary + box-shadow: 0 0 0 2px rgba(255,109,90,0.15)` | Add `focus:ring-2 focus:ring-primary/15` |
| Button primary | `bg-primary text-white shadow-sm` | Add `shadow-sm` |
| Button secondary | `bg-bg-light border-border text-text` | Fix: many React buttons use text-only style |

### 1D. Modal Design
| Element | Legacy | React Fix |
|---------|--------|-----------|
| Overlay | `rgba(0,0,0,0.3); backdrop-filter: blur(2px)` | Add `backdrop-blur-sm` to `bg-black/30` |
| Container | `border-radius: 12px; padding: 28px; width: 520px; max-height: 80vh` | Standardize modal wrapper component |
| Confirm dialog | Custom `appConfirm()` with styled buttons | Replace all `confirm()` with a shared `<ConfirmDialog>` |

### 1E. Mobile Responsiveness
| Feature | Legacy | React Fix |
|---------|--------|-----------|
| Mobile bottom nav | Fixed tab bar at 850px breakpoint | Implement `<MobileNav>` component |
| Sidebar hide | `display: none` below 850px | Add `hidden md:flex` to sidebar |
| Content padding | 24px desktop, 16px mobile | Add `p-4 md:p-6` |
| Card grid | Single column on mobile | Already done in most pages |

### 1F. Animations
| Animation | Legacy | React Fix |
|-----------|--------|-----------|
| Card hover | `transition: border-color 0.15s, box-shadow 0.15s` | Add `transition-all duration-150` |
| Nav transition | `transition: all 0.15s` | Add to nav items |
| Health dot pulse | `@keyframes monPulse` | Add CSS keyframe for health dots |
| Toast slide-in | `@keyframes slideIn` translateX(100px) | Add to ToastContainer |

### Verification
- [ ] Sidebar width matches 230px expanded, 60px collapsed
- [ ] Nav items have 18px icons, 500 weight, 6px radius
- [ ] Card hover shows primary border + shadow
- [ ] Input focus shows orange ring
- [ ] Modal has backdrop blur
- [ ] Mobile bottom nav appears below 850px

---

## Phase 2 — Critical Missing Features

### 2A. AI Chat Panel (ENTIRE FEATURE MISSING — 882 lines)
Port from `public/js/ai.js`. Create `frontend/src/features/ai-chat.tsx`:
- Floating action button (bottom-right)
- Slide-in panel from right (`transition: right 0.3s cubic-bezier`)
- Conversation list (CRUD)
- Chat message rendering with markdown
- Tool call display
- MCP server toggles per conversation
- Typing indicator ("Thinking...")
- Auto-save conversation per exchange

### 2B. Settings Page (ENTIRE PAGE STUB — 1336 lines)
Port from `public/js/settings.js`. Replace stubs in `frontend/src/features/settings.tsx`:
- **Users tab**: List, create/edit/delete with role selector
- **Instances tab**: CRUD with URL/API key/workers/color
- **SMTP tab**: Config form + test email button
- **Email Templates tab**: Template selector, subject/body editors, variable autocomplete, preview iframe, reset
- **Categories tab**: Workflow/ticket/KB category CRUD with icon picker
- **API Keys tab**: List, create with role/expiry, copy key, revoke
- **Webhooks tab**: CRUD with event checkboxes, test fire
- **AI tab**: Provider/model/key selector, system prompt overrides
- **MCP tab**: Built-in server toggle, tool enable/disable
- **2FA tab**: QR setup flow, verify, disable
- **Branding tab**: Logo upload, primary color picker, app name
- **Import/Export tab**: JSON export/import

### 2C. Template Library Edit + Preview
Port missing features in `frontend/src/features/library.tsx`:
- **Edit modal**: Name, rich text description (TipTap), category checkboxes, workflow preview (`<n8n-demo>` web component), AI docs button
- **Save template**: PUT `/api/templates/:id`
- **Version history modal**: List versions, restore
- **Full preview modal**: `<n8n-demo>` web component rendering
- **Custom confirm dialog**: Replace `confirm()` with styled dialog

### 2D. KB Create/Edit/Delete (ENTIRE CRUD MISSING)
Port from `public/js/kb.js` into `frontend/src/features/kb.tsx`:
- Create/edit article modal with TipTap (full toolbar)
- Tag chip editor with autocomplete
- Category + status selectors
- File attachment upload (base64) + delete
- Version history + restore
- Delete article with confirmation
- Feature toggle
- Image lightbox on article images
- DOMPurify sanitization on content render
- Syntax highlighting (highlight.js) on code blocks

### 2E. Prompt Edit + AI Improve
Port into `frontend/src/features/prompts.tsx`:
- Edit prompt form (name, content, category, variables, tags, change note)
- AI improvement ("Improve with AI") — instruction input, diff preview, accept
- Version restore/revert
- Word-level diff highlighting (use `diff` npm package)
- Quick compare button on version rows
- Variables + tags fields in create form

### Verification
- [ ] AI chat panel opens/closes, sends messages, renders markdown
- [ ] All 11 settings tabs are functional
- [ ] Template edit modal with rich text works
- [ ] KB article create/edit with TipTap + attachments
- [ ] Prompt edit with AI improve generates suggestions

---

## Phase 3 — Monitoring & Observability Parity

### 3A. Monitoring Enhancements
Missing from `frontend/src/features/monitoring.tsx`:
- **KPIs**: Waiting count, Avg Duration, Total Executions cards
- **Charts**: Execution Timeline (stacked bar), Status Distribution (doughnut) — use Chart.js via `react-chartjs-2`
- **Execution table**: Add ID column, pagination with cursor "Load More"
- **Execution detail**: Stop button, "Open in n8n" link, global error box, linked tickets section, node output data preview with expand/collapse, per-node execution time
- **AI error analysis**: Button + analysis container
- **Report Issue**: Pre-fill ticket with execution context (not just URL param)
- **Workflow tab**: Search box, Active/Inactive/All filter, node flow preview on cards, active toggle switch, tags display, Edit/Describe/Docs AI buttons
- **Toolbar**: Stop All Running button, manual Refresh button, configurable auto-refresh dropdown
- **Instance switcher**: Multi-instance dropdown
- **Guards**: `monViewingDetail` flag to suppress SSE while in detail; confirmation dialogs on retry/stop
- **Daily Summary**: Admin button to trigger email

### 3B. Observability Enhancements
Missing from `frontend/src/features/observability.tsx`:
- **KPI sub-labels**: Node.js version, Leader/Follower role, FD counts, heap used/total, p99 lag, active/completed/failed queue
- **Color thresholds**: Memory RSS (>2GB danger, >1GB warning), Queue (>50 danger, >10 warning)
- **Charts**: Replace SVG bars with Chart.js interactive line charts (hover tooltips, smooth animation)
- **Missing charts**: Queue Jobs (4 datasets), Active Resources (2 datasets), p99 on Event Loop, Total on Heap
- **Worker cards**: Status icon (checkmark/warning/x), Ready badge, full metrics grid (Uptime, Memory, Heap%, EL Lag, Jobs, Version)
- **AI Report**: Button, spinner, markdown render
- **Controls**: Manual Refresh button, "Updated at" timestamp
- **Raw metrics**: Label tags display, K/M value formatting, metric total count

### Verification
- [ ] Monitoring shows 2 Chart.js charts
- [ ] Execution detail shows node output data
- [ ] Observability shows 6 interactive Chart.js charts
- [ ] Worker cards show full metrics grid
- [ ] AI report button generates and renders report

---

## Phase 4 — Content Page Parity (Tickets, KB, Prompts)

### 4A. Tickets Enhancements
- Rich text (TipTap) for description on create + comment input
- Image upload/paste/drag-drop in editor
- "Mine" filter checkbox
- Execution context sidebar (linked executions with workflow name, error node)
- Instance column in list + instance selector in create form
- Assignee field in create form
- Role-gating: delete=admin only, internal note=staff only
- Activity log with human-readable action descriptions (not raw action keys)
- KPI: "Active Tickets" aggregate count, "Total" count
- Debounced search (300ms)
- Status name fix: use "waiting" not "pending" to match backend

### 4B. KB Enhancements (beyond Phase 2D CRUD)
- Sort filter dropdown
- Popular articles list in stats sidebar
- Tag counts displayed in sidebar
- Tag delete from sidebar (writer only)
- Feature toggle on reader page
- Attachment field name fix: `original_name`→`filename`, `size_bytes`→`size`
- Feedback API fix: send `{ helpful: true/false }` not `{ helpful: 'yes'/'no' }`
- Pin API fix: PATCH `/api/kb/articles/:id/pin` not PUT with body

### 4C. Prompts Enhancements (beyond Phase 2E)
- Sort filter dropdown
- Category filter from full API (not derived from current page)
- Author display on cards
- Tags display in detail view
- `change_note` field name (not `message`) in version list
- Status change via PUT full body (not PATCH `/status`) — verify API contract

### Verification
- [ ] Tickets: create with image paste, rich text comment
- [ ] KB: sort works, tags show counts, feedback sends boolean
- [ ] Prompts: AI improve with diff highlighting, version restore

---

## Phase 5 — Remaining Feature Gaps

### 5A. n8n Workflows Enhancements
- "Connect n8n first" guard when not configured
- Error state for load failures
- Pagination: first/last buttons, range indicator ("1–20 of N"), scroll-to-top
- Rich text description in import modal (TipTap)
- AI generate name + description buttons in import modal
- `<n8n-demo>` workflow preview in import modal
- Navigate to library after successful import
- Preserve `pinData` from source workflow
- Fix categories: send names not IDs (verify API contract)

### 5B. HITL Builder Enhancement
- Drag-and-drop canvas (use `@dnd-kit/core`)
- Component palette sidebar (categorized, draggable)
- Per-component property panel
- Nested columns/sections
- Live form preview panel
- Webhook data capture (trigger webhook, poll result, infer field types)

### 5C. Remaining Small Gaps
- **Alerts**: Per-condition config fields, user recipient picker (not raw email), cooldown, last-fired display
- **Security**: Typed item rendering with icons, settings table, versions, "Show N more"
- **Variables**: Search input, `$vars.KEY` usage column
- **Tags**: Workflow assignment modal (view tagged workflows, add/remove)
- **Audit**: Clickable row navigation, first/last page buttons
- **Notifications**: Typed icons, mobile badge, adaptive dropdown positioning, 20-item cap
- **Command Palette**: Show panels on empty query, section headers, typed icons, ticket status badge
- **Credentials**: Instance switcher

### 5D. Multi-Instance Support (Cross-cutting)
Many pages pass `?instance_id=` in legacy but React ignores it:
- Monitoring, Observability, Credentials, Variables, Tags, Security, Tickets, KB
- Add instance context to Zustand store + pass to all API calls

### Verification
- [ ] Import modal shows `<n8n-demo>` preview
- [ ] HITL builder has drag-and-drop canvas
- [ ] Multi-instance dropdown works across all pages

---

## Phase 6 — Polish & Verification

### 6A. DOMPurify Integration
- Install `dompurify` npm package
- Wrap all `dangerouslySetInnerHTML` with sanitization
- Files: library.tsx, kb.tsx, tickets.tsx, prompts.tsx

### 6B. TipTap Integration
- Install `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-code-block-lowlight`, `@tiptap/extension-placeholder`
- Create shared `<RichTextEditor preset="compact|full|mini" />` component
- Replace all `<textarea>` for rich content with TipTap

### 6C. Chart.js Integration
- Install `chart.js`, `react-chartjs-2`
- Replace SVG bars in observability with interactive Chart.js
- Add charts to monitoring page

### 6D. Final Verification
- [ ] All 24 routes render without errors
- [ ] All CRUD operations work (create, edit, delete)
- [ ] SSE connections work (notifications, monitoring, HITL)
- [ ] AI features work (chat, rename, docs, improve, analyze)
- [ ] Mobile bottom nav + responsive layouts
- [ ] Dark mode fully functional
- [ ] No `dangerouslySetInnerHTML` without DOMPurify
- [ ] Bundle size < 500KB gzipped
- [ ] TypeScript zero errors
