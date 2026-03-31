# n8n HITL Approval — Community Node Plan

## Overview

A custom n8n community node package (`n8n-nodes-hitl-approval`) that integrates n8n workflows with the n8n-console HITL (Human-in-the-Loop) approval system. Replaces manual HTTP Request + Wait for Webhook wiring with a single drag-and-drop node.

## Package Structure

```
n8n-nodes-hitl-approval/
├── package.json
├── tsconfig.json
├── README.md
├── credentials/
│   └── HitlApi.credentials.ts        # API key + instance URL
├── nodes/
│   ├── HitlApproval/
│   │   ├── HitlApproval.node.ts       # Main approval node (send + wait)
│   │   ├── HitlApproval.node.json     # Node metadata (icon, color, docs)
│   │   └── hitl-approval.svg          # Node icon
│   └── HitlTrigger/
│       ├── HitlTrigger.node.ts        # Webhook trigger (event-driven)
│       ├── HitlTrigger.node.json
│       └── hitl-trigger.svg
└── dist/                              # Compiled output
```

## Credentials: `HitlApi`

| Field | Type | Description |
|-------|------|-------------|
| `instanceUrl` | string | n8n-console base URL (e.g. `https://library.example.com`) |
| `apiKey` | string | API key (`n8nlib_xxx`) from n8n-console settings |

Credential test: `GET /api/hitl/templates` — verifies connectivity and auth.

## Node 1: HITL Approval (Action Node)

### Purpose
Sends data to n8n-console for human review. The workflow **pauses** until a human approves or rejects, then resumes with the decision.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| Template | options (dynamic) | yes | Dropdown populated from `GET /api/hitl/templates` |
| Title | string (expression) | no | Request title (defaults to template name) |
| Description | string (expression) | no | Context for the reviewer |
| Priority | options | no | `low`, `medium`, `high`, `critical` (default: `medium`) |
| Timeout | number | no | Minutes before auto-expiry (default: 1440 = 24h) |
| Assign To | string | no | User ID to assign the review to |
| Data | json (expression) | yes | The data to display in the approval form |

### Execution Flow

```
1. Node executes
2. n8n generates a unique resume webhook URL (built-in Wait functionality)
3. POST /api/hitl/webhook/:slug
   Headers: Authorization: Bearer <apiKey>
   Body: {
     callback_url: <n8n resume webhook URL>,
     title, description, priority, timeout_minutes, assign_to,
     data: <mapped from input>
   }
4. Node enters WAITING state (n8n pauses this execution)
5. Human reviews in n8n-console, clicks Approve/Reject
6. n8n-console POSTs decision to callback_url
7. n8n resumes execution
8. Node outputs the decision payload
```

### Output

```json
{
  "request_id": 42,
  "action": "approve",
  "status": "approved",
  "responded_by": "admin",
  "form_data": {
    "notes": "Looks good, approved with minor edits",
    "revised_amount": 11000
  },
  "comment": "Optional reviewer comment",
  "timestamp": "2026-03-17T15:30:00.000Z"
}
```

### Implementation Notes

- Use `INodeType` with `webhook` property for the wait/resume pattern
- Similar to n8n's built-in "Wait" node but with HITL-specific logic
- Reference: `n8n-nodes-base/nodes/Wait/Wait.node.ts` for the webhook resume pattern
- The node should implement `INodeType.webhook()` method to handle the callback
- Set `webhookMethods.default` for automatic webhook registration

### Error Handling

- Template not found → node error with clear message
- Template inactive → node error suggesting to activate in n8n-console
- Timeout expired → node continues with `{ action: "timeout", status: "expired" }`
- n8n-console unreachable → retry logic (3 attempts, exponential backoff)

## Node 2: HITL Trigger (Trigger Node)

### Purpose
Webhook trigger that fires when any HITL approval decision is made. For workflows that want to **react** to decisions rather than wait inline.

### Use Cases
- Audit logging of all approval decisions
- Slack notifications when approvals happen
- Post-processing workflows triggered by approvals
- Workflows where the requesting workflow doesn't need to wait

