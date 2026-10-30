<script setup lang="ts">
/* -------------------------------------------------------------------------- */
/*  ApprovalsPage — port of src/features/approvals.tsx                         */
/*  Approval requests inbox with SSE updates, approve/reject decisions and a    */
/*  sticky detail panel that renders the template schema.                       */
/*  (ApprovalsBuilderPage + the deprecated TemplateModal live in                */
/*  approvals-builder.vue / hitl-form-builder.vue.)                             */
/* -------------------------------------------------------------------------- */

import {
  defineComponent,
  h,
  computed,
  ref,
  watch,
  type PropType,
  type VNode,
} from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nBadge, N8nButton, N8nHeading, N8nIcon, N8nTimeAgo } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { appConfirm } from '@/stores/confirm'
import { useSse } from '@/composables/useSse'
import { useToast } from '@/stores/toast'
import { cn } from '@/lib/utils'
import CustomSelect from '@/components/CustomSelect.vue'

// --- Types --------------------------------------------------------------------

type RequestStatus = 'pending' | 'approved' | 'rejected' | 'expired'

interface HitlRequest {
  id: number
  template_id: number
  template_name: string
  status: RequestStatus
  submitted_data: Record<string, unknown>
  response_data?: Record<string, unknown>
  created_at: string
  responded_at?: string
  responded_by_name?: string
  response_comment?: string
  schema?: SchemaComponent[]
}

interface RequestsResponse {
  requests: HitlRequest[]
  total: number
  pending_count: number
}

// --- Schema types (server format, mirror the React file) ----------------------

type ComponentType =
  | 'heading' | 'text' | 'data-display' | 'json-viewer' | 'image' | 'badge' | 'divider' | 'spacer'
  | 'text-input' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'number'
  | 'columns' | 'section' | 'button-group'

interface SchemaComponent {
  type: ComponentType
  id?: string
  field?: string
  label?: string
  text?: string
  level?: number
  height?: number
  options?: Array<{ label: string; value: string }>
  children?: SchemaComponent[]
  title?: string
  thresholds?: Array<{ value: number; color: string; label: string }>
  src?: string
  alt?: string
  placeholder?: string
  required?: boolean
  format?: string
  name?: string
  props?: Record<string, unknown>
}

// --- Helpers ------------------------------------------------------------------

/** N8nBadge variant for a status pill (like the React statusColor classes) */
function statusBadgeVariant(status: RequestStatus): 'warning' | 'success' | 'danger' | 'subtle' {
  switch (status) {
    case 'pending': return 'warning'
    case 'approved': return 'success'
    case 'rejected': return 'danger'
    default: return 'subtle' // expired (and defensive: changes_requested)
  }
}

function statusIconName(status: RequestStatus): string {
  if (status === 'approved') return 'circle-check'
  if (status === 'rejected') return 'circle-x'
  return 'clock' // pending / expired
}

function statusIconClass(status: RequestStatus): string {
  switch (status) {
    case 'pending': return 'text-warning'
    case 'approved': return 'text-success'
    case 'rejected': return 'text-danger'
    case 'expired': return 'text-text-xmuted'
  }
}

type StatusTab = 'pending' | 'approved' | 'rejected' | 'expired' | 'all'

const TABS: { key: StatusTab; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'expired', label: 'Expired' },
  { key: 'all', label: 'All' },
]

const TAB_EMPTY_MESSAGES: Record<StatusTab, string> = {
  pending: 'No pending requests',
  approved: 'No approved requests',
  rejected: 'No rejected requests',
  expired: 'No expired requests',
  all: 'No requests found',
}

/** Resolve {{field.path}} templates with data values */
function resolveTemplate(text: string, data: Record<string, unknown>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_m, path: string) => {
    const parts = path.trim().split('.')
    let val: unknown = data
    for (const p of parts) {
      if (val && typeof val === 'object') val = (val as Record<string, unknown>)[p]
      else return `{{${path}}}`
    }
    return val !== undefined && val !== null ? String(val) : `{{${path}}}`
  })
}

function dataEntriesOf(obj: Record<string, unknown> | undefined): Array<[string, unknown]> {
  return Object.entries(obj || {})
}

/* --- HitlFormRenderer (recursive render helper, parity with the React file) --- */

interface RenderCtx {
  data: Record<string, unknown>
  responseData: Record<string, unknown>
  handleChange: (field: string, value: unknown) => void
  readOnly?: boolean
}

