# Credential Store review and improvement plan

Scope: `routes/credential-store.js`, `routes/credentials.js`, the credential-store
schema in `migrate.js`, and the React Credential Store UI.

## Phase 1 status (implemented 2026-10-20)

- [x] API/UI contract: templates now return `type`, `creator`,
      `user_fields`, and `user_field_definitions`.
- [x] Provision modal renders typed user fields and enforces required values.
- [x] Shared/user field overlap is rejected on create, update, and provision.
- [x] Provisioning is pinned to the template's configured instance.
- [x] Required shared fields are validated during template creation.
- [x] Schema defaults use enum/type-aware values and report missing required
      fields instead of hiding them with empty strings.
- [x] `credential_store.created_by` and `credential_audit.user_id` use
      `ON DELETE SET NULL`; audit instance references are validated.
- [x] n8n error bodies are sanitized for the browser and logged server-side.
- [x] Audit insert failures no longer turn a successful provisioning into a
      500; failed provisions are audited as `provision_failed`.
- [x] Schema helper tests added.

Remaining: edit/rotate UI, target-project ownership, store-specific audit
endpoint, idempotency, public API authentication, AAD/key rotation.

## Summary

The credential store has a sound security model: shared secrets are encrypted at
rest, never returned by the API, role-filtered, rate-limited, and audited.
Provisioning keeps shared fields out of the browser and merges them server-side.

However, there are two **critical functional problems** and several
authorization/operational gaps:

1. **The frontend and backend contract does not match.** The API returns
   `credential_type`, `creator_name`, and `user_fields`, while the UI expects
   `type`, `creator`, and `schema`. As a result:
   - type badges show **Unknown**
   - creators are never displayed
   - the Provision modal renders **no user fields**, so templates with required
     user fields cannot be provisioned
2. **A user field can override a shared secret.** The merge order is
   `{ ...sharedData, ...userFieldsOnly }`, so if the same key is both shared and
   user-supplied, the user value wins.

## Priority matrix

| Priority | Finding | Location | Impact |
|---|---|---|---|
| P0 | API/UI contract mismatch; `schema` is never returned | `routes/credential-store.js:14-20`, `frontend/src/features/credentials.tsx:52-63,576-578` | Provisioning with user fields is broken; wrong type/creator display |
| P0 | User fields can override shared secrets | `routes/credential-store.js:210-216` | Secret integrity / policy bypass |
| P1 | `instance_id` from the request overrides the template instance | `routes/credential-store.js:194` | Cross-instance provisioning |
| P1 | Required fields are not validated on template create/provision | `frontend/.../credentials.tsx` save handler; `routes/credential-store.js:205-216` | Invalid templates and confusing n8n errors |
| P1 | Provision fills **every** schema property with empty defaults | `routes/credential-store.js:241-267` | Masks missing required values; can create invalid credentials |
| P1 | User deletion can fail due to missing `ON DELETE` on FKs | `migrate.js:674-675,688-690` | Admin cannot delete users who created templates/audits |
| P1 | No edit or rotate-secret UI | backend PATCH exists at `:112`; no UI usage | Secrets cannot be rotated without delete/recreate |
| P1 | Provisioned credential lands in the API key owner's project | `routes/credential-store.js:280-284` | Requesting user may not see/use the credential |
| P1 | Raw n8n error bodies are returned to the browser | `:287-290` | Possible internal detail leakage |
| P1 | Audit insert failure can return 500 after n8n created the credential | `:294-298` | Duplicate credentials on retry |
| P1 | No credential-store tests | `test/` | Regressions like the contract mismatch go unnoticed |
| P2 | Viewer templates exist, but nav is editor-only | `AppLayout.tsx` nav item; `allowed_roles` defaults | Inconsistent access model |
| P2 | Store tab shows global credential audit | `frontend/.../credentials.tsx:879-882` | Viewers get 403; editors see unrelated events |
| P2 | No type-aware user inputs | `ProvisionModal` | Booleans/numbers/selects are sent as strings |
| P2 | No duplicate-name/idempotency protection | `:217,280` | Repeated clicks create duplicate credentials |
| P2 | Encryption has no AAD/key rotation | `lib/crypto.js` | Ciphertext swapping and rotation gaps |
| P2 | Proposed public API trusts `n8nUserId` | `credstore-in-templates.md` | User impersonation if implemented as written |

## 1. Fix the API/UI contract (P0)

Backend currently returns:

