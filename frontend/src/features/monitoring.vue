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
import { N8nIcon, N8nOption, N8nSelect, N8nSpinner } from '@n8n/design-system'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { Bar, Doughnut } from 'vue-chartjs'
import { api, ApiError } from '@/api/client'
import { useSse } from '@/composables/useSse'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'
import { useInstanceStore } from '@/stores/instance'
import { cn, formatDuration, timeAgo } from '@/lib/utils'
import NodeFlow from '@/components/NodeFlow.vue'
import PreviewModal from '@/components/PreviewModal.vue'
import ExecutionStatusIcon from './monitoring-parts/ExecutionStatusIcon.vue'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MonStats {
  health: string
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
/*  Charts (execution history 24h + status breakdown)                  */
/* ------------------------------------------------------------------ */

const barData = computed<ChartData<'bar', number[], string>>(() => {
  const now = Date.now()
  const hours = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(now - (23 - i) * 3600_000)
    return { label: `${d.getHours()}:00`, ts: d.getTime(), success: 0, error: 0, running: 0 }
  })
  for (const exec of executions.value) {
    const t = new Date(exec.startedAt).getTime()
    for (let i = hours.length - 1; i >= 0; i--) {
      if (t >= hours[i].ts) {
        if (exec.status === 'success') hours[i].success++
        else if (exec.status === 'error') hours[i].error++
        else hours[i].running++
        break
      }
    }
  }
  return {
    labels: hours.map((h) => h.label),
    datasets: [
      { label: 'Success', data: hours.map((h) => h.success), backgroundColor: 'rgba(34,197,94,0.7)' },
      { label: 'Error', data: hours.map((h) => h.error), backgroundColor: 'rgba(239,68,68,0.7)' },
      { label: 'Running', data: hours.map((h) => h.running), backgroundColor: 'rgba(59,130,246,0.7)' },
    ],
  }
})

const barOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
  plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
}

const doughnutData = computed<ChartData<'doughnut', number[], string> | null>(() => {
  const s = stats.value
  if (!s) return null
  const c = s.counts
  return {
    labels: ['Success', 'Error', 'Running', 'Waiting'],
    datasets: [{
      data: [c.success, c.error, c.running, c.waiting],
      backgroundColor: ['#22c55e', '#ef4444', '#3b82f6', '#f59e0b'],
      borderWidth: 0,
    }],
  }
})

const doughnutOptions: ChartOptions<'doughnut'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
}

const hasMore = computed(() => executions.value.length === 50 * page.value)

/* ------------------------------------------------------------------ */
/*  Stat cards (inline StatCard as a computed data model)              */
/* ------------------------------------------------------------------ */

interface StatCardModel {
  label: string
  value: string
  colorClass: string
  dot?: { pulse: boolean; colorClass: string }
  active?: boolean
  onClick?: () => void
}

const COLOR_MAP: Record<string, string> = {
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
  primary: 'text-primary',
  muted: 'text-text-muted',
}
const DOT_COLOR_MAP: Record<string, string> = {
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-warning',
  primary: 'bg-primary',
  muted: 'bg-text-muted',
}

function toggleStatusFilter(value: string) {
  statusFilter.value = statusFilter.value === value ? '' : value
}