function renderCompNode(comp: SchemaComponent, ctx: RenderCtx, key?: number | string): VNode | null {
  const field = comp.field ?? ''
  const displayValue = field ? String(ctx.data[field] ?? '') : ''
  const inputValue = field ? (ctx.responseData[field] ?? '') : ''

  switch (comp.type) {
    case 'heading': {
      const Tag = (['h1', 'h2', 'h3', 'h4'] as const)[Math.min((comp.level ?? 3) - 1, 3)]
      return h(Tag, {
        key,
        class: cn('font-semibold text-text-dark', comp.level === 1 ? 'text-base' : 'text-sm'),
      }, resolveTemplate(String(comp.text ?? comp.label ?? ''), ctx.data))
    }

    case 'text':
      return h('p', { key, class: 'text-sm text-text-muted' }, resolveTemplate(String(comp.text ?? displayValue), ctx.data))

    case 'data-display': {
      let formatted = displayValue
      if (comp.format === 'currency' && displayValue) formatted = `$${Number(displayValue).toLocaleString()}`
      else if (comp.format === 'date' && displayValue) formatted = new Date(displayValue).toLocaleDateString()
      return h('div', { key, class: 'flex flex-col gap-0.5' }, [
        comp.label
          ? h('span', { class: 'text-[10px] font-semibold uppercase text-text-xmuted' }, resolveTemplate(String(comp.label), ctx.data))
          : null,
        formatted
          ? h('span', { class: 'text-sm text-text-dark' }, formatted)
          : h('span', { class: 'text-sm text-text-dark' }, [h('span', { class: 'text-text-xmuted italic' }, '--')]),
      ])
    }

    case 'json-viewer':
      return h('div', { key, class: 'flex flex-col gap-0.5' }, [
        comp.label ? h('span', { class: 'text-[10px] font-semibold uppercase text-text-xmuted' }, comp.label) : null,
        h(
          'pre',
          { class: 'max-h-40 overflow-auto rounded-sm border border-border bg-bg p-2 font-mono text-[11px] text-text-muted' },
          JSON.stringify(field ? ctx.data[field] : ctx.data, null, 2),
        ),
      ])

    case 'image':
      return comp.src || displayValue
        ? h('img', {
            key,
            src: String(comp.src || displayValue),
            alt: comp.alt ?? '',
            class: 'max-h-40 rounded border border-border object-contain',
          })
        : null

    case 'badge': {
      const numVal = Number(displayValue)
      const matched = (comp.thresholds ?? []).find((t) => numVal >= t.value)
      const color = matched?.color ?? 'bg-border-light text-text-muted'
      const label = matched?.label ?? displayValue
      return h('span', { key, class: cn('rounded px-1.5 py-0.5 font-medium text-[10px]', color) }, label)
    }

    case 'divider':
      return h('hr', { key, class: 'border-border-light' })

    case 'spacer':
      return h('div', { key, style: { height: `${comp.height ?? 16}px` } })

    case 'text-input':
      return h('div', { key, class: 'flex flex-col gap-1' }, [
        comp.label
          ? h('label', { class: 'text-xs font-medium text-text-muted' }, [
              comp.label,
              comp.required ? h('span', { class: 'ml-0.5 text-danger' }, '*') : null,
            ])
          : null,
        h('input', {
          type: 'text',
          value: String(inputValue),
          onInput: (e: Event) => ctx.handleChange(field, (e.target as HTMLInputElement).value),
          disabled: ctx.readOnly,
          placeholder: comp.placeholder ?? '',
          class: 'w-full rounded-sm border border-input-border bg-input-bg px-3 py-1.5 text-sm text-text-dark outline-none focus:border-input-focus disabled:opacity-60',
        }),
      ])

    case 'textarea':
      return h('div', { key, class: 'flex flex-col gap-1' }, [
        comp.label
          ? h('label', { class: 'text-xs font-medium text-text-muted' }, [
              comp.label,
              comp.required ? h('span', { class: 'ml-0.5 text-danger' }, '*') : null,
            ])
          : null,
        h('textarea', {
          value: String(inputValue),
          onInput: (e: Event) => ctx.handleChange(field, (e.target as HTMLTextAreaElement).value),
          disabled: ctx.readOnly,
          rows: 3,
          placeholder: comp.placeholder ?? '',
          class: 'w-full resize-none rounded-sm border border-input-border bg-input-bg px-3 py-1.5 text-sm text-text-dark outline-none focus:border-input-focus disabled:opacity-60',
        }),
      ])

    case 'select':
      return h('div', { key, class: 'flex flex-col gap-1' }, [
        comp.label
          ? h('label', { class: 'text-xs font-medium text-text-muted' }, [
              comp.label,
              comp.required ? h('span', { class: 'ml-0.5 text-danger' }, '*') : null,
            ])
          : null,
        h(CustomSelect, {
          value: String(inputValue),
          onChange: (v: unknown) => ctx.handleChange(field, String(v)),
          disabled: ctx.readOnly,
          placeholder: 'Select...',
          options: [{ value: '', label: 'Select...' }, ...(comp.options ?? []).map((o) => ({ value: o.value, label: o.label }))],
          class: 'w-full',
        }),
      ])

    case 'checkbox':
      return h('label', {
        key,
        class: cn('flex cursor-pointer items-center gap-2', ctx.readOnly && 'pointer-events-none opacity-60'),
      }, [
        h('input', {
          type: 'checkbox',
          checked: Boolean(inputValue),
          onChange: (e: Event) => ctx.handleChange(field, (e.target as HTMLInputElement).checked),
          disabled: ctx.readOnly,
          class: 'h-3.5 w-3.5',
        }),
        h('span', { class: 'text-xs text-text-muted' }, comp.label ?? field),
      ])

    case 'radio':
      return h('div', { key, class: 'flex flex-col gap-1' }, [
        comp.label
          ? h('span', { class: 'text-xs font-medium text-text-muted' }, [
              comp.label,
              comp.required ? h('span', { class: 'ml-0.5 text-danger' }, '*') : null,
            ])
          : null,
        h('div', { class: 'flex flex-wrap gap-3' }, (comp.options ?? []).map((o) =>
          h('label', {
            key: o.value,
            class: cn('flex cursor-pointer items-center gap-1.5', ctx.readOnly && 'pointer-events-none opacity-60'),
          }, [
            h('input', {
              type: 'radio',
              name: field,
              value: o.value,
              checked: String(inputValue) === o.value,
              onChange: () => ctx.handleChange(field, o.value),
              disabled: ctx.readOnly,
              class: 'h-3 w-3',
            }),
            h('span', { class: 'text-xs text-text-muted' }, o.label),
          ]))),
      ])

    case 'number':
      return h('div', { key, class: 'flex flex-col gap-1' }, [
        comp.label
          ? h('label', { class: 'text-xs font-medium text-text-muted' }, [
              comp.label,
              comp.required ? h('span', { class: 'ml-0.5 text-danger' }, '*') : null,
            ])
          : null,
        h('input', {
          type: 'number',
          value: String(inputValue),
          onInput: (e: Event) => ctx.handleChange(field, (e.target as HTMLInputElement).value),
          disabled: ctx.readOnly,
          placeholder: comp.placeholder ?? '',
          class: 'w-full rounded-sm border border-input-border bg-input-bg px-3 py-1.5 text-sm text-text-dark outline-none focus:border-input-focus disabled:opacity-60',
        }),
      ])

    case 'section':
      return h('div', { key, class: 'overflow-hidden rounded-md border border-border' }, [
        comp.title
          ? h('div', { class: 'border-b border-border-light bg-bg px-3 py-2' }, [
              h('span', { class: 'text-xs font-semibold uppercase text-text-muted' }, resolveTemplate(comp.title, ctx.data)),
            ])
          : null,
        h('div', { class: 'space-y-3 p-3' }, (comp.children ?? []).map((child, i) =>
          h(RenderComponent, {
            key: i,
            comp: child,
            data: ctx.data,
            responseData: ctx.responseData,
            handleChange: ctx.handleChange,
            readOnly: ctx.readOnly,
          }))),
      ])

    case 'columns':
      return h('div', { key, class: 'flex flex-wrap gap-3' }, (comp.children ?? []).map((child, i) =>
        h('div', { key: i, class: 'min-w-0 flex-1 space-y-3' }, [
          h(RenderComponent, {
            comp: child,
            data: ctx.data,
            responseData: ctx.responseData,
            handleChange: ctx.handleChange,
            readOnly: ctx.readOnly,
          }),
        ])))

    case 'button-group':
      return null // handled externally by approve/reject buttons

    default:
      return null
  }
}

