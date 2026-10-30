<script setup lang="ts">
// ─── Imports ────────────────────────────────────────────────────────────────
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { N8nBadge, N8nButton, N8nCard, N8nHeading, N8nIcon, N8nInput, N8nSelect, N8nOption } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { formatDuration } from '@/lib/utils'

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface TraceSummary {
  traceId: string
  name: string
  service: string
  startTimeMs: number
  durationMs: number
  status: string
  executionId: string | null
  executionMode: string | null
  workflowId: string | null
  workflowName: string | null
  spanCount: number
}

interface TraceSpan {
  id: string
  parentId: string | null
  name: string
  service: string
  startTimeMs: number
  durationMs: number
  status: string
  tags: Record<string, unknown>
  logs: Array<{ timestamp: number; fields: Record<string, unknown> }>
  children?: TraceSpan[]
}

interface TraceDetail {
  traceId: string
  startTimeMs: number
  durationMs: number
  services: string[]
  spans: TraceSpan[]
  roots: TraceSpan[]
  summary: TraceSummary
}

interface TracingConfig {
  backend: string
  serviceName: string
  publicUrl: string
  queryUrl: string
}

type StatusFilter = 'all' | 'success' | 'error' | 'crashed'

// ─── Helpers ────────────────────────────────────────────────────────────────

const LOOKBACKS = [
  { value: '15m', label: 'Last 15 minutes' },
  { value: '1h', label: 'Last hour' },
  { value: '6h', label: 'Last 6 hours' },
  { value: '24h', label: 'Last 24 hours' },
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'success', label: 'Success' },
  { value: 'error', label: 'Error' },
  { value: 'crashed', label: 'Crashed' },
]

const LIMIT_OPTIONS = ['20', '50', '100']

function statusVariant(status: string): 'success' | 'danger' | 'warning' | 'subtle' {
  if (status === 'success' || status === 'ok' || status === 'unset') return 'success'
  if (status === 'error' || status === 'crashed') return 'danger'
  if (status === 'running' || status === 'waiting') return 'warning'
  return 'subtle'
}

interface StatusIconInfo {
  icon: string
  cls: string
}

function statusIcon(status: string): StatusIconInfo {
  if (status === 'error' || status === 'crashed') return { icon: 'triangle-alert', cls: 'text-danger' }
  if (status === 'running' || status === 'waiting') return { icon: 'clock', cls: 'text-warning' }
  return { icon: 'circle-check', cls: 'text-success' }
}

function flattenSpans(spans: TraceSpan[], depth = 0): Array<TraceSpan & { depth: number }> {
  return spans.flatMap((span) => [
    { ...span, depth },
    ...flattenSpans(span.children || [], depth + 1),
  ])
}

/** vue-router query values can be string | string[] | null — normalise to string */
function queryStr(v: unknown): string {
  if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : ''
  return typeof v === 'string' ? v : ''
}

// ─── Main page ───────────────────────────────────────────────────────────────

const route = useRoute()

interface AppliedFilters {
  service: string
  executionId: string
  workflowId: string
  lookback: string
  limit: string
  status: StatusFilter
}

const service = ref('')
const executionInput = ref(queryStr(route.query.executionId))
const workflowInput = ref(queryStr(route.query.workflowId))
const lookback = ref('1h')
const limit = ref('20')
const status = ref<StatusFilter>('all')
const applied = ref<AppliedFilters>({
  service: '',
  executionId: queryStr(route.query.executionId),
  workflowId: queryStr(route.query.workflowId),
  lookback: '1h',
  limit: '20',
  status: 'all',
})
const selectedTraceId = ref<string | null>(null)
const selectedSpanId = ref<string | null>(null)

const { data: config } = useQuery({
  queryKey: ['tracing-config'],
  queryFn: () => api.get<TracingConfig>('/api/tracing/config'),
})

watch(
  config,
  (c) => {
    if (c) {
      if (!service.value) service.value = c.serviceName
      if (!applied.value.service) applied.value = { ...applied.value, service: c.serviceName }
    }
  },
  { immediate: true },
)

const { data: healthData, isError: backendUnavailable, refetch: refetchHealth } = useQuery({
  queryKey: ['tracing-health'],
  queryFn: () => api.get<{ status: string; services: string[] }>('/api/tracing/health'),
  refetchInterval: 60_000,
  retry: 1,
})

