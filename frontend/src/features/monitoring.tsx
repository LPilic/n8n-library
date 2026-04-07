import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import { useSse } from '@/hooks/useSse'
import { useToast } from '@/hooks/useToast'
import { appConfirm } from '@/components/ConfirmDialog'
import { NodeFlow } from '@/components/NodeFlow'
import { PreviewModal } from '@/components/PreviewModal'
import { esc, formatDuration, timeAgo, cn } from '@/lib/utils'
import { markdownToHtml } from '@/lib/markdown'
import { useInstanceStore } from '@/stores/instance'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Square,
  RotateCcw,
  AlertTriangle,
  Zap,
  RefreshCw,
  Search,
  ChevronDown,
  StopCircle,
  ArrowLeft,
  Sparkles,
  ExternalLink,
} from 'lucide-react'

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
/*  MonitoringPage                                                     */
/* ------------------------------------------------------------------ */

export function MonitoringPage() {
  const navigate = useNavigate()
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()
  const iUrl = useInstanceStore((s) => s.url)
  const activeInstanceId = useInstanceStore((s) => s.activeId)
  const [tab, setTab] = useState<'executions' | 'workflows'>('executions')
  const [statusFilter, setStatusFilter] = useState('')
  const [workflowFilter, setWorkflowFilter] = useState('')
  const [sseStats, setSseStats] = useState<MonStats | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(0)
  const [wfSearch, setWfSearch] = useState('')
  const [wfActiveFilter, setWfActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [previewWf, setPreviewWf] = useState<Workflow | null>(null)
  const [page, setPage] = useState(1)

  // SSE for live updates
  const handleSse = useCallback((event: string, data: unknown) => {
    if (event === 'stats') setSseStats(data as MonStats)
    if (event === 'executions') {
      queryClient.setQueryData(
        ['monitoring-executions', statusFilter, workflowFilter],
        (old: { data: Execution[] } | undefined) => {
          const newData = data as { data: Execution[] }
          return old ? { ...old, data: newData.data || old.data } : newData
        },
      )
    }
  }, [queryClient, statusFilter, workflowFilter])

  useSse(iUrl('/api/monitoring/stream'), { onMessage: handleSse })

  // Stats query
  const { data: fetchedStats } = useQuery({
    queryKey: ['monitoring-stats', activeInstanceId],
    queryFn: () => api.get<MonStats>(iUrl('/api/monitoring/stats')),
    refetchInterval: autoRefresh || 30_000,
  })
  const stats = sseStats || fetchedStats

  // Executions query
  const { data: execData, isLoading: execLoading } = useQuery({
    queryKey: ['monitoring-executions', statusFilter, workflowFilter, activeInstanceId],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (workflowFilter) params.set('workflowId', workflowFilter)
      params.set('limit', String(50 * page))
      return api.get<{ data: Execution[] }>(iUrl(`/api/monitoring/executions?${params}`))
    },
    refetchInterval: autoRefresh || undefined,
  })

  // Workflows query
  const { data: wfData } = useQuery({
    queryKey: ['monitoring-workflows', activeInstanceId],
    queryFn: () => api.get<{ data: Workflow[] }>(iUrl('/api/monitoring/workflows')),
    refetchInterval: autoRefresh || undefined,
  })

  const executions = execData?.data ?? []
  const workflows = wfData?.data ?? []

  // Filtered workflows for the tab
  const filteredWorkflows = useMemo(() => {
    let list = workflows
    if (wfActiveFilter === 'active') list = list.filter((w) => w.active)
    if (wfActiveFilter === 'inactive') list = list.filter((w) => !w.active)
    if (wfSearch.trim()) {
      const q = wfSearch.toLowerCase()
      list = list.filter((w) => w.name.toLowerCase().includes(q))
    }
    return list
  }, [workflows, wfActiveFilter, wfSearch])

  // Retry execution
  const retryMut = useMutation({
    mutationFn: (id: string) => api.post(iUrl(`/api/monitoring/executions/${id}/retry`)),
    onSuccess: () => {
      showSuccess('Execution retried')
      queryClient.invalidateQueries({ queryKey: ['monitoring-executions'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Retry failed'),
  })

  // Stop single execution
  const stopMut = useMutation({
    mutationFn: (id: string) => api.post(iUrl(`/api/monitoring/executions/${id}/stop`)),
    onSuccess: () => {
      showSuccess('Execution stopped')
      queryClient.invalidateQueries({ queryKey: ['monitoring-executions'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Stop failed'),
  })

  // Stop all running
  const stopAllMut = useMutation({
    mutationFn: (ids: string[]) => api.post(iUrl('/api/monitoring/executions/stop'), { ids }),
    onSuccess: () => {
      showSuccess('All running executions stopped')
      queryClient.invalidateQueries({ queryKey: ['monitoring-executions'] })
      queryClient.invalidateQueries({ queryKey: ['monitoring-stats'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Stop all failed'),
  })

  // Toggle workflow active
  const toggleActiveMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post(iUrl(`/api/monitoring/workflows/${id}/activate`), { active }),
    onSuccess: () => {
      showSuccess('Workflow updated')
      queryClient.invalidateQueries({ queryKey: ['monitoring-workflows'] })
      queryClient.invalidateQueries({ queryKey: ['monitoring-stats'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Toggle failed'),
  })

  const runningIds = executions.filter((e) => e.status === 'running').map((e) => e.id)

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['monitoring-stats'] })
    queryClient.invalidateQueries({ queryKey: ['monitoring-executions'] })
    queryClient.invalidateQueries({ queryKey: ['monitoring-workflows'] })
  }

  const handleStopAll = async () => {
    if (runningIds.length === 0) return
    const ok = await appConfirm(`Stop all ${runningIds.length} running execution(s)?`, { danger: true, okLabel: 'Stop All' })
    if (ok) stopAllMut.mutate(runningIds)
  }

  const handleRetry = async (id: string) => {
    const ok = await appConfirm('Retry this execution?', { okLabel: 'Retry' })
    if (ok) retryMut.mutate(id)
  }

  const handleStop = async (id: string) => {
    const ok = await appConfirm('Stop this execution?', { danger: true, okLabel: 'Stop' })
    if (ok) stopMut.mutate(id)
  }

  // Chart data: execution history (last 24h grouped by hour)
  const barData = useMemo(() => {
    const now = Date.now()
    const hours = Array.from({ length: 24 }, (_, i) => {
      const d = new Date(now - (23 - i) * 3600_000)
      return { label: `${d.getHours()}:00`, ts: d.getTime(), success: 0, error: 0, running: 0 }
    })
    for (const exec of executions) {
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
  }, [executions])

  const doughnutData = useMemo(() => {
    if (!stats) return null
    const c = stats.counts
    return {
      labels: ['Success', 'Error', 'Running', 'Waiting'],
      datasets: [{
        data: [c.success, c.error, c.running, c.waiting],
        backgroundColor: ['#22c55e', '#ef4444', '#3b82f6', '#f59e0b'],
        borderWidth: 0,
      }],
    }
  }, [stats])

  const hasMore = executions.length === 50 * page

  return (
    <div>
      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-2 mb-4">
          <StatCard label="Health" color={stats.health === 'healthy' ? 'success' : stats.health === 'unhealthy' ? 'warning' : 'danger'}
            value={stats.health === 'healthy' ? 'Healthy' : stats.health === 'unhealthy' ? 'Unhealthy' : 'Unreachable'}
            dot={stats.health === 'healthy' ? 'pulse' : 'static'} />
          <StatCard label="Success" value={String(stats.counts.success)} color="success"
            onClick={() => setStatusFilter(statusFilter === 'success' ? '' : 'success')} active={statusFilter === 'success'} />
          <StatCard label="Error" value={String(stats.counts.error)}
            color={stats.counts.error > 0 ? 'danger' : 'muted'}
            onClick={() => setStatusFilter(statusFilter === 'error' ? '' : 'error')} active={statusFilter === 'error'} />
          <StatCard label="Running" value={String(stats.counts.running)} color="primary"
            onClick={() => setStatusFilter(statusFilter === 'running' ? '' : 'running')} active={statusFilter === 'running'} />
          <StatCard label="Waiting" value={String(stats.counts.waiting)} color="warning"
            onClick={() => setStatusFilter(statusFilter === 'waiting' ? '' : 'waiting')} active={statusFilter === 'waiting'} />
          <StatCard label="Success Rate" value={`${stats.successRate}%`}
            color={stats.successRate >= 80 ? 'success' : stats.successRate >= 50 ? 'warning' : 'danger'} />
          <StatCard label="Active / Total" value={`${stats.activeWorkflows} / ${stats.totalWorkflows}`} color="primary" />
          <StatCard label="Avg Duration" value={formatDuration(stats.avgDurationMs)} color="muted" />
          <StatCard label="Total Executions" value={String(stats.total)} color="muted" />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative">
          <select
            value={autoRefresh}
            onChange={(e) => setAutoRefresh(Number(e.target.value))}
            className="text-[12px] font-semibold px-2.5 py-[5px] rounded-md border border-input-border bg-input-bg text-text-dark appearance-none pr-6"
          >
            <option value={0}>Auto-refresh: Off</option>
            <option value={10000}>Auto-refresh: 10s</option>
            <option value={30000}>Auto-refresh: 30s</option>
            <option value={60000}>Auto-refresh: 60s</option>
          </select>
          <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        </div>
        <button onClick={handleRefresh}
          className="text-[12px] font-semibold px-2.5 py-[5px] rounded-md border border-input-border bg-input-bg text-text-dark hover:bg-card-hover flex items-center gap-1">
          <RefreshCw size={12} /> Refresh
        </button>
        {runningIds.length > 0 && (
          <button onClick={handleStopAll}
            className="text-[12px] font-semibold px-2.5 py-[5px] rounded-md bg-danger text-white hover:bg-danger/90 flex items-center gap-1">
            <StopCircle size={12} /> Stop All Running ({runningIds.length})
          </button>
        )}
      </div>

      {/* Charts row */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
          <div className="lg:col-span-2 bg-card border border-border rounded-lg p-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-2">Execution History (24h)</h4>
            <div className="h-[180px]">
              <Bar data={barData} options={{ responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } }} />
            </div>
          </div>
          {doughnutData && (
            <div className="bg-card border border-border rounded-lg p-3 flex flex-col items-center justify-center">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-2">Status Breakdown</h4>
              <div className="w-[160px] h-[160px]">
                <Doughnut data={doughnutData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-border mb-4">
        <button onClick={() => setTab('executions')}
          className={cn('pb-2 text-sm font-medium border-b-2 transition-colors',
            tab === 'executions' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-dark')}>
          Executions
        </button>
        <button onClick={() => setTab('workflows')}
          className={cn('pb-2 text-sm font-medium border-b-2 transition-colors',
            tab === 'workflows' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-dark')}>
          Workflows
        </button>
      </div>

      {/* Executions tab */}
      {tab === 'executions' && (
        <div>
          {/* Filters row */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs px-2 py-1 border border-input-border rounded-sm bg-input-bg text-text-dark">
              <option value="">All Statuses</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
              <option value="running">Running</option>
              <option value="waiting">Waiting</option>
            </select>
            <select value={workflowFilter} onChange={(e) => setWorkflowFilter(e.target.value)}
              className="text-xs px-2 py-1 border border-input-border rounded-sm bg-input-bg text-text-dark max-w-[200px]">
              <option value="">All Workflows</option>
              {workflows.map((wf) => (
                <option key={wf.id} value={wf.id}>{wf.name}</option>
              ))}
            </select>
          </div>

          {execLoading ? (
            <div className="text-text-muted text-sm flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading executions...</div>
          ) : executions.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-sm">No executions found</div>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg">
                    <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Status</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">ID</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Workflow</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted hidden md:table-cell">Mode</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted hidden lg:table-cell">Duration</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Started</th>
                    <th className="text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {executions.map((exec) => {
                    const duration = exec.stoppedAt
                      ? new Date(exec.stoppedAt).getTime() - new Date(exec.startedAt).getTime()
                      : 0
                    return (
                      <tr key={exec.id} className="hover:bg-card-hover cursor-pointer"
                        onClick={() => navigate(`/monitoring/${exec.id}`)}>
                        <td className="px-3 py-2"><StatusIcon status={exec.status} /></td>
                        <td className="px-3 py-2 text-text-muted text-xs font-mono">#{exec.id}</td>
                        <td className="px-3 py-2 text-text-dark truncate max-w-[200px]">
                          {esc(exec.workflowName || `Workflow #${exec.workflowId}`)}
                        </td>
                        <td className="px-3 py-2 text-text-muted capitalize hidden md:table-cell">{exec.mode}</td>
                        <td className="px-3 py-2 text-text-muted hidden lg:table-cell">
                          {duration > 0 ? formatDuration(duration) : exec.status === 'running' ? 'running...' : '-'}
                        </td>
                        <td className="px-3 py-2 text-text-muted">{timeAgo(exec.startedAt)}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            {exec.status === 'error' && (
                              <button onClick={() => handleRetry(exec.id)} className="p-1 text-text-muted hover:text-primary" title="Retry">
                                <RotateCcw size={14} />
                              </button>
                            )}
                            {(exec.status === 'running' || exec.status === 'waiting') && (
                              <button onClick={() => handleStop(exec.id)} className="p-1 text-text-muted hover:text-danger" title="Stop">
                                <Square size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs text-text-muted">
                <span>Showing 1-{executions.length}</span>
                {hasMore && (
                  <button onClick={() => setPage((p) => p + 1)}
                    className="text-[12px] font-semibold px-2.5 py-[5px] rounded-md border border-input-border bg-input-bg text-text-dark hover:bg-card-hover">
                    Load More
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Workflows tab */}
      {tab === 'workflows' && (
        <div>
          {/* KPI row */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs text-text-muted">Total: <strong className="text-text-dark">{workflows.length}</strong></span>
            <span className="text-xs text-text-muted">Active: <strong className="text-success">{workflows.filter((w) => w.active).length}</strong></span>
            <span className="text-xs text-text-muted">Inactive: <strong className="text-text-dark">{workflows.filter((w) => !w.active).length}</strong></span>
          </div>

          {/* Search and filter */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
              <input value={wfSearch} onChange={(e) => setWfSearch(e.target.value)}
                placeholder="Search workflows..."
                className="text-xs pl-6 pr-2 py-1.5 border border-input-border rounded-sm bg-input-bg text-text-dark w-[200px]" />
            </div>
            {(['all', 'active', 'inactive'] as const).map((f) => (
              <button key={f} onClick={() => setWfActiveFilter(f)}
                className={cn('text-[12px] font-semibold px-2.5 py-[5px] rounded-md border capitalize',
                  wfActiveFilter === f ? 'border-primary bg-primary/10 text-primary' : 'border-input-border bg-input-bg text-text-dark hover:bg-card-hover')}>
                {f}
              </button>
            ))}
          </div>

          {/* Workflow grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredWorkflows.map((wf) => (
              <div key={wf.id} className="bg-card border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-text-dark truncate mr-2">{esc(wf.name)}</h3>
                  <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0',
                    wf.active ? 'bg-success-light text-success' : 'bg-border-light text-text-muted')}>
                    {wf.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-text-muted mb-2">
                  <span>{wf.nodes?.length ?? 0} nodes</span>
                  {wf.updatedAt && <span>{timeAgo(wf.updatedAt)}</span>}
                </div>

                {/* Active toggle */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-text-muted">Active</span>
                  <button onClick={() => toggleActiveMut.mutate({ id: wf.id, active: !wf.active })}
                    className={cn('relative w-9 h-5 rounded-full transition-colors',
                      wf.active ? 'bg-success' : 'bg-border')}>
                    <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                      wf.active ? 'translate-x-4' : 'translate-x-0.5')} />
                  </button>
                </div>

                {/* NodeFlow preview */}
                {wf.nodes && wf.nodes.length > 0 && (
                  <div className="cursor-pointer" onClick={() => setPreviewWf(wf)}>
                    <NodeFlow nodes={wf.nodes} compact />
                  </div>
                )}
              </div>
            ))}
            {filteredWorkflows.length === 0 && (
              <div className="col-span-full text-center py-8 text-text-muted text-sm">No workflows match the filter</div>
            )}
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewWf && (
        <PreviewModal
          title={previewWf.name}
          workflowData={{ nodes: previewWf.nodes || [], connections: {} }}
          onClose={() => setPreviewWf(null)}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  ExecutionDetailPage                                                */
/* ------------------------------------------------------------------ */

export function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()
  const iUrl = useInstanceStore((s) => s.url)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const activeInstances = useInstanceStore((s) => s.instances)
  const activeInstanceId2 = useInstanceStore((s) => s.activeId)

  const { data: exec, isLoading } = useQuery({
    queryKey: ['execution-detail', id],
    queryFn: () => api.get<Record<string, unknown>>(iUrl(`/api/monitoring/executions/${id}`)),
    enabled: !!id,
  })

  const retryMut = useMutation({
    mutationFn: () => api.post(iUrl(`/api/monitoring/executions/${id}/retry`)),
    onSuccess: () => {
      showSuccess('Execution retried')
      queryClient.invalidateQueries({ queryKey: ['execution-detail', id] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Retry failed'),
  })

  const stopMut = useMutation({
    mutationFn: () => api.post(iUrl(`/api/monitoring/executions/${id}/stop`)),
    onSuccess: () => {
      showSuccess('Execution stopped')
      queryClient.invalidateQueries({ queryKey: ['execution-detail', id] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Stop failed'),
  })

  const handleRetry = async () => {
    const ok = await appConfirm('Retry this execution?', { okLabel: 'Retry' })
    if (ok) retryMut.mutate()
  }

  const handleStop = async () => {
    const ok = await appConfirm('Stop this execution?', { danger: true, okLabel: 'Stop' })
    if (ok) stopMut.mutate()
  }

  const handleAnalyzeError = async () => {
    if (!exec) return
    setAiAnalyzing(true)
    setAiAnalysis(null)
    try {
      const errorNode = sortedNodes.find(([, runs]) => runs[runs.length - 1]?.error)
      const errorMsg = errorNode ? (errorNode[1][errorNode[1].length - 1]?.error as Record<string, string>)?.message : ''
      const res = await api.post<{ analysis: string }>(iUrl('/api/ai/analyze-error'), {
        workflowName,
        errorMessage: errorMsg || globalError?.message || 'Unknown error',
        nodeName: errorNode?.[0] || '',
        nodeType: '',
      })
      setAiAnalysis(res.analysis || 'No analysis available.')
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Analysis failed')
    } finally {
      setAiAnalyzing(false)
    }
  }

  // Build the n8n instance URL for "Open in n8n"
  const activeInst = activeInstances.find((i) => i.id === activeInstanceId2)
  const n8nBaseUrl = activeInst?.base_url?.replace(/\/+$/, '') || ''

  const toggleNode = (name: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const status = (exec?.status as string) ?? ''
  const workflowName: string = (exec?.workflowName as string) || `Workflow #${String(exec?.workflowId ?? '')}`
  const startedAt = (exec?.startedAt as string) ?? ''
  const stoppedAt = exec?.stoppedAt as string | undefined
  const mode = (exec?.mode as string) ?? ''
  const duration = stoppedAt && startedAt ? new Date(stoppedAt).getTime() - new Date(startedAt).getTime() : 0
  const nodeData = (exec?.data as Record<string, unknown>)?.resultData as Record<string, unknown> | undefined
  const runData = nodeData?.runData as Record<string, Array<Record<string, unknown>>> | undefined
  const globalError = nodeData?.error as Record<string, string> | undefined

  // Sort nodes by startTime — must be before any early return
  const sortedNodes = useMemo(() => {
    if (!runData) return []
    return Object.entries(runData).sort(([, aRuns], [, bRuns]) => {
      const aTime = (aRuns[0]?.startTime as number) || 0
      const bTime = (bRuns[0]?.startTime as number) || 0
      return aTime - bTime
    })
  }, [runData])

  if (isLoading) {
    return <div className="text-text-muted text-sm flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading execution...</div>
  }
  if (!exec) {
    return <div className="text-danger text-sm">Execution not found</div>
  }

  return (
    <div>
      <button onClick={() => navigate('/monitoring')}
        className="text-sm text-primary hover:text-primary-hover mb-4 flex items-center gap-1">
        <ArrowLeft size={14} /> Back to Monitoring
      </button>

      {/* Header card */}
      <div className="bg-card border border-border rounded-lg p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <StatusIcon status={status} />
          <h2 className="text-lg font-semibold text-text-dark">Execution #{id}</h2>
          <span className="text-sm text-text-muted">- {esc(String(workflowName))}</span>
          <StatusBadge status={status} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Started</div>
            <div className="text-text-dark">{startedAt ? new Date(startedAt).toLocaleString() : '-'}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Finished</div>
            <div className="text-text-dark">{stoppedAt ? new Date(stoppedAt).toLocaleString() : '-'}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Duration</div>
            <div className="text-text-dark">{duration > 0 ? formatDuration(duration) : status === 'running' ? 'running...' : '-'}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Mode</div>
            <div className="text-text-dark capitalize">{mode}</div>
          </div>
        </div>
        <div className="flex gap-2">
          {status === 'error' && (
            <button onClick={handleRetry}
              className="text-[12px] font-semibold px-2.5 py-[5px] rounded-md bg-primary text-white hover:bg-primary-hover flex items-center gap-1">
              <RotateCcw size={12} /> Retry
            </button>
          )}
          {(status === 'running' || status === 'waiting') && (
            <button onClick={handleStop}
              className="text-[12px] font-semibold px-2.5 py-[5px] rounded-md bg-danger text-white hover:bg-danger/90 flex items-center gap-1">
              <Square size={12} /> Stop
            </button>
          )}
          <button onClick={() => setShowReportModal(true)}
            className="text-[12px] font-semibold px-2.5 py-[5px] rounded-md border border-border text-text-muted hover:bg-card-hover flex items-center gap-1">
            <AlertTriangle size={12} /> Report Issue
          </button>
          {status === 'error' && (
            <button onClick={handleAnalyzeError} disabled={aiAnalyzing}
              className={cn('text-[12px] font-semibold px-2.5 py-[5px] rounded-md border flex items-center gap-1',
                aiAnalysis ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-muted hover:bg-card-hover',
                aiAnalyzing && 'opacity-50')}>
              <Sparkles size={12} /> {aiAnalyzing ? 'Analyzing...' : 'Analyze Error'}
            </button>
          )}
          {n8nBaseUrl && (
            <a href={`${n8nBaseUrl}/execution/${id}`} target="_blank" rel="noopener noreferrer"
              className="text-[12px] font-semibold px-2.5 py-[5px] rounded-md border border-border text-text-muted hover:bg-card-hover flex items-center gap-1">
              <ExternalLink size={12} /> Open in n8n
            </a>
          )}
        </div>
      </div>

      {/* Global error block */}
      {(globalError || !!(exec?.data as Record<string, unknown>)?.error) && (
        <div className="bg-danger-light border border-danger/30 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <XCircle size={16} className="text-danger shrink-0" />
            <h3 className="text-sm font-semibold text-danger">Execution Error</h3>
          </div>
          <p className="text-sm text-danger/90">{esc(globalError?.message || JSON.stringify(globalError))}</p>
        </div>
      )}

      {/* AI Error Analysis */}
      {aiAnalyzing && (
        <div className="bg-card border border-border rounded-lg p-6 mb-4 text-center">
          <Loader2 size={20} className="animate-spin text-text-muted mx-auto mb-2" />
          <p className="text-sm text-text-muted">Analyzing error...</p>
        </div>
      )}
      {aiAnalysis && !aiAnalyzing && (
        <div className="bg-card border border-border rounded-lg p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-dark flex items-center gap-1.5">
              <Sparkles size={14} className="text-primary" /> AI Error Analysis
            </h3>
            <button onClick={() => setShowReportModal(true)}
              className="text-[11px] font-semibold px-2 py-1 bg-danger text-white rounded-md hover:bg-danger/90 flex items-center gap-1">
              <AlertTriangle size={11} /> Report Issue
            </button>
          </div>
          <div className="text-[13px] text-text-dark leading-relaxed [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:mt-4 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:mb-1 [&_h3]:mt-2 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_li]:mb-0.5 [&_strong]:font-semibold [&_code]:bg-bg [&_code]:px-1 [&_code]:rounded [&_code]:text-xs"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(aiAnalysis || '') }}
          />
        </div>
      )}

      {/* Report Issue Modal */}
      {showReportModal && exec && (
        <ReportIssueModal
          workflowName={workflowName}
          workflowId={String(exec?.workflowId ?? '')}
          executionId={id || ''}
          status={status}
          startedAt={startedAt}
          errorMessage={globalError?.message || ''}
          failedNode={sortedNodes.find(([, runs]) => runs[runs.length - 1]?.error)?.[0] || ''}
          aiAnalysis={aiAnalysis}
          onClose={() => setShowReportModal(false)}
          onCreated={(ticketId) => { setShowReportModal(false); showSuccess(`Ticket #${ticketId} created`); navigate(`/tickets/${ticketId}`) }}
        />
      )}

      {/* Node timeline */}
      {sortedNodes.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-3">Node Timeline</h3>
          <div className="space-y-2">
            {sortedNodes.map(([nodeName, runs]) => {
              const lastRun = runs[runs.length - 1]
              const nodeStatus = lastRun?.error ? 'error' : 'success'
              const nodeError = lastRun?.error as Record<string, string> | undefined
              const startTime = lastRun?.startTime as number | undefined
              const endTime = lastRun?.executionTime as number | undefined
              const executionMs = endTime ?? (startTime ? Date.now() - startTime : 0)
              const outputData = lastRun?.data as Record<string, unknown> | undefined
              const mainOutput = outputData?.main as Array<Array<Record<string, unknown>>> | undefined
              const itemCount = mainOutput ? mainOutput.flat().length : 0
              const isExpanded = expandedNodes.has(nodeName)

              return (
                <div key={nodeName}
                  className={cn('bg-card border rounded-lg p-3', nodeStatus === 'error' ? 'border-danger/30' : 'border-border')}>
                  <div className="flex items-center gap-2">
                    <StatusIcon status={nodeStatus} />
                    <span className="text-sm font-medium text-text-dark flex-1">{esc(nodeName)}</span>
                    <span className="text-xs text-text-muted">{executionMs}ms</span>
                  </div>
                  {nodeError && (
                    <div className="mt-2 text-xs text-danger bg-danger-light rounded p-2">
                      {esc(nodeError.message || JSON.stringify(nodeError))}
                    </div>
                  )}
                  {itemCount > 0 && (
                    <div className="mt-2">
                      <button onClick={() => toggleNode(nodeName)}
                        className="text-xs text-primary hover:text-primary-hover flex items-center gap-1">
                        <ChevronDown size={12} className={cn('transition-transform', isExpanded && 'rotate-180')} />
                        {itemCount} item{itemCount !== 1 ? 's' : ''} output
                      </button>
                      {isExpanded && mainOutput && (
                        <pre className="mt-2 text-[11px] text-text-muted bg-bg rounded p-2 overflow-x-auto max-h-[300px]">
                          {JSON.stringify(mainOutput, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Report Issue Modal (from execution detail)                         */
/* ------------------------------------------------------------------ */

function ReportIssueModal({
  workflowName, workflowId, executionId, status, startedAt, errorMessage, failedNode, aiAnalysis, onClose, onCreated,
}: {
  workflowName: string; workflowId: string; executionId: string; status: string; startedAt: string
  errorMessage: string; failedNode: string; aiAnalysis: string | null
  onClose: () => void; onCreated: (id: number) => void
}) {
  const { error: showError } = useToast()
  const [title, setTitle] = useState(`Workflow failed: ${workflowName}`)
  const [description, setDescription] = useState(() => {
    let desc = `<p><strong>Failed node:</strong> ${failedNode}</p><p><strong>Error:</strong> ${esc(errorMessage)}</p>`
    if (aiAnalysis) desc += `<p><strong>AI Analysis:</strong></p>${markdownToHtml(aiAnalysis)}`
    return desc
  })
  const [priority, setPriority] = useState('high')
  const [categoryId, setCategoryId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: ticketCategories } = useQuery({
    queryKey: ['ticket-categories'],
    queryFn: async () => {
      const r = await api.get<Array<{ id: number; name: string }>>('/api/ticket-categories')
      return Array.isArray(r) ? r : []
    },
  })

  const { data: assignableUsers } = useQuery({
    queryKey: ['assignable-users'],
    queryFn: async () => {
      const r = await api.get<Array<{ id: number; username: string }>>('/api/tickets/assignable-users')
      return Array.isArray(r) ? r : []
    },
  })

  async function handleCreate() {
    if (!title.trim()) return showError('Title is required')
    setSaving(true)
    try {
      const res = await api.post<{ id: number }>('/api/tickets', {
        title: title.trim(),
        description,
        priority,
        ...(categoryId ? { category_id: Number(categoryId) } : {}),
        ...(assigneeId ? { assigned_to: Number(assigneeId) } : {}),
        execution_data: {
          workflow_name: workflowName,
          execution_id: executionId,
          execution_status: status,
          started_at: startedAt || null,
          failed_node: failedNode || null,
          error_message: errorMessage || null,
          ai_analysis: aiAnalysis || null,
        },
      })
      // Link execution to ticket
      try {
        await api.post(`/api/tickets/${res.id}/executions`, {
          execution_id: executionId,
          workflow_id: workflowId,
          workflow_name: workflowName,
          status,
        })
      } catch { /* non-critical */ }
      onCreated(res.id)
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Failed to create ticket')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center modal-overlay bg-black/30" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg shadow-lg mx-4 flex flex-col overflow-hidden"
        style={{ width: '90vw', maxWidth: '700px', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <h2 className="text-[15px] font-bold text-text-dark">Report Execution Issue</h2>
          <button onClick={onClose} className="text-text-xmuted hover:text-text-dark text-lg">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-1">Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-input-border rounded-md bg-input-bg text-sm text-text-dark focus-ring" />
          </div>
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-1">Description</label>
            <div className="border border-input-border rounded-md overflow-hidden bg-input-bg">
              <div className="px-3 py-2 text-sm text-text-dark min-h-[150px] max-h-[300px] overflow-y-auto"
                contentEditable suppressContentEditableWarning
                dangerouslySetInnerHTML={{ __html: description }}
                onBlur={(e) => setDescription(e.currentTarget.innerHTML)} />
            </div>
          </div>

          {/* Execution context */}
          <div className="bg-bg border border-border-light rounded-md p-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-2 flex items-center gap-1">
              <Zap size={11} /> Execution Context
            </h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-text-muted">Workflow:</span><span className="text-text-dark">{esc(workflowName)}</span>
              <span className="text-text-muted">Execution:</span><span className="text-text-dark">#{executionId}</span>
              <span className="text-text-muted">Status:</span><span className="text-text-dark">{status}</span>
              <span className="text-text-muted">Time:</span><span className="text-text-dark">{startedAt ? new Date(startedAt).toLocaleString() : '-'}</span>
              {failedNode && <><span className="text-text-muted">Failed Node:</span><span className="text-text-dark">{esc(failedNode)}</span></>}
              {errorMessage && <><span className="text-text-muted">Error:</span><span className="text-text-dark truncate">{esc(errorMessage)}</span></>}
            </div>
          </div>

          {/* Priority, Category, Assign */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-1">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)}
                className="w-full px-2 py-1.5 border border-input-border rounded-md bg-input-bg text-sm text-text-dark">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-1">Category</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-2 py-1.5 border border-input-border rounded-md bg-input-bg text-sm text-text-dark">
                <option value="">None</option>
                {(ticketCategories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-1">Assign To</label>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-2 py-1.5 border border-input-border rounded-md bg-input-bg text-sm text-text-dark">
                <option value="">Unassigned</option>
                {(assignableUsers ?? []).map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} className="text-[12px] font-semibold px-3 py-1.5 border border-border text-text-muted rounded-md hover:bg-bg">Cancel</button>
          <button onClick={handleCreate} disabled={saving}
            className="text-[12px] font-semibold px-3 py-1.5 bg-primary text-white rounded-md hover:bg-primary-hover disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  color,
  onClick,
  active,
  dot,
}: {
  label: string
  value: string
  color: string
  onClick?: () => void
  active?: boolean
  dot?: 'pulse' | 'static'
}) {
  const colorMap: Record<string, string> = {
    success: 'text-success',
    danger: 'text-danger',
    warning: 'text-warning',
    primary: 'text-primary',
    muted: 'text-text-muted',
  }
  const dotColorMap: Record<string, string> = {
    success: 'bg-success',
    danger: 'bg-danger',
    warning: 'bg-warning',
    primary: 'bg-primary',
    muted: 'bg-text-muted',
  }
  return (
    <div onClick={onClick}
      className={cn('bg-card border rounded-lg p-3 text-center',
        onClick ? 'cursor-pointer hover:bg-card-hover' : '',
        active ? 'border-primary ring-1 ring-primary/30' : 'border-border')}>
      {dot && (
        <div className="flex justify-center mb-1">
          <span className={cn('inline-block w-2.5 h-2.5 rounded-full', dotColorMap[color] || 'bg-text-muted',
            dot === 'pulse' && 'animate-pulse')} />
        </div>
      )}
      <div className={cn('text-lg font-bold leading-tight', colorMap[color] || '')}>{value}</div>
      <div className="text-[10px] text-text-muted mt-0.5 leading-tight">{label}</div>
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'success':
      return <CheckCircle size={16} className="text-success shrink-0" />
    case 'error':
      return <XCircle size={16} className="text-danger shrink-0" />
    case 'running':
      return <Loader2 size={16} className="text-primary shrink-0 animate-spin" />
    case 'waiting':
      return <Clock size={16} className="text-warning shrink-0" />
    default:
      return <Zap size={16} className="text-text-muted shrink-0" />
  }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: 'bg-success-light text-success',
    error: 'bg-danger-light text-danger',
    running: 'bg-primary/10 text-primary',
    waiting: 'bg-warning/10 text-warning',
  }
  return (
    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded capitalize', map[status] || 'bg-border-light text-text-muted')}>
      {status}
    </span>
  )
}
