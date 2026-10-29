# Approvals (HITL) — Feature Parity Plan

## Current State
The React approvals has basic request list + template CRUD but is missing the visual form builder entirely. The form renderer works for basic components but lacks formatting features.

## Gap Summary

### CRITICAL (entire subsystems missing)
1. **Three-panel drag-and-drop form builder** — palette, canvas, properties panel
2. **Webhook capture** — listen for incoming payload, auto-populate data fields
3. **Preview mode** — toggle builder ↔ live form preview with sample data
4. **Navigation links** between Approvals ↔ Form Builder pages

### HIGH (significant feature gaps)
5. **Tab granularity** — need Pending/Approved/Rejected/Expired/All (not just Pending/Completed/All)
6. **Request fields** — priority, title, description, response_comment, responded_by_name
7. **Webhook URLs + cURL** — PROD/TEST URLs in editor with copy + cURL buttons
8. **Template list as table** — matching legacy layout (Active toggle, Slug, Requests, Status, Updated, Actions)
9. **Badge threshold schema** — legacy uses `{"0.7":"danger"}` string, React expects typed array
10. **Confirm on reject** — appConfirm before reject action

### MEDIUM (feature differences)
11. **`{{field}}` interpolation** in text/data-display components
12. **Data-display formats** — currency, markdown, date
13. **Text markdown support** — format: 'markdown' option
14. **Template list updated_at** — React uses created_at (bug)
15. **Schema validation** — require ≥1 component before save
16. **Empty state messages** — status-specific ("No pending requests")
17. **Required field validation** on form submit

---

## Phase 1 — Navigation + Tab Fixes + Quick Wins

### Tasks:
1. Add "Form Builder" button on ApprovalsPage (top-right, links to /approvals-builder)
2. Add "Back to Approvals" button on ApprovalsBuilderPage
3. Change tabs from Pending/Completed/All → Pending/Approved/Rejected/Expired/All
4. Fix template list `created_at` → `updated_at`
5. Add `appConfirm` on reject action
6. Status-specific empty state messages
7. Add schema validation (require ≥1 component)

### Verification:
- [ ] "Form Builder" button visible on approvals page
- [ ] "Back to Approvals" visible on builder page
- [ ] 5 tabs work correctly with proper API filters
- [ ] Reject shows confirmation dialog
- [ ] Empty template schema shows error on save

---

## Phase 2 — Template List as Table + Request Detail Enhancement

### Tasks:
1. Rewrite template list from cards to table matching legacy:
   - Columns: Active toggle, Template (name + description), Slug, Requests, Status, Updated, Actions
   - Table count footer
2. Add missing request fields to the type and detail view:
   - `responded_by_name` display
   - `response_comment` display
   - Priority dot on request rows
3. Expand rows inline (click to reveal) instead of side panel

### Verification:
- [ ] Template list is a table with all columns
- [ ] Request detail shows "approved by admin on DATE"
- [ ] Response comment visible in expanded row

---

## Phase 3 — Form Builder Three-Panel Layout

**This is the biggest phase.** The visual drag-and-drop builder.

### Tasks:
1. Replace `TemplateModal` with a full-page builder view when creating/editing
2. Three panels:
   - **Left**: Component palette (categorized: Display, Input, Layout, Actions) with draggable items
   - **Center**: Canvas with drop zones, component headers with colored labels, delete buttons, click-to-select
   - **Right**: Properties panel for selected component (dynamic fields per type)
3. Use `@dnd-kit/core` for drag-and-drop (or implement with native HTML5 DnD)
4. Component types matching legacy: heading, text, data-display, json-viewer, image, badge, divider, spacer, text-input, textarea, select, checkbox, radio, number, columns, section, button-group
5. Component previews in canvas (inline rendering of props)

### Verification:
- [ ] Three-panel layout visible
- [ ] Components draggable from palette to canvas
- [ ] Click component → properties panel shows editable fields
- [ ] Nested columns work
- [ ] Save produces valid schema JSON

---

## Phase 4 — Webhook Capture + Data Fields

### Tasks:
1. "Data Fields" section in left palette below components
2. Webhook listen button → POST /api/hitl/capture → shows capture URL
3. Poll for captured data (GET /api/hitl/capture/:token)
4. Auto-infer field types (score, number, boolean, image, longtext, array, object)
5. Draggable field chips → auto-create appropriate component
6. Stop listening button → DELETE /api/hitl/capture/:token

### Verification:
- [ ] "Listening for webhook..." status visible
- [ ] Captured data populates field list
- [ ] Dragging a field creates appropriate component

---

## Phase 5 — Preview Mode + Webhook URLs

### Tasks:
1. Preview/Builder toggle button in top bar
2. Preview mode: sample data JSON textarea (left) + live form render (right)
3. Form rendered using HitlFormRenderer with interpolated sample data
4. Webhook URLs section: PROD + TEST URLs with copy + cURL buttons
5. cURL button generates full curl command with schema-derived fields

### Verification:
- [ ] Preview toggle switches between builder and preview
- [ ] Sample data renders in form preview
- [ ] Webhook URLs update when slug changes
- [ ] cURL button copies correct command

---

## Phase 6 — Form Renderer Enhancements

### Tasks:
1. `{{field}}` template interpolation in text content
2. Data-display formats: currency ($X,XXX), markdown, date
3. Text component: markdown format option
4. Badge threshold: support both legacy `{"0.7":"danger"}` string format AND typed array
5. Number input: min/max attributes
6. Required field validation + red highlight on submit

### Verification:
- [ ] `{{customer_name}}` resolves to actual data value
- [ ] Currency values show with $ and commas
- [ ] Badge colors match threshold values
- [ ] Required fields highlighted on empty submit

---

## Priority Order

| Phase | Effort | Impact |
|-------|--------|--------|
| 1 | Small | High — fixes navigation and basic UX |
| 2 | Medium | High — matches legacy layout |
| 3 | Very Large | Critical — the core builder feature |
| 4 | Large | High — enables real HITL workflows |
| 5 | Medium | Medium — polish and preview |
| 6 | Medium | Medium — renderer parity |

**Note:** Phase 3 (the drag-and-drop builder) is the most complex single feature in the entire app (1429 lines in legacy). It may need to be broken into sub-phases or implemented incrementally.
