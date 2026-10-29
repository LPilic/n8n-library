# Vue 3 + @n8n/design-system Port — Conventions

Read-only reference while porting `features/*.tsx` to `features/*.vue`.

## Stack
- Vue 3 `<script setup lang="ts">` SFC single-file-components, one page component per file, `export default` via `<script setup>`.
- vue-router 4: `useRoute()`, `useRouter()`, `<RouterLink>`. `useRoute().params.id` returns `string | string[]` — wrap with `Number(...)`.
- Server state: `@tanstack/vue-query` — `useQuery({ queryKey, queryFn, refetchInterval })` returns refs. Mutations: plain `api.post/put/patch/delete` + `toast` + invalidation via `useQueryClient()` / `useQueryClient().invalidateQueries({ queryKey })`.
- Stores: Pinia (`@/stores/auth|theme|branding|instance|confirm|toast`). Options-style stores; use `storeToRefs()` when destructuring reactive state.
- SSE: `import { useSse } from '@/composables/useSse'` — `useSse('/api/notifications/stream', { onMessage: (event, data) => {} })` (url may be a `ref`).

## Design system (@n8n/design-system) — import from barrel
| Component | API |
|---|---|
| `N8nButton` | `variant="solid"\|"brand"\|"ghost"\|"outline"\|"destructive"\|"success"`, `size="mini"\|"xmini"\|"small"\|"medium"\|"large"\|"xlarge"\|"xsmall"`, `:loading`, `label` or default slot, `icon` (name), emit `click`. Map old primary→brand, secondary→outline, danger→destructive, ghost→ghost |
| `N8nInput` | `v-model`, `type` (text/number/password/email/url), `size`, `placeholder`, `:disabled`, emits `update:modelValue`. Use for text inputs incl. old Textarea (`type="textarea"` not supported — use plain `<textarea class="w-full rounded-md border border-input-border bg-input-bg px-3 py-2 text-[13px] text-text-dark outline-none focus:border-primary">` for multi-line) |
| `N8nSelect` + `N8nOption` | Element-Plus style: `<N8nSelect v-model="x" :filterable="false" size="medium"><N8nOption v-for="o in opts" :key="o.value" :value="o.value" :label="o.label">slot text</N8nOption></N8nSelect>`. Prefer this over CustomSelect for NEW selects |
| `N8nCheckbox` | `v-model` (boolean), label |
| `N8nSwitch` / `N8nToggle` | `v-model` boolean switches |
| `N8nBadge` | `variant="filled"\|"primary"\|"secondary"\|"subtle"\|"outline"\|"ghost"\|"warning"\|"danger"\|"success"\|"info"`, `size="xsmall"\|"small"…` Map old badge-{danger,warning,success,primary,default} → {danger, warning, success, primary, subtle} |
| `N8nTag` | `:text` + `:size="'sm'"\|"md"`. For filter/tag chips |
| `N8nCard` | `:hoverable`; slots: `#header`, `#default`, `#footer`(?) — verify with typecheck; when unsure wrap custom header markup in #header slot |
| `N8nHeading` | `size="small"\|"medium"\|"large"`, `tag="h1\|h2\|h3"`, default slot |
| `N8nText` | `size="xsmall"\|"small"\|"medium"\|"large"`, `color="primary"\|"secondary"\|"muted"\|"danger"\|"success"\|"warning"`…, `:bold`, default slot |
| `N8nAlertDialog` | Confirm dialogs: `:open, title, :description, action-label, action-variant="destructive", cancel-label`, emits `action`, `cancel`, `update:open` |
| `N8nDialog` | Content modals: `:open, size="small\|xlarge\|2xlarge\|full"`, `:header`, `show-close-button`, emits `update:open`. ONLY a #default slot — put footer buttons inside the default content |
| `N8nSpinner` | `size="small\|large"` loading indicator (replaces Loader2/animate-spin) |
| `N8nIcon` | **All icons**: `<N8nIcon icon="kebab-lucide-name" :size="16" class="text-text-muted" />` — `icon` accepts any lucide kebab-case string (`(string & {})`), e.g. `"layout-dashboard"`, `"chart-bar-big"`, `"ellipsis"`, `"circle-x"`, `"chevron-down"`, `"trash-2"`, `"pencil"`, `"user-round-plus"`, `"triangle-alert"`, `"info"`, `"x"`, `"check"`, `"search"`, `"refresh-cw"`, `"external-link"`, `"copy"`, `"play"`, `"clock"`, `"database"`, `"server"`, `"log-out"`, `"settings"`, `"users"`, `"key-round"`, `"shield"`, `"book-open"`, `"ticket"`, `"zap"`, `"activity"`, `"waypoints"`, `"sparkles"`, `"wrench"`, `"tag"`, `"bell"`, `"bell-ring"`, `"message-square-text"`, `"package"`, `"library"`, `"file-text"`, `"link"`, `"code"`, `"arrow-left"` |
| `N8nTooltip` | wrap trigger; label via default slot |
| `N8nTimeAgo` | `:date="isoString"` (relative time, live) — use instead of `timeAgo()` where it updates |
| `N8nCallout` | `theme="info\|success\|warning\|danger\|secondary"`, `icon`, default slot = text |
| `N8nSegmentControl` | segmented options, for old Tabs where simple |
| `N8nTabs` | `v-model`, `<N8nTab value=… label=… />` children — port feature tab bars |
| `N8nPagination` | paginated lists if the React page had its own controls |
| `N8nEmptyState` | `heading, description, button-text, icon` (+ emits click via button) for empty lists |

