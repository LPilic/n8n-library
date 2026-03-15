# API Reference

All endpoints return JSON. Roles: `admin`, `editor`, `viewer`.

> **Interactive docs:** Visit `/api/docs` for the Swagger UI with the full OpenAPI 3.0 specification.

## Authentication Methods

### Session (Browser)

Login via `POST /api/auth/login` to obtain a session cookie. Mutating requests (`POST`, `PUT`, `DELETE`) require the header `X-Requested-With: XMLHttpRequest` for CSRF protection.

### API Key (Programmatic)

Generate API keys in **Settings > API Keys**. Authenticate via:

```
Authorization: Bearer n8nlib_your_key_here
```

Or:

```
X-API-Key: n8nlib_your_key_here
```

API key requests bypass CSRF checks and have CORS enabled. A key's effective role is the more restrictive of the key's role and the user's role.

---

## Auth Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | None | Login with `{email, password}` |
| POST | `/api/auth/logout` | Any | Destroy session |
| GET | `/api/auth/me` | Any | Get current user |
| POST | `/api/auth/forgot-password` | None | Request password reset email |
| POST | `/api/auth/reset-password` | None | Reset password with `{token, password}` |

## Users

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/users` | Admin | List all users |
| POST | `/api/users` | Admin | Create user `{username, email, password, role}` |
| PUT | `/api/users/:id` | Admin | Update user |
| DELETE | `/api/users/:id` | Admin | Delete user |

## Templates

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/templates/categories` | None | n8n-compatible category list |
| GET | `/templates/search` | None | Search templates `?category=&search=&skip=&limit=` |
| GET | `/templates/workflows/:id` | None | Get template detail |
| GET | `/templates/collections` | None | List collections |
| GET | `/templates/collections/:id` | None | Collection detail with workflows |
| POST | `/api/templates` | Editor+ | Create template |
| PUT | `/api/templates/:id` | Editor+ | Update template |
| DELETE | `/api/templates/:id` | Admin | Delete template |
| GET | `/api/categories` | Any | List categories with icons |
| POST | `/api/categories` | Admin | Create category |
| PUT | `/api/categories/:id` | Admin | Update category |
| DELETE | `/api/categories/:id` | Admin | Delete category |

## Monitoring

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/monitoring/health` | Editor+ | n8n health check `?instance_id=` |
| GET | `/api/monitoring/metrics` | Editor+ | Prometheus metrics (parsed) |
| GET | `/api/monitoring/metrics/history` | Editor+ | Metrics time series |
| GET | `/api/monitoring/stats` | Editor+ | Execution stats summary |
| GET | `/api/monitoring/workflows` | Editor+ | All workflows (cached 60s) |
| GET | `/api/monitoring/executions` | Editor+ | Executions `?status=&workflowId=&limit=&cursor=` |
| GET | `/api/monitoring/executions/:id` | Editor+ | Execution detail with node data |
| POST | `/api/monitoring/workflows/:id/activate` | Editor+ | Activate/deactivate `{active: bool}` |
| GET | `/api/monitoring/workers` | Editor+ | Worker health and metrics |
| POST | `/api/monitoring/daily-summary` | Admin | Trigger daily summary email |

## Instances

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/instances` | Editor+ | List all n8n instances |
| POST | `/api/instances` | Admin | Add instance `{name, environment, internal_url, api_key, color, is_default, workers}` |
| PUT | `/api/instances/:id` | Admin | Update instance |
| DELETE | `/api/instances/:id` | Admin | Delete instance |

## Tickets

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/ticket-categories` | Any | List ticket categories |
| POST | `/api/ticket-categories` | Admin | Create category |
| PUT | `/api/ticket-categories/:id` | Admin | Update category |
| DELETE | `/api/ticket-categories/:id` | Admin | Delete category |
| GET | `/api/tickets` | Any | List tickets `?status=&priority=&assignee=&search=` |
| GET | `/api/tickets/:id` | Any | Ticket detail with comments and activity |
| POST | `/api/tickets` | Any | Create ticket |
| PUT | `/api/tickets/:id` | Editor+ | Update ticket |
| DELETE | `/api/tickets/:id` | Admin | Delete ticket |
| POST | `/api/tickets/:id/comments` | Any | Add comment `{body, is_internal}` |

### Public Ticket API (no session required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/public/ticket-categories` | List categories |
| GET | `/api/public/n8n-me` | Validate n8n user `?userId=` |
| POST | `/api/public/ticket` | Submit ticket from n8n |
| POST | `/api/public/ticket-image` | Upload image attachment |

