<script setup lang="ts">
// Ported from src/features/monitoring.tsx (MonitoringPage).
// Live stats/executions via the monitoring SSE stream, chart.js execution
// history + status charts, the executions table (filters / retry / stop /
// stop-all / load more) and the workflows tab (KPIs, search, active filter,
// activate toggle, NodeFlow preview). The StatCard sub-component is inlined as
// a computed data model, StatusIcon lives in monitoring-parts/.

import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton, N8nHeading, N8nIcon, N8nOption, N8nSelect, N8nSpinner } from '@n8n/design-system'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { Bar } from 'vue-chartjs'
import { api, ApiError } from '@/api/client'
import { useSse } from '@/composables/useSse'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'
import { useInstanceStore } from '@/stores/instance'
import { cn, formatDuration, timeAgo } from '@/lib/utils'
import NodeFlow from '@/components/NodeFlow.vue'
import PreviewModal from '@/components/PreviewModal.vue'
import ExecutionStatusIcon from './monitoring-parts/ExecutionStatusIcon.vue'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MonStats {
  health: string
  healthLatencyMs: number
  total: number
  counts: { success: number; error: number; running: number; waiting: number }
  avgDurationMs: number
  activeWorkflows: number
  totalWorkflows: number
  workflowsReady?: boolean
  successRate: number
}

interface Execution {
  id: string
  status: string
  mode: string
  startedAt: string
  stoppedAt?: string
  workflowId: string
  workflowName?: string
}

interface Workflow {
  id: string
  name: string
  active: boolean
  nodes?: Array<{ type?: string; name?: string; displayName?: string; position?: number[]; group?: string }>
  tags?: Array<{ name: string }>
  updatedAt?: string
}

/* ------------------------------------------------------------------ */
/*  Store / router / toasts                                            */
/* ------------------------------------------------------------------ */

const router = useRouter()
const queryClient = useQueryClient()
const { error: showError, success: showSuccess } = useToast()
const instanceStore = useInstanceStore()
const { activeId: activeInstanceId, loaded: instanceLoaded } = storeToRefs(instanceStore)

/** Append the active instance_id query param (React `iUrl`). */
const iUrl = (path: string): string => instanceStore.url(path)

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

const tab = ref<'executions' | 'workflows'>('executions')
const statusFilter = ref('')
const workflowFilter = ref('')
const sseStats = ref<MonStats | null>(null)
const autoRefresh = ref(0)
const wfSearch = ref('')
const wfActiveFilter = ref<'all' | 'active' | 'inactive'>('all')
const previewWf = ref<Workflow | null>(null)
const page = ref(1)

/* ------------------------------------------------------------------ */
/*  SSE for live updates                                               */
/* ------------------------------------------------------------------ */

useSse(computed(() => iUrl('/api/monitoring/stream')), {
  onMessage: (event, data) => {
    if (event === 'stats') sseStats.value = data as MonStats
    if (event === 'executions') {
      queryClient.setQueryData<{ data: Execution[] }>(
        ['monitoring-executions', statusFilter.value, workflowFilter.value],
        (old) => {
          const newData = data as { data: Execution[] }
          return old ? { ...old, data: newData.data || old.data } : newData
        },
      )
    }
  },
})

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

// Stats query
const { data: fetchedStats } = useQuery({
  queryKey: ['monitoring-stats', activeInstanceId],
  queryFn: () => api.get<MonStats>(iUrl('/api/monitoring/stats')),
  enabled: computed(() => instanceLoaded.value),
  refetchInterval: computed(() => autoRefresh.value || 30_000),
})

// SSE stats win over fetched stats
const stats = computed<MonStats | undefined>(() => {
  const fetched = fetchedStats.value
  const live = sseStats.value
  if (!fetched) return live ?? undefined
  return live ? { ...fetched, ...live } : fetched
})

// Executions query
const { data: execData, isLoading: execLoading } = useQuery({
  queryKey: ['monitoring-executions', statusFilter, workflowFilter, activeInstanceId],
  queryFn: () => {
    const params = new URLSearchParams()
    if (statusFilter.value) params.set('status', statusFilter.value)
    if (workflowFilter.value) params.set('workflowId', workflowFilter.value)
    params.set('limit', String(50 * page.value))
    return api.get<{ data: Execution[] }>(iUrl(`/api/monitoring/executions?${params}`))
  },
  enabled: computed(() => instanceLoaded.value),
  refetchInterval: computed(() => autoRefresh.value || undefined),
})