```json
{
  "id": 5,
  "name": "...",
  "credential_type": "activeCampaignApi",
  "user_fields": [],
  "allowed_roles": ["editor", "viewer"],
  "creator_name": "admin"
}
```

Frontend expects:

```ts
interface StoreTemplate {
  type: string
  creator?: string
  schema?: Record<string, SchemaProperty>
}
```

Recommended change: make the API explicit and stable.

```json
{
  "id": 5,
  "name": "...",
  "description": "",
  "type": "activeCampaignApi",
  "displayType": "ActiveCampaign API",
  "creator": "admin",
  "allowed_roles": ["editor", "viewer"],
  "instance_id": 1,
  "instance_name": "production",
  "user_fields": [
    {
      "key": "apiKey",
      "label": "API Key",
      "type": "string",
      "required": true,
      "sensitive": true,
      "description": "..."
    }
  ]
}
```

Implementation options:

- Store `user_field_definitions` JSONB when the template is created, derived
  from the n8n schema. This avoids returning the full admin schema to every
  user.
- Or return a sanitized schema containing only `user_fields`.
- Always return `type` (not just `credential_type`) and `creator` (not just
  `creator_name`).

## 2. Enforce disjoint shared/user fields (P0)

A field should be **either** shared or user-supplied, never both.

Server-side:

```js
const overlap = tpl.user_fields.filter((f) => Object.hasOwn(sharedData, f));
if (overlap.length) {
  return res.status(400).json({
    error: `Fields cannot be both shared and user-supplied: ${overlap.join(', ')}`,
  });
}
```

Also validate this when creating/updating a template. The UI should disable the
"User field" checkbox for fields that contain a shared value, or clear the
shared value when the field is switched.

## 3. Do not allow arbitrary instance overrides (P1)

Current code:

```js
const instanceId = req.body.instance_id || tpl.instance_id;
```

A user allowed on a template for instance A can pass instance B and provision
there. Recommended:

- If `tpl.instance_id` is set, always use it.
- Only allow `req.body.instance_id` when the template is explicitly
  multi-instance (future feature) and the user has access to that instance.
- Add an instance ACL if multi-instance provisioning is required.

## 4. Validate required fields and types (P1)

At template creation:

- Require every schema `required` field that is not marked as a user field.
- Reject empty strings for required secrets.
- Validate field names against the schema.
- Disallow duplicate `user_fields`.

At provisioning:

- Validate user values against the stored field definitions.
- Coerce booleans/numbers; render checkbox/number/select controls.
- Do not fill every schema property with `''`. Instead:
  - apply explicit defaults
  - fill only properties that n8n's `allOf` validation requires
  - reject missing required fields with a clear message
- Cache the credential schema per type; do not fetch it on every provision.

## 5. Fix user-deletion foreign keys (P1)

`credential_store.created_by` and `credential_audit.user_id` have no
`ON DELETE` action. Deleting a user who created a template or generated an audit
entry fails with an FK violation.

Add a migration:

```sql
ALTER TABLE credential_store
  DROP CONSTRAINT IF EXISTS credential_store_created_by_fkey,
  ADD CONSTRAINT credential_store_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE credential_audit
  DROP CONSTRAINT IF EXISTS credential_audit_user_id_fkey,
  ADD CONSTRAINT credential_audit_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
```

Also add an FK for `credential_audit.instance_id`.

## 6. Add edit and rotate flows (P1)

The backend supports `PATCH /api/credential-store/:id`, but the UI only creates
and deletes templates. Add:

- Edit name, description, allowed roles, instance
- Replace shared secrets without revealing existing values
- Show "configured" vs "not configured" per shared field
- Rotate one secret at a time
- Optional `rotation_due_at` reminder
- Audit `template_updated` with changed field **names**, never values

## 7. Fix project ownership of provisioned credentials (P1)

`POST /api/v1/credentials` creates the credential in the n8n API key owner's
project. A viewer/editor may not see it. Options:

1. Add a `project_id` to the template or instance configuration and transfer
   the credential after creation using n8n's credential transfer API.
2. Ask the user to select a project (requires project listing permission).
3. Document that an admin must transfer the credential afterward.

Recommended: template-level `target_project_id` plus a post-create transfer.
Record the project in the audit entry.

## 8. Sanitize n8n errors and make auditing safe (P1)

Current provision returns the raw n8n error body:

```js
return res.status(r.status).json({ error: errBody || 'Failed to create credential' });
```