## Knowledge Base

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/kb/categories` | Any | List KB categories (hierarchical) |
| POST | `/api/kb/categories` | Admin | Create category |
| PUT | `/api/kb/categories/:id` | Admin | Update category |
| DELETE | `/api/kb/categories/:id` | Admin | Delete category |
| GET | `/api/kb/tags` | Any | List tags with article counts |
| DELETE | `/api/kb/tags/:id` | Admin | Delete tag |
| GET | `/api/kb/articles` | Any | List articles `?search=&category=&tag=&status=&sort=` |
| GET | `/api/kb/articles/:idOrSlug` | Any | Article detail (increments view count) |
| POST | `/api/kb/articles` | Editor+ | Create article |
| PUT | `/api/kb/articles/:id` | Editor+ | Update article |
| DELETE | `/api/kb/articles/:id` | Admin | Delete article |
| POST | `/api/kb/articles/:id/feedback` | Any | Vote `{helpful: bool}` |
| PATCH | `/api/kb/articles/:id/pin` | Admin | Toggle pin `{is_pinned: bool}` |
| PATCH | `/api/kb/articles/:id/feature` | Admin | Toggle feature `{is_featured: bool}` |
| GET | `/api/kb/articles/:id/versions` | Editor+ | Version history |
| POST | `/api/kb/articles/:id/restore/:versionId` | Editor+ | Restore version |
| POST | `/api/kb/articles/:id/attachments` | Editor+ | Upload file (multipart) |
| DELETE | `/api/kb/articles/:id/attachments/:attachId` | Editor+ | Delete attachment |
| GET | `/api/kb/stats` | Editor+ | KB statistics |

## AI

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/ai/models` | Admin | Fetch available models from provider |
| POST | `/api/ai/name-workflow` | Editor+ | Generate workflow name from JSON |
| POST | `/api/ai/describe-workflow` | Editor+ | Generate workflow description |
| POST | `/api/ai/document-workflow` | Editor+ | Generate full workflow documentation |
| POST | `/api/ai/analyze-error` | Editor+ | Analyze execution error |
| POST | `/api/ai/observability-report` | Editor+ | Generate performance analysis |
| POST | `/api/ai/chat` | Editor+ | Chat with AI `{messages, conversationId, mcpServerIds}` |
| GET | `/api/ai/conversations` | Any | List user's conversations |
| POST | `/api/ai/conversations` | Any | Create conversation |
| GET | `/api/ai/conversations/:id` | Any | Get conversation |
| PUT | `/api/ai/conversations/:id` | Any | Update conversation |
| DELETE | `/api/ai/conversations/:id` | Any | Delete conversation |

## MCP Servers

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/mcp/servers` | Admin | List servers with status and tool count |
| POST | `/api/mcp/servers` | Admin | Add server `{name, type, command, args, env, url, enabled}` |
| PUT | `/api/mcp/servers/:id` | Admin | Update server |
| DELETE | `/api/mcp/servers/:id` | Admin | Delete server |
| POST | `/api/mcp/servers/:id/reconnect` | Admin | Reconnect server |
| GET | `/api/mcp/tools` | Editor+ | List all available MCP tools |
| POST | `/api/mcp/tools/call` | Editor+ | Call tool `{serverId, toolName, args}` |

## Settings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/settings/smtp` | Admin | Get SMTP configuration |
| PUT | `/api/settings/smtp` | Admin | Update SMTP settings |
| POST | `/api/settings/smtp/test` | Admin | Send test email |
| GET | `/api/settings/email-templates` | Admin | Get email templates |
| PUT | `/api/settings/email-templates` | Admin | Update templates |
| POST | `/api/settings/email-templates/reset` | Admin | Reset template to default |
| POST | `/api/settings/email-templates/preview` | Admin | Preview rendered template |
| GET | `/api/settings/ai` | Admin | Get AI provider settings |
| PUT | `/api/settings/ai` | Admin | Update AI settings |
| GET | `/api/settings/ai-prompts` | Admin | Get custom AI prompts |
| PUT | `/api/settings/ai-prompts` | Admin | Update AI prompts |
| GET | `/api/settings/branding` | Any | Get branding (logo, name) |
| PUT | `/api/settings/branding` | Admin | Update branding |

## API Keys

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/api-keys` | Any | List current user's API keys |
| GET | `/api/api-keys/all` | Admin | List all API keys across all users |
| POST | `/api/api-keys` | Any | Create API key `{name, role, expires_in}` — returns full key once |
| PUT | `/api/api-keys/:id` | Any | Update key name `{name}` |
| DELETE | `/api/api-keys/:id` | Any | Revoke API key |

**Key format:** `n8nlib_<64 hex chars>` (71 chars total). Only the SHA-256 hash is stored; the `key_prefix` (first 15 chars) is stored for display.

**Create key response:**

```json
{
  "id": 1,
  "name": "CI/CD Pipeline",
  "key_prefix": "n8nlib_a1b2c3d",
  "role": "editor",
  "key": "n8nlib_a1b2c3d4e5f6...full key here...",
  "expires_at": "2027-03-16T00:00:00.000Z",
  "created_at": "2026-03-16T12:00:00.000Z"
}
```

> The `key` field is only returned in the create response. Store it securely.