## Icon mapping rule
`lucide-react` `import { X } from 'lucide-react'` → `<N8nIcon icon="kebab-name" />`. Kebab-Case the camel/PascalCase name and use the CURRENT lucide naming (e.g. `MoreHorizontal`→`ellipsis`, `BarChart3`→`chart-bar-big`, `CheckCircle`/`CheckCircle2`/`CircleCheck`→`circle-check`, `XCircle`→`circle-x`, `AlertTriangle`→`triangle-alert`, `Loader2`→`loader-circle` + `spin` or N8nSpinner, `Plus`→`plus`, `Trash2`→`trash-2`). If truly custom icon grids are required (only IconPicker), use `lucide-vue-next` in that file.

## Styling
- Tailwind v4 utilities port over mostly 1:1 (className→class). Keep layout classes identical.
- Old app CSS variables now map to design-system tokens (defined in `src/index.css` `@theme`): `bg-bg`, `bg-card`, `bg-bg-alt`, `bg-bg-light`, `text-text-dark`, `text-text-base`, `text-text-muted`, `text-text-xmuted`, `border-border`, `border-border-light`, `bg-primary`, `text-primary`, `bg-primary-light`, `bg-success-light`, `bg-danger-light`, `bg-warning-light`, `bg-info-light`, `text-success`, `text-danger`, `text-warning`, `text-info`, `bg-input-bg`, `border-input-border`, `rounded-{xs,sm,md,lg,xl}`, `shadow-card`, `shadow-popover`, plus `dark:` works via `[data-theme="dark"]`.
- **Forbidden**: the legacy `.n8n-btn`, `.n8n-input`, `.n8n-card*`, `.n8n-badge*`, `.n8n-table`, `.n8n-tabs`, `.n8n-modal*`, `.n8n-select-*`, `.n8n-popover*`, `.n8n-label`, `.n8n-hint`, `.n8n-divider`, `.n8n-page-title` custom CSS classes — replace with design-system components or the Tailwind tokens above.
- Shared components available: `@/components/{AppLayout,KpiCard,ConfirmDialog,ToastContainer,CommandPalette,NotificationDropdown,InstanceSelector,CustomSelect,LucideIcon,IconPicker,RichTextEditor,PreviewModal,N8nDemoPreview,NodeFlow,DocsModal,ErrorBoundary}.vue`
  - `<NodeFlow :nodes="wf.nodes" compact previewable @preview="...">`; `previewable` replaces old `onClick`.
  - `<PreviewModal :title="..." :workflow-data="wf" @close="..." />`
  - `<CustomSelect :value="v" :options="[{value,label}]" @change="..."/>` (thin N8nSelect wrapper).
  - `<IconPicker :value="iconName" @change="..."/>`, `<LucideIcon :name="name" :size="18"/>` (PascalCase lucide names).

