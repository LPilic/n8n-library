import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { RefreshCw, Search, Sparkles, Loader2 } from 'lucide-react'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js'
import { Line } from 'react-chartjs-2'
import { cn, esc } from '@/lib/utils'
import { markdownToHtml } from '@/lib/markdown'
import { useToast } from '@/hooks/useToast'
import { useInstanceStore } from '@/stores/instance'
import { sanitizeHtml } from '@/lib/sanitize'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface MetricEntry {
  name: string
  value: number
  type: string
  help?: string
  labels?: Record<string, string>
}

export interface HistoryPoint {
  ts: number
  metrics: Record<string, number>
}

export interface Worker {
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

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: { display: true, labels: { font: { size: 11 }, boxWidth: 12, padding: 8 } },
    tooltip: { mode: 'index' as const, intersect: false },
  },
  scales: {
    x: { ticks: { maxTicksLimit: 6, font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
    y: { ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
  },
  elements: { line: { tension: 0.35 }, point: { radius: 0, hitRadius: 6 } },
}

// ─── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string
  sub: string
  color?: 'danger' | 'warning' | 'success'
}) {
  const valueColor =
    color === 'danger' ? 'text-danger' : color === 'warning' ? 'text-warning' : 'text-text-dark'

  return (
    <div className="bg-card border border-border rounded-md overflow-hidden flex">
      <div className="w-1 shrink-0 bg-success" />
      <div className="flex-1 px-3 py-2.5">
        <div className={cn('text-xl font-bold leading-tight', valueColor)}>{value}</div>
        <div className="text-[10px] font-semibold text-text-xmuted uppercase tracking-wider mt-0.5">{label}</div>
        <div className="text-[11px] text-text-muted mt-0.5 truncate">{sub}</div>
      </div>
    </div>
  )
}

