# Settings & AI Config — Feature Parity Plan

## Architecture Note
Legacy: single scrollable page with all sections visible. React: tabbed sidebar. The tabbed approach is fine — no need to change to scrollable.

## Current State
- **8 sections implemented** (Users, Instances, SMTP, API Keys, Export/Import, 2FA, Categories partial, Branding partial)
- **4 "Coming soon" placeholders** (Email Templates, Webhooks, AI, MCP)
- **1 missing entirely** (Alerts — already on separate /alerts page in React)

---

## Phase 1 — Branding Enhancement

### Currently: App Name + Logo URL + Primary Color only
### Needed (from screenshot):
- **Logo upload** (click to upload PNG/JPG/SVG, not just URL input)
- **Theme selector**: Light / Dark / System radio buttons
- **7 color fields** with color picker + hex input:
  - Primary, Primary Hover, Background, Sidebar, Card, Text, Text Dark
- **Reset to Defaults** button
- **Live preview card** (shows branding applied to a sample card with logo, name, badges)

### API:
- `GET /api/settings/branding` → key-value pairs
- `PUT /api/settings/branding` → saves all branding keys

### Verification:
- [ ] Logo upload works (file → base64 → saved)
- [ ] Theme radio buttons change theme
- [ ] All 7 color fields show color pickers
- [ ] Reset to Defaults resets all values
- [ ] Live preview card updates in real-time

---

## Phase 2 — Email Templates

### Needed (from screenshot):
- **Template selector** dropdown (Password Reset, Ticket New, Ticket Status, etc.)
- **Subject** input
- **Body** HTML textarea (monospace, multi-line)
- **Available Variables** list below textarea:
  - `{{app_name}}`, `{{primary_color}}`, `{{primary_hover}}`, `{{logo_url}}`, `{{username}}`, `{{reset_url}}` etc.
  - Clickable to insert into body
- **Live preview** — iframe or rendered HTML panel showing the email
- **Save Template** + **Reset to Default** buttons

### API:
- `GET /api/settings/email-templates` → `{templates: {key: {label, subject, body}}}`
- `PUT /api/settings/email-templates` → batch save
- `POST /api/settings/email-templates/reset` → reset one template
- `POST /api/settings/email-templates/preview` → `{subject, html}` rendered preview

### Verification:
- [ ] Template dropdown shows all template types
- [ ] Subject and body load for selected template
- [ ] Variable click inserts into body textarea
- [ ] Preview shows rendered HTML
- [ ] Save and Reset work

---

## Phase 3 — Webhooks

### Needed (from screenshot):
- **Webhook list** with: enabled dot, name, URL, events, test/edit/delete buttons
- **"+ New Webhook"** button
- **Create/Edit form**: Name, URL, Events (checkboxes), Custom Headers (JSON), Secret, Enable toggle
- **Test fire** button (sends test payload)
- **Delete** with confirmation

### API:
- `GET /api/webhooks` → `{webhooks: [...], events: [event_names]}`
- `POST /api/webhooks` → create
- `PUT /api/webhooks/:id` → update
- `DELETE /api/webhooks/:id` → delete
- `POST /api/webhooks/:id/test` → test fire

### Verification:
- [ ] Webhook list renders with all columns
- [ ] Create webhook with events works
- [ ] Test fire returns success/failure
- [ ] Delete with confirmation

---

## Phase 4 — AI Configuration (separate page or tab)

### Needed (from screenshots — this is at /ai in legacy):

**LLM Provider section:**
- Provider dropdown (Anthropic Claude / OpenAI / Ollama / etc.)
- API Key input (hidden for Ollama)
- Model dropdown + "Fetch Models" button
- Base URL (optional, for Ollama/custom endpoints)
- Daily Summary Hour (0-23, empty to disable)
- Save button

**System Prompts section:**
- 4 editable textareas:
  - Workflow Description
  - Workflow Documentation
  - Error Analysis
  - Daily Summary
- Each with "Reset to Default" button
- "Save Prompts" button

**MCP Servers section (AI clients):**
- List of connected MCP servers: name, URL (http/stdio), status badge (connected/error + tool count), reconnect/edit/delete
- "+ Add MCP Server" button
- Create/Edit modal: Name, Transport type (http/stdio), URL or Command+Args+Env, Auth header

### API:
- `GET /api/settings/ai` → `{provider, model, base_url, daily_summary_hour}`
- `PUT /api/settings/ai` → save AI config
- `POST /api/ai/models` → fetch available models for provider
- `GET /api/settings/ai-prompts` → `{workflow_description, workflow_documentation, error_analysis, daily_summary}`
- `PUT /api/settings/ai-prompts` → save prompts
- `GET /api/mcp/servers` → `{servers: [{id, name, transport_type, url, status, toolCount, error}]}`
- `POST /api/mcp/servers` → create
- `PUT /api/mcp/servers/:id` → update
- `DELETE /api/mcp/servers/:id` → delete
- `POST /api/mcp/servers/:id/reconnect` → reconnect

### Verification:
- [ ] Provider dropdown changes visible fields
- [ ] Fetch Models populates model dropdown
- [ ] Save AI settings works
- [ ] System prompts load and save
- [ ] Reset to Default resets individual prompts
- [ ] MCP server list shows status + tool count
- [ ] Add/edit/delete/reconnect MCP servers

---

## Phase 5 — MCP Server (Built-in)

### Needed (from screenshot):
- **Enable/Disable toggle** for the built-in MCP server
- **Endpoint display**: HTTP endpoint URL + stdio command
- **Per-tool toggles**: search_templates, get_template, list_tickets, get_ticket, create_ticket, search_kb_articles, get_kb_article, get_stats, list_users

### API:
- `GET /api/settings/mcp-server` → `{enabled}`
- `PUT /api/settings/mcp-server` → toggle
- `GET /api/settings/mcp-server-tools` → `{tools: [{name, enabled}]}`
- `PUT /api/settings/mcp-server-tools` → toggle individual tool

### Verification:
- [ ] Toggle enables/disables MCP server
- [ ] Tool list shows with individual toggles
- [ ] Endpoint URLs display correctly

---

## Phase 6 — Categories Enhancement

### Currently: workflow categories only, name + icon
### Needed:
- **3 category types**: Workflow, Service Desk, Knowledge Base (type switcher)
- **Additional fields**: description (rich text or plain), slug, sort_order
- **Font Awesome icon picker** or searchable icon selector

### Verification:
- [ ] Type switcher shows 3 types
- [ ] Each type loads its own categories
- [ ] Description, slug, sort_order fields in modal

---

## Priority Order

| Phase | Effort | Impact |
|-------|--------|--------|
| 4 | Large | Critical — AI config needed for all AI features |
| 1 | Medium | High — branding is visible everywhere |
| 2 | Large | Medium — email templates for notifications |
| 3 | Medium | Medium — webhook integrations |
| 5 | Small | Medium — MCP server management |
| 6 | Small | Low — categories are functional enough |
