# Architecture

## Overview

n8n Library is a Node.js/Express single-page application backed by PostgreSQL. It serves as both a management UI and an API-compatible template server for self-hosted n8n instances.

```
┌─────────────────────────────────────────────────────────┐
│                      Browser (SPA)                       │
│  ┌─────────┬──────────┬──────────┬──────────┬─────────┐ │
│  │ Library │ Monitor  │ Tickets  │    KB    │   AI    │ │
│  └────┬────┴────┬─────┴────┬─────┴────┬─────┴────┬────┘ │
└───────┼─────────┼──────────┼──────────┼──────────┼──────┘
        │         │          │          │          │
┌───────┴─────────┴──────────┴──────────┴──────────┴──────┐
│                   Express Server (:3100)                  │
│  ┌──────────────────────────────────────────────────┐    │
│  │   Routes: auth, templates, monitoring, tickets,   │    │
│  │           kb, settings, ai, mcp-routes            │    │
│  ├──────────────────────────────────────────────────┤    │
│  │   Lib: n8n-api, ai-providers, mcp, email, tools  │    │
│  └───────┬─────────┬─────────┬──────────────────────┘    │
└──────────┼─────────┼─────────┼───────────────────────────┘
           │         │         │
     ┌─────┴──┐  ┌───┴───┐  ┌─┴─────────┐
     │PostgreSQL│  │ n8n   │  │ LLM APIs  │
     │         │  │ API   │  │ + MCP     │
     └────────┘  └───────┘  └───────────┘
```

## Directory Structure

```
n8n-library/
├── server.js              # Express app entry point, middleware, route mounting
├── db.js                  # PostgreSQL connection pool
├── migrate.js             # Database schema creation and seeding
├── setup.js               # Web-based installation wizard
├── package.json           # Dependencies and scripts
├── Dockerfile             # Container build
├── docker-compose.yml     # Multi-container orchestration
│
├── lib/                   # Shared server-side modules
│   ├── ai-providers.js    # LLM integration (Claude, OpenAI, Gemini, Groq, Ollama)
│   ├── api-key-auth.js    # API key authentication middleware
│   ├── alert-engine.js    # Scheduled alert evaluation
│   ├── audit.js           # Audit-log writer
│   ├── crypto.js          # AES-256-GCM for credentials and API keys
│   ├── email.js           # SMTP transport, templates, DB restore
│   ├── helpers.js         # Escaping, slugs, SSRF/DNS validation, HMAC signing
│   ├── mcp.js             # MCP client manager (stdio/HTTP transports)
│   ├── mcp-server.js      # MCP server exposed by the library
│   ├── middleware.js      # Auth guards, role checks, rate limiters
│   ├── n8n-api.js         # n8n REST client, instances, summary/name caches
│   ├── retention.js       # Scheduled data-retention cleanup
│   ├── webhooks.js        # Signed outbound webhooks
│   └── tools.js           # AI tool definitions (built-in + MCP tools)
│
├── routes/                # Express route modules
│   ├── auth.js            # Login, 2FA, password reset, user CRUD
│   ├── templates.js       # n8n-compatible template API + internal CRUD
│   ├── monitoring.js      # Health, metrics, executions, workers, instance CRUD
│   ├── tickets.js         # Service desk: tickets, comments, activity log
│   ├── kb.js              # Knowledge base: articles, categories, tags, versions
│   ├── prompts.js         # Versioned prompt library + public endpoints
│   ├── hitl.js            # Approvals, form templates, webhooks, callbacks
│   ├── credential-store.js # Encrypted credential templates and provisioning
│   ├── credentials.js     # n8n credential management
│   ├── alerts.js          # Alert-rule CRUD
│   ├── variables.js       # n8n variables
│   ├── tags.js            # n8n tags and workflow-tag assignment
│   ├── audit.js           # Audit-log API
│   ├── notifications.js   # In-app notifications and SSE
│   ├── search.js          # Global search
│   ├── webhooks.js        # Outbound webhook management
│   ├── security.js        # n8n security audit proxy
│   ├── settings.js        # SMTP, email templates, AI, branding, import/export
│   ├── ai.js              # AI chat, workflow help, conversations
│   ├── mcp-routes.js      # MCP server management and tool calls
│   └── api-keys.js        # API key CRUD
│
├── public/                # Legacy vanilla-JS SPA
│   ├── index.html         # Application shell (all panels defined inline)
│   ├── css/               # Theme and panel styles
│   ├── js/                # app.js, library.js, monitoring.js, etc.
│   └── vendor/            # Vendored CDN dependencies (offline-capable)
│
├── frontend/              # React/Vite frontend (FRONTEND=react)
│   ├── src/features/      # Page-level features
│   ├── src/components/    # Shared UI components
│   ├── src/stores/        # Zustand stores (auth, instance, theme, branding)
│   ├── src/api/           # Fetch client and shared types
│   └── dist/              # Production build
│
├── test/                  # node:test + supertest coverage
├── scripts/               # Maintenance scripts (OpenAPI generator)
├── .github/workflows/     # CI (Postgres, tests, build, lint, audit)
├── data/                  # Seed data for templates and collections
├── node-icons.json        # n8n node icon definitions (534 nodes)
└── node-creds.json        # n8n node credential type definitions (751 types)
```