const serviceOptions = computed(() => {
  const services = healthData.value?.services
  return services?.length ? services : [config.value?.serviceName || 'n8n']
})

const { data: tracesData, isFetching: tracesFetching, isError: tracesError, error: tracesErrorValue, refetch: refetchTraces } = useQuery({
  queryKey: ['tracing-traces', applied],
  queryFn: () => {
    const params = new URLSearchParams()
    if (applied.value.service) params.set('service', applied.value.service)
    if (applied.value.executionId) params.set('executionId', applied.value.executionId)
    if (applied.value.workflowId) params.set('workflowId', applied.value.workflowId)
    params.set('lookback', applied.value.lookback)
    params.set('limit', applied.value.limit)
    if (applied.value.status !== 'all') params.set('status', applied.value.status)
    return api.get<{ traces: TraceSummary[] }>(`/api/tracing/traces?${params.toString()}`)
  },
  enabled: computed(() => healthData.value?.status === 'ok'),
  retry: 0,
})

const { data: trace, isFetching: traceFetching, refetch: refetchTrace } = useQuery({
  queryKey: ['tracing-trace', selectedTraceId],
  queryFn: () => api.get<TraceDetail>(`/api/tracing/traces/${selectedTraceId.value}`),
  enabled: computed(() => !!selectedTraceId.value),
  retry: 0,
})

// URL search params drive the filters
watch(
  () => [route.query.executionId, route.query.workflowId],
  () => {
    const executionId = queryStr(route.query.executionId)
    const workflowId = queryStr(route.query.workflowId)
    if (executionId || workflowId) {
      executionInput.value = executionId
      workflowInput.value = workflowId
      applied.value = { ...applied.value, executionId, workflowId }
    }
  },
  { immediate: true },
)

// Auto-select the first trace once results arrive
watch(
  [tracesData, selectedTraceId],
  ([td, sid]) => {
    const first = td?.traces?.[0]
    if (first && !sid) selectedTraceId.value = first.traceId
  },
  { immediate: true },
)

// ── Trace waterfall data model ───────────────────────────────────────────

interface WaterfallSpan extends TraceSpan {
  depth: number
  left: number
  width: number
}

const waterfallSpans = computed<WaterfallSpan[]>(() => {
  const t = trace.value
  if (!t) return []
  const total = Math.max(t.durationMs, 1)
  return flattenSpans(t.roots).map((span) => ({
    ...span,
    left: Math.min(99, (Math.max(0, span.startTimeMs - t.startTimeMs) / total) * 100),
    width: Math.max(0.5, (span.durationMs / total) * 100),
  }))
})

const selectedSpan = computed<WaterfallSpan | null>(
  () => waterfallSpans.value.find((span) => span.id === selectedSpanId.value) || null,
)

function selectSpan(id: string) {
  selectedSpanId.value = selectedSpanId.value === id ? null : id
}

const traces = computed(() => tracesData.value?.traces ?? [])

// ── Handlers (unknown-typed select payloads → explicit casts) ────────────

function onServiceChange(v: unknown) {
  service.value = String(v)
}

function onLookbackChange(v: unknown) {
  lookback.value = String(v)
}

function onLimitChange(v: unknown) {
  limit.value = String(v)
}

function onStatusChange(v: unknown) {
  status.value = String(v) as StatusFilter
}

function selectTrace(traceId: string) {
  selectedTraceId.value = traceId
  selectedSpanId.value = null
}

function applyFilters() {
  applied.value = {
    service: service.value,
    executionId: executionInput.value.trim(),
    workflowId: workflowInput.value.trim(),
    lookback: lookback.value,
    limit: limit.value,
    status: status.value,
  }
  selectedTraceId.value = null
  selectedSpanId.value = null
}

function clearFilters() {
  const defaultService = config.value?.serviceName || 'n8n'
  executionInput.value = ''
  workflowInput.value = ''
  lookback.value = '1h'
  limit.value = '20'
  status.value = 'all'
  service.value = defaultService
  applied.value = { service: defaultService, executionId: '', workflowId: '', lookback: '1h', limit: '20', status: 'all' }
  selectedTraceId.value = null
  selectedSpanId.value = null
}

function onFilterKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') applyFilters()
}