// ─── Chart wrapper ──────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-md p-3">
      <div className="text-xs font-semibold text-text-dark mb-2">{title}</div>
      <div style={{ height: 160 }}>{children}</div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export function ObservabilityPage() {
  const iUrl = useInstanceStore((s) => s.url)
  const activeInstanceId = useInstanceStore((s) => s.activeId)
  const instanceLoaded = useInstanceStore((s) => s.loaded)
  const { error: showError } = useToast()
  const queryClient = useQueryClient()

  const [refreshInterval, setRefreshInterval] = useState(20)
  const [metricSearch, setMetricSearch] = useState('')
  const [updatedAt, setUpdatedAt] = useState(nowHHMMSS())
  const [aiLoading, setAiLoading] = useState(false)
  const [aiReport, setAiReport] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const instanceId = activeInstanceId

  const refetchAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['obs-metrics', instanceId] })
    queryClient.invalidateQueries({ queryKey: ['obs-history', instanceId] })
    queryClient.invalidateQueries({ queryKey: ['obs-workers', instanceId] })
    setUpdatedAt(nowHHMMSS())
  }, [queryClient, instanceId])

  // Auto-refresh
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (refreshInterval > 0) {
      intervalRef.current = setInterval(refetchAll, refreshInterval * 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [refreshInterval, refetchAll])

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['obs-metrics', instanceId],
    queryFn: async () => {
      const raw = await api.get<Record<string, Array<{ labels?: Record<string, string>; value: number }>>>(
        iUrl('/api/monitoring/metrics')
      )
      const entries: MetricEntry[] = []
      for (const [name, samples] of Object.entries(raw)) {
        for (const s of samples) {
          entries.push({ name, value: s.value, type: 'gauge', labels: s.labels, help: '' })
        }
      }
      return entries
    },
    enabled: instanceLoaded,
    refetchInterval: false,
  })

  const { data: history } = useQuery({
    queryKey: ['obs-history', instanceId],
    queryFn: async () => {
      const raw = await api.get<Array<Record<string, unknown>>>(iUrl('/api/monitoring/metrics/history'))
      return normalizeHistory(raw)
    },
    enabled: instanceLoaded,
    refetchInterval: false,
  })

  const { data: workers } = useQuery({
    queryKey: ['obs-workers', instanceId],
    queryFn: () => api.get<Worker[]>(iUrl('/api/monitoring/workers')),
    enabled: instanceLoaded,
    refetchInterval: false,
  })

  // ── KPI extraction ──────────────────────────────────────────────────────

  const metricVal = (name: string): number => {
    if (!metrics) return 0
    // Try exact match first, then with n8n_ prefix
    return metrics.find((m) => m.name === name)?.value
      ?? metrics.find((m) => m.name === `n8n_${name}`)?.value
      ?? 0
  }

  const version      = (metrics?.find((m) => m.name === 'n8n_version_info') ?? metrics?.find((m) => m.name === 'version_info'))?.labels?.version || '-'
  const nodeVersion  = (metrics?.find((m) => m.name === 'n8n_nodejs_version_info') ?? metrics?.find((m) => m.name === 'nodejs_version_info'))?.labels?.version || ''
  const startTime    = metricVal('process_start_time_seconds')
  const uptime       = startTime > 0 ? (Date.now() / 1000) - startTime : 0
  const activeWf     = metricVal('active_workflow_count') || metricVal('active_workflows_total')
  const rss          = metricVal('process_resident_memory_bytes')
  const fds          = metricVal('process_open_fds')
  const maxFds       = metricVal('process_max_fds')
  const heapUsed     = metricVal('nodejs_heap_size_used_bytes')
  const heapTotal    = metricVal('nodejs_heap_size_total_bytes')
  const heapPct      = heapTotal > 0 ? Math.round((heapUsed / heapTotal) * 100) : 0
  const lagSec       = metricVal('nodejs_eventloop_lag_seconds')
  const lagMs        = lagSec * 1000
  const lagP99Sec    = metricVal('nodejs_eventloop_lag_p99_seconds')
  const lagP99Ms     = lagP99Sec * 1000
  const qWait        = metricVal('scaling_mode_queue_jobs_waiting') || metricVal('queue_waiting')
  const qActive      = metricVal('scaling_mode_queue_jobs_active') || metricVal('queue_active')
  const qDone        = metricVal('scaling_mode_queue_jobs_completed') || metricVal('queue_completed')
  const qFailed      = metricVal('scaling_mode_queue_jobs_failed') || metricVal('queue_failed')

  // ── AI report ────────────────────────────────────────────────────────────

  async function handleAiReport() {
    setAiLoading(true)
    setAiReport(null)
    try {
      const res = await api.post<{ report: string }>('/api/ai/observability-report', {
        metrics: metrics ?? [],
        history: history ?? [],
      })
      const html = markdownToHtml(res.report)
      setAiReport(html)
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'AI report failed')
    } finally {
      setAiLoading(false)
    }
  }

  // ── Filter / group raw metrics ────────────────────────────────────────────

  const filteredMetrics = (metrics ?? []).filter((m) =>
    metricSearch ? m.name.toLowerCase().includes(metricSearch.toLowerCase()) : true
  )

  const groups: Record<string, MetricEntry[]> = {}
  for (const m of filteredMetrics) {
    const prefix = m.name.split('_').slice(0, 2).join('_')
    if (!groups[prefix]) groups[prefix] = []
    groups[prefix].push(m)
  }

  // ── Chart data helpers ────────────────────────────────────────────────────

  const hist = history ?? []
  const labels = hist.map((h) => fmtTime(h.ts * (h.ts < 1e10 ? 1000 : 1)))

  function histVals(key: string): number[] {
    return hist.map((h) => h.metrics[key] ?? 0)
  }

  function derivative(vals: number[]): number[] {
    if (vals.length < 2) return vals
    const out: number[] = [0]
    for (let i = 1; i < vals.length; i++) {
      const dt = hist[i].ts - hist[i - 1].ts
      const dtSec = dt > 1000 ? dt / 1000 : dt || 1
      const diff = Math.max(0, (vals[i] - vals[i - 1]) / dtSec)
      out.push(parseFloat(diff.toFixed(4)))
    }
    return out
  }

  // CPU chart
  const cpuData = {
    labels,
    datasets: [{
      label: 'CPU (s/s)',
      data: derivative(histVals('process_cpu_seconds_total')),
      borderColor: 'rgba(59,130,246,1)',
      backgroundColor: 'rgba(59,130,246,0.15)',
      fill: true,
    }],
  }

  // Memory chart
  const memData = {
    labels,
    datasets: [{
      label: 'RSS (MB)',
      data: histVals('process_resident_memory_bytes').map(fmtMB),
      borderColor: 'rgba(249,115,22,1)',
      backgroundColor: 'rgba(249,115,22,0.15)',
      fill: true,
    }],
  }

  // Heap chart
  const heapData = {
    labels,
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
  }

  // Event loop chart
  const hasP99 = hist.some((h) => (h.metrics.eventLoopP99 ?? 0) > 0)
  const lagDatasets: Array<Record<string, unknown>> = [
    {
      label: 'Lag (ms)',
      data: histVals('nodejs_eventloop_lag_seconds').map((v) => parseFloat((v * 1000).toFixed(3))),
      borderColor: 'rgba(239,68,68,1)',
      backgroundColor: 'rgba(239,68,68,0.1)',
      fill: true,
    },
  ]
  if (hasP99) {
    lagDatasets.push({
      label: 'p99 (ms)',
      data: histVals('eventLoopP99').map((v) => parseFloat((v * 1000).toFixed(3))),
      borderColor: 'rgba(239,68,68,0.5)',
      backgroundColor: 'transparent',
      borderDash: [5, 3],
      fill: false,
    })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lagData = { labels, datasets: lagDatasets as any }

  // Queue chart
  const queueData = {
    labels,
    datasets: [
      { label: 'Waiting',   data: histVals('queueWaiting'),   borderColor: 'rgba(249,115,22,1)',  backgroundColor: 'transparent', fill: false },
      { label: 'Active',    data: histVals('queueActive'),    borderColor: 'rgba(59,130,246,1)',  backgroundColor: 'transparent', fill: false },
      { label: 'Completed', data: histVals('queueCompleted'), borderColor: 'rgba(34,197,94,1)',   backgroundColor: 'transparent', fill: false },
      { label: 'Failed',    data: histVals('queueFailed'),    borderColor: 'rgba(239,68,68,1)',   backgroundColor: 'transparent', fill: false },
    ],
  }

  // Active resources chart
  const resourcesData = {
    labels,
    datasets: [
      { label: 'Handles',  data: histVals('nodejs_active_handles_total'), borderColor: 'rgba(20,184,166,1)', backgroundColor: 'rgba(20,184,166,0.1)', fill: true },
      { label: 'Requests', data: histVals('activeRequests'),              borderColor: 'rgba(168,85,247,1)', backgroundColor: 'transparent',            fill: false },
    ],
  }

  // ── Shared chart options builders ─────────────────────────────────────────

  const baseOpts = (yLabel?: string) => ({
    ...CHART_DEFAULTS,
    scales: {
      ...CHART_DEFAULTS.scales,
      y: {
        ...CHART_DEFAULTS.scales.y,
        title: yLabel ? { display: true, text: yLabel, font: { size: 10 } } : undefined,
      },
    },
  })

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <h2 className="text-base font-semibold text-text-dark">Observability</h2>
        <span className="text-xs text-text-muted ml-1">Updated {updatedAt}</span>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(parseInt(e.target.value, 10))}
            className="text-xs px-2 py-1 border border-input-border rounded-sm bg-input-bg text-text-dark"
          >
            <option value="0">Off</option>
            <option value="10">10s</option>
            <option value="20">20s</option>
            <option value="30">30s</option>
            <option value="60">60s</option>
          </select>
          <button
            onClick={refetchAll}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 border border-input-border rounded-sm bg-input-bg text-text-dark hover:bg-card-hover"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
          <button
            onClick={handleAiReport}
            disabled={aiLoading}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-sm bg-danger text-white hover:bg-danger/90 disabled:opacity-60"
          >
            {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            AI Report
          </button>
        </div>
      </div>

      {/* AI report output */}
      {aiReport && (
        <div
          className="mb-5 bg-card border border-border rounded-md p-4 prose prose-sm max-w-none text-text-dark"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(aiReport) }}
        />
      )}

      {metricsLoading ? (
        <div className="flex items-center gap-2 text-text-muted text-sm py-8">
          <Loader2 size={16} className="animate-spin" /> Loading metrics…
        </div>
      ) : (
        <>
          {/* ── KPI Cards ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <KpiCard
              label="N8N VERSION"
              value={version}
              sub={nodeVersion ? `Node ${nodeVersion}` : 'n8n version'}
            />
            <KpiCard
              label="UPTIME"
              value={fmtUptime(uptime)}
              sub={`Leader · ${activeWf} active workflows`}
            />
            <KpiCard
              label="MEMORY (RSS)"
              value={fmtBytes(rss)}
              sub={maxFds > 0 ? `FDs: ${fds} / ${maxFds}` : `FDs: ${fds}`}
            />
            <KpiCard
              label="HEAP USAGE"
              value={`${heapPct}%`}
              sub={`${fmtMB(heapUsed)} MB / ${fmtMB(heapTotal)} MB`}
              color={heapPct > 85 ? 'danger' : heapPct > 70 ? 'warning' : undefined}
            />
            <KpiCard
              label="EVENT LOOP LAG"
              value={`${lagMs.toFixed(1)}ms`}
              sub={lagP99Ms > 0 ? `p99: ${lagP99Ms.toFixed(1)}ms` : 'p99: —'}
              color={lagMs > 100 ? 'danger' : lagMs > 50 ? 'warning' : undefined}
            />
            <KpiCard
              label="QUEUE (WAIT / ACTIVE)"
              value={`${qWait} / ${qActive}`}
              sub={`${qDone} done, ${qFailed} failed`}
            />
          </div>

          {/* ── Charts ────────────────────────────────────────────────────── */}
          {hist.length > 1 && (
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <ChartCard title="CPU Usage (Seconds)">
                <Line data={cpuData} options={baseOpts('cpu s/s')} />
              </ChartCard>

              <ChartCard title="Memory (RSS)">
                <Line data={memData} options={baseOpts('MB')} />
              </ChartCard>

              <ChartCard title="Heap Usage">
                <Line data={heapData} options={baseOpts('MB')} />
              </ChartCard>

              <ChartCard title="Event Loop Lag">
                <Line data={lagData} options={baseOpts('ms')} />
              </ChartCard>

              <ChartCard title="Queue Jobs">
                <Line data={queueData} options={baseOpts('jobs')} />
              </ChartCard>

              <ChartCard title="Active Resources">
                <Line data={resourcesData} options={baseOpts('count')} />
              </ChartCard>
            </div>
          )}

          {/* ── Workers ───────────────────────────────────────────────────── */}
          {workers && workers.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-text-dark mb-2">Workers</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {workers.map((w, idx) => {
                  const m = w.metrics || {}
                  const wRss    = m.memoryRss ?? m.process_resident_memory_bytes ?? 0
                  const wHeapU  = m.heapUsed ?? m.nodejs_heap_size_used_bytes ?? 0
                  const wHeapT  = m.heapTotal ?? m.nodejs_heap_size_total_bytes ?? 0
                  const wHeapPct= wHeapT > 0 ? Math.round((wHeapU / wHeapT) * 100) : 0
                  const wLag    = (m.eventLoopLag ?? m.nodejs_eventloop_lag_seconds ?? 0) * 1000
                  const wUptime = m.uptime ?? m.process_uptime_seconds ?? 0
                  const healthy = w.status === 'healthy' || w.status === 'ready'

                  return (
                    <div key={w.id || w.name || idx} className="bg-card border border-border rounded-md overflow-hidden flex">
                      <div className={cn('w-1 shrink-0', healthy ? 'bg-success' : 'bg-danger')} />
                      <div className="flex-1 px-3 py-2.5">
                        <div className="flex items-center justify-between mb-1.5 gap-2">
                          <span className="text-sm font-medium text-text-dark truncate">{w.name || w.host || w.url || w.id}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {w.status && (
                              <span className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded font-medium',
                                healthy ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                              )}>
                                {w.status.charAt(0).toUpperCase() + w.status.slice(1)}
                              </span>
                            )}
                            {healthy && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-primary/10 text-primary">Ready</span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-text-muted">
                          {wUptime > 0 && <span>Uptime: {fmtUptime(wUptime)}</span>}
                          {wRss > 0    && <span>Mem: {fmtBytes(wRss)}</span>}
                          {wHeapPct > 0 && (
                            <span className={wHeapPct > 85 ? 'text-danger' : wHeapPct > 70 ? 'text-warning' : ''}>
                              Heap: {wHeapPct}%
                            </span>
                          )}
                          {wLag > 0 && (
                            <span className={wLag > 100 ? 'text-danger' : wLag > 50 ? 'text-warning' : ''}>
                              Loop: {wLag.toFixed(1)}ms
                            </span>
                          )}
                        </div>
                        {w.version && <div className="text-[10px] text-text-xmuted mt-1">v{esc(w.version)}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Raw Metrics Explorer ──────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-text-dark">Raw Metrics</h3>
              <div className="relative ml-auto">
                <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-xmuted" />
                <input
                  type="text"
                  placeholder="Filter metrics…"
                  value={metricSearch}
                  onChange={(e) => setMetricSearch(e.target.value)}
                  className="pl-7 pr-3 py-1 text-xs border border-input-border rounded-sm bg-input-bg text-text-dark w-56 focus:outline-none focus:border-input-focus"
                />
              </div>
            </div>

            <div className="bg-card border border-border rounded-md overflow-hidden">
              {Object.entries(groups).map(([prefix, entries]) => (
                <MetricGroup key={prefix} prefix={prefix} entries={entries} />
              ))}
              {Object.keys(groups).length === 0 && (
                <div className="px-3 py-4 text-sm text-text-muted text-center">No metrics found</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── MetricGroup accordion ─────────────────────────────────────────────────

function MetricGroup({ prefix, entries }: { prefix: string; entries: MetricEntry[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-border-light last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-3 py-2 text-xs font-medium text-text-dark hover:bg-card-hover flex items-center justify-between"
      >
        <span>{prefix} <span className="text-text-xmuted font-normal">({entries.length})</span></span>
        <span className="text-text-xmuted text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-0.5">
          {entries.map((m, i) => (
            <div key={i} className="flex items-center justify-between py-0.5 text-xs">
              <span className="text-text-muted truncate mr-2 font-mono">{m.name}</span>
              <span className="text-text-dark font-mono shrink-0">
                {typeof m.value === 'number'
                  ? m.value % 1 === 0 ? m.value : m.value.toFixed(4)
                  : m.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
