# n8n Library — Security & Reliability Review (October 2026)

Status: **Phase 1 complete** on branch `improvement/phase-1-security`.
Phases 2–4 are tracked but not yet implemented.

This document records the findings from a full read of the server, routes, schema,
frontend, and deployment files, plus the results of:

```bash
node --check server.js db.js migrate.js setup.js lib/*.js routes/*.js
cd frontend && npx tsc -b --pretty false
cd frontend && npx eslint .
npm audit --omit=dev
```

There is currently no automated test suite or CI workflow in the repository.

---

## Executive summary

The codebase is broad and generally well-structured: parameterized SQL almost
everywhere, a clear role hierarchy, hashed API keys, AES-GCM encrypted
credential-store secrets, DOMPurify on rendered HTML, CSRF protection, and
sensible rate limiters.

The most important risks are:

1. **HITL approvals are not access-controlled.** Any authenticated user,
   including a viewer, can approve or reject any request.
2. **The n8n login path bypasses 2FA and can claim synced accounts.**
3. **The credential encryption key is ephemeral by default.** Setup and the
   sample Compose file never persist it; the server generates a new key each
   boot and the startup migration can re-encrypt already-encrypted data.
4. **MCP tools are callable by any authenticated user.** Server credentials are
   also returned by the MCP server list endpoint.
5. **The monitoring SSE loop can saturate production.** With any monitoring
   client connected it calls uncached `fetchAllWorkflows()` every 15 seconds.
   The documented production instance has ~2,292 workflows and a ~4.5 minute
   full fetch.

---

## Priority matrix

| Priority | Finding | Location | Risk |
|---|---|---|---|
| P0 | HITL approve/reject only requires `requireAuth` | `routes/hitl.js:226` | Any viewer can approve anything |
| P0 | HITL `callback_url` fetched without SSRF validation | `routes/hitl.js:279` | Authenticated SSRF |
| P0 | `n8n-login` skips TOTP and claims placeholder accounts | `routes/auth.js:219-302` | 2FA bypass / account takeover |
| P0 | Ephemeral credential encryption key | `server.js:70-90`, `setup.js`, Compose | Permanent loss of stored secrets |
| P0 | Unauthenticated setup wizard + SQL injection via schema | `setup.js:26-44,139` | DB compromise / admin takeover |
| P0 | Arbitrary MCP tool invocation by any user | `routes/mcp-routes.js:99`, `lib/tools.js:182` | Viewer can run privileged tools |
| P1 | MCP server credentials returned to all users | `routes/mcp-routes.js:10-22` | Secret disclosure |
| P1 | Monitoring SSE uncached workflow fetches | `routes/monitoring.js:389-444` | CPU saturation / hangs |
| P1 | `req.session.user` used with API-key auth | `routes/kb.js`, `routes/ai.js` | API-key requests break |
| P1 | Alert failure-rate passes `{}` as instance ID | `lib/alert-engine.js:66` | Wrong-instance alerts |
| P1 | SMTP DB settings not restored after restart | `lib/email.js` startup | Password resets/alerts stop |
| P1 | Public ticket API trusts caller-supplied n8n user ID | `routes/tickets.js:28-90` | Ticket impersonation |
| P1 | SSRF helper does not resolve DNS | `lib/helpers.js:88-117` | DNS-based SSRF bypass |
| P2 | Dual frontend, stale build, missing deep-link route | `server.js:151,331`, Dockerfile | Drift and 404s |
| P2 | No tests, CI, or dependency gate | repository root | Regressions |
| P2 | OpenAPI/docs/license drift | `openapi.json`, README, docs | Misleading API/legal state |

---

## Phase 1 — Security hotfixes

- [x] Add this review to source control. (`362e278`)
- [x] HITL: require `admin`/`editor`, enforce `assign_to`, validate `action`.
      (`c7605e9`)
- [x] HITL/webhooks: validate callback/webhook URLs, including DNS resolution;
      sign outbound requests with HMAC when a signing secret is configured.
      (`224d512`)
- [x] Auth: enforce TOTP in `n8n-login`; stop implicit claiming of synced
      placeholder accounts (opt-in auto-provision only). (`424367e`)
- [x] Crypto: require and persist `CREDENTIAL_ENCRYPTION_KEY`; never re-encrypt
      undecryptable values on startup. (`9adf517`)
- [x] Setup: bind to loopback, require a one-time token, validate schema names,
      generate the encryption key, and stop returning stack traces. (`a3093d3`)
- [x] MCP: admin-only server list/reconnect; role-gate external MCP tool calls
      and AI tool use; per-session actor for the `/mcp` endpoint; write tools
      require editor or admin. (`58bb7ee`)