// Workflows query
const { data: wfData } = useQuery({
  queryKey: ['monitoring-workflows', activeInstanceId],
  queryFn: () => api.get<{ data: Workflow[] }>(iUrl('/api/monitoring/workflows')),
  enabled: computed(() => instanceLoaded.value),
  refetchInterval: computed(() => autoRefresh.value || undefined),
})

const executions = computed(() => execData.value?.data ?? [])
const workflows = computed(() => wfData.value?.data ?? [])

// Filtered workflows for the tab
const filteredWorkflows = computed(() => {
  let list = workflows.value
  if (wfActiveFilter.value === 'active') list = list.filter((w) => w.active)
  if (wfActiveFilter.value === 'inactive') list = list.filter((w) => !w.active)
  if (wfSearch.value.trim()) {
    const q = wfSearch.value.toLowerCase()
    list = list.filter((w) => w.name.toLowerCase().includes(q))
  }
  return list
})

/* ------------------------------------------------------------------ */
/*  Mutations (plain api calls + toast + invalidation)                 */
/* ------------------------------------------------------------------ */

async function retryExecution(id: string) {
  try {
    await api.post(iUrl(`/api/monitoring/executions/${id}/retry`))
    showSuccess('Execution retried')
    await queryClient.invalidateQueries({ queryKey: ['monitoring-executions'] })
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Retry failed')
  }
}

async function stopExecution(id: string) {
  try {
    await api.post(iUrl(`/api/monitoring/executions/${id}/stop`))
    showSuccess('Execution stopped')
    await queryClient.invalidateQueries({ queryKey: ['monitoring-executions'] })
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Stop failed')
  }
}

async function stopAllRunning(ids: string[]) {
  try {
    await api.post(iUrl('/api/monitoring/executions/stop'), { ids })
    showSuccess('All running executions stopped')
    await queryClient.invalidateQueries({ queryKey: ['monitoring-executions'] })
    await queryClient.invalidateQueries({ queryKey: ['monitoring-stats'] })
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Stop all failed')
  }
}

async function toggleActive(pay: { id: string; active: boolean }) {
  try {
    await api.post(iUrl(`/api/monitoring/workflows/${pay.id}/activate`), { active: pay.active })
    showSuccess('Workflow updated')
    await queryClient.invalidateQueries({ queryKey: ['monitoring-workflows'] })
    await queryClient.invalidateQueries({ queryKey: ['monitoring-stats'] })
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Toggle failed')
  }
}

const runningIds = computed(() => executions.value.filter((e) => e.status === 'running').map((e) => e.id))

/* ------------------------------------------------------------------ */
/*  Handlers                                                           */
/* ------------------------------------------------------------------ */

function handleRefresh() {
  sseStats.value = null
  queryClient.invalidateQueries({ queryKey: ['monitoring-stats'] })
  queryClient.invalidateQueries({ queryKey: ['monitoring-executions'] })
  queryClient.invalidateQueries({ queryKey: ['monitoring-workflows'] })
}

async function handleStopAll() {
  if (runningIds.value.length === 0) return
  const ok = await appConfirm(
    `Stop all ${runningIds.value.length} running execution(s)?`,
    { danger: true, okLabel: 'Stop All' },
  )
  if (ok) await stopAllRunning(runningIds.value)
}

async function handleRetry(id: string) {
  const ok = await appConfirm('Retry this execution?', { okLabel: 'Retry' })
  if (ok) await retryExecution(id)
}

async function handleStop(id: string) {
  const ok = await appConfirm('Stop this execution?', { danger: true, okLabel: 'Stop' })
  if (ok) await stopExecution(id)
}

/* ------------------------------------------------------------------ */
/*  Charts (execution history 24h — n8n Insights style)                */
/* ------------------------------------------------------------------ */

const N8N_GREEN = 'rgba(47, 158, 68, 0.9)'
const N8N_RED = 'rgba(224, 49, 49, 0.9)'
const N8N_BLUE = 'rgba(102, 112, 133, 0.8)'

