# Plan: Display Credential Store in n8n Template Browser

## Feasibility: YES

The existing `n8n-custom.js` injection mechanism already places a support ticket button in n8n's sidebar using `[class*="_filters_n14ka"]`. The same pattern works for a credential store section. The main work is creating public API endpoints (like the ticket widget uses) since cross-origin session cookies are blocked by `sameSite: 'strict'`.

## Phase 0: Research Findings (Complete)

### Injection Mechanism
- `n8n-custom.js` is loaded via n8n's `N8N_EXTERNAL_FRONTEND_HOOKS_URLS` env var
- Script served from `public/` via Express static (server.js:163-169)
- Base URL exposed as `window.__n8nLibBaseUrl` (n8n-custom.js:20)
- Sidebar found via `document.querySelector('[class*="_filters_n14ka"]')` (n8n-custom.js:262)
- MutationObserver handles SPA navigation (n8n-custom.js:276-283)

### Auth Challenge
- `GET /api/credential-store` requires `requireAuth` (credential-store.js:11)
- Cross-origin session cookies blocked by `sameSite: 'strict'` (server.js:103)
- API key auth works cross-origin (CORS Block 2, server.js:183-190) but embedding keys in JS is insecure
- **Solution**: Follow the ticket widget pattern — create `/api/public/credential-store` endpoints that authenticate via n8n user identity (read from Pinia store)

### Ticket Widget Pattern (to copy)
- n8n user read from Vue Pinia store: `app.__vue_app__.config.globalProperties.$pinia._s.get('users').currentUser` (n8n-custom.js:296-301)
- Public endpoint accepts n8n user identity in request body
- CORS Block 1 (server.js:175-181) allows `/api/public/*` without auth headers
- Backend verifies n8n user via `verifyN8nUser()` from lib/n8n-api.js

### Credential Store Data
- Template fields: id, name, description, credential_type, user_fields, allowed_roles, instance_id, instance_name
- Provision request: `{ name, data: {user_field_values}, instance_id }`
- Provision response: `{ success: true, credentialId, name }`

---

## Phase 1: Create Public Credential Store API Endpoints

**Goal**: Expose credential store read + provision via `/api/public/` paths that authenticate using n8n user identity (same pattern as ticket submission).

### Backend Changes

**File: `routes/credential-store.js`**

Add two new public endpoints:

#### `GET /api/public/credential-store`
- No session auth required; CORS-friendly via Block 1
- Accept `n8nUserId` as query param
- Call `verifyN8nUser(n8nUserId)` from `lib/n8n-api.js` to confirm the user exists on the linked n8n instance
- Look up or create a local user record by n8n email (same as ticket submission pattern in routes/tickets.js public endpoint)
- Filter templates by the resolved user's role via `allowed_roles`
- Return template list (same shape as authenticated endpoint, minus `shared_data`)

#### `POST /api/public/credential-store/:id/provision`
- Accept body: `{ n8nUserId, n8nEmail, n8nFirstName, n8nLastName, name, data }`
- Verify n8n user, resolve local user record
- Check template's `allowed_roles` against resolved user role
- Proceed with existing provisioning logic (decrypt shared_data, merge user fields, POST to n8n)
- Apply `publicLimiter` rate limiting

**Reference patterns to copy:**
- `routes/tickets.js` public ticket endpoint (~line 200+) for n8n user verification + local user resolution
- `routes/credential-store.js:182-247` for existing provisioning logic
- `lib/n8n-api.js:verifyN8nUser()` for n8n user validation

### Verification
- [ ] `GET /api/public/credential-store?n8nUserId=xxx` returns templates filtered by role
- [ ] `POST /api/public/credential-store/:id/provision` with n8n user payload creates a credential
- [ ] Requests without valid n8nUserId are rejected
- [ ] Rate limiting applies

---

## Phase 2: Add Credential Store UI to n8n-custom.js

**Goal**: Display credential store templates in n8n's template sidebar with a provision modal.

### File: `public/n8n-custom.js`

Add a fourth IIFE that:

1. **Reads n8n user from Pinia** — reuse the `tryGetN8nUser()` pattern from the ticket widget (n8n-custom.js:293-306)

2. **Places a "Credential Store" section in the sidebar** — use the same `[class*="_filters_n14ka"]` selector as `placeSupportButton()` (n8n-custom.js:256-272). Insert a collapsible section with template cards after the categories.

3. **Fetches templates** — `fetch(LIB + '/api/public/credential-store?n8nUserId=' + n8nUser.id)` on init

4. **Renders template cards** — For each template, show:
   - Name + credential type badge
   - Description (truncated)
   - "Provision" button

5. **Provision modal** — Similar to the ticket modal pattern (n8n-custom.js:495-560):
   - Credential name input (pre-filled as "My {template.name}")
   - Dynamic user fields (rendered from `user_fields` array)
   - Password fields for sensitive names (token, secret, apikey, etc.)
   - Submit button → `POST /api/public/credential-store/:id/provision`
   - Success/error feedback

6. **MutationObserver** — show/hide on SPA navigation, same as ticket widget

### File: `public/n8n-custom.css`

Add styles for:
- `.n8n-cred-store-section` — collapsible sidebar section
- `.n8n-cred-card` — template card styling
- `.n8n-cred-modal` — provision modal (can reuse many `.ntm-*` ticket modal styles)

### Verification
- [ ] Credential store section appears in sidebar on `/templates` page
- [ ] Templates load from public API
- [ ] Clicking "Provision" opens modal with correct fields
- [ ] Provisioning creates credential in n8n successfully
- [ ] Section hides when navigating away from templates
- [ ] Works cross-origin (n8n host != library host)

### Anti-pattern guards
- Do NOT embed API keys in the JavaScript
- Do NOT rely on session cookies cross-origin
- Do NOT expose `shared_data` (encrypted secrets) in the public API
- Do NOT skip n8n user verification on the public endpoints

---

## Phase 3: Build & Test

1. No frontend rebuild needed (static JS/CSS files)
2. Restart server to pick up new route endpoints
3. Test in n8n template browser:
   - Log in as a user whose role allows provisioning
   - Verify templates appear in sidebar
   - Provision a credential and confirm it shows up in n8n
4. Test edge cases:
   - User with no allowed templates sees empty/hidden section
   - Invalid n8n user ID returns error
   - Rate limiting prevents abuse
