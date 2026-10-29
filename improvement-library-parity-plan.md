# Library & Workflows — Legacy Parity Implementation Plan

## Architecture Summary

The legacy library has **7 distinct user flows** that involve modals, AI calls, and the `<n8n-demo>` web component. The React frontend is missing significant pieces.

### Gap Matrix

| Flow | Legacy | React Status | Priority |
|------|--------|-------------|----------|
| Preview modal (n8n-demo) | Click node flow → full canvas | n8n page: DONE. Library: **MISSING onClick** | HIGH |
| Edit template | Full modal (name + Quill + categories + n8n-demo preview + AI docs) | Partial: textarea, no preview, no AI docs inside | HIGH |
| Generate Docs | Modal with loading → rendered HTML → "Save to KB" button | **MISSING** — just a toast, no modal, no save-to-KB | HIGH |
| Import workflow | Modal (name + Quill + categories + n8n-demo + AI name/desc) | Partial: textarea, has preview, **no AI name/desc buttons** | MEDIUM |
| AI Rename | Loading on button → generate → PATCH n8n → re-render | Partial: loading works, but doesn't PATCH n8n | MEDIUM |
| Version history | Modal with versions + restore | DONE | OK |
| Save to KB from docs | POST /api/kb/articles with draft + tags | **MISSING** | HIGH |

---

## Phase 1 — Docs Modal with Save-to-KB

**What:** Create a `DocsModal` component that matches the legacy `#docModal`. This is the most impactful missing feature.

**Legacy flow** (`ai.js:722-787`):
1. Opens modal immediately with loading spinner
2. POSTs `/api/ai/document-workflow` with `{ nodes, connections, workflowName }`
3. On success: renders HTML documentation in the modal body
4. Shows "Save to Knowledge Base" button
5. On save: POSTs `/api/kb/articles` with `{ title: "<name> — Documentation", body: html, excerpt: "Auto-generated...", status: "draft", tags: ["workflow-docs", "auto-generated"] }`
6. On save success: changes button to "View in KB" → navigates to `/kb/:id`

**Implementation:**
- Create `frontend/src/components/DocsModal.tsx`
- Props: `{ workflowName: string; nodes: unknown[]; connections: unknown; onClose: () => void }`
- States: `loading`, `html`, `error`, `saved`, `articleId`
- Use from both Library and n8n Workflows pages

**API endpoints:**
- `POST /api/ai/document-workflow` → `{ documentation: string }`
- `POST /api/kb/articles` → `{ id, ... }`

**Verification:**
- [ ] Modal opens with loading state
- [ ] Documentation HTML renders in modal
- [ ] "Save to KB" button creates draft article
- [ ] Button changes to "View in KB" after save

---

## Phase 2 — Library Preview Modal

**What:** Wire the NodeFlow `onClick` in library cards to open a preview modal.

**Legacy flow** (`library.js:428-461`):
1. Checks `libraryWorkflowCache[id]` (pre-cached during `loadLibraryPreviews`)
2. If not cached, fetches `GET /workflows/templates/${id}`
3. Opens modal with `<n8n-demo>` web component

**Implementation:**
- Add `previewWf` state to `LibraryPage`
- Add a `PreviewModal` (can reuse from n8n-workflows.tsx or extract shared)
- Pass `onClick` to `NodeFlow` in `TemplateCard` that fetches workflow data and opens preview
- Pre-cache workflow data using the `['template-meta', id]` query (already used by edit modal)

**Verification:**
- [ ] Clicking node flow area on library card opens n8n-demo preview
- [ ] "Preview" text appears on hover over node flow
- [ ] Preview modal shows full workflow canvas

---

## Phase 3 — Docs Integration in Cards

**What:** Replace the inline `generateDocs()` in `TemplateCard` with the `DocsModal`.

**Current:** Library Docs button does `api.post('/api/ai/document-workflow')` inline and shows a toast. No modal, no save-to-KB.

**Fix:** Open `DocsModal` instead. Same for n8n workflows page.

**Implementation:**
- Library: Add `docsTemplate` state → when set, render `<DocsModal>` with workflow data
- n8n Workflows: Replace `handleDocs` with opening `DocsModal`
- Both need to fetch workflow nodes/connections from cache

**Verification:**
- [ ] Library "Docs" button opens DocsModal
- [ ] n8n "Docs" button opens DocsModal
- [ ] Modal shows generated docs with "Save to KB" button

---

## Phase 4 — Import Modal AI Buttons

**What:** Add "AI Generate Name" and "AI Generate Description" buttons to the import modal.

**Legacy flow:**
- `aiGenerateImportName()` (`ai.js:609-634`): POSTs `/api/ai/name-workflow` → sets name input
- `aiGenerateImportDescription()` (`ai.js:636-661`): POSTs `/api/ai/describe-workflow` → sets description editor

**Implementation:**
- Add two buttons next to the Name and Description labels in `ImportModal`
- Each shows loading state, calls the respective API, sets the form value
- Only show if `aiEnabled`

**API endpoints:**
- `POST /api/ai/name-workflow` → `{ name }`
- `POST /api/ai/describe-workflow` → `{ description }`

**Verification:**
- [ ] "Generate" button appears next to Name when AI configured
- [ ] "Generate" button appears next to Description
- [ ] Clicking generates and fills the field

---

## Phase 5 — Edit Modal Enhancement

**What:** Add n8n-demo preview to the edit template modal.

**Legacy flow** (`library.js:60-93`):
- Fetches both metadata AND full workflow JSON in parallel
- Shows n8n-demo preview above the form fields
- Has "Generate Docs" button in the header

**Implementation:**
- In `EditTemplateModal`, also fetch `GET /workflows/templates/${id}` for the full workflow
- Add `<N8nDemoPreview>` component above the form fields
- Add "Generate Docs" button that opens `DocsModal`

**Verification:**
- [ ] Edit modal shows workflow canvas preview
- [ ] "Generate Docs" button in edit modal header opens DocsModal

---

## Phase 6 — Verification

- [ ] Library: click node flow → preview modal with n8n-demo
- [ ] Library: click Docs → modal with loading → HTML → save to KB
- [ ] Library: click Edit → modal with n8n-demo preview + form
- [ ] n8n: click node flow → preview modal
- [ ] n8n: click Docs → same DocsModal
- [ ] n8n: click Import → modal with preview + AI name/desc buttons
- [ ] n8n: click Rename → button shows loading, name updates
- [ ] KB article created as draft with "workflow-docs" tag
- [ ] "View in KB" navigates correctly