## Server Architecture

### Entry Point (`server.js`)

Middleware chain (order matters):

1. **JSON parser** — 10MB body limit
2. **Helmet** — Security headers (CSP disabled for inline scripts)
3. **Session** — PostgreSQL-backed sessions via `connect-pg-simple`
4. **User re-validation** — Fetches fresh user role from DB on every request
5. **API key auth** — Bearer token / X-API-Key header authentication (SHA-256 hash lookup)
6. **CSRF protection** — Requires `X-Requested-With: XMLHttpRequest` on mutating requests (bypassed for API key auth)
7. **Static files** — Serves `public/` with no-cache headers on HTML/JS/CSS
8. **CORS** — Allows cross-origin for n8n-facing endpoints and API key requests
9. **Request logging** — Timestamps all requests

### Route Modules

Each route file exports an Express Router. All API endpoints use JSON request/response.

**Authentication model:**
- Session-based auth (cookie + PostgreSQL session store)
- API key auth (Bearer token or X-API-Key header, SHA-256 hashed storage)
- Role hierarchy: `admin` > `editor` > `viewer`
- API key role cannot exceed the user's own role
- `requireRole('admin', 'editor')` middleware on protected endpoints
- Public endpoints under `/api/public/` (ticket submission from n8n)
- Interactive API docs at `/api/docs` (Swagger UI, OpenAPI 3.0)

**Rate limiting:**
- Login: 15 attempts / 15 min
- Password reset: 5 / hour
- AI operations: 10 / minute
- Ticket submission: 30 / 15 min

### n8n API Integration (`lib/n8n-api.js`)

```
Request → getInstanceConfig(instanceId)
            ├── DB lookup by instance ID
            ├── Fallback to default instance
            └── Fallback to env vars (N8N_INTERNAL_URL)
         → n8nApiFetch(path, instanceId)
            ├── Resolves instance URL + API key
            └── Authenticated request with X-N8N-API-KEY
```

**Caching layers (per-instance):**
- Workflow name map: 30s TTL
- Stats: 15s TTL
- Instance list: 10s TTL
- Workflow list: 60s TTL

### AI Integration (`lib/ai-providers.js`)

Supports multiple LLM providers behind a unified interface:

| Provider | Model examples | Features |
|----------|---------------|----------|
| Claude | claude-sonnet-4-20250514 | Chat, tools |
| OpenAI | gpt-4o, gpt-4o-mini | Chat, tools |
| Gemini | gemini-2.0-flash | Chat, tools |
| Groq | llama-3.1-70b | Chat, tools |
| Ollama | Any local model | Chat (no tools) |

**Tool system:**
- 5 built-in tools (ticket search, KB search, stats)
- MCP tools from connected servers
- Tools converted to provider-specific format at call time

### MCP Integration (`lib/mcp.js`)

Connects to Model Context Protocol servers for extending AI capabilities:

- **stdio transport** — Spawns child process (e.g., `npx n8n-mcp`)
- **HTTP transport** — Connects to remote MCP server
- On connect: runs `initialize` + `tools/list`, caches available tools
- Tools exposed to AI chat sessions

## Database Schema

All tables created by `migrate.js`. Migrations are idempotent (safe to re-run).

### Core Tables

```
users                    # Admin, editor, viewer accounts
  ├── id, username, email, password_hash, role
  ├── session            # PostgreSQL session store
  └── api_keys           # Per-user API keys (SHA-256 hashed)
       ├── key_prefix, key_hash, role
       ├── last_used_at, expires_at
       └── CASCADE on user delete

settings                 # Key-value configuration store

n8n_instances            # Multi-instance n8n connections
  ├── id, name, environment, internal_url, api_key
  ├── is_default, color
  └── workers (JSONB)    # [{name, url}] for queue-mode workers
```

