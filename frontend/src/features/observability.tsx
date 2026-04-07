import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'

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

// Map API history field names to standard metric names used in charts
function normalizeHistory(raw: Array<Record<string, unknown>>): HistoryPoint[] {
  return raw.map((p) => ({
    ts: (p.timestamp as number) || 0,
    metrics: {
      process_cpu_seconds_total: (p.cpu as number) || 0,
      process_resident_memory_bytes: (p.memoryRss as number) || 0,
      nodejs_heap_size_used_bytes: (p.heapUsed as number) || 0,
      nodejs_heap_size_total_bytes: (p.heapTotal as number) || 0,
      nodejs_eventloop_lag_seconds: (p.eventLoopLag as number) || 0,
      nodejs_active_handles_total: (p.activeHandles as number) || 0,
    },
  }))
}

interface Worker {
  id: string
  host?: string
  version?: string
  status?: string
  metrics?: Record<string, number>
}

function fmtBytes(b: number): string {
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB'
  return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function ObservabilityPage() {
  const [refreshInterval, setRefreshInterval] = useState(30)
  const [metricSearch, setMetricSearch] = useState('')

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['obs-metrics'],
    queryFn: async () => {
      const raw = await api.get<Record<string, Array<{ labels?: Record<string, string>; value: number }>>>('/api/monitoring/metrics')
      // Convert dict-of-arrays to flat MetricEntry array
      const entries: MetricEntry[] = []
      for (const [name, samples] of Object.entries(raw)) {
        for (const s of samples) {
          entries.push({ name, value: s.value, type: 'gauge', labels: s.labels, help: '' })
        }
      }
      return entries
    },
    refetchInterval: refreshInterval * 1000,
  })

  const { data: history } = useQuery({
    queryKey: ['obs-history'],
    queryFn: async () => {
      const raw = await api.get<Array<Record<string, unknown>>>('/api/monitoring/metrics/history')
      return normalizeHistory(raw)
    },
    refetchInterval: refreshInterval * 1000,
  })

  const { data: workers } = useQuery({
    queryKey: ['obs-workers'],
    queryFn: () => api.get<Worker[]>('/api/monitoring/workers'),
    refetchInterval: refreshInterval * 1000,
  })

  // Extract KPI values from metrics
  const metricVal = (name: string): number => {
    if (!metrics) return 0
    const found = metrics.find((m) => m.name === name)
    return found?.value ?? 0
  }

  const version = metrics?.find((m) => m.name === 'n8n_version_info')?.labels?.version || '-'
  const uptime = metricVal('process_uptime_seconds')
  const rss = metricVal('process_resident_memory_bytes')
  const heapUsed = metricVal('nodejs_heap_size_used_bytes')
  const heapTotal = metricVal('nodejs_heap_size_total_bytes')
  const heapPct = heapTotal > 0 ? Math.round((heapUsed / heapTotal) * 100) : 0
  const eventLoopLag = metricVal('nodejs_eventloop_lag_seconds') * 1000
  const queueDepth = metricVal('n8n_queue_depth') || metricVal('bull_queue_size')

  // Filter raw metrics
  const filteredMetrics = (metrics ?? []).filter((m) =>
    metricSearch ? m.name.toLowerCase().includes(metricSearch.toLowerCase()) : true,
  )

  // Group by metric name prefix
  const groups: Record<string, MetricEntry[]> = {}
  for (const m of filteredMetrics) {
    const prefix = m.name.split('_').slice(0, 2).join('_')
    if (!groups[prefix]) groups[prefix] = []
    groups[prefix].push(m)
  }

  return (
    <div>
      {/* Refresh control */}
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-text-dark">Observability</h2>
        <div className="ml-auto flex items-center gap-2">
          <RefreshCw size={14} className="text-text-muted" />
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(parseInt(e.target.value, 10))}
            className="text-xs px-2 py-1 border border-input-border rounded-sm bg-input-bg text-text-dark"
          >
            <option value="10">10s</option>
            <option value="30">30s</option>
            <option value="60">60s</option>
            <option value="0">Off</option>
          </select>
        </div>
      </div>

      {metricsLoading ? (
        <div className="text-text-muted text-sm">Loading metrics...</div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <KpiBox label="Version" value={version} />
            <KpiBox label="Uptime" value={fmtUptime(uptime)} />
            <KpiBox label="RSS Memory" value={fmtBytes(rss)} />
            <KpiBox
              label="Heap Usage"
              value={`${heapPct}%`}
              color={heapPct > 85 ? 'danger' : heapPct > 70 ? 'warning' : 'success'}
            />
            <KpiBox
              label="Event Loop Lag"
              value={`${eventLoopLag.toFixed(1)}ms`}
              color={eventLoopLag > 100 ? 'danger' : eventLoopLag > 50 ? 'warning' : 'success'}
            />
            <KpiBox label="Queue Depth" value={String(queueDepth)} />
          </div>

          {/* Simple sparkline-style history display */}
          {history && history.length > 0 && (
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <HistoryChart
                title="CPU Usage"
                history={history}
                metricKey="process_cpu_seconds_total"
                format={(v) => `${(v * 100).toFixed(1)}%`}
                derivative
              />
              <HistoryChart
                title="Memory (RSS)"
                history={history}
                metricKey="process_resident_memory_bytes"
                format={fmtBytes}
              />
              <HistoryChart
                title="Heap Used"
                history={history}
                metricKey="nodejs_heap_size_used_bytes"
                format={fmtBytes}
              />
              <HistoryChart
                title="Event Loop Lag"
                history={history}
                metricKey="nodejs_eventloop_lag_seconds"
                format={(v) => `${(v * 1000).toFixed(1)}ms`}
              />
            </div>
          )}

          {/* Workers */}
          {workers && workers.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-text-dark mb-2">Workers</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {workers.map((w) => (
                  <div key={w.id} className="bg-card border border-border rounded-md p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-text-dark">{w.host || w.id}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        w.status === 'healthy' ? 'bg-success-light text-success' : 'bg-danger-light text-danger'
                      }`}>
                        {w.status || 'unknown'}
                      </span>
                    </div>
                    {w.version && <div className="text-xs text-text-muted">v{w.version}</div>}
                    {w.metrics && (
                      <div className="text-xs text-text-muted mt-1">
                        RSS: {fmtBytes(w.metrics.process_resident_memory_bytes || 0)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw metrics explorer */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-text-dark">Raw Metrics</h3>
              <div className="relative ml-auto">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-xmuted" />
                <input
                  type="text"
                  placeholder="Filter metrics..."
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

function KpiBox({ label, value, color }: { label: string; value: string; color?: string }) {
  const colorClass: Record<string, string> = {
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
  }
  return (
    <div className="bg-card border border-border rounded-md p-3 text-center">
      <div className={`text-lg font-bold ${color ? colorClass[color] || '' : 'text-text-dark'}`}>{value}</div>
      <div className="text-xs text-text-muted mt-0.5">{label}</div>
    </div>
  )
}

function HistoryChart({
  title,
  history,
  metricKey,
  format,
  derivative,
}: {
  title: string
  history: HistoryPoint[]
  metricKey: string
  format: (v: number) => string
  derivative?: boolean
}) {
  let values = history.map((h) => h.metrics[metricKey] ?? 0)

  if (derivative && values.length > 1) {
    const diffs = []
    for (let i = 1; i < values.length; i++) {
      const dt = (history[i].ts - history[i - 1].ts) / 1000
      diffs.push(dt > 0 ? (values[i] - values[i - 1]) / dt : 0)
    }
    values = diffs
  }

  const max = Math.max(...values, 0.001)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const current = values.length > 0 ? values[values.length - 1] : 0

  // Simple SVG bar chart
  const barWidth = Math.max(1, Math.floor(200 / values.length))

  return (
    <div className="bg-card border border-border rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-dark">{title}</span>
        <span className="text-xs text-text-muted">{format(current)}</span>
      </div>
      <svg viewBox={`0 0 ${values.length * barWidth} 40`} className="w-full h-10" preserveAspectRatio="none">
        {values.map((v, i) => {
          const h = ((v - min) / range) * 36 + 2
          return (
            <rect
              key={i}
              x={i * barWidth}
              y={40 - h}
              width={Math.max(barWidth - 1, 1)}
              height={h}
              fill="var(--color-primary)"
              opacity={0.7}
            />
          )
        })}
      </svg>
    </div>
  )
}

function MetricGroup({ prefix, entries }: { prefix: string; entries: MetricEntry[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-border-light last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left px-3 py-2 text-xs font-medium text-text-dark hover:bg-card-hover flex items-center justify-between"
      >
        <span>{prefix} ({entries.length})</span>
        <span className="text-text-xmuted">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && (
        <div className="px-3 pb-2">
          {entries.map((m, i) => (
            <div key={i} className="flex items-center justify-between py-0.5 text-xs">
              <span className="text-text-muted truncate mr-2">{m.name}</span>
              <span className="text-text-dark font-mono shrink-0">
                {typeof m.value === 'number' ? (m.value % 1 === 0 ? m.value : m.value.toFixed(3)) : m.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