const statCards = computed<StatCardModel[]>(() => {
  const s = stats.value
  if (!s) return []
  const healthColor = s.health === 'healthy' ? 'success' : s.health === 'unhealthy' ? 'warning' : 'danger'
  return [
    {
      label: 'Health',
      value: s.health === 'healthy' ? 'Healthy' : s.health === 'unhealthy' ? 'Unhealthy' : 'Unreachable',
      colorClass: COLOR_MAP[healthColor] ?? '',
      dot: { pulse: s.health === 'healthy', colorClass: DOT_COLOR_MAP[healthColor] ?? 'bg-text-muted' },
    },
    {
      label: 'Success',
      value: String(s.counts.success),
      colorClass: COLOR_MAP['success'] ?? '',
      onClick: () => toggleStatusFilter('success'),
      active: statusFilter.value === 'success',
    },
    {
      label: 'Error',
      value: String(s.counts.error),
      colorClass: COLOR_MAP[s.counts.error > 0 ? 'danger' : 'muted'] ?? '',
      onClick: () => toggleStatusFilter('error'),
      active: statusFilter.value === 'error',
    },
    {
      label: 'Running',
      value: String(s.counts.running),
      colorClass: COLOR_MAP['primary'] ?? '',
      onClick: () => toggleStatusFilter('running'),
      active: statusFilter.value === 'running',
    },
    {
      label: 'Waiting',
      value: String(s.counts.waiting),
      colorClass: COLOR_MAP['warning'] ?? '',
      onClick: () => toggleStatusFilter('waiting'),
      active: statusFilter.value === 'waiting',
    },
    {
      label: 'Success Rate',
      value: `${s.successRate}%`,
      colorClass: COLOR_MAP[s.successRate >= 80 ? 'success' : s.successRate >= 50 ? 'warning' : 'danger'] ?? '',
    },
    {
      label: 'Active / Total',
      value: s.workflowsReady === false ? '—' : `${s.activeWorkflows} / ${s.totalWorkflows}`,
      colorClass: COLOR_MAP['primary'] ?? '',
    },
    {
      label: 'Avg Duration',
      value: formatDuration(s.avgDurationMs),
      colorClass: COLOR_MAP['muted'] ?? '',
    },
    {
      label: 'Total Executions',
      value: String(s.total),
      colorClass: COLOR_MAP['muted'] ?? '',
    },
  ]
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
    <!-- Stats bar -->
    <div v-if="statCards.length > 0" class="grid grid-cols-2 gap-2 mb-4 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10">
      <div
        v-for="card in statCards"
        :key="card.label"
        :class="cn(
          'bg-card border rounded-lg p-3 text-center',
          card.onClick ? 'cursor-pointer hover:bg-card-hover' : '',
          card.active ? 'border-primary ring-1 ring-primary/30' : 'border-border',
        )"
        @click="card.onClick?.()"
      >
        <div v-if="card.dot" class="flex justify-center mb-1">
          <span
            :class="cn('inline-block w-2.5 h-2.5 rounded-full', card.dot.colorClass, card.dot.pulse && 'animate-pulse')"
          />
        </div>
        <div :class="cn('text-lg font-bold leading-tight', card.colorClass)">{{ card.value }}</div>
        <div class="text-[10px] text-text-muted mt-0.5 leading-tight">{{ card.label }}</div>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="flex items-center gap-2 mb-4 flex-wrap">
      <N8nSelect
        :model-value="String(autoRefresh)"
        :filterable="false"
        size="small"
        class="w-[180px]"
        @update:model-value="onAutoRefreshChange"
      >
        <N8nOption v-for="o in REFRESH_OPTIONS" :key="o.value" :value="o.value" :label="o.label">
          {{ o.label }}
        </N8nOption>
      </N8nSelect>
      <button
        type="button"
        class="flex items-center gap-1 rounded-md border border-input-border bg-input-bg px-2.5 py-[5px] text-[12px] font-semibold text-text-dark hover:bg-card-hover"
        @click="handleRefresh"
      >
        <N8nIcon icon="refresh-cw" :size="12" /> Refresh
      </button>
      <button
        v-if="runningIds.length > 0"
        type="button"
        class="flex items-center gap-1 rounded-md bg-danger px-2.5 py-[5px] text-[12px] font-semibold text-white hover:bg-danger/90"
        @click="handleStopAll"
      >
        <N8nIcon icon="circle-stop" :size="12" /> Stop All Running ({{ runningIds.length }})
      </button>
    </div>

    <!-- Charts row -->
    <div v-if="stats" class="grid grid-cols-1 gap-3 mb-4 lg:grid-cols-3">
      <div class="rounded-lg border border-border bg-card p-3 lg:col-span-2">
        <h4 class="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-2">Execution History (24h)</h4>
        <div class="h-[180px]">
          <Bar :data="barData" :options="barOptions" />
        </div>
      </div>
      <div v-if="doughnutData" class="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-3">
        <h4 class="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-2">Status Breakdown</h4>
        <div class="h-[160px] w-[160px]">
          <Doughnut :data="doughnutData" :options="doughnutOptions" />
        </div>
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
      <div v-else class="overflow-hidden rounded-lg border border-border bg-card">
        <table class="w-full">
          <thead>
            <tr class="border-b border-border bg-bg">
              <th class="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">Status</th>
              <th class="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">ID</th>
              <th class="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">Workflow</th>
              <th class="hidden px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted md:table-cell">Mode</th>
              <th class="hidden px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted lg:table-cell">Duration</th>
              <th class="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">Started</th>
              <th class="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-light">
            <tr
              v-for="exec in executions"
              :key="exec.id"
              class="cursor-pointer hover:bg-card-hover"
              @click="router.push(`/monitoring/${exec.id}`)"
            >
              <td class="px-3 py-2"><ExecutionStatusIcon :status="exec.status" /></td>
              <td class="px-3 py-2 font-mono text-xs text-text-muted">#{{ exec.id }}</td>
              <td class="max-w-[200px] truncate px-3 py-2 text-text-dark">
                {{ exec.workflowName || `Workflow #${exec.workflowId}` }}
              </td>
              <td class="hidden px-3 py-2 text-text-muted capitalize md:table-cell">{{ exec.mode }}</td>
              <td class="hidden px-3 py-2 text-text-muted lg:table-cell">{{ durationText(exec) }}</td>
              <td class="px-3 py-2 text-text-muted">{{ timeAgo(exec.startedAt) }}</td>
              <td class="px-3 py-2 text-right">
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
                'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
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