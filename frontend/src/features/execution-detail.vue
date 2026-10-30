<script setup lang="ts">
// Ported from src/features/monitoring.tsx (ExecutionDetailPage).
// Route: /monitoring/:id — execution header with start/stop/retry/report/AI
// analysis actions, global error callout, per-node timeline with expandable
// output dumps and the Report Issue modal (monitoring-parts).

import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton, N8nIcon, N8nSpinner } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'
import { useInstanceStore } from '@/stores/instance'
import { cn, formatDuration } from '@/lib/utils'
import { markdownToHtml } from '@/lib/markdown'
import { sanitizeHtml } from '@/lib/sanitize'
import ExecutionStatusIcon from './monitoring-parts/ExecutionStatusIcon.vue'
import ReportIssueModal from './monitoring-parts/ReportIssueModal.vue'

/* ------------------------------------------------------------------ */
/*  Store / route / toasts                                             */
/* ------------------------------------------------------------------ */

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const { error: showError, success: showSuccess } = useToast()
const instanceStore = useInstanceStore()
const { instances, activeId } = storeToRefs(instanceStore)

/** React `iUrl` */
const iUrl = (path: string): string => instanceStore.url(path)

const id = computed<string>(() => {
  const param = route.params.id
  return (Array.isArray(param) ? param[0] : param) ?? ''
})

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

const expandedNodes = ref(new Set<string>())
const aiAnalysis = ref<string | null>(null)
const aiAnalyzing = ref(false)
const showReportModal = ref(false)

/* ------------------------------------------------------------------ */
/*  Queries + mutations (plain api calls + toast + invalidation)       */
/* ------------------------------------------------------------------ */

const { data: exec, isLoading } = useQuery({
  queryKey: ['execution-detail', id],
  queryFn: () => api.get<Record<string, unknown>>(iUrl(`/api/monitoring/executions/${id.value}`)),
  enabled: computed(() => !!id.value),
})

async function retryExecution() {
  try {
    await api.post(iUrl(`/api/monitoring/executions/${id.value}/retry`))
    showSuccess('Execution retried')
    await queryClient.invalidateQueries({ queryKey: ['execution-detail', id.value] })
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Retry failed')
  }
}

async function stopExecution() {
  try {
    await api.post(iUrl(`/api/monitoring/executions/${id.value}/stop`))
    showSuccess('Execution stopped')
    await queryClient.invalidateQueries({ queryKey: ['execution-detail', id.value] })
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Stop failed')
  }
}

async function handleRetry() {
  const ok = await appConfirm('Retry this execution?', { okLabel: 'Retry' })
  if (ok) await retryExecution()
}

async function handleStop() {
  const ok = await appConfirm('Stop this execution?', { danger: true, okLabel: 'Stop' })
  if (ok) await stopExecution()
}

/* ------------------------------------------------------------------ */
/*  Derived execution fields                                           */
/* ------------------------------------------------------------------ */

const status = computed(() => (exec.value?.status as string) ?? '')
const workflowName = computed(
  () => (exec.value?.workflowName as string) || `Workflow #${String(exec.value?.workflowId ?? '')}`,
)
const startedAt = computed(() => (exec.value?.startedAt as string) ?? '')
const stoppedAt = computed(() => exec.value?.stoppedAt as string | undefined)
const mode = computed(() => (exec.value?.mode as string) ?? '')
const duration = computed(() =>
  stoppedAt.value && startedAt.value
    ? new Date(stoppedAt.value).getTime() - new Date(startedAt.value).getTime()
    : 0,
)

const nodeData = computed(
  () => (exec.value?.data as Record<string, unknown>)?.resultData as Record<string, unknown> | undefined,
)
const runData = computed(
  () => nodeData.value?.runData as Record<string, Array<Record<string, unknown>>> | undefined,
)
const globalError = computed(() => nodeData.value?.error as Record<string, string> | undefined)
const hasDataError = computed(() => !!((exec.value?.data as Record<string, unknown>)?.error))