const barData = computed<ChartData<'bar', number[], string>>(() => {
  // Daily buckets like n8n Insights ("Breakdown by day") — last 7 days
  const now = new Date()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i))
    return { label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), ts: d.getTime(), success: 0, error: 0, running: 0 }
  })
  for (const exec of executions.value) {
    const t = new Date(exec.startedAt).getTime()
    for (let i = days.length - 1; i >= 0; i--) {
      if (t >= days[i].ts) {
        if (exec.status === 'success') days[i].success++
        else if (exec.status === 'error') days[i].error++
        else days[i].running++
        break
      }
    }
  }
  return {
    labels: days.map((h) => h.label),
    datasets: [
      { label: 'Succeeded', data: days.map((h) => h.success), backgroundColor: N8N_GREEN, borderRadius: { topLeft: 3, topRight: 3 }, borderSkipped: 'bottom', barPercentage: 0.55, categoryPercentage: 0.7 },
      { label: 'Failed', data: days.map((h) => h.error), backgroundColor: N8N_RED, borderRadius: 0, borderSkipped: 'bottom', barPercentage: 0.55, categoryPercentage: 0.7 },
      { label: 'Running', data: days.map((h) => h.running), backgroundColor: N8N_BLUE, borderRadius: 0, borderSkipped: 'bottom', barPercentage: 0.55, categoryPercentage: 0.7 },
    ],
  }
})

const barOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  scales: {
    x: {
      stacked: true,
      grid: { display: false },
      border: { display: false },
      ticks: { color: 'rgba(127,127,134,0.9)', font: { size: 10 }, maxRotation: 0, autoSkipPadding: 24 },
    },
    y: {
      stacked: true,
      beginAtZero: true,
      grid: { color: 'rgba(127,127,134,0.14)' },
      border: { display: false },
      ticks: { color: 'rgba(127,127,134,0.9)', font: { size: 10 }, precision: 0 },
    },
  },
  plugins: {
    legend: {
      position: 'bottom',
      align: 'start',
      labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'rect', color: 'rgba(127,127,134,1)', font: { size: 11 } },
    },
  },
}

const hasMore = computed(() => executions.value.length === 50 * page.value)

/* ------------------------------------------------------------------ */
/*  KPI strip (n8n Insights style: single card, divided columns)       */
/* ------------------------------------------------------------------ */

interface KpiColumn {
  label: string
  hint: string
  value: string
  valueClass?: string
  /** Status filter toggled by clicking this column */
  filter?: string
  active?: boolean
}

function toggleStatusFilter(value: string) {
  statusFilter.value = statusFilter.value === value ? '' : value
}

const kpiColumns = computed<KpiColumn[]>(() => {
  const s = stats.value
  if (!s) return []
  const failureRate = Math.max(0, 100 - s.successRate)
  return [
    {
      label: 'Executions',
      hint: 'Recent runs',
      value: String(s.total),
    },
    {
      label: 'Succeeded',
      hint: 'Recent runs',
      value: String(s.counts.success),
      filter: 'success',
      active: statusFilter.value === 'success',
    },
    {
      label: 'Failed',
      hint: 'Recent runs',
      value: String(s.counts.error),
      valueClass: s.counts.error > 0 ? 'text-danger' : '',
      filter: 'error',
      active: statusFilter.value === 'error',
    },
    {
      label: 'Running',
      hint: 'Recent runs',
      value: String(s.counts.running),
      valueClass: s.counts.running > 0 ? 'text-primary' : '',
      filter: 'running',
      active: statusFilter.value === 'running',
    },
    {
      label: 'Failure rate',
      hint: 'Recent runs',
      value: `${failureRate}%`,
      valueClass: s.successRate >= 95 ? '' : s.successRate >= 50 ? 'text-warning' : 'text-danger',
    },
    {
      label: 'Run time (avg.)',
      hint: 'Per finished run',
      value: formatDuration(s.avgDurationMs),
    },
  ]
})

