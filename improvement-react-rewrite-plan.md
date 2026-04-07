# React Rewrite Plan — n8n Library Frontend

## Executive Summary

**Current state:** 11,459 lines of vanilla JS across 19 files, ~34 screens/views, zero build tooling, no module system. All JS files share `window` scope via `<script>` tags. UI is built with innerHTML string concatenation.

**Backend:** 23 Express route files exposing ~150+ REST endpoints + 3 SSE streams. Already fully decoupled JSON API — no server-side rendering. Cookie-based session auth with CSRF headers.

**Scope:** Replace `public/` frontend with a React SPA. Backend stays untouched (maybe minor CORS/static-serving adjustments).

**Estimated effort:** ~40-60 sessions of focused work across 8 phases.

---

## Phase 0 — Documentation Discovery & Tech Stack Decision

### Goal
Lock in the React stack before writing any code. Every library choice must be validated against actual docs.

### Tasks

1. **Choose React framework** — Two viable paths:
   - **Vite + React** (recommended): Fast builds, simple config, no SSR complexity. The app is already a client-side SPA served from Express static middleware.
   - **Next.js**: Overkill — no SEO needs, no SSR, adds routing/server complexity on top of existing Express backend.

2. **Choose key libraries** (read their docs, confirm API compatibility):
   | Concern | Recommended | Alternative | Why |
   |---------|-------------|-------------|-----|
   | Build | Vite 6 | — | Fast, zero-config React support |
   | Routing | React Router v7 | TanStack Router | History API already used; RR is proven |
   | State | Zustand | Jotai / Redux Toolkit | Lightweight, no boilerplate, perfect for this scale |
   | Data fetching | TanStack Query v5 | SWR | Caching, polling, SSE integration |
   | Forms | React Hook Form | — | Settings/CRUD-heavy app needs good forms |
   | UI components | shadcn/ui + Tailwind | Radix + custom CSS | Copy-paste components, no heavy deps |
   | Rich text editor | TipTap (`@tiptap/react`) | — | First-class React hooks, headless/Tailwind-friendly, replaces Quill |
   | Charts | Chart.js + react-chartjs-2 | Recharts | Already using Chart.js |
   | Icons | Lucide React | — | shadcn default, replaces Font Awesome 4 |
   | Sanitization | DOMPurify (keep) | — | Already used |
   | Code highlighting | lowlight (via TipTap) | — | `@tiptap/extension-code-block-lowlight` replaces highlight.js in editor; keep highlight.js for read-only rendering |

3. **Confirm n8n-demo web component compatibility** — The `<n8n-demo>` Lit-based web component renders workflow node previews. Verify it works inside React (web components in React need ref-based prop passing for non-string attributes).

4. **Map the vendor files** that can be replaced by npm packages vs kept as-is:
   | Current vendor file | Replace with |
   |---|---|
   | `vendor/js/purify.min.js` | `npm: dompurify` |
   | `vendor/js/highlight.min.js` | `npm: highlight.js` (read-only rendering) + `lowlight` (via TipTap editor) |
   | `vendor/js/quill.js` | `npm: @tiptap/react` + `@tiptap/starter-kit` + extensions |
   | `vendor/js/chart.umd.min.js` | `npm: chart.js + react-chartjs-2` |
   | `vendor/js/n8n-demo.bundled.js` | Keep as static asset, load via `<script>` or dynamic import |
   | `vendor/css/font-awesome.min.css` | `npm: lucide-react` (replace icons) |
   | `vendor/css/quill.snow.css` | Not needed — TipTap is headless, styled with Tailwind |

### Verification
- [ ] `npm create vite@latest` scaffolds successfully with React + TypeScript template
- [ ] All chosen libraries install without peer dep conflicts
- [ ] `<n8n-demo>` web component renders inside a React wrapper component
- [ ] Build output can be served by the existing Express `express.static()` middleware

### Anti-patterns
- Do NOT pick Next.js — the backend is Express and must stay Express
- Do NOT use Create React App — it's deprecated
- Do NOT add GraphQL or tRPC — the REST API exists and works fine

---

