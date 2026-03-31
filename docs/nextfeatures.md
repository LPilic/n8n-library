# n8n-library — Next Features Proposal

## Current n8n API Coverage

### Already Integrated
| API | Used For |
|-----|----------|
| `GET /workflows` | Monitoring, Dashboard, Library, n8n panel |
| `GET/PATCH /workflows/{id}` | Import, AI rename |
| `POST /workflows/{id}/activate\|deactivate` | Monitoring toggle |
| `GET /executions` | Monitoring, Dashboard, Stats |
| `GET /executions/{id}` | Execution detail view |
| `POST /executions/{id}/retry` | Retry failed executions |
| `GET /users/{id}` | User verification |
| `GET /healthz` | Health checks |
| `GET /metrics` | Observability (Prometheus) |

### Not Yet Integrated
| API | Potential |
|-----|-----------|
| **Credentials** — `GET/POST/PUT/DELETE /credentials`, `/credentials/schema/{type}`, `/credentials/{id}/transfer` | Full credential management |
| **Tags** — `GET/POST/PUT/DELETE /tags`, `/workflows/{id}/tags` | Workflow organization |
| **Variables** — `GET/POST/PUT/DELETE /variables` | Environment variable management |
| **Projects** — `GET/POST/PUT/DELETE /projects`, project user management | Project organization |
| **Source Control** — `POST /source-control/pull` | Git integration |
| **Audit** — `GET /audit` | Security audit |
| **Data Tables** — Full CRUD + rows | n8n's built-in data storage |
| **Executions** — `POST /executions/{id}/stop`, `POST /executions/stop` | Stop running executions |
| **Execution Tags** — `/executions/{id}/tags` | Tag/categorize executions |
| **Workflow Versions** — `/workflows/{id}/{versionId}` | Workflow version history |
| **Workflow Transfer** — `/workflows/{id}/transfer` | Ownership transfer |

---

## Proposed Features

### 1. Credential Manager

Manage n8n credentials from n8n-library. Users can see which credentials exist, check their types, see which workflows use them, and create new ones — without logging into the n8n editor.

**API**: `/credentials`, `/credentials/schema/{type}`, `/credentials/{id}`

**Value**: Centralized credential overview across instances, identify unused/expired credentials, bulk audit.

#### Security Considerations for Multi-Tenant / Agency Use

This is the most sensitive feature due to the nature of credential data. In an agency scenario where one n8n-library instance manages multiple customer n8n instances, the following safeguards are essential:

**Architecture Principle: n8n-library never stores or proxies raw credential secrets.**

1. **Read-Only by Default**
   - The n8n API returns credential metadata (name, type, created date) but NOT the secret values themselves. This is safe to display.
   - Creating/editing credentials requires writing secrets — this should be a separate, explicitly enabled permission, not the default.

2. **Instance-Level Access Control**
   - Each n8n instance already has its own API key. n8n-library should enforce that a user can only see credentials for instances they have access to.
   - Implement an **instance permission matrix**: map n8n-library users → allowed instances. An agency user managing "Customer A" should never see "Customer B" credentials.
   - Store this mapping in a `user_instance_access` table (user_id, instance_id, role).

3. **Role Hierarchy for Credential Operations**
   - `viewer` — Can see credential names and types (metadata only). Cannot see secrets or modify.
   - `editor` — Can see metadata. Cannot create/edit/delete credentials.
   - `admin` — Full credential management, but only for assigned instances.
   - `super_admin` — Cross-instance access (agency owner only).

4. **Credential Write Operations — Additional Safeguards**
   - Require **re-authentication** (password confirmation or 2FA) before any credential write operation.
   - Require **audit justification** — a mandatory text field explaining why the credential is being created/modified.
   - All credential operations logged to audit log with full detail (who, what, when, which instance).
   - Optional: require **approval workflow** — credential changes go through HITL approval before being applied to the n8n instance.

5. **Secret Value Handling**
   - When creating credentials, secrets are sent directly from the browser to the n8n instance API (via the existing `/api/n8n-proxy` endpoint). They pass through n8n-library's proxy but are NOT stored in n8n-library's database.
   - Add a `no-log` flag on the proxy for credential endpoints so that request bodies containing secrets are never written to access logs or audit logs.
   - Consider a direct browser→n8n connection for credential writes (bypassing the proxy entirely) if the n8n instance is reachable from the browser.