const RenderComponent = defineComponent({
  name: 'HitlRenderComponent',
  props: {
    comp: { type: Object as PropType<SchemaComponent>, required: true },
    data: { type: Object as PropType<Record<string, unknown>>, required: true },
    responseData: { type: Object as PropType<Record<string, unknown>>, required: true },
    handleChange: { type: Function as PropType<(field: string, value: unknown) => void>, required: true },
    readOnly: { type: Boolean, default: false },
  },
  setup(p) {
    return () =>
      renderCompNode(p.comp, {
        data: p.data,
        responseData: p.responseData,
        handleChange: p.handleChange,
        readOnly: p.readOnly,
      })
  },
})

/* -------------------------------------------------------------------------- */
/*  ApprovalsPage                                                            */
/* -------------------------------------------------------------------------- */

const { error: showError, success: showSuccess } = useToast()
const queryClient = useQueryClient()
const router = useRouter()

const tab = ref<StatusTab>('pending')
const page = ref(1)
const selectedRequest = ref<HitlRequest | null>(null)

const statusParam = computed(() => (tab.value === 'all' ? '' : tab.value))

const { data, isLoading } = useQuery({
  queryKey: ['hitl-requests', statusParam, page],
  queryFn: () => {
    const params = new URLSearchParams({ page: String(page.value), limit: '20' })
    if (statusParam.value) params.set('status', statusParam.value)
    return api.get<RequestsResponse>(`/api/hitl/requests?${params}`)
  },
})