const healthPill = computed<{ cls: string; label: string; pulse: boolean }>(() => {
  const s = stats.value
  if (!s) return { cls: 'bg-border-light text-text-muted', label: 'no data', pulse: false }
  if (s.health === 'healthy') return { cls: 'bg-success-light text-success', label: `Healthy${s.healthLatencyMs ? ` · ${s.healthLatencyMs}ms` : ''}`, pulse: true }
  if (s.health === 'unhealthy') return { cls: 'bg-warning-light text-warning', label: 'Unhealthy', pulse: false }
  return { cls: 'bg-danger-light text-danger', label: 'Unreachable', pulse: false }
})

/* ------------------------------------------------------------------ */
/*  Row helpers + select options                                       */
/* ------------------------------------------------------------------ */

function durationText(exec: Execution): string {
  const duration = exec.stoppedAt
    ? new Date(exec.stoppedAt).getTime() - new Date(exec.startedAt).getTime()
    : 0
  return duration > 0 ? formatDuration(duration) : exec.status === 'running' ? 'running...' : '-'
}

const REFRESH_OPTIONS = [
  { value: '0', label: 'Auto-refresh: Off' },
  { value: '10000', label: 'Auto-refresh: 10s' },
  { value: '30000', label: 'Auto-refresh: 30s' },
  { value: '60000', label: 'Auto-refresh: 60s' },
]

function onAutoRefreshChange(v: unknown) {
  autoRefresh.value = Number(v)
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'success', label: 'Success' },
  { value: 'error', label: 'Error' },
  { value: 'running', label: 'Running' },
  { value: 'waiting', label: 'Waiting' },
]

const workflowOptions = computed(() => [
  { value: '', label: 'All Workflows' },
  ...workflows.value.map((wf) => ({ value: wf.id, label: wf.name })),
])

const WF_FILTERS: Array<'all' | 'active' | 'inactive'> = ['all', 'active', 'inactive']
</script>