### Configuration

| Parameter | Type | Description |
|-----------|------|-------------|
| Template Filter | options (dynamic) | Only trigger for specific template (or "All") |
| Action Filter | options | `all`, `approve`, `reject` |

### Implementation

Two options (choose during development):

**Option A: Webhook-based**
- Register a webhook URL in n8n-console settings
- n8n-console POSTs to it on every decision
- Requires: new webhook registration system in n8n-console

**Option B: Polling-based**
- Polls `GET /api/hitl/requests?status=approved,rejected&since=<last_check>`
- Simpler to implement, no n8n-console changes needed
- Trade-off: slight delay (poll interval)

**Recommendation**: Start with Option A. Add a global webhook setting in n8n-console (`Settings > Integrations > HITL Event Webhook URL`) that fires on every status change. This keeps it real-time.

### Required Backend Changes (n8n-console)

Add to `routes/hitl.js` respond endpoint — after updating status and sending callback:

```javascript
// Fire event webhook if configured
const { rows: settings } = await pool.query(
  "SELECT value FROM settings WHERE key = 'hitl_event_webhook'"
);
if (settings.length && settings[0].value) {
  fetch(settings[0].value, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'hitl_decision',
      request_id: hitlReq.id,
      template_slug: hitlReq.template_slug,
      action, status: newStatus,
      responded_by: req.user.username,
      form_data: form_data || {},
      timestamp: new Date().toISOString()
    })
  }).catch(() => {});
}
```

## Development Phases

### Phase 1: Foundation
- [ ] Scaffold package with `npx n8n-node-dev init`
- [ ] Implement `HitlApi` credentials with test method
- [ ] Implement basic `HitlApproval` node (send request, no wait)
- [ ] Test with n8n locally

### Phase 2: Wait/Resume
- [ ] Implement webhook-based wait/resume pattern in `HitlApproval`
- [ ] Handle timeout expiry (auto-resume with expired status)
- [ ] Test full flow: send → wait → human approves → workflow resumes

### Phase 3: Trigger Node
- [ ] Add event webhook system to n8n-console backend
- [ ] Implement `HitlTrigger` node
- [ ] Add template/action filtering

### Phase 4: Polish
- [ ] Custom node icon (matches n8n-console branding)
- [ ] Comprehensive error messages
- [ ] Node documentation (codex entries)
- [ ] Dynamic parameter loading (template list, user list)
- [ ] Test with n8n Cloud compatibility

### Phase 5: Publish
- [ ] npm publish to `n8n-nodes-hitl-approval`
- [ ] Submit to n8n community nodes registry
- [ ] Add install instructions to n8n-console docs
- [ ] README with screenshots and usage examples

## Technical References

- [n8n community node starter](https://github.com/n8n-io/n8n-nodes-starter)
- [Creating n8n community nodes](https://docs.n8n.io/integrations/creating-nodes/)
- [Webhook/wait pattern](https://docs.n8n.io/integrations/creating-nodes/build/programmatic-style-node/#webhook-methods)
- [Dynamic options (loadOptions)](https://docs.n8n.io/integrations/creating-nodes/build/programmatic-style-node/#dynamic-options)
- [Credential testing](https://docs.n8n.io/integrations/creating-nodes/test/test-credentials/)

## n8n-console API Endpoints Used

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/hitl/templates` | API key | List templates (for dropdown) |
| POST | `/api/hitl/webhook/:slug` | API key | Create approval request |
| POST | `/api/hitl/webhook/test/:slug` | API key | Validate without creating |
| GET | `/api/hitl/requests/:id` | API key | Check request status |

## Example Workflow

```
[Trigger: New Invoice]
    → [Extract Data]
    → [HITL Approval: "invoice-approval"]
    → [IF: action == "approve"]
        → Yes: [Process Payment]
        → No: [Send Rejection Email]
```

The HITL Approval node pauses the workflow. The finance team reviews the invoice in n8n-console with all the extracted data displayed in the custom form. They approve or reject, optionally editing amounts or adding notes. The workflow resumes with their decision and form data.