## Phase 1 — Project Scaffolding & Parallel Dev Setup

### Goal
Set up the React project alongside the existing frontend so both can run during migration.

### Tasks

1. **Create `frontend/` directory** at project root with Vite + React + TypeScript:
   ```
   frontend/
   ├── src/
   │   ├── main.tsx          # Entry point
   │   ├── App.tsx           # Router setup
   │   ├── api/              # API client + types
   │   ├── hooks/            # Shared hooks (useAuth, useToast, etc.)
   │   ├── components/       # Shared UI components
   │   ├── features/         # Feature modules (1 per panel)
   │   ├── stores/           # Zustand stores
   │   └── lib/              # Utilities (esc, md, formatDuration, etc.)
   ├── public/               # Static assets (n8n-demo bundle, etc.)
   ├── index.html
   ├── vite.config.ts
   ├── tsconfig.json
   ├── tailwind.config.ts
   └── package.json
   ```

2. **Configure Vite dev proxy** — proxy `/api/*`, `/templates/*`, `/workflows/*`, `/health` to the Express backend (same as current setup but via Vite's `server.proxy`).

3. **Set up Tailwind CSS + shadcn/ui** — Initialize with the project's existing color scheme (extract CSS custom properties from `base.css`). Map current theme variables:
   - `--primary` → Tailwind primary
   - `--bg`, `--surface`, `--text` → dark/light mode tokens
   - Current dark mode toggle in `app.js:8-43` → React `useTheme` hook

4. **Create the API client layer** (`frontend/src/api/client.ts`):
   - Wrap `fetch()` with CSRF headers (`X-Requested-With: XMLHttpRequest`)
   - Cookie auth works automatically (same-origin)
   - TypeScript interfaces for major API response shapes (derive from route handler return values documented in Phase 0)

5. **Create shared hooks**:
   - `useAuth()` — wraps `/api/auth/me`, login, logout, 2FA
   - `useToast()` — replaces global `toast()` function
   - `useSse(url)` — generic SSE hook with auto-reconnect (replaces 3 separate SSE implementations)

6. **Modify `server.js`** — In production, serve `frontend/dist/` instead of `public/`. Keep `public/` fallback during migration. Add to `package.json`:
   ```json
   "scripts": {
     "dev:frontend": "cd frontend && npm run dev",
     "build:frontend": "cd frontend && npm run build",
     "start": "node server.js"
   }
   ```

7. **Update Dockerfile** — Add a build step for the React frontend before the existing `COPY . .`

### Verification
- [ ] `npm run dev:frontend` starts Vite dev server
- [ ] API proxy works: `http://localhost:5173/api/auth/me` returns user data
- [ ] Tailwind classes render correctly with dark/light mode
- [ ] Production build (`npm run build:frontend`) outputs to `frontend/dist/`
- [ ] Express serves `frontend/dist/index.html` for SPA routes

### Anti-patterns
- Do NOT delete `public/` yet — it stays as fallback during migration
- Do NOT try to import existing vanilla JS files into React — rewrite from scratch using the API types

---

## Phase 2 — Core Shell & Auth

### Goal
Implement the app shell (sidebar, topbar, routing, modals, toasts) and authentication flow.

### Tasks

1. **App shell layout** — Port from `index.html` lines 1-117:
   - Sidebar with nav items (role-based visibility via `currentUser.role`)
   - Topbar with search trigger (Cmd+K), notification bell, user menu
   - Main content area with `<Outlet />` for React Router
   - Mobile responsive hamburger menu (from `responsive.css`)

2. **React Router setup** — Map all 19 panels to routes:
   ```tsx
   /                    → Dashboard
   /library             → Template Library
   /n8n                 → n8n Workflows
   /monitoring          → Monitoring
   /monitoring/:id      → Execution Detail
   /observability       → Observability
   /tickets             → Tickets
   /tickets/:id         → Ticket Detail
   /kb                  → Knowledge Base
   /kb/:slug            → KB Article
   /prompts             → Prompts
   /prompts/:slug       → Prompt Detail
   /credentials         → Credentials
   /approvals           → HITL Requests
   /approvals-builder   → HITL Builder
   /settings/*          → Settings (nested routes)
   /ai                  → AI Chat
   /alerts              → Alerts
   /security            → Security Audit
   /variables           → Variables
   /tags                → Tags
   /audit               → Audit Log
   ```

3. **Auth flow** — Port from `app.js:46-270`:
   - Login form (email + password)
   - 2FA verification step
   - Forgot password / reset password forms
   - Protected route wrapper that redirects to login
   - Auth store (Zustand): `currentUser`, `isAuthenticated`, `login()`, `logout()`

4. **Shared UI components** (shadcn/ui based):
   - `<Modal />` — replaces `openModal/closeModal` pattern (30+ modals in index.html)
   - `<ConfirmDialog />` — replaces `appConfirm()` promise-based dialog
   - `<Toast />` — replaces global `toast()` (use shadcn Sonner or similar)
   - `<CustomSelect />` — replaces hand-rolled `upgradeSelects()` (~140 lines)
   - `<Badge />`, `<Button />`, `<Card />` — basic UI primitives

5. **Branding system** — Port from `app.js:339-555`:
   - Fetch `/api/settings/branding` on app load
   - Apply CSS custom properties dynamically
   - Logo display in sidebar

6. **Notification dropdown** — Port from `notifications.js` (204 lines):
   - SSE connection via `useSse('/api/notifications/stream')`
   - Dropdown with notification list, mark-read, click-to-navigate
   - Unread badge count

7. **Command palette** — Port from `cmdpalette.js` (179 lines):
   - Ctrl+K / Cmd+K to open
   - Local panel search + API search (`/api/search`)
   - Keyboard navigation (arrow keys, Enter)

### Verification
- [ ] Login → 2FA → Dashboard flow works
- [ ] Sidebar navigation switches routes without page reload
- [ ] Role-based nav items: viewer sees fewer items than admin
- [ ] Dark/light mode toggle persists across sessions
- [ ] Branding (custom logo, colors) applies correctly
- [ ] Notifications SSE connects and shows real-time updates
- [ ] Cmd+K opens palette and searches

### Anti-patterns
- Do NOT render all 19 panels simultaneously and show/hide with CSS (the old pattern) — use React Router lazy loading
- Do NOT store auth state in localStorage — use the session cookie + `/api/auth/me` check

---

## Phase 3 — Dashboard & Template Library

### Goal
Port the two most visible screens: Dashboard and Template Library.

### Tasks

1. **Dashboard** — Port from `dashboard.js` (231 lines):
   - Fetch `/api/dashboard` with TanStack Query
   - Greeting header with user name + time-based greeting
   - KPI row: templates, tickets, KB articles, executions
   - Two-column layout: recent tickets, recent executions, popular KB articles
   - Instance selector dropdown (multi-instance support)
   - Execution stats with success rate

2. **Template Library** — Port from `library.js` (467 lines):
   - Workflow grid with `<n8n-demo>` preview cards
   - Category filter sidebar
   - Search with debounced input
   - Template detail modal (description, nodes, category, tags)
   - Import to n8n button (via `/api/n8n-proxy`)
   - Create/edit template modal with Quill editor
   - Version history modal
   - AI-powered naming/description (conditional on AI being configured)

3. **`<N8nDemo>` React wrapper** — Create a React component that wraps the `<n8n-demo>` Lit web component:
   ```tsx
   // Sets workflow JSON via ref since React doesn't handle web component properties well
   const N8nDemo = ({ workflow }: { workflow: object }) => {
     const ref = useRef<HTMLElement>(null);
     useEffect(() => { if (ref.current) (ref.current as any).workflow = workflow; }, [workflow]);
     return <n8n-demo ref={ref} />;
   };
   ```

4. **TipTap editor React component** — Replace Quill with TipTap (port from `app.js:1036-1125`):
   - Three toolbar presets matching current compact/full/mini levels — just pass different extension arrays
   - Packages: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-placeholder`, `@tiptap/extension-code-block-lowlight`
   - `useEditor()` hook with `onUpdate` callback — no manual lifecycle sync needed
   - Image paste/drop: use `@tiptap/extension-image` with custom paste handler for base64 upload
   - Code blocks: `@tiptap/extension-code-block-lowlight` with `lowlight` for syntax highlighting
   - Headless styling: Tailwind classes on the editor container + `.tiptap` prose styles
   - Output format: `.getHTML()` returns standard HTML — existing DB content (from Quill) renders without migration
   - Create a shared `<RichTextEditor preset="compact|full|mini" />` component used across all features

### Verification
- [ ] Dashboard loads and shows all KPI cards with real data
- [ ] Template library shows workflow preview cards with node icons
- [ ] Template search and category filter work
- [ ] Create/edit template with TipTap editor saves successfully
- [ ] Existing Quill-authored HTML content renders correctly in TipTap
- [ ] AI describe/name buttons work when AI is configured
- [ ] Instance switching on dashboard reloads data

### Anti-patterns
- Do NOT re-implement the `<n8n-demo>` web component in React — wrap it
- Do NOT fetch dashboard data on every render — use TanStack Query with staleTime
- Do NOT use Quill in the React rewrite — TipTap is the replacement

---

## Phase 4 — Monitoring & Observability

### Goal
Port the real-time monitoring dashboard and observability metrics.

### Tasks

1. **Monitoring panel** — Port from `monitoring.js` (995 lines):
   - Stats bar: success/error/running/waiting counts, success rate
   - SSE live updates via `useSse('/api/monitoring/stream')` — update stats and execution list in real-time without full re-render
   - Workflow cards grid/list view with status filter
   - Execution list with pagination (cursor-based)
   - Execution detail view: node run data, error highlighting, duration breakdown
   - Actions: retry, stop, stop-all, report issue (pre-fill ticket)
   - Multi-instance support (instance selector)
   - Chart.js trend charts (success/error over time, duration histogram)

2. **Observability panel** — Port from `observability.js` (413 lines):
   - 6 KPI cards: version, uptime, RSS memory, heap %, event loop lag, queue depth
   - 6 time-series charts (Chart.js): CPU, memory, heap, event loop, queue, handles
   - Raw metrics explorer with search/filter
   - Worker health cards
   - AI performance report button
   - Auto-refresh with configurable interval

3. **Chart.js React integration** — Use `react-chartjs-2` for all charts. Port `renderMonCharts` and `renderObsCharts` logic.

### Verification
- [ ] Monitoring stats update in real-time via SSE
- [ ] Execution list paginates correctly
- [ ] Execution detail shows node-level data
- [ ] Retry/stop execution works
- [ ] Observability charts render and auto-refresh
- [ ] Worker health cards display correctly
- [ ] Instance switching works across both panels

### Anti-patterns
- Do NOT poll for monitoring data when SSE is connected — SSE replaces polling
- Do NOT re-render full execution list on every SSE event — use React state updates surgically

---

## Phase 5 — Service Desk, Knowledge Base & Prompts

### Goal
Port the content management features.

### Tasks

1. **Service Desk (Tickets)** — Port from `tickets.js` (779 lines):
   - Ticket list with filters (status, priority, assignee, category, search)
   - KPI sidebar with stats
   - Create ticket modal with TipTap editor + image upload (paste/drop/base64)
   - Ticket detail: comments, activity log, linked executions
   - Inline field editing (status, priority, assignee)
   - Mobile: inline detail view (not modal) at ≤850px

2. **Knowledge Base** — Port from `kb.js` (703 lines):
   - Article list with search, category filter, tag filter
   - Article reader view with URL update (`/kb/:slug`)
   - Create/edit article modal with TipTap + tag autocomplete + file attachments
   - Feedback buttons (helpful yes/no)
   - Pin/feature toggles
   - Version history + restore
   - Image lightbox

3. **Prompt Versioning** — Port from `prompts.js` (518 lines):
   - Prompt list with status filter and search
   - Prompt detail view with variable display
   - Create/edit modal with content editor
   - Version history with checkbox-based diff comparison
   - **Word diff algorithm** — Port the hand-written LCS diff from `prompts.js:343-413` or replace with `diff` npm package
   - AI prompt improvement with side-by-side preview
   - Public API endpoint display

### Verification
- [ ] Create ticket with image upload → appears in list
- [ ] Ticket detail updates inline (change status, add comment)
- [ ] KB article create/edit with tags and attachments
- [ ] KB article reader renders sanitized HTML correctly
- [ ] Prompt version diff shows word-level changes
- [ ] AI prompt improvement works

### Anti-patterns
- Do NOT use `dangerouslySetInnerHTML` without DOMPurify sanitization for KB/ticket content
- Do NOT re-implement word diff — use `diff` npm package instead

---

## Phase 6 — HITL, Credentials, AI Chat & Remaining Features

### Goal
Port the remaining complex features.

### Tasks

1. **HITL (Human-in-the-Loop)** — Port from `hitl.js` (1,429 lines, most complex file):
   - **Template list** with request/pending counts
   - **Form builder** — full drag-and-drop canvas with 15+ component types:
     - Component palette (draggable)
     - Canvas with insertion logic (before/after/into columns)
     - Property inspector panel
     - Live iframe preview
     - Data capture (call webhook, poll for result, infer field types)
   - **Request list** with pending/completed filter
   - **Request form** — renders dynamic form from template schema, submit approve/reject
   - SSE for real-time request notifications
   - Webhook URL management with auto-slug
   - Consider using `@dnd-kit/core` for drag-and-drop instead of hand-rolling

2. **Credentials** — Port from `credentials.js` (1,090 lines):
   - Credential list with type/project filters
   - Credential detail with audit trail
   - Dynamic form generation from n8n credential type schemas
   - Create/edit with schema-driven form fields
   - Transfer credential between projects
   - Credential Store: template list, create template, provision to n8n

3. **AI Chat** — Port from `ai.js` (882 lines):
   - Floating side panel (toggle open/close)
   - Conversation list with create/delete
   - Chat interface with streaming-style message rendering
   - MCP server toggles per conversation
   - Markdown rendering in chat messages
   - Tool call display
   - AI workflow utilities: name, describe, document, analyze-error

4. **Settings** — Port from `settings.js` (1,336 lines):
   - Nested routes under `/settings/*`
   - Sub-pages: Users, Instances, SMTP, Email Templates, Categories, API Keys, Webhooks, MCP, 2FA, Branding, Import/Export, AI Settings, AI Prompts

5. **Remaining small panels**:
   - Alerts (`alerts.js`, 304 lines) — CRUD + recipient picker
   - Security (`security.js`, 252 lines) — Audit report display
   - Variables (`variables.js`, 136 lines) — Simple CRUD
   - Tags (`tags.js`, 252 lines) — CRUD + workflow assignment
   - Audit Log (`audit.js`, 96 lines) — Paginated log viewer

### Verification
- [ ] HITL form builder: drag component → canvas → edit props → preview
- [ ] HITL data capture: trigger webhook → auto-detect fields
- [ ] Credential creation with dynamic schema form
- [ ] Credential provisioning from store template
- [ ] AI chat sends messages and renders responses with markdown
- [ ] All settings sub-pages save and load correctly
- [ ] Alert CRUD with recipient picker
- [ ] All small panels functional

### Anti-patterns
- Do NOT build a custom drag-and-drop from scratch — use `@dnd-kit`
- Do NOT render HITL form components with `dangerouslySetInnerHTML` — use proper React components for each form field type

---

## Phase 7 — Migration Cutover & Cleanup

### Goal
Switch from old frontend to React, remove legacy code.

### Tasks

1. **Update `server.js` static serving**:
   - Serve `frontend/dist/` as primary static directory
   - Update the SPA catch-all to serve `frontend/dist/index.html`
   - Keep `/templates/*` and `/workflows/*` public API routes unchanged

2. **Handle `n8n-custom.js` / `n8n-custom.css`** — These are injected into the n8n iframe and are NOT part of the React app. Keep them in `public/` or move to a separate `n8n-inject/` directory served statically.

3. **Handle service worker** (`sw.js`) — Either rewrite for the new asset paths or remove if not needed (Vite handles caching via content-hash filenames).

4. **Update Dockerfile**:
   ```dockerfile
   # Build frontend
   WORKDIR /app/frontend
   COPY frontend/package*.json ./
   RUN npm ci
   COPY frontend/ ./
   RUN npm run build

   # Copy backend
   WORKDIR /app
   COPY . .
   # frontend/dist/ already built above
   ```

5. **Delete legacy frontend files**:
   - `public/js/` — all 19 JS files
   - `public/css/` — all 11 CSS files
   - `public/vendor/` — replaced by npm packages (except n8n-demo bundle)
   - `public/index.html` — replaced by `frontend/index.html`
   - Keep: `public/uploads/`, `public/hitl-sample-workflow.json`, n8n-custom files

6. **Update any webhook/callback URLs** that reference `public/` paths

### Verification
- [ ] `docker-compose build && docker-compose up` works
- [ ] All 34 screens functional in production build
- [ ] No references to deleted files in codebase
- [ ] `n8n-custom.js` still loads correctly in n8n iframe
- [ ] Public template API (`/templates/*`) still works for n8n

### Anti-patterns
- Do NOT delete `public/` until ALL features are verified working in React
- Do NOT change any backend API endpoints during cutover

---

## Phase 8 — Verification & Polish

### Goal
Comprehensive testing and quality pass.

### Tasks

1. **Cross-browser testing** — Chrome, Firefox, Safari, mobile Safari/Chrome
2. **Accessibility audit** — keyboard navigation, screen reader, focus management, ARIA labels
3. **Performance check**:
   - Bundle size analysis (`npx vite-bundle-visualizer`)
   - Code splitting: each feature route should be lazy-loaded
   - First Contentful Paint < 1.5s
4. **TypeScript coverage** — Ensure all API response types are defined
5. **Add basic tests**:
   - Vitest unit tests for utility functions and stores
   - React Testing Library tests for critical flows (login, create ticket, etc.)
6. **Grep for anti-patterns**:
   - `dangerouslySetInnerHTML` without DOMPurify → must sanitize
   - `any` type assertions → minimize
   - Inline styles → should use Tailwind classes
   - Direct DOM manipulation → should use React refs

### Verification
- [ ] All 34 screens render correctly
- [ ] No console errors in production build
- [ ] Bundle size < 500KB gzipped (excluding vendor chunks)
- [ ] Lighthouse performance score > 80
- [ ] Zero `dangerouslySetInnerHTML` without sanitization

---

## Migration Strategy Notes

### Incremental vs Big-Bang

**Recommended: Big-bang rewrite** in a separate `frontend/` directory. Reasons:
- The vanilla JS files cannot be incrementally imported into React (no module system, global scope deps)
- The innerHTML pattern is fundamentally incompatible with React's virtual DOM
- 11,459 lines is large but not enormous — it's tractable as a focused rewrite
- The API layer is clean and unchanged — the rewrite is purely presentation

### What Makes This Feasible
- **Clean API boundary** — 150+ REST endpoints already return JSON, zero SSR
- **No build system to migrate FROM** — no webpack/rollup config to untangle
- **Feature parity is well-defined** — 34 screens, each mapping to 1 JS file
- **Vendor deps have React equivalents** — Chart.js, DOMPurify have React wrappers; Quill replaced by TipTap (React-native)

### What Makes This Hard
- **HITL form builder** (1,429 lines) — drag-and-drop UI with 15+ component types is the most complex feature
- **30+ modals in index.html** — need to be reimagined as React modal components
- **Global state coupling** — 15+ global variables shared across files need proper state management
- **SSE → React state** — 3 SSE streams need to integrate with React's render cycle
- **Rich text editor migration** — Quill → TipTap. Both output standard HTML so existing DB content works, but editor toolbar/behavior needs full reimplementation with TipTap extensions

### Risk Mitigation
- Keep the old `public/` directory intact until React is fully verified
- Run both frontends in parallel during development (old on `:3000`, React on `:5173`)
- Port one feature at a time, validating against the real backend
- The backend API is the contract — as long as it doesn't change, the rewrite is safe