6. **Instance Isolation in Multi-Tenant Setup**
   - Each instance connection uses its own n8n API key with appropriate scope.
   - n8n-library should validate that the API key for instance A cannot be used to access instance B (already enforced by n8n itself, but defense-in-depth).
   - Display clear visual indicators showing which instance a credential belongs to — prevent accidental cross-instance operations.
   - Consider namespace prefixing in the UI: `[Customer A] > Credentials` vs `[Customer B] > Credentials`.

7. **Network Security**
   - Credential API calls should only be allowed over HTTPS (enforce TLS check on instance URLs when credential operations are involved).
   - Rate limit credential operations more aggressively than other endpoints (e.g., 10 req/min vs 60 req/15min for general writes).

**Recommended Implementation Order:**
1. Read-only credential listing (metadata only) — low risk, high visibility
2. Instance permission matrix (user→instance access control)
3. Credential usage mapping (which workflows use which credentials)
4. Write operations with re-auth + audit trail (optional, behind feature flag)

---

### 2. Tag & Project Manager

Visual organization of workflows using tags and projects. Drag-and-drop tagging, bulk operations, tag-based filtering in monitoring.

**API**: `/tags`, `/workflows/{id}/tags`, `/projects`, `/projects/{id}/users`

**Value**: Most n8n users don't organize workflows. A visual tag manager would improve findability and enable tag-based monitoring dashboards (e.g., "show me all executions for workflows tagged 'billing'").

---

### 3. Variable Manager

Manage n8n environment variables (used in expressions like `$vars.MY_VAR`) from n8n-library. CRUD interface, search, bulk edit, diff across instances.

**API**: `/variables`

**Value**: Variables are painful to manage in n8n's UI (buried in settings). A dedicated panel with search, categories, and multi-instance comparison would be very useful. Especially valuable for agencies managing dev/staging/prod instances — compare variables across environments at a glance.

---

### 4. Execution Control — Stop Running Workflows

Add "Stop" button to running executions in the monitoring panel, including bulk stop.

**API**: `POST /executions/{id}/stop`, `POST /executions/stop`

**Value**: Currently monitoring can only retry failed executions. Being able to stop runaway or stuck executions from n8n-library is critical for operations. A single button to stop all running executions in an emergency would be a lifesaver.

---

### 5. Workflow Version History

View and compare historical versions of n8n workflows, with visual diff of node changes.

**API**: `/workflows/{id}/{versionId}`

**Value**: n8n tracks workflow versions internally. Surfacing this in n8n-library with a visual diff (nodes added/removed/changed) gives teams audit and rollback capability. Could reuse the diff pattern from prompt versioning.

---

### 6. Security Audit Dashboard

Pull n8n's built-in security audit and display risk scores, recommendations, and compliance status.

**API**: `GET /audit`

**Value**: Most teams never run the audit. A persistent dashboard showing security posture with actionable recommendations would improve security hygiene. Could run on a schedule and alert on new findings.

---

### 7. Data Tables Browser

Browse and manage n8n's built-in data tables (new feature in n8n). View rows, create/update/delete entries, export data.

**API**: `/data-tables`, `/data-tables/{id}/rows`, upsert, delete

**Value**: Data tables are new in n8n and have a minimal UI. A richer data browser with search, filtering, CSV export, and bulk operations would be valuable.

---

### 8. Source Control Integration

Trigger git pull/push operations from n8n-library, view deployment status, compare environments.

**API**: `POST /source-control/pull`

**Value**: Teams using n8n's git integration could manage deployments (dev → staging → prod) from n8n-library without accessing each instance directly.

---

## Priority Matrix

| Priority | Feature | Effort | Impact | Risk |
|----------|---------|--------|--------|------|
| **High** | Execution Stop (4) | Low | Immediate operational value | Low |
| **High** | Variable Manager (3) | Medium | Pain point for every n8n team | Low |
| **High** | Tag & Project Manager (2) | Medium | Organizational backbone | Low |
| **Medium** | Credential Manager (1) — Read-only | Medium | Security & visibility | Medium |
| **Medium** | Security Audit Dashboard (6) | Low | Compliance | Low |
| **Medium** | Workflow Version History (5) | High | Audit & rollback | Low |
| **Lower** | Data Tables Browser (7) | Medium | New n8n feature, smaller audience | Low |
| **Lower** | Source Control (8) | Medium | Only for git-integrated teams | Low |
| **Careful** | Credential Manager (1) — Write ops | High | Full lifecycle management | **High** |
