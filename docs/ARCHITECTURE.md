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
│   ├── email.js           # SMTP transport, email templates
│   ├── helpers.js         # Utilities (escaping, slugs, validation, SSRF protection)
│   ├── mcp.js             # MCP client manager (stdio/HTTP transports)
│   ├── middleware.js       # Auth guards, role checks, rate limiters
│   ├── n8n-api.js         # n8n REST API client with instance routing and caching
│   └── tools.js           # AI tool definitions (built-in + MCP tools)
│
├── routes/                # Express route modules
│   ├── auth.js            # Login, logout, password reset, user CRUD
│   ├── templates.js       # n8n-compatible template API + internal CRUD
│   ├── monitoring.js      # Instance health, metrics, executions, workers, instance CRUD
│   ├── tickets.js         # Service desk: tickets, comments, activity log
│   ├── kb.js              # Knowledge base: articles, categories, tags, versions
│   ├── settings.js        # SMTP, email templates, AI config, branding
│   ├── ai.js              # AI chat, workflow description, error analysis, reports
│   └── mcp-routes.js      # MCP server management endpoints
│
├── public/                # Frontend (SPA)
│   ├── index.html         # Application shell (all panels defined inline)
│   ├── css/styles.css     # Main stylesheet with CSS variables, light/dark themes
│   ├── js/
│   │   ├── app.js         # Core: auth, navigation, theme, modals, custom selects
│   │   ├── library.js     # Template browsing, search, import
│   │   ├── monitoring.js  # Execution dashboard, workflow cards, charts
│   │   ├── observability.js # Prometheus metrics visualization, worker status
│   │   ├── tickets.js     # Ticket management UI
│   │   ├── kb.js          # Knowledge base UI
│   │   ├── ai.js          # AI chat interface with tool rendering
│   │   └── settings.js    # Admin settings panels, instance management
│   └── vendor/            # Vendored CDN dependencies (offline-capable)
│       ├── js/            # Chart.js, Quill, DOMPurify, highlight.js, n8n web components
│       ├── css/           # FontAwesome, Quill theme, highlight theme
│       └── fonts/         # FontAwesome webfonts
│
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
5. **CSRF protection** — Requires `X-Requested-With: XMLHttpRequest` on mutating requests
6. **Static files** — Serves `public/` with no-cache headers on HTML/JS/CSS
7. **CORS** — Allows cross-origin for n8n-facing endpoints (`/templates/`, `/api/public/`)
8. **Request logging** — Timestamps all requests

### Route Modules

Each route file exports an Express Router. All API endpoints use JSON request/response.

**Authentication model:**
- Session-based auth (cookie + PostgreSQL session store)
- Role hierarchy: `admin` > `editor` > `viewer`
- `requireRole('admin', 'editor')` middleware on protected endpoints
- Public endpoints under `/api/public/` (ticket submission from n8n)

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
  └── session            # PostgreSQL session store

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

Single-page application with panel-based navigation. No build step — vanilla JS modules loaded via script tags.

### Panel System

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

## Deployment

### With nginx (recommended)

nginx sits in front and routes requests:

- `/templates/*`, `/workflows/*` → n8n-library (template API)
- `/api/*` → n8n-library (application API)
- Everything else → n8n (the n8n UI)

This allows n8n's built-in template browser to fetch from the library transparently.

### Docker

n8n Library only requires PostgreSQL. It connects to your existing n8n instance(s) via their REST API — no shared network or co-location needed. Configure n8n connections in the Settings UI or via `N8N_INTERNAL_URL` env var.

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
- Sessions stored server-side in PostgreSQL
- CSRF protection via `X-Requested-With` header validation
- Helmet security headers in production
- Rate limiting on auth and AI endpoints
- SSRF protection on external URL validation (`lib/helpers.js`)
- HTML sanitization with DOMPurify on frontend
- SQL injection prevention via parameterized queries throughout
- No secrets in client-side code