Recommended:

- Log the full n8n error server-side with a request ID.
- Return a short generic error to the browser.
- Never include submitted values or secrets in the response.
- Insert the audit row with `provision_failed` on failure.
- Do not turn an audit-insert failure into a 500 after n8n already created the
  credential; log it and return success with a warning, or use an outbox.

Also add an idempotency key or a duplicate-name check to prevent repeated
provisioning from creating multiple credentials.

## 9. Role and navigation consistency (P2)

Templates can allow `viewer`, but the nav item for `/credential-store` requires
`editor`. The store tab also queries `/api/credentials/audit`, which is
`admin`/`editor` only, so a viewer who reaches the page gets a 403 for activity.

Decide one policy:

- **Viewers can provision:** make the nav item visible to viewers, add a
  viewer-scoped audit endpoint, and filter templates in SQL.
- **Only editors/admins can provision:** remove `viewer` from default
  `allowed_roles` and reject it on create/update.

Recommended: keep `viewer` support for self-service credentials, but add a
dedicated `GET /api/credential-store/audit` scoped to visible templates.

## 10. UI improvements

- Show type using `displayType` from the bundled credential types.
- Show creator and target instance.
- Show shared vs user-provided fields with clear badges.
- Add field descriptions, required markers, and type-aware controls.
- Add "My provisions" tab using the existing
  `/api/credentials/my-provisions` endpoint.
- Show credential ID and an n8n link after provisioning.
- Replace native `confirm()` with the shared confirm dialog.
- Add search, pagination, and empty states.
- Add edit/rotate actions.
- Add a "Test template" validation that checks fields without creating a
  credential.

## 11. Data model improvements

Suggested additions:

```sql
credential_store
  user_field_definitions JSONB DEFAULT '[]'
  target_project_id TEXT
  version INTEGER DEFAULT 1
  last_provisioned_at TIMESTAMPTZ
  rotation_due_at TIMESTAMPTZ
  deleted_at TIMESTAMPTZ

credential_audit
  project_id TEXT
  request_id TEXT
  error_code TEXT
  action: template_created | template_updated | template_deleted |
          provisioned | provision_failed
```

Indexes:

- `credential_store (instance_id)`
- `credential_store USING GIN (allowed_roles)`
- `credential_audit (created_at DESC)`
- `credential_audit (instance_id)`

Consider a unique partial index on `(lower(name), instance_id)` if duplicate
template names are not desired.

## 12. Public API plan (future)

`credstore-in-templates.md` proposes `n8nUserId`-based public endpoints. That is
not sufficient authentication: anyone can supply another n8n user ID, and the
same pattern already exists for public ticket submission.

Before implementing public credential-store endpoints:

- Require an HMAC-signed payload from n8n, or an API key with a dedicated scope.
- Never expose `shared_data` or field values.
- Apply per-user and per-template rate limits.
- Audit every public provisioning attempt.
- Consider disabling public provisioning entirely for sensitive credential
  types.

## 13. Test plan

Add backend tests for:

- API contract includes `type`, `creator`, `user_fields`
- role filtering for viewer/editor/admin
- overlap between shared and user fields is rejected
- instance override is rejected
- missing required fields fail with a clear error
- provisioning succeeds against a mocked n8n API
- n8n error responses are sanitized
- audit failure does not create duplicates/500s
- deleting a user with templates/audit entries succeeds
- encryption/decryption round-trip and key change failure

Add frontend checks for:

- Provision modal renders all user fields with correct types
- shared/user overlap is not selectable
- required fields block submit
- edit/rotate flow preserves unchanged secrets
- viewer/editor/admin navigation behavior

## Recommended delivery order

### Phase 1 — correctness and security (1–2 days)

1. Fix the API/UI contract and render user fields.
2. Reject shared/user overlap.
3. Pin provisioning to the template instance.
4. Validate required fields and stop blanket schema filling.
5. Add FK `ON DELETE SET NULL` migration.
6. Sanitize n8n errors and audit failures.

### Phase 2 — usability and ownership (2–3 days)

1. Edit/rotate templates.
2. Target project/ownership handling.
3. Type-aware user inputs and validation.
4. Store-specific audit endpoint and role/nav consistency.
5. Idempotency/duplicate-name protection.

### Phase 3 — hardening (2–3 days)

1. Tests for all above.
2. AAD and encryption-key rotation.
3. Public API authentication design, if still needed.
4. Audit retention and observability.
