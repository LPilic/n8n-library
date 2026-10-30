<script setup lang="ts">
// ─── Imports ────────────────────────────────────────────────────────────────
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend, type ChartData, type ChartDataset, type ChartOptions } from 'chart.js'
import { Line } from 'vue-chartjs'
import { N8nHeading, N8nIcon, N8nSelect, N8nOption, N8nSpinner } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { cn } from '@/lib/utils'
import { markdownToHtml } from '@/lib/markdown'
import { sanitizeHtml } from '@/lib/sanitize'
import { useToast } from '@/stores/toast'
import { useInstanceStore } from '@/stores/instance'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface MetricEntry {
  name: string
  value: number
  type: string
  help?: string
  labels?: Record<string, string>
}

interface HistoryPoint {
  ts: number
  metrics: Record<string, number>
}

interface Worker {
  id: string
  name?: string
  host?: string
  url?: string
  version?: string
  status?: string
  ready?: boolean
  metrics?: Record<string, number>
}

// ─── History normalisation ──────────────────────────────────────────────────

function normalizeHistory(raw: Array<Record<string, unknown>>): HistoryPoint[] {
  return raw.map((p) => ({
    ts: (p.timestamp as number) || 0,
    metrics: {
      process_cpu_seconds_total:      (p.cpu as number)              || 0,
      process_resident_memory_bytes:  (p.memoryRss as number)        || 0,
      nodejs_heap_size_used_bytes:    (p.heapUsed as number)         || 0,
      nodejs_heap_size_total_bytes:   (p.heapTotal as number)        || 0,
      nodejs_eventloop_lag_seconds:   (p.eventLoopLag as number)     || 0,
      nodejs_active_handles_total:    (p.activeHandles as number)    || 0,
      queueWaiting:                   (p.queueWaiting as number)     || 0,
      queueActive:                    (p.queueActive as number)      || 0,
      queueCompleted:                 (p.queueCompleted as number)   || 0,
      queueFailed:                    (p.queueFailed as number)      || 0,
      activeRequests:                 (p.activeRequests as number)   || 0,
      eventLoopP99:                   (p.eventLoopP99 as number)     || 0,
    },
  }))
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB'
  return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

function fmtMB(bytes: number): number {
  return parseFloat((bytes / (1024 * 1024)).toFixed(2))
}

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function nowHHMMSS(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const CHART_DEFAULTS: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: true, labels: { font: { size: 11 }, boxWidth: 12, padding: 8 } },
    tooltip: { mode: 'index', intersect: false },
  },
  scales: {
    x: { ticks: { maxTicksLimit: 6, font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
    y: { ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
  },
  elements: { line: { tension: 0.35 }, point: { radius: 0, hitRadius: 6 } },
}

// ─── Shared chart options builders ──────────────────────────────────────────

const baseOpts = (yLabel?: string): ChartOptions<'line'> => ({
  ...CHART_DEFAULTS,
  scales: {
    x: { ticks: { maxTicksLimit: 6, font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
    y: {
      ticks: { font: { size: 10 } },
      grid: { color: 'rgba(0,0,0,0.05)' },
      title: yLabel ? { display: true, text: yLabel, font: { size: 10 } } : undefined,
    },
  },
})

// ─── Main page ───────────────────────────────────────────────────────────────

const instanceStore = useInstanceStore()
const { error: showError } = useToast()
const queryClient = useQueryClient()

const refreshInterval = ref(20)
const metricSearch = ref('')
const updatedAt = ref(nowHHMMSS())
const aiLoading = ref(false)
const aiReport = ref<string | null>(null)
let intervalRef: ReturnType<typeof setInterval> | null = null

const instanceId = computed(() => instanceStore.activeId)

const REFRESH_OPTIONS = [
  { value: '0', label: 'Off' },
  { value: '10', label: '10s' },
  { value: '20', label: '20s' },
  { value: '30', label: '30s' },
  { value: '60', label: '60s' },
]

function onIntervalChange(v: unknown) {
  refreshInterval.value = parseInt(String(v), 10)
}

function refetchAll() {
  const id = instanceId.value
  queryClient.invalidateQueries({ queryKey: ['obs-metrics', id] })
  queryClient.invalidateQueries({ queryKey: ['obs-history', id] })
  queryClient.invalidateQueries({ queryKey: ['obs-workers', id] })
  updatedAt.value = nowHHMMSS()
}

// Auto-refresh
watch(
  [refreshInterval, instanceId],
  () => {
    if (intervalRef) clearInterval(intervalRef)
    if (refreshInterval.value > 0) {
      intervalRef = setInterval(refetchAll, refreshInterval.value * 1000)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (intervalRef) clearInterval(intervalRef)
})

const { data: metricsData, isLoading: metricsLoading } = useQuery({
  queryKey: ['obs-metrics', instanceId],
  queryFn: async (): Promise<MetricEntry[]> => {
    const raw = await api.get<Record<string, Array<{ labels?: Record<string, string>; value: number }>>>(
      instanceStore.url('/api/monitoring/metrics'),
    )
    const entries: MetricEntry[] = []
    for (const [name, samples] of Object.entries(raw)) {
      for (const s of samples) {
        entries.push({ name, value: s.value, type: 'gauge', labels: s.labels, help: '' })
      }
    }
    return entries
  },
  enabled: computed(() => instanceStore.loaded),
  refetchInterval: false,
})

const { data: historyData } = useQuery({
  queryKey: ['obs-history', instanceId],
  queryFn: async () => {
    const raw = await api.get<Array<Record<string, unknown>>>(instanceStore.url('/api/monitoring/metrics/history'))
    return normalizeHistory(raw)
  },
  enabled: computed(() => instanceStore.loaded),
  refetchInterval: false,
})

const { data: workersData } = useQuery({
  queryKey: ['obs-workers', instanceId],
  queryFn: () => api.get<Worker[]>(instanceStore.url('/api/monitoring/workers')),
  enabled: computed(() => instanceStore.loaded),
  refetchInterval: false,
})

// ── KPI extraction ──────────────────────────────────────────────────────

function metricVal(name: string): number {
  if (!metricsData.value) return 0
  // Try exact match first, then with n8n_ prefix
  return metricsData.value.find((m) => m.name === name)?.value
    ?? metricsData.value.find((m) => m.name === `n8n_${name}`)?.value
    ?? 0
}

const stats = computed(() => {
  const version = (metricsData.value?.find((m) => m.name === 'n8n_version_info') ?? metricsData.value?.find((m) => m.name === 'version_info'))?.labels?.version || '-'
  const nodeVersion = (metricsData.value?.find((m) => m.name === 'n8n_nodejs_version_info') ?? metricsData.value?.find((m) => m.name === 'nodejs_version_info'))?.labels?.version || ''
  const startTime = metricVal('process_start_time_seconds')
  const uptime = startTime > 0 ? Date.now() / 1000 - startTime : 0
  const activeWf = metricVal('active_workflow_count') || metricVal('active_workflows_total')
  const rss = metricVal('process_resident_memory_bytes')
  const fds = metricVal('process_open_fds')
  const maxFds = metricVal('process_max_fds')
  const heapUsed = metricVal('nodejs_heap_size_used_bytes')
  const heapTotal = metricVal('nodejs_heap_size_total_bytes')
  const heapPct = heapTotal > 0 ? Math.round((heapUsed / heapTotal) * 100) : 0
  const lagSec = metricVal('nodejs_eventloop_lag_seconds')
  const lagMs = lagSec * 1000
  const lagP99Ms = metricVal('nodejs_eventloop_lag_p99_seconds') * 1000
  const qWait = metricVal('scaling_mode_queue_jobs_waiting') || metricVal('queue_waiting')
  const qActive = metricVal('scaling_mode_queue_jobs_active') || metricVal('queue_active')
  const qDone = metricVal('scaling_mode_queue_jobs_completed') || metricVal('queue_completed')
  const qFailed = metricVal('scaling_mode_queue_jobs_failed') || metricVal('queue_failed')
  return { version, nodeVersion, uptime, activeWf, rss, fds, maxFds, heapUsed, heapTotal, heapPct, lagMs, lagP99Ms, qWait, qActive, qDone, qFailed }
})

// ── AI report ────────────────────────────────────────────────────────────

async function handleAiReport() {
  aiLoading.value = true
  aiReport.value = null
  try {
    const res = await api.post<{ report: string }>('/api/ai/observability-report', {
      metrics: metricsData.value ?? [],
      history: historyData.value ?? [],
    })
    aiReport.value = markdownToHtml(res.report)
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'AI report failed')
  } finally {
    aiLoading.value = false
  }
}

const aiReportHtml = computed(() => (aiReport.value ? sanitizeHtml(aiReport.value) : ''))

// ── Filter / group raw metrics ────────────────────────────────────────────

const filteredMetrics = computed(() =>
  (metricsData.value ?? []).filter((m) =>
    metricSearch.value ? m.name.toLowerCase().includes(metricSearch.value.toLowerCase()) : true,
  ),
)

const groupList = computed(() => {
  const groups: Record<string, MetricEntry[]> = {}
  for (const m of filteredMetrics.value) {
    const prefix = m.name.split('_').slice(0, 2).join('_')
    if (!groups[prefix]) groups[prefix] = []
    groups[prefix].push(m)
  }
  return Object.entries(groups).map(([prefix, entries]) => ({ prefix, entries }))
})

const openGroups = ref<Record<string, boolean>>({})

function toggleGroup(prefix: string) {
  openGroups.value[prefix] = !openGroups.value[prefix]
}

// ── KPI cards (local KpiCard sub-component flattened into a data model) ────

interface KpiEntry {
  label: string
  value: string
  sub: string
  color?: 'danger' | 'warning'
}

const kpiCards = computed<KpiEntry[]>(() => {
  const s = stats.value
  return [
    {
      label: 'n8n version',
      value: s.version,
      sub: s.nodeVersion ? `Node ${s.nodeVersion}` : 'n8n version',
    },
    {
      label: 'Uptime',
      value: fmtUptime(s.uptime),
      sub: `Leader · ${s.activeWf} active workflows`,
    },
    {
      label: 'Memory (RSS)',
      value: fmtBytes(s.rss),
      sub: s.maxFds > 0 ? `FDs: ${s.fds} / ${s.maxFds}` : `FDs: ${s.fds}`,
    },
    {
      label: 'Heap usage',
      value: `${s.heapPct}%`,
      sub: `${fmtMB(s.heapUsed)} MB / ${fmtMB(s.heapTotal)} MB`,
      color: s.heapPct > 85 ? 'danger' : s.heapPct > 70 ? 'warning' : undefined,
    },
    {
      label: 'Event loop lag',
      value: `${s.lagMs.toFixed(1)}ms`,
      sub: s.lagP99Ms > 0 ? `p99: ${s.lagP99Ms.toFixed(1)}ms` : 'p99: —',
      color: s.lagMs > 100 ? 'danger' : s.lagMs > 50 ? 'warning' : undefined,
    },
    {
      label: 'Queue (wait / active)',
      value: `${s.qWait} / ${s.qActive}`,
      sub: `${s.qDone} done, ${s.qFailed} failed`,
    },
  ]
})

// ── Chart data helpers ────────────────────────────────────────────────────

const hist = computed(() => historyData.value ?? [])
const labels = computed(() => hist.value.map((h) => fmtTime(h.ts * (h.ts < 1e10 ? 1000 : 1))))

function histVals(key: string): number[] {
  return hist.value.map((h) => h.metrics[key] ?? 0)
}

function derivative(vals: number[]): number[] {
  const h = hist.value
  if (vals.length < 2) return vals
  const out: number[] = [0]
  for (let i = 1; i < vals.length; i++) {
    const dt = h[i].ts - h[i - 1].ts
    const dtSec = dt > 1000 ? dt / 1000 : dt || 1
    const diff = Math.max(0, (vals[i] - vals[i - 1]) / dtSec)
    out.push(parseFloat(diff.toFixed(4)))
  }
  return out
}

// CPU chart
const cpuData = computed<ChartData<'line', number[], string>>(() => ({
  labels: labels.value,
  datasets: [{
    label: 'CPU (s/s)',
    data: derivative(histVals('process_cpu_seconds_total')),
    borderColor: 'rgba(59,130,246,1)',
    backgroundColor: 'rgba(59,130,246,0.15)',
    fill: true,
  }],
}))

// Memory chart
const memData = computed<ChartData<'line', number[], string>>(() => ({
  labels: labels.value,
  datasets: [{
    label: 'RSS (MB)',
    data: histVals('process_resident_memory_bytes').map(fmtMB),
    borderColor: 'rgba(249,115,22,1)',
    backgroundColor: 'rgba(249,115,22,0.15)',
    fill: true,
  }],
}))

// Heap chart
const heapData = computed<ChartData<'line', number[], string>>(() => ({
  labels: labels.value,
  datasets: [
    {
      label: 'Heap Used (MB)',
      data: histVals('nodejs_heap_size_used_bytes').map(fmtMB),
      borderColor: 'rgba(34,197,94,1)',
      backgroundColor: 'rgba(34,197,94,0.1)',
      fill: false,
    },
    {
      label: 'Heap Total (MB)',
      data: histVals('nodejs_heap_size_total_bytes').map(fmtMB),
      borderColor: 'rgba(34,197,94,0.5)',
      backgroundColor: 'transparent',
      borderDash: [5, 3],
      fill: false,
    },
  ],
}))

// Event loop chart
const hasP99 = computed(() => hist.value.some((h) => (h.metrics.eventLoopP99 ?? 0) > 0))
const lagData = computed<ChartData<'line', number[], string>>(() => {
  const datasets: ChartDataset<'line', number[]>[] = [
    {
      label: 'Lag (ms)',
      data: histVals('nodejs_eventloop_lag_seconds').map((v) => parseFloat((v * 1000).toFixed(3))),
      borderColor: 'rgba(239,68,68,1)',
      backgroundColor: 'rgba(239,68,68,0.1)',
      fill: true,
    },
  ]
  if (hasP99.value) {
    datasets.push({
      label: 'p99 (ms)',
      data: histVals('eventLoopP99').map((v) => parseFloat((v * 1000).toFixed(3))),
      borderColor: 'rgba(239,68,68,0.5)',
      backgroundColor: 'transparent',
      borderDash: [5, 3],
      fill: false,
    })
  }
  return { labels: labels.value, datasets }
})

// Queue chart
const queueData = computed<ChartData<'line', number[], string>>(() => ({
  labels: labels.value,
  datasets: [
    { label: 'Waiting',   data: histVals('queueWaiting'),   borderColor: 'rgba(249,115,22,1)',  backgroundColor: 'transparent', fill: false },
    { label: 'Active',    data: histVals('queueActive'),    borderColor: 'rgba(59,130,246,1)',  backgroundColor: 'transparent', fill: false },
    { label: 'Completed', data: histVals('queueCompleted'), borderColor: 'rgba(34,197,94,1)',   backgroundColor: 'transparent', fill: false },
    { label: 'Failed',    data: histVals('queueFailed'),    borderColor: 'rgba(239,68,68,1)',   backgroundColor: 'transparent', fill: false },
  ],
}))

// Active resources chart
const resourcesData = computed<ChartData<'line', number[], string>>(() => ({
  labels: labels.value,
  datasets: [
    { label: 'Handles',  data: histVals('nodejs_active_handles_total'), borderColor: 'rgba(20,184,166,1)', backgroundColor: 'rgba(20,184,166,0.1)', fill: true },
    { label: 'Requests', data: histVals('activeRequests'),              borderColor: 'rgba(168,85,247,1)', backgroundColor: 'transparent',          fill: false },
  ],
}))

// Chart options (static per chart)
const cpuOpts = baseOpts('cpu s/s')
const memOpts = baseOpts('MB')
const heapOpts = baseOpts('MB')
const lagOpts = baseOpts('ms')
const queueOpts = baseOpts('jobs')
const resourcesOpts = baseOpts('count')

// ── Workers (per-card derived stats) ────────────────────────────────────────

interface WorkerCard {
  worker: Worker
  idx: number
  name: string
  wRss: number
  wHeapPct: number
  wLag: number
  wUptime: number
  healthy: boolean
}

const workerCards = computed<WorkerCard[]>(() =>
  (workersData.value ?? []).map((w, idx) => {
    const m = w.metrics || {}
    const wRss = m.memoryRss ?? m.process_resident_memory_bytes ?? 0
    const wHeapU = m.heapUsed ?? m.nodejs_heap_size_used_bytes ?? 0
    const wHeapT = m.heapTotal ?? m.nodejs_heap_size_total_bytes ?? 0
    const wHeapPct = wHeapT > 0 ? Math.round((wHeapU / wHeapT) * 100) : 0
    const wLag = (m.eventLoopLag ?? m.nodejs_eventloop_lag_seconds ?? 0) * 1000
    const wUptime = m.uptime ?? m.process_uptime_seconds ?? 0
    const healthy = w.status === 'healthy' || w.status === 'ready'
    return { worker: w, idx, name: w.name || w.host || w.url || w.id, wRss, wHeapPct, wLag, wUptime, healthy }
  }),
)
</script>

<template>
  <div>
    <!-- Toolbar -->
    <div class="flex items-center gap-3 mb-5 flex-wrap">
      <N8nHeading size="xlarge" tag="h2">Observability</N8nHeading>
      <span class="text-xs text-text-muted ml-1">Updated {{ updatedAt }}</span>
      <div class="ml-auto flex items-center gap-2">
        <N8nSelect
          :model-value="String(refreshInterval)"
          :filterable="false"
          size="small"
          class="w-24"
          @update:model-value="onIntervalChange"
        >
          <N8nOption v-for="opt in REFRESH_OPTIONS" :key="opt.value" :value="opt.value" :label="opt.label">
            {{ opt.label }}
          </N8nOption>
        </N8nSelect>
        <button
          class="flex items-center gap-1.5 text-xs px-2.5 py-1 border border-input-border rounded-sm bg-input-bg text-text-dark hover:bg-card-hover"
          @click="refetchAll"
        >
          <N8nIcon icon="refresh-cw" :size="12" />
          Refresh
        </button>
        <button
          :disabled="aiLoading"
          class="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-sm bg-danger text-white hover:bg-danger/90 disabled:opacity-60"
          @click="handleAiReport"
        >
          <N8nIcon v-if="aiLoading" icon="loader-circle" :size="12" spin />
          <N8nIcon v-else icon="sparkles" :size="12" />
          AI Report
        </button>
      </div>
    </div>

    <!-- AI report output -->
    <div
      v-if="aiReport"
      class="mb-5 overflow-hidden rounded-xl border border-border bg-card p-5 max-w-none text-text-dark"
      v-html="aiReportHtml"
    />

    <div v-if="metricsLoading" class="flex items-center gap-2 text-text-muted text-sm py-8">
      <N8nSpinner size="small" /> Loading metrics…
    </div>
    <template v-else>
      <!-- ── KPI Cards ─────────────────────────────────────────────────── -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <div v-for="kpi in kpiCards" :key="kpi.label" class="overflow-hidden rounded-xl border border-border bg-card flex">
          <div class="w-1 shrink-0 bg-success" />
          <div class="flex-1 px-4 py-3">
            <div
              class="text-[20px] leading-tight font-semibold"
              :class="kpi.color === 'danger' ? 'text-danger' : kpi.color === 'warning' ? 'text-warning' : 'text-text-dark'"
            >
              {{ kpi.value }}
            </div>
            <div class="text-[12px] font-medium text-text-muted mt-0.5">{{ kpi.label }}</div>
            <div class="text-[12px] text-text-muted mt-0.5 truncate">{{ kpi.sub }}</div>
          </div>
        </div>
      </div>

      <!-- ── Charts ────────────────────────────────────────────────────── -->
      <div v-if="hist.length > 1" class="grid md:grid-cols-2 gap-4 mb-6">
        <div class="rounded-xl border border-border bg-card p-5 shadow-card">
          <N8nHeading size="medium" tag="h3" class="mb-3">CPU Usage (Seconds)</N8nHeading>
          <div :style="{ height: '160px' }">
            <Line :data="cpuData" :options="cpuOpts" />
          </div>
        </div>

        <div class="rounded-xl border border-border bg-card p-5 shadow-card">
          <N8nHeading size="medium" tag="h3" class="mb-3">Memory (RSS)</N8nHeading>
          <div :style="{ height: '160px' }">
            <Line :data="memData" :options="memOpts" />
          </div>
        </div>

        <div class="rounded-xl border border-border bg-card p-5 shadow-card">
          <N8nHeading size="medium" tag="h3" class="mb-3">Heap Usage</N8nHeading>
          <div :style="{ height: '160px' }">
            <Line :data="heapData" :options="heapOpts" />
          </div>
        </div>

        <div class="rounded-xl border border-border bg-card p-5 shadow-card">
          <N8nHeading size="medium" tag="h3" class="mb-3">Event Loop Lag</N8nHeading>
          <div :style="{ height: '160px' }">
            <Line :data="lagData" :options="lagOpts" />
          </div>
        </div>

        <div class="rounded-xl border border-border bg-card p-5 shadow-card">
          <N8nHeading size="medium" tag="h3" class="mb-3">Queue Jobs</N8nHeading>
          <div :style="{ height: '160px' }">
            <Line :data="queueData" :options="queueOpts" />
          </div>
        </div>

        <div class="rounded-xl border border-border bg-card p-5 shadow-card">
          <N8nHeading size="medium" tag="h3" class="mb-3">Active Resources</N8nHeading>
          <div :style="{ height: '160px' }">
            <Line :data="resourcesData" :options="resourcesOpts" />
          </div>
        </div>
      </div>

      <!-- ── Workers ───────────────────────────────────────────────────── -->
      <div v-if="workerCards.length > 0" class="mb-6">
        <N8nHeading size="medium" tag="h3" class="mb-3">Workers</N8nHeading>
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="w in workerCards"
            :key="w.worker.id || w.worker.name || w.idx"
            class="overflow-hidden rounded-xl border border-border bg-card flex"
          >
            <div :class="cn('w-1 shrink-0', w.healthy ? 'bg-success' : 'bg-danger')" />
            <div class="flex-1 px-4 py-3">
              <div class="flex items-center justify-between mb-1.5 gap-2">
                <span class="text-sm font-medium text-text-dark truncate">{{ w.name }}</span>
                <div class="flex items-center gap-1 shrink-0">
                  <span
                    v-if="w.worker.status"
                    :class="cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-medium',
                      w.healthy ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                    )"
                  >
                    {{ w.worker.status.charAt(0).toUpperCase() + w.worker.status.slice(1) }}
                  </span>
                  <span v-if="w.healthy" class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-primary/10 text-primary">Ready</span>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-text-muted">
                <span v-if="w.wUptime > 0">Uptime: {{ fmtUptime(w.wUptime) }}</span>
                <span v-if="w.wRss > 0">Mem: {{ fmtBytes(w.wRss) }}</span>
                <span
                  v-if="w.wHeapPct > 0"
                  :class="w.wHeapPct > 85 ? 'text-danger' : w.wHeapPct > 70 ? 'text-warning' : ''"
                >
                  Heap: {{ w.wHeapPct }}%
                </span>
                <span
                  v-if="w.wLag > 0"
                  :class="w.wLag > 100 ? 'text-danger' : w.wLag > 50 ? 'text-warning' : ''"
                >
                  Loop: {{ w.wLag.toFixed(1) }}ms
                </span>
              </div>
              <div v-if="w.worker.version" class="text-[10px] text-text-xmuted mt-1">v{{ w.worker.version }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Raw Metrics Explorer ──────────────────────────────────────── -->
      <div>
        <div class="flex items-center gap-2 mb-3">
          <N8nHeading size="medium" tag="h3">Raw Metrics</N8nHeading>
          <div class="relative ml-auto">
            <N8nIcon icon="search" :size="13" class="absolute left-2 top-1/2 -translate-y-1/2 text-text-xmuted" />
            <input
              v-model="metricSearch"
              type="text"
              placeholder="Filter metrics…"
              class="pl-7 pr-3 py-1 text-xs border border-input-border rounded-sm bg-input-bg text-text-dark w-56 focus:outline-none focus:border-input-focus"
            >
          </div>
        </div>

        <div class="overflow-hidden rounded-xl border border-border bg-card">
          <div v-for="g in groupList" :key="g.prefix" class="border-b border-border-light last:border-b-0">
            <button
              class="w-full text-left px-3 py-2 text-xs font-medium text-text-dark hover:bg-card-hover flex items-center justify-between"
              @click="toggleGroup(g.prefix)"
            >
              <span>{{ g.prefix }} <span class="text-text-xmuted font-normal">({{ g.entries.length }})</span></span>
              <span class="text-text-xmuted text-[10px]">{{ openGroups[g.prefix] ? '▲' : '▼' }}</span>
            </button>
            <div v-if="openGroups[g.prefix]" class="flex flex-col gap-0.5 px-3 pb-2">
              <div v-for="(m, i) in g.entries" :key="i" class="flex items-center justify-between py-0.5 text-xs">
                <span class="text-text-muted truncate mr-2 font-mono">{{ m.name }}</span>
                <span class="text-text-dark font-mono shrink-0">
                  {{ typeof m.value === 'number' ? (m.value % 1 === 0 ? m.value : m.value.toFixed(4)) : m.value }}
                </span>
              </div>
            </div>
          </div>
          <div v-if="groupList.length === 0" class="px-3 py-4 text-sm text-text-muted text-center">No metrics found</div>
        </div>
      </div>
    </template>
  </div>
</template>