## Shared helpers
- `import { cn, timeAgo, formatDuration } from '@/lib/utils'` (no `esc()` — Vue escapes template text; use `v-html="sanitizeHtml(x)"` for trusted HTML).
- `import { markdownToHtml } from '@/lib/markdown'`, `import { sanitizeHtml } from '@/lib/sanitize'`, `import { loadNodeIcons, getNodeIconSrc, getNodeFaIcon, getNodeIconEntry } from '@/lib/node-icons'`.
- `import { useHighlight } from '@/composables/useHighlight'` — `const container = useHighlight([refDep])`, put `ref="container"` on the rendered HTML node.
- Toasts: `import { useToast } from '@/stores/toast'` → `const { success, error, warning, info } = useToast()`.
- Confirm: `import { appConfirm } from '@/stores/confirm'` → `if (await appConfirm('Delete?', { danger: true, okLabel: 'Delete' }))`. (Only if the page uses a custom modal for this flow can N8nAlertDialog be used directly.)
- API: `import { api, ApiError } from '@/api/client'` (unchanged).

## Porting rules
1. Port ALL functionality faithfully — every query, mutation, event handler, keyboard shortcut, edge case from the React file. Do not drop features "for simplicity".
2. React → Vue mapping: `useState`→`ref`, `useMemo`→`computed`, `useEffect(()=>{...},[x])`→`watch(() => x, cb, { immediate: true })` or `onMounted`, `useRef`→`ref(null)` template refs, `props`→`defineProps<...>()`, callbacks→`defineEmits`, `{cond && <A/>}`→`<A v-if="cond">`, `.map()`→`v-for`, `key`→`:key`, `className`→`class`, `style={{a:b}}`→`:style="{ a: b }"`, `onClick={()=>f(p)}`→`@click="f(p)"`, `dangerouslySetInnerHTML={{__html: x}}`→`v-html="x"`, `useParams`→`useRoute().params`.
3. Two exported pages in one React file → TWO .vue files (e.g. monitoring.tsx → monitoring.vue + execution-detail.vue). Internal sub-components → either local `<script setup>` helpers below the SFC via additional normal `<script>` blocks are NOT allowed — instead create sibling files `features/<kebab-name>.vue` or plain render helpers within the same SFC using computed data models. Prefer sibling component files with explicit props.
4. Do NOT modify: `index.css`, `router.ts`, `App.vue`, `main.ts`, `stores/*`, `api/*`, `components/*` (shared). If you need a change there, note it in your final report instead.
5. Do NOT run `npm run build` or `vue-tsc` (a central typecheck happens afterwards). Double-check imports and types carefully by hand.
6. Types from React ports: keep the same interfaces; put shared page-local types in the SFC. Prefer `Record<string, unknown>` casts identical to the React file.
7. Keep file-level comments; translate component tree structure; keep data-test semantics where present.
8. Charts: `react-chartjs-2` → `vue-chartjs` (`import { Line, Bar, Doughnut } from 'vue-chartjs'`), same `data`/`options` objects via `computed` (pass `:data`/`:options`).
9. DnD (approvals builder only): `@dnd-kit/*` → `vue-draggable-plus` (`useDraggable`/`useDroppable` composables or `<VueDraggable>`).
10. When a route param drives the page (`/:id`), `watch(() => route.params.id, load, { immediate: true })`.