### Template Library

```
categories               # Workflow categories (Sales, Marketing, AI, etc.)
templates                # Workflow templates with full n8n workflow JSON
  ├── workflow (JSONB)   # Complete n8n workflow definition
  ├── nodes (JSONB)      # Node summary for cards
  └── template_categories (junction)

collections              # Curated template collections
  └── collection_workflows (junction)
```

### Service Desk

```
ticket_categories        # Bug, Feature Request, Question, etc.
tickets                  # Support tickets
  ├── status: open → in_progress → waiting → resolved → closed
  ├── priority: low, medium, high, critical
  ├── execution_data (JSONB)  # Linked n8n execution context
  ├── ticket_comments         # Internal + public comments
  ├── ticket_activity         # Status/assignment change log
  └── ticket_executions       # Links to n8n execution IDs
```

### Knowledge Base

```
kb_categories            # Hierarchical categories with slugs
kb_articles              # Articles with full-text search
  ├── search_vector (tsvector)  # Auto-updated trigram index
  ├── status: draft → published → archived
  ├── kb_article_tags          # Tag associations
  ├── kb_article_versions      # Edit history
  ├── kb_article_feedback      # Helpfulness votes
  └── kb_article_attachments   # File uploads
kb_tags                  # Reusable tags with slugs
```

### AI

```
ai_conversations         # Chat history per user
  ├── messages (JSONB)   # Full message array with tool calls
  └── enabled_mcp_servers (JSONB)  # Per-conversation MCP filter

mcp_servers              # MCP server configurations
  ├── type: stdio | http
  ├── command, args, env (for stdio)
  └── url, auth_header (for http)
```

## Frontend Architecture

Two frontends currently coexist:

- **Legacy SPA** in `public/` — vanilla JS modules loaded via script tags, no
  build step. This is the default.
- **React SPA** in `frontend/` — Vite + React 18 + TypeScript + TanStack Query +
  Zustand + Tailwind. It is served when `FRONTEND=react` is set and
  `frontend/dist` exists.

The Docker image builds both. Set `FRONTEND=react` to use the React build.
Long-term, one frontend should be selected to avoid feature drift.

### Panel System (legacy)

```html
<div class="panel" id="panel-library">    <!-- Template browsing -->
<div class="panel" id="panel-monitoring">  <!-- Execution dashboard -->
<div class="panel" id="panel-observability"> <!-- Metrics charts -->
<div class="panel" id="panel-tickets">     <!-- Service desk -->
<div class="panel" id="panel-kb">          <!-- Knowledge base -->
<div class="panel" id="panel-ai">          <!-- AI configuration -->
<div class="panel" id="panel-settings">    <!-- Admin settings -->
```

`switchPanel(name)` shows one panel, hides others, and triggers data loading.

### Key Frontend Patterns

- **Custom selects** — All `<select>` elements replaced with styled dropdowns (`upgradeSelects()`)
- **Instance selector** — Sidebar dropdown for switching n8n instances
- **Auto-refresh** — Configurable polling intervals for monitoring/observability
- **Theme** — CSS variables with `[data-theme="dark"]` overrides
- **No framework** — Vanilla JS with DOM string building for rendering

### Vendored Dependencies

All CDN libraries vendored locally in `public/vendor/` for offline/proxy environments:

| Library | Purpose |
|---------|---------|
| Chart.js | Monitoring and observability charts |
| Quill | Rich text editor (tickets, KB articles) |
| DOMPurify | HTML sanitization |
| highlight.js | Code syntax highlighting |
| FontAwesome | Icon set |
| n8n-demo.bundled.js | n8n workflow preview web components |

## Approvals (HITL)

`routes/hitl.js` provides form templates, request intake from n8n, reviewer
responses, and callbacks:

- Templates store a JSON form schema built by the visual builder.
- n8n submits requests with an API key and a `callback_url`.
- Reviewers must be `admin` or `editor`; if `assign_to` is set, only that
  reviewer (or an admin) can respond.
- Responses transition `pending` → `approved` / `rejected` /
  `request_changes` (or `expired`).
- Callback URLs are validated, including DNS resolution, and can be signed with
  `HITL_CALLBACK_SECRET` (`X-N8N-Library-Signature`).