// Sort nodes by startTime
interface NodeRunsEntry {
  startTime?: number
  executionTime?: number
  error?: Record<string, string>
  data?: Record<string, unknown>
}
type SortedNodeEntry = [string, Array<Record<string, unknown>>]

const sortedNodes = computed<SortedNodeEntry[]>(() => {
  const rd = runData.value
  if (!rd) return []
  return Object.entries(rd).sort(([, aRuns], [, bRuns]) => {
    const aTime = (aRuns[0]?.startTime as number) || 0
    const bTime = (bRuns[0]?.startTime as number) || 0
    return aTime - bTime
  })
})

// First node whose last run errored (for the Report Issue modal)
const failedNode = computed<string>(() => {
  const entry = sortedNodes.value.find(([, runs]) => {
    const last = runs[runs.length - 1] as NodeRunsEntry | undefined
    return !!last?.error
  })
  return entry?.[0] ?? ''
})

// Build the n8n instance URL for "Open in n8n"
const activeInst = computed(() => instances.value.find((i) => i.id === activeId.value))
const n8nBaseUrl = computed(() => activeInst.value?.base_url?.replace(/\/+$/, '') || '')

/* ------------------------------------------------------------------ */
/*  Handlers                                                           */
/* ------------------------------------------------------------------ */

async function handleAnalyzeError() {
  if (!exec.value) return
  aiAnalyzing.value = true
  aiAnalysis.value = null
  try {
    const errorEntry = sortedNodes.value.find(([, runs]) => {
      const last = runs[runs.length - 1] as NodeRunsEntry | undefined
      return !!last?.error
    })
    const errorMsg = errorEntry
      ? (((errorEntry[1][errorEntry[1].length - 1] as NodeRunsEntry | undefined)?.error as
           Record<string, string> | undefined)?.message ?? '')
      : ''
    const res = await api.post<{ analysis: string }>(iUrl('/api/ai/analyze-error'), {
      workflowName: workflowName.value,
      errorMessage: errorMsg || globalError.value?.message || 'Unknown error',
      nodeName: errorEntry?.[0] || '',
      nodeType: '',
    })
    aiAnalysis.value = res.analysis || 'No analysis available.'
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Analysis failed')
  } finally {
    aiAnalyzing.value = false
  }
}