function refreshAll() {
  refetchHealth()
  refetchTraces()
  refetchTrace()
}
</script>

<template>
  <div class="flex flex-col gap-5 ">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <N8nHeading size="xlarge" tag="h2" class="flex items-center gap-2">
          <N8nIcon icon="activity" :size="18" class="text-primary" />
          Tracing
        </N8nHeading>
        <p class="text-[13px] text-text-muted">
          OpenTelemetry traces exported by n8n, including workflow and node spans.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <N8nBadge :variant="backendUnavailable ? 'danger' : 'subtle'">
          {{ backendUnavailable ? 'Jaeger unavailable' : `${healthData?.services?.length ?? 0} services` }}
        </N8nBadge>
        <N8nButton variant="outline" size="small" icon="refresh-cw" @click="refreshAll">
          Refresh
        </N8nButton>
        <a
          v-if="trace && config?.publicUrl"
          :href="`${config.publicUrl}/trace/${trace.traceId}`"
          target="_blank"
          rel="noreferrer"
          class="inline-flex items-center gap-1.5 rounded-sm border border-input-border bg-input-bg px-2.5 py-1 text-xs text-text-dark transition-colors hover:bg-card-hover"
        >
          <N8nIcon icon="external-link" :size="12" /> Open in Jaeger
        </a>
      </div>
    </div>

    <N8nCard>
      <div class="grid gap-4 md:grid-cols-12">
        <div class="md:col-span-3">
          <label class="mb-1 block text-[12px] font-medium text-text-muted">Service</label>
          <N8nSelect :model-value="service" :filterable="false" size="small" class="w-full" @update:model-value="onServiceChange">
            <N8nOption v-for="s in serviceOptions" :key="s" :value="s" :label="s">{{ s }}</N8nOption>
          </N8nSelect>
        </div>
        <div class="md:col-span-2">
          <label class="mb-1 block text-[12px] font-medium text-text-muted">Lookback</label>
          <N8nSelect :model-value="lookback" :filterable="false" size="small" class="w-full" @update:model-value="onLookbackChange">
            <N8nOption v-for="item in LOOKBACKS" :key="item.value" :value="item.value" :label="item.label">{{ item.label }}</N8nOption>
          </N8nSelect>
        </div>
        <div class="md:col-span-2">
          <label class="mb-1 block text-[12px] font-medium text-text-muted">Status</label>
          <N8nSelect :model-value="status" :filterable="false" size="small" class="w-full" @update:model-value="onStatusChange">
            <N8nOption v-for="item in STATUS_OPTIONS" :key="item.value" :value="item.value" :label="item.label">{{ item.label }}</N8nOption>
          </N8nSelect>
        </div>
        <div class="md:col-span-3">
          <label class="mb-1 block text-[12px] font-medium text-text-muted">Execution ID</label>
          <N8nInput
            v-model="executionInput"
            placeholder="e.g. 12345"
            size="small"
            @keydown="onFilterKeydown"
          />
        </div>
        <div class="flex items-end md:col-span-2">
          <N8nButton variant="brand" size="small" icon="search" label="Search" class="w-full" @click="applyFilters" />
        </div>
        <div class="md:col-span-3">
          <label class="mb-1 block text-[12px] font-medium text-text-muted">Workflow ID</label>
          <N8nInput
            v-model="workflowInput"
            placeholder="optional workflow ID"
            size="small"
            @keydown="onFilterKeydown"
          />
        </div>
        <div class="md:col-span-2">
          <label class="mb-1 block text-[12px] font-medium text-text-muted">Limit</label>
          <N8nSelect :model-value="limit" :filterable="false" size="small" class="w-full" @update:model-value="onLimitChange">
            <N8nOption v-for="o in LIMIT_OPTIONS" :key="o" :value="o" :label="o">{{ o }}</N8nOption>
          </N8nSelect>
        </div>
        <div class="flex items-end gap-2 md:col-span-2">
          <N8nButton variant="ghost" size="small" label="Clear Filters" class="w-full" @click="clearFilters" />
        </div>
      </div>
    </N8nCard>

    <N8nCard v-if="backendUnavailable">
      <div class="flex items-start gap-3 text-sm">
        <N8nIcon icon="triangle-alert" :size="18" class="mt-0.5 shrink-0 text-warning" />
        <div>
          <div class="font-medium text-text-dark">Trace backend is not reachable</div>
          <p class="mt-1 text-text-muted">
            Check that Jaeger is running and that <code class="font-mono">OTEL_QUERY_URL</code> points to it.
            The POC default is <code class="font-mono">http://jaeger:16686</code>.
          </p>
        </div>
      </div>
    </N8nCard>

    <N8nCard>
      <template #header>
        <div class="flex w-full flex-wrap items-center justify-between gap-2 px-1">
          <div>
            <N8nHeading size="medium" tag="h3">Traces</N8nHeading>
            <p class="text-[13px] text-text-muted">{{ traces.length }} trace{{ traces.length === 1 ? '' : 's' }} in the selected window</p>
          </div>
          <span v-if="tracesFetching" class="text-xs text-text-muted">Loading…</span>
        </div>
      </template>
      <div v-if="tracesError">
        <p class="text-sm text-danger">
          {{ tracesErrorValue instanceof ApiError ? tracesErrorValue.message : 'Failed to load traces' }}
        </p>
      </div>
      <div v-else-if="traces.length === 0">
        <div class="py-10 text-center">
          <N8nIcon icon="activity" :size="24" class="mx-auto mb-2 text-text-xmuted" />
          <p class="text-sm font-medium text-text-dark">No traces found</p>
          <p class="mt-1 text-xs text-text-muted">
            Run a workflow, then refresh. In n8n, enable Settings → OpenTelemetry and make sure the
            OTLP endpoint is reachable.
          </p>
        </div>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border bg-bg-light text-left">
              <th class="px-3 py-2.5 text-[12px] font-medium text-text-muted">Status</th>
              <th class="px-3 py-2.5 text-[12px] font-medium text-text-muted">Trace</th>
              <th class="px-3 py-2.5 text-[12px] font-medium text-text-muted">Workflow</th>
              <th class="px-3 py-2.5 text-[12px] font-medium text-text-muted">Execution</th>
              <th class="px-3 py-2.5 text-[12px] font-medium text-text-muted">Duration</th>
              <th class="px-3 py-2.5 text-[12px] font-medium text-text-muted">Spans</th>
              <th class="px-3 py-2.5 text-[12px] font-medium text-text-muted">Started</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in traces"
              :key="item.traceId"
              class="cursor-pointer border-b border-border-light last:border-0"
              :class="selectedTraceId === item.traceId ? 'bg-primary-light/60' : 'hover:bg-card-hover'"
              @click="selectTrace(item.traceId)"
            >
              <td class="px-3 py-2.5 text-[13px]">
                <N8nIcon :icon="statusIcon(item.status).icon" :size="14" :class="statusIcon(item.status).cls" />
              </td>
              <td class="px-3 py-2.5 text-[13px]">
                <div class="font-medium text-text-dark">{{ item.name }}</div>
                <div class="max-w-[220px] truncate text-[11px] text-text-xmuted">{{ item.traceId }}</div>
              </td>
              <td class="px-3 py-2.5 text-[13px]">
                <div class="max-w-[220px] truncate text-[13px] text-text-dark underline decoration-border-strong underline-offset-2">{{ item.workflowName || '—' }}</div>
                <div class="text-[11px] text-text-xmuted">{{ item.workflowId || '' }}</div>
              </td>
              <td class="px-3 py-2.5 font-mono text-xs">{{ item.executionId || '—' }}</td>
              <td class="whitespace-nowrap px-3 py-2.5 text-[13px]">{{ formatDuration(item.durationMs) }}</td>
              <td class="px-3 py-2.5 text-[13px]">{{ item.spanCount }}</td>
              <td class="whitespace-nowrap px-3 py-2.5 text-xs text-text-muted">
                {{ new Date(item.startTimeMs).toLocaleString() }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </N8nCard>

    <N8nCard v-if="trace">
      <template #header>
        <div class="flex w-full flex-wrap items-center justify-between gap-2 px-1">
          <div>
            <N8nHeading size="medium" tag="h3">Trace detail</N8nHeading>
            <p class="text-[13px] text-text-muted">{{ trace.traceId }} · {{ trace.services.join(', ') }} · {{ formatDuration(trace.durationMs) }}</p>
          </div>
          <span v-if="traceFetching" class="text-xs text-text-muted">Loading…</span>
        </div>
      </template>
      <div>
        <div class="mb-4 flex flex-wrap gap-2 text-xs">
          <N8nBadge v-if="trace.summary.workflowName" variant="primary">{{ trace.summary.workflowName }}</N8nBadge>
          <N8nBadge v-if="trace.summary.executionId" variant="subtle">execution {{ trace.summary.executionId }}</N8nBadge>
          <N8nBadge v-if="trace.summary.executionMode" variant="subtle">{{ trace.summary.executionMode }}</N8nBadge>
          <N8nBadge :variant="statusVariant(trace.summary.status)">{{ trace.summary.status }}</N8nBadge>
        </div>

        <!-- Trace waterfall (TraceWaterfall sub-component, inlined) -->
        <div class="overflow-x-auto">
          <div class="min-w-[720px]">
            <div
              v-for="span in waterfallSpans"
              :key="span.id"
              class="grid cursor-pointer grid-cols-[minmax(260px,1fr)_minmax(300px,2fr)_90px] items-center gap-3 border-b border-border-light px-2 py-1.5 text-[12px] last:border-0"
              :class="selectedSpanId === span.id ? 'bg-primary-light/60' : 'hover:bg-card-hover'"
              @click="selectSpan(span.id)"
            >
              <div class="flex min-w-0 items-center gap-1.5" :style="{ paddingLeft: `${span.depth * 16}px` }">
                <N8nIcon
                  :icon="span.children && span.children.length > 0 ? 'chevron-down' : 'chevron-right'"
                  :size="12"
                  class="shrink-0 text-text-xmuted"
                />
                <N8nIcon :icon="statusIcon(span.status).icon" :size="14" :class="statusIcon(span.status).cls" />
                <span class="truncate font-medium text-text-dark" :title="span.name">{{ span.name }}</span>
                <span class="truncate text-[11px] text-text-xmuted">{{ span.service }}</span>
              </div>
              <div class="relative h-5 rounded-sm bg-bg">
                <div
                  class="absolute top-1 h-3 rounded-sm"
                  :class="span.status === 'error' || span.status === 'crashed' ? 'bg-danger/70' : span.status === 'running' ? 'bg-warning/70' : 'bg-primary/70'"
                  :style="{ left: `${span.left}%`, width: `${span.width}%` }"
                  :title="`${span.name} · ${formatDuration(span.durationMs)}`"
                />
              </div>
              <div class="text-right text-[11px] tabular-nums text-text-muted">{{ formatDuration(span.durationMs) }}</div>
            </div>
          </div>
        </div>

        <!-- Span detail (SpanDetail sub-component, inlined) -->
        <div v-if="selectedSpan" class="mt-4 rounded-xl border border-border bg-bg/50 p-4">
          <div class="mb-2 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate text-[13px] font-medium text-text-dark">{{ selectedSpan.name }}</div>
              <div class="text-[11px] text-text-muted">{{ selectedSpan.service }} · {{ formatDuration(selectedSpan.durationMs) }} · {{ selectedSpan.id }}</div>
            </div>
            <N8nBadge :variant="statusVariant(selectedSpan.status)">{{ selectedSpan.status }}</N8nBadge>
          </div>
          <div v-if="Object.entries(selectedSpan.tags || {}).length > 0" class="max-h-48 overflow-auto rounded-sm border border-border-light bg-card">
            <table class="w-full text-[11px]">
              <tbody>
                <tr v-for="([key, value], i) in Object.entries(selectedSpan.tags || {})" :key="`${key}-${i}`" class="border-b border-border-light last:border-0">
                  <td class="w-1/3 px-2 py-1 font-mono text-text-muted text-[13px]">{{ key }}</td>
                  <td class="break-all px-2 py-1 font-mono text-text-dark text-[13px]">{{ String(value) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="selectedSpan.logs.length > 0" class="flex flex-col gap-1 mt-2">
            <div v-for="(log, index) in selectedSpan.logs" :key="index" class="rounded-sm border border-border-light bg-card p-2 font-mono text-[11px] text-text-base">
              <div v-for="[key, value] in Object.entries(log.fields)" :key="key">
                <span class="text-text-muted">{{ key }}:</span> {{ String(value) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </N8nCard>
  </div>
</template>