- `N8N_INTERNAL_URL` origins are always allowed; other private destinations
  require `HITL_ALLOW_PRIVATE_CALLBACKS=true`.

## Prompt Library

`routes/prompts.js` stores versioned prompts with categories, tags, status, and
public read endpoints. Updates create a version; reverts create a new version
from an older one. `POST /api/prompts/:id/improve` uses the configured LLM.

## Credential Store

`routes/credential-store.js` stores shared credential fields encrypted with
AES-256-GCM. Admins define which fields users must supply. Provisioning merges
shared secrets with user fields, fetches the n8n credential schema, fills
schema defaults, strips disallowed keys, and creates the credential in n8n.
Secrets are never returned by the API.

## Monitoring caches

`lib/n8n-api.js` maintains:

- Single-flight full workflow fetches (never duplicated concurrently).
- A lightweight workflow summary (`id`, `name`, `active`, `tags`) with a
  15-minute TTL and stale-while-revalidate behavior.
- A workflow-name map with a 5-minute TTL.
- Non-blocking name lookups so execution and dashboard requests never wait
  minutes for a full workflow list. The Workflows page seeds the cache.

The SSE push polls only instances that have connected listeners and runs every
30 seconds. Metrics collectors run every 60 seconds.

## Alerts and retention

`lib/alert-engine.js` runs every 5 minutes and supports failure rate/count, open
tickets, SLA breach, and unreachable-instance conditions. `lib/retention.js`
removes expired reset tokens, old audit entries, old credential-audit entries,
and read notifications once per day.

## Testing and CI

Backend tests use `node:test` + `supertest` against a dedicated PostgreSQL
database (`n8n_library_test`). Coverage includes:

- Role matrix for HITL, MCP, and KB writes.
- HITL state transitions, assignee enforcement, SSRF rejection, and signed
  callbacks.
- API-key role capping and expiry.
- Migration versioning and idempotency.
- SSRF helpers, HMAC signing, and credential crypto.

CI runs on PostgreSQL 16: install, syntax check, migrate twice, tests,
TypeScript/Vite build, ESLint, and runtime dependency audit.

## Deployment

### With nginx (recommended)

nginx sits in front and routes requests:

- `/templates/*`, `/workflows/*` → n8n-library (template API)
- `/api/*` → n8n-library (application API)
- Everything else → n8n (the n8n UI)

This allows n8n's built-in template browser to fetch from the library transparently.

### Docker

n8n Library only requires PostgreSQL. It connects to your existing n8n instance(s) via their REST API — no shared network or co-location needed. Configure n8n connections in the Settings UI or via `N8N_INTERNAL_URL` env var.

Set `CREDENTIAL_ENCRYPTION_KEY` to a persistent 64-hex-character value
(`openssl rand -hex 32`). Losing it makes stored credentials unrecoverable.
Set `FRONTEND=react` to serve the React build instead of `public/`.

If deploying alongside n8n with Docker Compose, add `n8n-library` as a service on the same network so it can reach n8n's internal URL. A sample `docker-compose.yml` is included for reference.

### Standalone

```bash
npm install
cp .env.example .env
# Edit .env
node migrate.js
node server.js
```

Or use the setup wizard: `npm run setup`

## Security

- Passwords hashed with bcrypt (cost factor 10)
- API keys stored as SHA-256 hashes (raw key shown once at creation)
- Sessions stored server-side in PostgreSQL
- CSRF protection via `X-Requested-With` header validation (bypassed for API key auth)
- Helmet security headers in production
- Rate limiting on auth, AI, write, and credential endpoints
- 2FA/TOTP for password and n8n logins
- SSRF protection on external URL validation, including DNS resolution (`lib/helpers.js`)
- HMAC-signed outbound webhooks and HITL callbacks
- HTML sanitization with DOMPurify on frontend (`<style>` tags stripped to prevent CSS injection)
- SQL injection prevention via parameterized queries throughout
- AES-256-GCM encryption for stored n8n API keys and credential-store secrets
- `CREDENTIAL_ENCRYPTION_KEY` required in production; startup never re-encrypts
  values that fail to decrypt
- Setup wizard binds to loopback and requires a one-time token
- MCP server list and tool invocation are role-gated; `/mcp` sessions carry the
  authenticated actor
- No secrets in client-side code
- API key role enforcement: key permissions capped at user's own role
- Daily retention cleanup for reset tokens, audit logs, and notifications