// SSE for real-time new request notifications
useSse('/api/hitl/stream', {
  onMessage: (event: string) => {
    if (event === 'hitl') {
      queryClient.invalidateQueries({ queryKey: ['hitl-requests'] })
      queryClient.invalidateQueries({ queryKey: ['hitl-pending-count'] })
    }
  },
})

const { data: pendingCountData } = useQuery({
  queryKey: ['hitl-pending-count'],
  queryFn: () => api.get<{ count: number }>('/api/hitl/pending-count'),
  refetchInterval: 30_000,
})

const pendingCount = computed(
  () => pendingCountData.value?.count ?? data.value?.pending_count ?? 0,
)
const requests = computed<HitlRequest[]>(() => data.value?.requests ?? [])
const total = computed(() => data.value?.total ?? 0)
const totalPages = computed(() => Math.ceil(total.value / 20))

function setPage(next: number) {
  page.value = next
}

function selectTab(next: StatusTab) {
  tab.value = next
  page.value = 1
  selectedRequest.value = null
}

function toggleCard(req: HitlRequest) {
  selectedRequest.value = selectedRequest.value?.id === req.id ? null : req
}

function previewEntriesOf(req: HitlRequest): Array<[string, unknown]> {
  return Object.entries(req.submitted_data || {}).slice(0, 3)
}

function trimText(value: unknown): string {
  return String(value).slice(0, 40)
}

/* --- Detail panel ------------------------------------------------------------ */

const responseData = ref<Record<string, unknown>>({})
const responding = ref(false)

// Reset the draft response whenever another request is opened
watch(() => selectedRequest.value?.id, () => {
  responseData.value = {}
})

const { data: detail, isLoading: detailLoading } = useQuery({
  queryKey: ['hitl-request-detail', () => selectedRequest.value?.id],
  queryFn: () => api.get<HitlRequest>(`/api/hitl/requests/${selectedRequest.value!.id}`),
  enabled: computed(() => !!selectedRequest.value),
})

const req = computed<HitlRequest | null>(() => detail.value ?? selectedRequest.value)
const schema = computed<SchemaComponent[]>(() => req.value?.schema ?? [])
const isPending = computed(() => req.value?.status === 'pending')

const hasResponseData = computed(() => {
  const rd = req.value?.response_data
  return !!rd && Object.keys(rd).length > 0
})

function handleChange(field: string, value: unknown) {
  responseData.value = { ...responseData.value, [field]: value }
}

async function submitResponse(action: 'approve' | 'reject') {
  if (!selectedRequest.value || responding.value) return
  responding.value = true
  try {
    await api.post(`/api/hitl/requests/${selectedRequest.value.id}/respond`, {
      action,
      response_data: responseData.value,
    })
    selectedRequest.value = null
    queryClient.invalidateQueries({ queryKey: ['hitl-requests'] })
    queryClient.invalidateQueries({ queryKey: ['hitl-pending-count'] })
    showSuccess('Response submitted')
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Response failed')
  } finally {
    responding.value = false
  }
}