function toggleNode(name: string) {
  const next = new Set(expandedNodes.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  expandedNodes.value = next
}

function onTicketCreated(ticketId: number) {
  showReportModal.value = false
  showSuccess(`Ticket #${ticketId} created`)
  router.push(`/tickets/${ticketId}`)
}

/* ------------------------------------------------------------------ */
/*  Node timeline view model                                           */
/* ------------------------------------------------------------------ */

interface NodeRowModel {
  nodeName: string
  status: string
  errorText: string | null
  durationMs: number
  itemCount: number
  outputJson: string | null
  expanded: boolean
}

const nodeRows = computed<NodeRowModel[]>(() =>
  sortedNodes.value.map(([nodeName, runs]) => {
    const lastRun = runs[runs.length - 1] as NodeRunsEntry | undefined
    const nodeStatus = lastRun?.error ? 'error' : 'success'
    const nodeError = lastRun?.error as Record<string, string> | undefined
    const startTime = lastRun?.startTime as number | undefined
    const endTime = lastRun?.executionTime as number | undefined
    const executionMs = endTime ?? (startTime ? Date.now() - startTime : 0)
    const outputData = lastRun?.data as Record<string, unknown> | undefined
    const mainOutput = outputData?.main as Array<Array<Record<string, unknown>>> | undefined
    const itemCount = mainOutput ? mainOutput.flat().length : 0
    return {
      nodeName,
      status: nodeStatus,
      errorText: nodeError ? nodeError.message || JSON.stringify(nodeError) : null,
      durationMs: executionMs,
      itemCount,
      outputJson: mainOutput ? JSON.stringify(mainOutput, null, 2) : null,
      expanded: expandedNodes.value.has(nodeName),
    }
  }),
)
</script>

<template>
  <div>
    <div v-if="isLoading" class="flex items-center gap-2 text-sm text-text-muted">
      <N8nSpinner size="small" /> Loading execution...
    </div>
    <div v-else-if="!exec" class="text-sm text-danger">Execution not found</div>
    <div v-else>
      <button
        type="button"
        class="mb-4 flex items-center gap-1 text-sm text-primary hover:text-primary-hover"
        @click="router.push('/monitoring')"
      >
        <N8nIcon icon="arrow-left" :size="14" /> Back to Monitoring
      </button>

      <!-- Header card -->
      <div class="rounded-lg border border-border bg-card p-4 mb-4">
        <div class="flex items-center gap-3 mb-3">
          <ExecutionStatusIcon :status="status" />
          <h2 class="text-lg font-semibold text-text-dark">Execution #{{ id }}</h2>
          <span class="text-sm text-text-muted">- {{ workflowName }}</span>
          <span
            :class="cn(
              'rounded px-1.5 py-0.5 text-[11px] font-medium capitalize',
              status === 'success' ? 'bg-success-light text-success'
                : status === 'error' ? 'bg-danger-light text-danger'
                : status === 'running' ? 'bg-primary/10 text-primary'
                : status === 'waiting' ? 'bg-warning/10 text-warning'
                : 'bg-border-light text-text-muted',
            )"
          >
            {{ status }}
          </span>
        </div>
        <div class="grid grid-cols-2 gap-3 text-sm mb-3 md:grid-cols-4">
          <div>
            <div class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Started</div>
            <div class="text-text-dark">{{ startedAt ? new Date(startedAt).toLocaleString() : '-' }}</div>
          </div>
          <div>
            <div class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Finished</div>
            <div class="text-text-dark">{{ stoppedAt ? new Date(stoppedAt).toLocaleString() : '-' }}</div>
          </div>
          <div>
            <div class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Duration</div>
            <div class="text-text-dark">{{ duration > 0 ? formatDuration(duration) : status === 'running' ? 'running...' : '-' }}</div>
          </div>
          <div>
            <div class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Mode</div>
            <div class="text-text-dark capitalize">{{ mode }}</div>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <N8nButton
            variant="outline"
            size="small"
            icon="waypoints"
            @click="router.push(`/tracing?executionId=${encodeURIComponent(String(id))}`)"
          >
            View trace
          </N8nButton>
          <button
            v-if="status === 'error'"
            type="button"
            class="flex items-center gap-1 rounded-md bg-primary px-2.5 py-[5px] text-[12px] font-semibold text-white hover:bg-primary-hover"
            @click="handleRetry"
          >
            <N8nIcon icon="rotate-ccw" :size="12" /> Retry
          </button>
          <button
            v-if="status === 'running' || status === 'waiting'"
            type="button"
            class="flex items-center gap-1 rounded-md bg-danger px-2.5 py-[5px] text-[12px] font-semibold text-white hover:bg-danger/90"
            @click="handleStop"
          >
            <N8nIcon icon="square" :size="12" /> Stop
          </button>
          <button
            type="button"
            class="flex items-center gap-1 rounded-md border border-border px-2.5 py-[5px] text-[12px] font-semibold text-text-muted hover:bg-card-hover"
            @click="showReportModal = true"
          >
            <N8nIcon icon="triangle-alert" :size="12" /> Report Issue
          </button>
          <button
            v-if="status === 'error'"
            type="button"
            :disabled="aiAnalyzing"
            :class="cn(
              'flex items-center gap-1 rounded-md border px-2.5 py-[5px] text-[12px] font-semibold',
              aiAnalysis
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-text-muted hover:bg-card-hover',
              aiAnalyzing && 'opacity-50',
            )"
            @click="handleAnalyzeError"
          >
            <N8nIcon icon="sparkles" :size="12" /> {{ aiAnalyzing ? 'Analyzing...' : 'Analyze Error' }}
          </button>
          <a
            v-if="n8nBaseUrl"
            :href="`${n8nBaseUrl}/execution/${id}`"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-1 rounded-md border border-border px-2.5 py-[5px] text-[12px] font-semibold text-text-muted hover:bg-card-hover"
          >
            <N8nIcon icon="external-link" :size="12" /> Open in n8n
          </a>
        </div>
      </div>

      <!-- Global error block -->
      <div v-if="globalError || hasDataError" class="rounded-lg border border-danger/30 bg-danger-light p-4 mb-4">
        <div class="flex items-center gap-2 mb-1">
          <N8nIcon icon="circle-x" :size="16" class="shrink-0 text-danger" />
          <h3 class="text-sm font-semibold text-danger">Execution Error</h3>
        </div>
        <p class="text-sm text-danger/90">{{ globalError?.message || JSON.stringify(globalError) }}</p>
      </div>

      <!-- AI Error Analysis -->
      <div v-if="aiAnalyzing" class="rounded-lg border border-border bg-card p-6 text-center mb-4">
        <N8nSpinner size="large" class="mx-auto mb-2 text-text-muted" />
        <p class="text-sm text-text-muted">Analyzing error...</p>
      </div>
      <div v-if="aiAnalysis && !aiAnalyzing" class="rounded-lg border border-border bg-card p-5 mb-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="flex items-center gap-1.5 text-sm font-semibold text-text-dark">
            <N8nIcon icon="sparkles" :size="14" class="text-primary" /> AI Error Analysis
          </h3>
          <button
            type="button"
            class="flex items-center gap-1 rounded-md bg-danger px-2 py-1 text-[11px] font-semibold text-white hover:bg-danger/90"
            @click="showReportModal = true"
          >
            <N8nIcon icon="triangle-alert" :size="11" /> Report Issue
          </button>
        </div>
        <div
          class="text-text-dark leading-relaxed [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:mt-4 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:mb-1 [&_h3]:mt-2 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_li]:mb-0.5 [&_strong]:font-semibold [&_code]:bg-bg [&_code]:px-1 [&_code]:rounded [&_code]:text-xs"
          v-html="sanitizeHtml(markdownToHtml(aiAnalysis || ''))"
        />
      </div>

      <!-- Report Issue Modal -->
      <ReportIssueModal
        v-if="showReportModal && exec"
        :workflow-name="workflowName"
        :workflow-id="String(exec.workflowId ?? '')"
        :execution-id="id || ''"
        :status="status"
        :started-at="startedAt"
        :error-message="globalError?.message || ''"
        :failed-node="failedNode"
        :ai-analysis="aiAnalysis"
        @close="showReportModal = false"
        @created="onTicketCreated"
      />

      <!-- Node timeline -->
      <div v-if="nodeRows.length > 0">
        <h3 class="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-3">Node Timeline</h3>
        <div class="flex flex-col gap-2 ">
          <div
            v-for="row in nodeRows"
            :key="row.nodeName"
            :class="cn('rounded-lg border bg-card p-3', row.status === 'error' ? 'border-danger/30' : 'border-border')"
          >
            <div class="flex items-center gap-2">
              <ExecutionStatusIcon :status="row.status" />
              <span class="flex-1 text-sm font-medium text-text-dark">{{ row.nodeName }}</span>
              <span class="text-xs text-text-muted">{{ row.durationMs }}ms</span>
            </div>
            <div v-if="row.errorText" class="mt-2 rounded bg-danger-light p-2 text-xs text-danger">
              {{ row.errorText }}
            </div>
            <div v-if="row.itemCount > 0" class="mt-2">
              <button
                type="button"
                class="flex items-center gap-1 text-xs text-primary hover:text-primary-hover"
                @click="toggleNode(row.nodeName)"
              >
                <N8nIcon
                  icon="chevron-down"
                  :size="12"
                  :class="cn('transition-transform', row.expanded && 'rotate-180')"
                />
                {{ row.itemCount }} item{{ row.itemCount !== 1 ? 's' : '' }} output
              </button>
              <pre
                v-if="row.expanded && row.outputJson"
                class="mt-2 max-h-[300px] overflow-x-auto rounded bg-bg p-2 text-[11px] text-text-muted"
              >{{ row.outputJson }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>