- [x] API-key compatibility: replace `req.session.user` with `req.user` in KB
      and AI routes. (`676107e`)
- [x] Alert engine: pass the real instance ID to `n8nApiFetch`. (`946e29d`)
- [x] Password reset: invalidate sessions with a JSON path, not a substring
      `LIKE`. (`b299362`)
- [x] Add unit tests for URL validation, HMAC signing, and crypto round-trips.
      (`4a96115`)

### Phase 1 verification

```bash
node --check server.js setup.js lib/*.js routes/*.js
npm test
cd frontend && npx tsc -b --pretty false
cd frontend && npx eslint .
```

Phase 1 validation (2026-10-19):

- `node --check` passes for all server, lib, and route modules.
- `npm test` passes 6/6 helper and crypto tests.
- `npx tsc -b` passes in `frontend/`.
- `npx eslint .` still reports the three pre-existing Phase 3 errors in
  `approvals.tsx`, `credentials.tsx`, and `security.tsx`.
- The setup server was manually verified to return 401 without the one-time
  token and 200 with it.

Manual checks:

- A viewer cannot approve/reject an HITL request.
- An editor assigned to another user cannot respond unless admin.
- A synced `n8n-external` account cannot be claimed by supplying a password.
- A 2FA-enabled user cannot log in through `n8n-login` without a TOTP code.
- Restarting the server does not change the encryption key or corrupt stored
  n8n API keys.
- `node setup.js` is only reachable on loopback and requires the printed token.
- `/api/mcp/servers` is admin-only; viewers cannot call external MCP tools.

---

## Phase 2 — Reliability and performance

- Rework monitoring caches:
  - Remove `fetchAllWorkflows()` from the SSE push and stats endpoint.
  - Add a single-flight, stale-while-revalidate workflow summary cache
    (`id`, `name`, `active`, `tags`) with a 5–15 minute TTL.
  - Raise the workflow-name-map TTL from 30 seconds to 5 minutes.
  - Poll only instances that have SSE listeners; slow the push to 30–60s.
  - Fix `inst.base_url` → `inst.internal_url` in the SSE health check.
- Add `AbortSignal.timeout()` to all outbound `fetch()` calls.
- Restore SMTP settings from the database at startup.
- Fix daily-summary workflow names by using the name map.
- Add compression and cache headers for `/api/node-icons`.
- Add graceful shutdown and a centralized JSON error handler/404.
- Add retention jobs for reset tokens, audit log, notifications, and metrics.

## Phase 3 — Quality gate

- Add `node:test` + `supertest` coverage with a real PostgreSQL CI service.
- Role-matrix tests for viewer/editor/admin/API-key requests.
- Credential crypto restart/corruption tests.
- HITL state-machine and SSRF tests.
- Run `node migrate.js` twice in CI to prove idempotency.
- Upgrade vulnerable dependencies; remove unused `http-proxy-middleware`.
- Split `migrate.js` into versioned, transactional migrations.
- Update `openapi.json`, README, architecture docs, and resolve the license
  mismatch (README says private, package says AGPL-3.0-or-later).

## Phase 4 — Frontend and scale

- Choose legacy or React as the supported frontend; align Docker/`FRONTEND`.
- Stop committing `frontend/dist`; build it in CI.
- Add route-level code splitting and a shared accessible modal.
- Fix the three ESLint errors and the remaining React hook warnings.
- If multi-replica deployment is required, move SSE, rate limits, caches, and
  alert locking to shared infrastructure.

---

## Detailed findings

### HITL authorization and callbacks

`POST /api/hitl/requests/:id/respond` only requires authentication. It does not
require a staff role, does not enforce `assign_to`, and accepts any action
string. The callback is fetched from a caller-supplied URL without SSRF checks.
Because any authenticated user can create and approve a request, the two issues
chain into an internal-network SSRF primitive.

Recommended shape:

- `requireRole('admin', 'editor')` on respond.
- If `assign_to` is set and the actor is not an admin, require
  `assign_to === req.user.id`.
- Validate `action` against `approve`, `reject`, `request_changes`.
- Validate the callback URL at creation and again before fetching, resolving
  DNS and rejecting private/link-local/metadata addresses.
- Add an HMAC signature header when `HITL_CALLBACK_SECRET` is configured.
- Return `callback_sent: false` when the callback failed.

### n8n login

The login handler verifies that the email exists in n8n, then:

- accepts any password for accounts whose hash is `n8n-external` (created by
  `sync-n8n`), and
- logs in real-password accounts without checking `totp_enabled`.