<template>
  <div>
    <!-- Header row: title + health + controls (n8n Insights style) -->
    <div class="mb-4 flex items-center justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-3">
        <N8nHeading size="xlarge" tag="h2">Monitoring</N8nHeading>
        <span v-if="stats" class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" :class="healthPill.cls">
          <span class="inline-block h-1.5 w-1.5 rounded-full bg-current" :class="healthPill.pulse && 'animate-pulse'" />
          {{ healthPill.label }}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <N8nSelect
          :model-value="String(autoRefresh)"
          :filterable="false"
          size="small"
          class="w-[150px]"
          @update:model-value="onAutoRefreshChange"
        >
          <N8nOption v-for="o in REFRESH_OPTIONS" :key="o.value" :value="o.value" :label="o.label">
            {{ o.label }}
          </N8nOption>
        </N8nSelect>
        <N8nButton icon="refresh-cw" size="small" variant="outline" label="Refresh" @click="handleRefresh" />
        <N8nButton
          v-if="runningIds.length > 0"
          icon="square"
          size="small"
          variant="destructive"
          :label="`Stop All (${runningIds.length})`"
          @click="handleStopAll"
        />
      </div>
    </div>

    <!-- KPI strip: single card divided into columns -->
    <div v-if="stats" class="mb-5 grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-3 lg:grid-cols-6">
      <button
        v-for="(col, i) in kpiColumns"
        :key="col.label"
        type="button"
        :class="cn(
          'relative flex flex-col items-start px-5 py-3.5 text-left outline-none transition-colors',
          i > 0 && 'border-l border-border-light',
          col.filter ? 'cursor-pointer hover:bg-card-hover' : 'cursor-default',
          col.active ? 'bg-primary-light' : '',
        )"
        @click="col.filter ? toggleStatusFilter(col.filter) : undefined"
      >
        <span v-if="col.active" class="absolute inset-x-0 bottom-0 h-[2px] bg-primary" />
        <span class="text-[13px] font-medium text-text-dark">{{ col.label }}</span>
        <span class="text-[12px] text-text-muted">{{ col.hint }}</span>
        <span class="mt-2 text-[20px] leading-tight font-semibold" :class="col.valueClass || 'text-text-dark'">{{ col.value }}</span>
      </button>
    </div>
    <div v-else class="mb-5 flex items-center gap-2 py-6 text-sm text-text-muted">
      <N8nSpinner size="small" /> Loading instance stats...
    </div>

    <!-- Execution history (last 7 days, like n8n Insights "Breakdown by day") -->
    <div v-if="stats" class="mb-5 rounded-xl border border-border bg-card p-5 shadow-card">
      <N8nHeading size="medium" tag="h3" class="mb-3">Breakdown by day · Last 7 days</N8nHeading>
      <div class="h-[240px]">
        <Bar :data="barData" :options="barOptions" />
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex items-center gap-4 border-b border-border mb-4">
      <button
        type="button"
        :class="cn(
          'pb-2 text-sm font-medium border-b-2 transition-colors',
          tab === 'executions' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-dark',
        )"
        @click="tab = 'executions'"
      >
        Executions
      </button>
      <button
        type="button"
        :class="cn(
          'pb-2 text-sm font-medium border-b-2 transition-colors',
          tab === 'workflows' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-dark',
        )"
        @click="tab = 'workflows'"
      >
        Workflows
      </button>
    </div>

    <!-- Executions tab -->
    <div v-if="tab === 'executions'">
      <!-- Filters row -->
      <div class="flex items-center gap-2 mb-3 flex-wrap">
        <N8nSelect v-model="statusFilter" :filterable="false" size="small" class="w-[140px]">
          <N8nOption v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value" :label="o.label">
            {{ o.label }}
          </N8nOption>
        </N8nSelect>
        <N8nSelect v-model="workflowFilter" :filterable="false" size="small" class="w-[200px]">
          <N8nOption v-for="o in workflowOptions" :key="o.value" :value="o.value" :label="o.label">
            {{ o.label }}
          </N8nOption>
        </N8nSelect>
      </div>

      <div v-if="execLoading" class="flex items-center gap-2 text-sm text-text-muted">
        <N8nSpinner size="small" /> Loading executions...
      </div>
      <div v-else-if="executions.length === 0" class="py-8 text-center text-sm text-text-muted">
        No executions found
      </div>
      <div v-else class="overflow-hidden rounded-xl border border-border bg-card">
        <table class="w-full">
          <thead>
            <tr class="border-b border-border bg-bg-light">
              <th class="px-3 py-2 text-left text-[12px] font-medium text-text-muted">Status</th>
              <th class="px-3 py-2 text-left text-[12px] font-medium text-text-muted">ID</th>
              <th class="px-3 py-2 text-left text-[12px] font-medium text-text-muted">Workflow</th>
              <th class="hidden px-3 py-2 text-left text-[12px] font-medium text-text-muted md:table-cell">Mode</th>
              <th class="hidden px-3 py-2 text-right text-[12px] font-medium text-text-muted lg:table-cell">Duration</th>
              <th class="px-3 py-2 text-left text-[12px] font-medium text-text-muted">Started</th>
              <th class="px-3 py-2 text-right text-[12px] font-medium text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-light">
            <tr
              v-for="exec in executions"
              :key="exec.id"
              class="cursor-pointer hover:bg-card-hover"
              @click="router.push(`/monitoring/${exec.id}`)"
            >
              <td class="px-3 py-2 text-[13px]"><ExecutionStatusIcon :status="exec.status" /></td>
              <td class="px-3 py-2 font-mono text-xs text-text-muted">#{{ exec.id }}</td>
              <td class="max-w-[220px] truncate px-3 py-2 text-[13px]">
                <span class="text-[13px] text-text-dark underline decoration-border-strong underline-offset-2">
                  {{ exec.workflowName || `Workflow #${exec.workflowId}` }}
                </span>
              </td>
              <td class="hidden px-3 py-2 text-text-muted capitalize md:table-cell text-[13px]">{{ exec.mode }}</td>
              <td class="hidden px-3 py-2 text-right text-text-muted lg:table-cell text-[13px]">{{ durationText(exec) }}</td>
              <td class="px-3 py-2 text-text-muted text-[13px]">{{ timeAgo(exec.startedAt) }}</td>
              <td class="px-3 py-2 text-right text-[13px]">
                <div class="flex items-center justify-end gap-1" @click.stop>
                  <button
                    v-if="exec.status === 'error'"
                    type="button"
                    class="p-1 text-text-muted hover:text-primary"
                    title="Retry"
                    @click="handleRetry(exec.id)"
                  >
                    <N8nIcon icon="rotate-ccw" :size="14" />
                  </button>
                  <button
                    v-if="exec.status === 'running' || exec.status === 'waiting'"
                    type="button"
                    class="p-1 text-text-muted hover:text-danger"
                    title="Stop"
                    @click="handleStop(exec.id)"
                  >
                    <N8nIcon icon="square" :size="14" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-text-muted">
          <span>Showing 1-{{ executions.length }}</span>
          <button
            v-if="hasMore"
            type="button"
            class="rounded-md border border-input-border bg-input-bg px-2.5 py-[5px] text-[12px] font-semibold text-text-dark hover:bg-card-hover"
            @click="page = page + 1"
          >
            Load More
          </button>
        </div>
      </div>
    </div>

    <!-- Workflows tab -->
    <div v-if="tab === 'workflows'">
      <!-- KPI row -->
      <div class="flex items-center gap-3 mb-3">
        <span class="text-xs text-text-muted">Total: <strong class="text-text-dark">{{ workflows.length }}</strong></span>
        <span class="text-xs text-text-muted">Active: <strong class="text-success">{{ workflows.filter((w) => w.active).length }}</strong></span>
        <span class="text-xs text-text-muted">Inactive: <strong class="text-text-dark">{{ workflows.filter((w) => !w.active).length }}</strong></span>
      </div>

      <!-- Search and filter -->
      <div class="flex items-center gap-2 mb-3 flex-wrap">
        <div class="relative">
          <N8nIcon icon="search" :size="12" class="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            v-model="wfSearch"
            type="text"
            placeholder="Search workflows..."
            class="w-[200px] rounded-sm border border-input-border bg-input-bg px-2 py-1.5 pl-6 text-xs text-text-dark"
          />
        </div>
        <button
          v-for="f in WF_FILTERS"
          :key="f"
          type="button"
          :class="cn(
            'rounded-md border px-2.5 py-[5px] text-[12px] font-semibold capitalize',
            wfActiveFilter === f
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-input-border bg-input-bg text-text-dark hover:bg-card-hover',
          )"
          @click="wfActiveFilter = f"
        >
          {{ f }}
        </button>
      </div>

      <!-- Workflow grid -->
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="wf in filteredWorkflows"
          :key="wf.id"
          class="rounded-lg border border-border bg-card p-3"
        >
          <div class="flex items-center justify-between mb-2">
            <h3 class="mr-2 truncate text-sm font-medium text-text-dark">{{ wf.name }}</h3>
            <span
              :class="cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium',
                wf.active ? 'bg-success-light text-success' : 'bg-border-light text-text-muted',
              )"
            >
              {{ wf.active ? 'Active' : 'Inactive' }}
            </span>
          </div>
          <div class="flex items-center justify-between text-xs text-text-muted mb-2">
            <span>{{ wf.nodes?.length ?? 0 }} nodes</span>
            <span v-if="wf.updatedAt">{{ timeAgo(wf.updatedAt) }}</span>
          </div>

          <!-- Active toggle -->
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-text-muted">Active</span>
            <button
              type="button"
              :class="cn('relative h-5 w-9 rounded-full transition-colors', wf.active ? 'bg-success' : 'bg-border')"
              @click="toggleActive({ id: wf.id, active: !wf.active })"
            >
              <div
                :class="cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                  wf.active ? 'translate-x-4' : 'translate-x-0.5',
                )"
              />
            </button>
          </div>

          <!-- NodeFlow preview -->
          <div v-if="wf.nodes && wf.nodes.length > 0" class="cursor-pointer" @click="previewWf = wf">
            <NodeFlow :nodes="wf.nodes" compact />
          </div>
        </div>
        <div v-if="filteredWorkflows.length === 0" class="col-span-full py-8 text-center text-sm text-text-muted">
          No workflows match the filter
        </div>
      </div>
    </div>

    <!-- Preview modal -->
    <PreviewModal
      v-if="previewWf"
      :title="previewWf.name"
      :workflow-data="{ nodes: previewWf.nodes || [], connections: {} }"
      @close="previewWf = null"
    />
  </div>
</template>