# n8n Library

A self-hosted companion app for [n8n](https://n8n.io) that adds a workflow template library, monitoring dashboard, service desk, knowledge base, and AI assistant — all in one interface.

## Features

- **Template Library** — Browse, search, and import workflow templates directly into n8n via the built-in template browser
- **Monitoring Dashboard** — Real-time execution stats, workflow management, activate/deactivate workflows, execution detail with node-level timeline
- **Observability** — Prometheus metrics visualization, CPU/memory/heap/event loop charts, queue metrics, worker health monitoring
- **Service Desk** — Ticket system with categories, priorities, assignments, comments, and direct linking to n8n executions
- **Knowledge Base** — Articles with categories, tags, versioning, full-text search, and helpfulness feedback
- **AI Assistant** — Chat interface powered by LLMs (Claude, OpenAI, Gemini, Groq, Ollama) with tool use for searching tickets and KB articles
- **MCP Integration** — Connect Model Context Protocol servers to extend AI capabilities (e.g., n8n-mcp for workflow management via chat)
- **Multi-Instance Support** — Monitor and switch between multiple n8n instances (production, staging, dev) from a single dashboard
- **Worker Monitoring** — Track n8n queue-mode workers with health checks and per-worker metrics
- **Email Notifications** — Customizable email templates for password resets, ticket updates, and daily summary reports
- **API Keys** — Per-user API key generation for programmatic access with role-based permissions and optional expiry
- **API Documentation** — Interactive Swagger/OpenAPI docs at `/api/docs`
- **Role-Based Access** — Admin, editor, and viewer roles with granular permissions
- **Dark Mode** — System-preference-aware theme toggle

## Quick Start

### Prerequisites

- **Node.js** 20+
- **PostgreSQL** 14+
- An **n8n** instance (self-hosted)

### Option A: Web-Based Setup Wizard

```bash
git clone https://github.com/LPilic/n8n-library.git
cd n8n-library
npm install
npm run setup
```

Open `http://localhost:3100/setup` in your browser and follow the steps.

### Option B: Manual Setup

```bash
git clone https://github.com/LPilic/n8n-library.git
cd n8n-library
npm install
cp .env.example .env
# Edit .env with your database credentials and settings
node migrate.js
node server.js
```

### Option C: Docker

n8n Library requires only a PostgreSQL database. You can use an existing PostgreSQL instance or run one alongside it.

**With an external PostgreSQL database:**

```bash
docker build -t n8n-library .
docker run -d \
  --name n8n-library \
  -p 3100:3100 \
  -e DB_POSTGRESDB_HOST=your-postgres-host \
  -e DB_POSTGRESDB_PORT=5432 \
  -e DB_POSTGRESDB_USER=postgres \
  -e DB_POSTGRESDB_PASSWORD=your-password \
  -e DB_POSTGRESDB_DATABASE=n8n_library \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  n8n-library
```

**With a local PostgreSQL container:**

```bash
# Create a network
docker network create n8n-lib-net

# Start PostgreSQL
docker run -d \
  --name n8n-lib-db \
  --network n8n-lib-net \
  -e POSTGRES_DB=n8n_library \
  -e POSTGRES_PASSWORD=changeme \
  -v n8n-lib-pgdata:/var/lib/postgresql/data \
  postgres:16-alpine

# Start n8n Library
docker build -t n8n-library .
docker run -d \
  --name n8n-library \
  --network n8n-lib-net \
  -p 3100:3100 \
  -e DB_POSTGRESDB_HOST=n8n-lib-db \
  -e DB_POSTGRESDB_PASSWORD=changeme \
  -e DB_POSTGRESDB_DATABASE=n8n_library \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  n8n-library
```

> **Note:** n8n Library only needs PostgreSQL. Your n8n instance, workers, Redis, and other services run separately — just point the library to your n8n via the Settings UI or `N8N_INTERNAL_URL` env var.

## Configuration

All configuration is via environment variables (or `.env` file):

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_POSTGRESDB_HOST` | `localhost` | PostgreSQL host |
| `DB_POSTGRESDB_PORT` | `5432` | PostgreSQL port |
| `DB_POSTGRESDB_USER` | `postgres` | PostgreSQL user |
| `DB_POSTGRESDB_PASSWORD` | _(empty)_ | PostgreSQL password |
| `DB_POSTGRESDB_DATABASE` | `n8n_library` | Database name |
| `DB_POSTGRESDB_SCHEMA` | `public` | Database schema (allows sharing a DB) |
| `PORT` | `3100` | Application port |
| `SESSION_SECRET` | _(required)_ | Session encryption key (32+ chars recommended) |
| `APP_URL` | `http://localhost:3100` | Public URL (used in emails) |
| `NODE_ENV` | _(empty)_ | Set to `production` for secure cookies and HSTS |
| `N8N_INTERNAL_URL` | _(empty)_ | Default n8n instance URL (can also be set in UI) |
| `N8N_API_KEY` | _(empty)_ | Default n8n API key (can also be set in UI) |
| `SMTP_HOST` | _(empty)_ | SMTP server for emails |
| `SMTP_PORT` | `25` | SMTP port |
| `SMTP_USER` | _(empty)_ | SMTP auth user |
| `SMTP_PASS` | _(empty)_ | SMTP auth password |
| `SMTP_FROM` | `n8n-library@localhost` | From address for emails |

## n8n Integration

### Template Browser

n8n Library serves as a drop-in replacement for n8n's template API. Configure your n8n instance to use it:

```env
# In your n8n environment:
N8N_TEMPLATES_HOST=http://your-library-host:3100
N8N_TEMPLATES_ENABLED=true
```

When using the nginx proxy (see architecture docs), n8n's template browser seamlessly loads templates from the library.

### n8n API Key

Generate an API key in your n8n instance: **Settings > API > Create API Key**. Add it when configuring the n8n instance in the library's Settings panel.

### Worker Monitoring

For queue-mode workers, enable on each worker:

```env
QUEUE_HEALTH_CHECK_ACTIVE=true
N8N_METRICS=true
N8N_METRICS_INCLUDE_DEFAULT_METRICS=true
N8N_METRICS_INCLUDE_QUEUE_METRICS=true
```

Then add worker URLs in Settings > Instances > Edit > Workers.

## API Access

### API Keys

Generate API keys in **Settings > API Keys** for programmatic access. Keys support role-based permissions (admin, editor, viewer) and optional expiry.

```bash
# Authenticate with Bearer token
curl -H "Authorization: Bearer n8nlib_your_key_here" https://your-server/api/tickets

# Or use the X-API-Key header
curl -H "X-API-Key: n8nlib_your_key_here" https://your-server/api/kb/articles
```

Keys are hashed (SHA-256) in the database — the full key is shown only once at creation. A key's permissions cannot exceed its owner's role.

### API Documentation

Interactive Swagger UI is available at `/api/docs` with the full OpenAPI 3.0 specification covering all endpoints.

## Default Credentials

After installation, log in with:

- **Email:** `admin@localhost`
- **Password:** `admin`

Change these immediately in Settings > Users.

## NPM Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm start` | `node server.js` | Start the application |
| `npm run setup` | `node setup.js` | Launch web-based setup wizard |
| `npm run dev` | `node --watch server.js` | Start with file watching (dev mode) |
| `npm run migrate` | `node migrate.js` | Run database migrations |

## License

Private — not for redistribution.