Fix by enforcing TOTP on all password logins and removing implicit password
claiming. Auto-provisioning can remain as an explicit opt-in via
`N8N_LOGIN_AUTO_PROVISION=true` for trusted deployments.

### Credential encryption key

`server.js` generates a random key when `CREDENTIAL_ENCRYPTION_KEY` is missing.
`setup.js` and the Compose example never write it. The startup migration then
tries to decrypt existing values and, on failure, encrypts the ciphertext again.
After a restart the n8n API keys become double-encrypted, and credential-store
secrets become permanently undecryptable.

Fix:

- Generate and persist the key in the setup wizard and Compose example.
- Fail fast in production if it is missing.
- Never re-encrypt values that fail to decrypt. Only migrate obvious plaintext
  values, and log a clear remediation message for ciphertext.
- Document that losing the key means losing every stored secret.

### Setup wizard

The setup server binds to all interfaces and exposes `/setup/test-db` and
`/setup/install` without authentication. The database schema name is
interpolated directly into SQL. Errors return stack traces.

Fix with a loopback bind, a one-time token printed at startup, schema-name
validation, `.env` value sanitization, and generic error responses.

### MCP

`GET /api/mcp/servers` returns `env` and `auth_header` to any authenticated user.
`POST /api/mcp/tools/call` lets any user invoke any connected server's tools.
The AI chat loop has the same issue, and the `/mcp` endpoint creates one global
server for every session.

Fix:

- Restrict server list/reconnect to admins.
- Allow external MCP tool calls only for admin/editor.
- Per-session MCP server with the authenticated actor; write tools require
  editor/admin and ticket creation uses the actor's user ID.
- Audit tool calls.

### SSRF

`isPrivateUrl` checks hostname literals but never resolves DNS. A public hostname
pointing at an internal address bypasses it. Add a DNS-resolving validator and
use it for webhooks, HITL callbacks, and other outbound URLs. An allowlist is
usually safer for webhooks.

### Public ticket endpoints

`/api/public/n8n-me` returns name/email for any n8n user ID without auth.
`/api/public/ticket` verifies that the user exists but not that the caller is
that user. `/api/public/ticket-image` writes files synchronously without magic
byte validation. Require an HMAC-signed payload or API key from n8n, rate-limit
the lookup, and validate/limit uploads.

### Monitoring hot path

`startMonitoringPush()` runs every 15 seconds when any SSE client is connected.
It loops every instance, fetches 250 executions, resolves workflow names on a
30-second TTL, and calls uncached `fetchAllWorkflows()`. The stats endpoint does
the same on a 15-second cache. With thousands of workflows, a single open
monitoring tab can keep the process in permanent full-workflow fetches.

Add a workflow summary cache with single-flight and stale-while-revalidate
semantics, remove full workflow fetches from hot paths, and poll only instances
with listeners.

### Other correctness items

- `routes/kb.js` and `routes/ai.js` use `req.session.user`, which is absent for
  API-key requests. Use `req.user`.
- `lib/alert-engine.js:66` passes `{}` instead of `inst.id`.
- `lib/email.js` never restores SMTP settings from the database after restart.
- `generateDailySummary` uses workflow IDs instead of names.
- `routes/auth.js:130` invalidates sessions with a substring `LIKE`, matching
  user 1 to users 10, 21, etc.
- Most `fetch()` calls have no timeout.
- API keys update `last_used_at` on every request; throttle this write.
- No retention jobs for reset tokens, audit entries, notifications, or metrics.
- In-memory SSE, caches, rate limits, and cron jobs assume a single instance.
- No graceful shutdown, structured logging, request IDs, or `/readyz`.

---

## Quick wins checklist

- [ ] `routes/monitoring.js:423`: `inst.base_url` → `inst.internal_url`.
- [ ] `routes/monitoring.js:416`: remove `fetchAllWorkflows` from SSE.
- [ ] `lib/n8n-api.js:107`: 30s → 5 minutes.
- [ ] `routes/kb.js` / `routes/ai.js`: `req.session.user` → `req.user`.
- [ ] `lib/alert-engine.js:66`: remove the `{}` argument.
- [ ] `routes/hitl.js:226`: add `requireRole('admin','editor')`.
- [ ] `routes/hitl.js:279`: validate callback URL.
- [ ] `routes/webhooks.js`: validate webhook URLs.
- [ ] `server.js:331`: add `credential-store` to `CLIENT_ROUTES`.
- [ ] Remove unused `http-proxy-middleware`.
- [ ] Add `CREDENTIAL_ENCRYPTION_KEY` to setup and Compose.
