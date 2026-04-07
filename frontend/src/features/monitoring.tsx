import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import { useSse } from '@/hooks/useSse'
import { useToast } from '@/hooks/useToast'
import { esc, formatDuration, timeAgo, cn } from '@/lib/utils'
import {
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Square,
  RotateCcw,
  AlertTriangle,
  Zap,
} from 'lucide-react'

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
  nodes?: Array<{ type: string; name: string }>
}

export function MonitoringPage() {
  const navigate = useNavigate()
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'executions' | 'workflows'>('executions')
  const [statusFilter, setStatusFilter] = useState('')
  const [workflowFilter, setWorkflowFilter] = useState('')
  const [sseStats, setSseStats] = useState<MonStats | null>(null)

  // SSE for live updates
  const handleSse = useCallback((event: string, data: unknown) => {
    if (event === 'stats') {
      setSseStats(data as MonStats)
    }
    if (event === 'executions') {
      queryClient.setQueryData(['monitoring-executions', '', ''], (old: { data: Execution[] } | undefined) => {
        const newData = data as { data: Execution[] }
        return old ? { ...old, data: newData.data || old.data } : newData
      })
    }
  }, [queryClient])

  useSse('/api/monitoring/stream', { onMessage: handleSse })

  // Fetch stats (fallback when SSE hasn't delivered yet)
  const { data: fetchedStats } = useQuery({
    queryKey: ['monitoring-stats'],
    queryFn: () => api.get<MonStats>('/api/monitoring/stats'),
    refetchInterval: 30_000,
  })

  const stats = sseStats || fetchedStats

  // Fetch executions
  const { data: execData, isLoading: execLoading } = useQuery({
    queryKey: ['monitoring-executions', statusFilter, workflowFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (workflowFilter) params.set('workflowId', workflowFilter)
      params.set('limit', '50')
      return api.get<{ data: Execution[] }>(`/api/monitoring/executions?${params}`)
    },
  })

  // Fetch workflows
  const { data: wfData } = useQuery({
    queryKey: ['monitoring-workflows'],
    queryFn: () => api.get<{ data: Workflow[] }>('/api/monitoring/workflows'),
  })

  const executions = execData?.data ?? []
  const workflows = wfData?.data ?? []

  // Retry execution
  const retryMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/monitoring/executions/${id}/retry`),
    onSuccess: () => {
      showSuccess('Execution retried')
      queryClient.invalidateQueries({ queryKey: ['monitoring-executions'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Retry failed'),
  })

  // Stop execution
  const stopMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/monitoring/executions/${id}/stop`),
    onSuccess: () => {
      showSuccess('Execution stopped')
      queryClient.invalidateQueries({ queryKey: ['monitoring-executions'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Stop failed'),
  })

  return (
    <div>
      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <StatCard
            label="Health"
            value={stats.health === 'healthy' ? 'Healthy' : stats.health === 'unhealthy' ? 'Unhealthy' : 'Unreachable'}
            color={stats.health === 'healthy' ? 'success' : stats.health === 'unhealthy' ? 'warning' : 'danger'}
          />
          <StatCard
            label="Success"
            value={String(stats.counts.success)}
            color="success"
            onClick={() => setStatusFilter(statusFilter === 'success' ? '' : 'success')}
            active={statusFilter === 'success'}
          />
          <StatCard
            label="Error"
            value={String(stats.counts.error)}
            color={stats.counts.error > 0 ? 'danger' : 'muted'}
            onClick={() => setStatusFilter(statusFilter === 'error' ? '' : 'error')}
            active={statusFilter === 'error'}
          />
          <StatCard
            label="Running"
            value={String(stats.counts.running)}
            color="primary"
            onClick={() => setStatusFilter(statusFilter === 'running' ? '' : 'running')}
            active={statusFilter === 'running'}
          />
          <StatCard
            label="Success Rate"
            value={`${stats.successRate}%`}
            color={stats.successRate >= 80 ? 'success' : stats.successRate >= 50 ? 'warning' : 'danger'}
          />
          <StatCard
            label="Active Workflows"
            value={`${stats.activeWorkflows} / ${stats.totalWorkflows}`}
            color="primary"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-border mb-4">
        <button
          onClick={() => setTab('executions')}
          className={cn(
            'pb-2 text-sm font-medium border-b-2 transition-colors',
            tab === 'executions' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-dark',
          )}
        >
          Executions
        </button>
        <button
          onClick={() => setTab('workflows')}
          className={cn(
            'pb-2 text-sm font-medium border-b-2 transition-colors',
            tab === 'workflows' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-dark',
          )}
        >
          Workflows
        </button>

        {/* Filters (executions tab only) */}
        {tab === 'executions' && (
          <div className="flex items-center gap-2 ml-auto pb-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs px-2 py-1 border border-input-border rounded-sm bg-input-bg text-text-dark"
            >
              <option value="">All Statuses</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
              <option value="running">Running</option>
              <option value="waiting">Waiting</option>
            </select>
            <select
              value={workflowFilter}
              onChange={(e) => setWorkflowFilter(e.target.value)}
              className="text-xs px-2 py-1 border border-input-border rounded-sm bg-input-bg text-text-dark max-w-[200px]"
            >
              <option value="">All Workflows</option>
              {workflows.map((wf) => (
                <option key={wf.id} value={wf.id}>{wf.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Executions tab */}
      {tab === 'executions' && (
        <div>
          {execLoading ? (
            <div className="text-text-muted text-sm">Loading executions...</div>
          ) : executions.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-sm">No executions found</div>
          ) : (
            <div className="bg-card border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg">
                    <th className="text-left px-3 py-2 text-text-muted font-medium text-xs">Status</th>
                    <th className="text-left px-3 py-2 text-text-muted font-medium text-xs">Workflow</th>
                    <th className="text-left px-3 py-2 text-text-muted font-medium text-xs hidden md:table-cell">Mode</th>
                    <th className="text-left px-3 py-2 text-text-muted font-medium text-xs hidden lg:table-cell">Duration</th>
                    <th className="text-left px-3 py-2 text-text-muted font-medium text-xs">Started</th>
                    <th className="text-right px-3 py-2 text-text-muted font-medium text-xs">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {executions.map((exec) => {
                    const duration = exec.stoppedAt
                      ? new Date(exec.stoppedAt).getTime() - new Date(exec.startedAt).getTime()
                      : 0
                    return (
                      <tr
                        key={exec.id}
                        className="hover:bg-card-hover cursor-pointer"
                        onClick={() => navigate(`/monitoring/${exec.id}`)}
                      >
                        <td className="px-3 py-2">
                          <StatusIcon status={exec.status} />
                        </td>
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
                              <button
                                onClick={() => retryMut.mutate(exec.id)}
                                className="p-1 text-text-muted hover:text-primary"
                                title="Retry"
                              >
                                <RotateCcw size={14} />
                              </button>
                            )}
                            {exec.status === 'running' && (
                              <button
                                onClick={() => stopMut.mutate(exec.id)}
                                className="p-1 text-text-muted hover:text-danger"
                                title="Stop"
                              >
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
            </div>
          )}
        </div>
      )}

      {/* Workflows tab */}
      {tab === 'workflows' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {workflows.map((wf) => (
            <div key={wf.id} className="bg-card border border-border rounded-md p-3">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-text-dark truncate">{esc(wf.name)}</h3>
                <span className={cn(
                  'text-[10px] font-medium px-1.5 py-0.5 rounded',
                  wf.active ? 'bg-success-light text-success' : 'bg-border-light text-text-muted',
                )}>
                  {wf.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="text-xs text-text-muted">
                {wf.nodes?.length ?? 0} nodes
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Execution detail page
export function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { error: showError, success: showSuccess } = useToast()

  const { data: exec, isLoading } = useQuery({
    queryKey: ['execution-detail', id],
    queryFn: () => api.get<Record<string, unknown>>(`/api/monitoring/executions/${id}`),
    enabled: !!id,
  })

  const retryMut = useMutation({
    mutationFn: () => api.post(`/api/monitoring/executions/${id}/retry`),
    onSuccess: () => showSuccess('Execution retried'),
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Retry failed'),
  })

  if (isLoading) return <div className="text-text-muted text-sm">Loading execution...</div>
  if (!exec) return <div className="text-danger text-sm">Execution not found</div>

  const status = exec.status as string
  const workflowName = (exec.workflowName as string) || `Workflow #${exec.workflowId}`
  const startedAt = exec.startedAt as string
  const stoppedAt = exec.stoppedAt as string | undefined
  const duration = stoppedAt
    ? new Date(stoppedAt).getTime() - new Date(startedAt).getTime()
    : 0
  const nodeData = (exec.data as Record<string, unknown>)?.resultData as Record<string, unknown> | undefined
  const runData = nodeData?.runData as Record<string, Array<Record<string, unknown>>> | undefined

  return (
    <div>
      <button
        onClick={() => navigate('/monitoring')}
        className="text-sm text-primary hover:text-primary-hover mb-4"
      >
        &larr; Back to Monitoring
      </button>

      {/* Header */}
      <div className="bg-card border border-border rounded-md p-4 mb-4">
        <div className="flex items-center gap-3 mb-2">
          <StatusIcon status={status} />
          <h2 className="text-lg font-semibold text-text-dark">{esc(workflowName)}</h2>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-text-muted">
          <span>Status: <strong className="text-text-dark capitalize">{status}</strong></span>
          <span>Mode: <strong className="text-text-dark capitalize">{exec.mode as string}</strong></span>
          {duration > 0 && <span>Duration: <strong className="text-text-dark">{formatDuration(duration)}</strong></span>}
          <span>Started: <strong className="text-text-dark">{timeAgo(startedAt)}</strong></span>
        </div>
        <div className="mt-3 flex gap-2">
          {status === 'error' && (
            <button
              onClick={() => retryMut.mutate()}
              className="text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover flex items-center gap-1"
            >
              <RotateCcw size={12} /> Retry
            </button>
          )}
          <button
            onClick={() => navigate(`/tickets?from_execution=${id}`)}
            className="text-xs px-3 py-1.5 border border-border text-text-muted rounded-sm hover:bg-card-hover flex items-center gap-1"
          >
            <AlertTriangle size={12} /> Report Issue
          </button>
        </div>
      </div>

      {/* Node execution data */}
      {runData && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-text-dark mb-2">Node Executions</h3>
          {Object.entries(runData).map(([nodeName, runs]) => {
            const lastRun = runs[runs.length - 1]
            const nodeStatus = lastRun?.error ? 'error' : 'success'
            const nodeError = lastRun?.error as Record<string, string> | undefined
            return (
              <div
                key={nodeName}
                className={cn(
                  'bg-card border rounded-md p-3',
                  nodeStatus === 'error' ? 'border-danger/30' : 'border-border',
                )}
              >
                <div className="flex items-center gap-2">
                  <StatusIcon status={nodeStatus} />
                  <span className="text-sm font-medium text-text-dark">{esc(nodeName)}</span>
                </div>
                {nodeError && (
                  <div className="mt-2 text-xs text-danger bg-danger-light rounded p-2">
                    {esc(nodeError.message || JSON.stringify(nodeError))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// --- Sub-components ---

function StatCard({
  label,
  value,
  color,
  onClick,
  active,
}: {
  label: string
  value: string
  color: string
  onClick?: () => void
  active?: boolean
}) {
  const colorMap: Record<string, string> = {
    success: 'text-success',
    danger: 'text-danger',
    warning: 'text-warning',
    primary: 'text-primary',
    muted: 'text-text-muted',
  }
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-card border rounded-md p-3 text-center',
        onClick ? 'cursor-pointer hover:bg-card-hover' : '',
        active ? 'border-primary' : 'border-border',
      )}
    >
      <div className={`text-xl font-bold ${colorMap[color] || ''}`}>{value}</div>
      <div className="text-xs text-text-muted mt-0.5">{label}</div>
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