async function handleReject() {
  const ok = await appConfirm('Reject this request?', { danger: true, okLabel: 'Reject' })
  if (ok) await submitResponse('reject')
}

/** de-DE timestamp, parity with the React detail panel */
function formatRespondedAt(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}
</script>

<template>
  <div class="flex gap-6">
    <!-- Request list -->
    <div class="min-w-0 flex-1">
      <!-- Header -->
      <div class="mb-5">
        <div class="flex items-center gap-3">
          <N8nHeading size="xlarge" tag="h2">Approval Requests</N8nHeading>
          <span
            v-if="pendingCount > 0"
            class="rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-semibold text-white"
          >
            {{ pendingCount }}
          </span>
          <N8nButton
            variant="outline"
            size="small"
            icon="layout-template"
            label="Form Builder"
            class="ml-auto"
            @click="router.push('/approvals-builder')"
          />
        </div>
        <p class="mt-1 text-[13px] text-text-muted">
          Review requests sent from n8n workflows and respond with an approval decision.
        </p>
      </div>

      <!-- Tabs -->
      <div class="mb-5 flex gap-1 border-b border-border">
        <button
          v-for="t in TABS"
          :key="t.key"
          :class="cn(
            '-mb-px border-b-2 px-3 py-2 text-xs transition-colors',
            tab === t.key
              ? 'border-primary font-medium text-primary'
              : 'border-transparent text-text-muted hover:text-text-dark',
          )"
          @click="selectTab(t.key)"
        >
          {{ t.label }}
        </button>
      </div>

      <div v-if="isLoading" class="text-sm text-text-muted">Loading requests...</div>

      <div v-else-if="requests.length === 0" class="py-12 text-center">
        <N8nIcon icon="inbox" :size="32" class="mx-auto mb-2 text-text-xmuted" />
        <p class="text-sm text-text-muted">{{ TAB_EMPTY_MESSAGES[tab] }}</p>
      </div>

      <div v-else class="space-y-2">
        <!-- RequestCard -->
        <div
          v-for="r in requests"
          :key="r.id"
          class="cursor-pointer rounded-xl border bg-card p-4 transition-colors"
          :class="selectedRequest?.id === r.id ? 'border-primary' : 'border-border hover:border-border-strong'"
          @click="toggleCard(r)"
        >
          <div class="flex items-start gap-2">
            <N8nIcon
              :icon="statusIconName(r.status)"
              :size="13"
              class="shrink-0"
              :class="statusIconClass(r.status)"
            />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="truncate text-sm font-medium text-text-dark">{{ r.template_name }}</span>
                <span class="shrink-0 text-[10px] text-text-xmuted">#{{ r.id }}</span>
                <N8nBadge
                  :variant="(statusBadgeVariant(r.status) as 'warning')"
                  size="xsmall"
                  class="ml-auto capitalize"
                >
                  {{ r.status }}
                </N8nBadge>
              </div>
              <div v-if="previewEntriesOf(r).length > 0" class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                <span v-for="[k, v] in previewEntriesOf(r)" :key="k" class="text-[11px] text-text-muted">
                  <span class="text-text-xmuted">{{ k }}:</span> {{ trimText(v) }}
                </span>
              </div>
              <div class="mt-1 text-[10px] text-text-xmuted">
                <N8nTimeAgo :date="r.created_at" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="mt-4 flex items-center justify-center gap-2">
        <button
          :disabled="page <= 1"
          class="rounded-sm border border-input-border p-1.5 text-text-muted hover:bg-card-hover disabled:opacity-40"
          @click="setPage(page - 1)"
        >
          <N8nIcon icon="chevron-left" :size="13" />
        </button>
        <span class="text-xs text-text-muted">Page {{ page }} of {{ totalPages }}</span>
        <button
          :disabled="page >= totalPages"
          class="rounded-sm border border-input-border p-1.5 text-text-muted hover:bg-card-hover disabled:opacity-40"
          @click="setPage(page + 1)"
        >
          <N8nIcon icon="chevron-right" :size="13" />
        </button>
      </div>
    </div>

    <!-- Detail panel (RequestDetailPanel) -->
    <aside v-if="selectedRequest && req" class="w-96 shrink-0">
      <div class="sticky top-0 overflow-hidden rounded-xl border border-border bg-card">
        <div class="flex items-center justify-between border-b border-border px-4 py-3">
          <div class="flex items-center gap-2">
            <N8nIcon :icon="statusIconName(req.status)" :size="13" class="shrink-0" :class="statusIconClass(req.status)" />
            <N8nHeading size="medium" tag="h3">{{ req.template_name }}</N8nHeading>
          </div>
          <button class="text-lg leading-none text-text-xmuted hover:text-text-dark" @click="selectedRequest = null">&times;</button>
        </div>

        <div class="max-h-[70vh] space-y-4 overflow-y-auto p-4">
          <div class="flex flex-wrap items-center gap-2">
            <N8nBadge :variant="(statusBadgeVariant(req.status) as 'warning')" size="xsmall" class="capitalize">
              {{ req.status }}
            </N8nBadge>
            <span class="text-[10px] text-text-xmuted"><N8nTimeAgo :date="req.created_at" /></span>
            <span v-if="req.responded_at" class="text-[10px] text-text-xmuted">
              · responded <N8nTimeAgo :date="req.responded_at" />
            </span>
          </div>

          <!-- Responded-by info -->
          <div v-if="!isPending && req.responded_at" class="text-xs text-text-muted">
            {{ req.status === 'approved' ? 'Approved' : req.status === 'rejected' ? 'Rejected' : 'Expired' }}
            <template v-if="req.responded_by_name"> by <strong class="font-semibold text-text-dark">{{ req.responded_by_name }}</strong></template>
            <template v-if="req.responded_at"> on {{ formatRespondedAt(req.responded_at) }}</template>
          </div>

          <!-- Response comment -->
          <div v-if="req.response_comment" class="rounded-sm border border-border-light bg-bg px-3 py-2 text-xs italic text-text-muted">
            {{ req.response_comment }}
          </div>

          <div v-if="detailLoading" class="text-sm text-text-muted">Loading details...</div>

          <div v-else-if="schema.length > 0" class="space-y-3">
            <RenderComponent
              v-for="(comp, i) in schema"
              :key="i"
              :comp="comp"
              :data="req.submitted_data ?? {}"
              :response-data="responseData"
              :handle-change="handleChange"
              :read-only="!isPending"
            />
          </div>

          <!-- Fallback: show raw submitted data -->
          <div v-else class="space-y-2">
            <div v-for="[k, v] in dataEntriesOf(req.submitted_data)" :key="k" class="flex flex-col gap-0.5">
              <span class="text-[10px] font-semibold uppercase text-text-xmuted">{{ k }}</span>
              <span class="text-sm text-text-dark">{{ String(v) }}</span>
            </div>
          </div>

          <!-- Response data (for completed requests) -->
          <div v-if="!isPending" class="border-t border-border-light pt-3">
            <div class="mb-2 text-[10px] font-semibold uppercase text-text-xmuted">Reviewer Response</div>
            <div v-if="hasResponseData" class="space-y-1">
              <div v-for="[k, v] in dataEntriesOf(req.response_data)" :key="k" class="flex gap-2 text-xs">
                <span class="text-text-xmuted">{{ k }}:</span>
                <span class="text-text-dark">{{ String(v) }}</span>
              </div>
            </div>
            <p v-else class="text-xs italic text-text-xmuted">No additional data</p>
          </div>
        </div>

        <!-- Actions -->
        <div v-if="isPending" class="flex gap-2 border-t border-border bg-bg px-4 py-3">
          <button
            :disabled="responding"
            class="flex flex-1 items-center justify-center gap-1 rounded-sm border border-danger px-3 py-2 text-xs text-danger hover:bg-danger-light disabled:opacity-50"
            @click="handleReject"
          >
            <N8nIcon icon="circle-x" :size="13" /> Reject
          </button>
          <button
            :disabled="responding"
            class="flex flex-1 items-center justify-center gap-1 rounded-sm bg-success px-3 py-2 text-xs text-white hover:bg-success/90 disabled:opacity-50"
            @click="submitResponse('approve')"
          >
            <N8nIcon icon="circle-check" :size="13" /> Approve
          </button>
        </div>
      </div>
    </aside>
  </div>
</template>