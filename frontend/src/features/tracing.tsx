import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  RefreshCw,
  Search,
} from 'lucide-react'
import { api, ApiError } from '@/api/client'
import { Button, Card, CardHeader, CardContent, Input, Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui'
import { formatDuration } from '@/lib/utils'

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

const LOOKBACKS = [
  { value: '15m', label: 'Last 15 minutes' },
  { value: '1h', label: 'Last hour' },
  { value: '6h', label: 'Last 6 hours' },
  { value: '24h', label: 'Last 24 hours' },
]

function statusVariant(status: string): 'success' | 'danger' | 'warning' | 'default' {
  if (status === 'success' || status === 'ok' || status === 'unset') return 'success'
  if (status === 'error' || status === 'crashed') return 'danger'
  if (status === 'running' || status === 'waiting') return 'warning'
  return 'default'
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'error' || status === 'crashed') return <AlertTriangle size={14} className="text-danger" />
  if (status === 'running' || status === 'waiting') return <Clock size={14} className="text-warning" />
  return <CheckCircle2 size={14} className="text-success" />
}

function flattenSpans(spans: TraceSpan[], depth = 0): Array<TraceSpan & { depth: number }> {
  return spans.flatMap((span) => [
    { ...span, depth },
    ...flattenSpans(span.children || [], depth + 1),
  ])
}

export function TracingPage() {
  const [searchParams] = useSearchParams()
  const [config, setConfig] = useState<TracingConfig | null>(null)
  const [service, setService] = useState('')
  const [executionInput, setExecutionInput] = useState(searchParams.get('executionId') || '')
  const [workflowInput, setWorkflowInput] = useState(searchParams.get('workflowId') || '')
  const [lookback, setLookback] = useState('1h')
  const [limit, setLimit] = useState('20')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [applied, setApplied] = useState({
    service: '',
    executionId: searchParams.get('executionId') || '',
    workflowId: searchParams.get('workflowId') || '',
    lookback: '1h',
    limit: '20',
    status: 'all' as StatusFilter,
  })
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null)
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)

  const configQuery = useQuery({
    queryKey: ['tracing-config'],
    queryFn: () => api.get<TracingConfig>('/api/tracing/config'),
  })

  useEffect(() => {
    if (configQuery.data) {
      setConfig(configQuery.data)
      setService((current) => current || configQuery.data.serviceName)
      setApplied((current) => ({ ...current, service: current.service || configQuery.data.serviceName }))
    }
  }, [configQuery.data])

  const healthQuery = useQuery({
    queryKey: ['tracing-health'],
    queryFn: () => api.get<{ status: string; services: string[] }>('/api/tracing/health'),
    refetchInterval: 60_000,
    retry: 1,
  })

  const tracesQuery = useQuery({
    queryKey: ['tracing-traces', applied],
    queryFn: () => {
      const params = new URLSearchParams()
      if (applied.service) params.set('service', applied.service)
      if (applied.executionId) params.set('executionId', applied.executionId)
      if (applied.workflowId) params.set('workflowId', applied.workflowId)
      params.set('lookback', applied.lookback)
      params.set('limit', applied.limit)
      if (applied.status !== 'all') params.set('status', applied.status)
      return api.get<{ traces: TraceSummary[] }>(`/api/tracing/traces?${params.toString()}`)
    },
    enabled: healthQuery.data?.status === 'ok',
    retry: 0,
  })

  const traceQuery = useQuery({
    queryKey: ['tracing-trace', selectedTraceId],
    queryFn: () => api.get<TraceDetail>(`/api/tracing/traces/${selectedTraceId}`),
    enabled: !!selectedTraceId,
    retry: 0,
  })

  useEffect(() => {
    const executionId = searchParams.get('executionId') || ''
    const workflowId = searchParams.get('workflowId') || ''
    if (executionId || workflowId) {
      setExecutionInput(executionId)
      setWorkflowInput(workflowId)
      setApplied((current) => ({ ...current, executionId, workflowId }))
    }
  }, [searchParams])

  useEffect(() => {
    const first = tracesQuery.data?.traces?.[0]
    if (first && !selectedTraceId) setSelectedTraceId(first.traceId)
  }, [tracesQuery.data, selectedTraceId])

  const trace = traceQuery.data
  const flatSpans = useMemo(() => (trace ? flattenSpans(trace.roots) : []), [trace])
  const selectedSpan = flatSpans.find((span) => span.id === selectedSpanId) || null

  function applyFilters() {
    setApplied({
      service,
      executionId: executionInput.trim(),
      workflowId: workflowInput.trim(),
      lookback,
      limit,
      status,
    })
    setSelectedTraceId(null)
    setSelectedSpanId(null)
  }

  function clearFilters() {
    const defaultService = config?.serviceName || 'n8n'
    setExecutionInput('')
    setWorkflowInput('')
    setLookback('1h')
    setLimit('20')
    setStatus('all')
    setService(defaultService)
    setApplied({ service: defaultService, executionId: '', workflowId: '', lookback: '1h', limit: '20', status: 'all' })
    setSelectedTraceId(null)
    setSelectedSpanId(null)
  }

  const backendUnavailable = healthQuery.isError
  const traces = tracesQuery.data?.traces ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="n8n-page-title flex items-center gap-2">
            <Activity size={18} className="text-primary" />
            Tracing
          </h1>
          <p className="n8n-page-subtitle">
            OpenTelemetry traces exported by n8n, including workflow and node spans.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={backendUnavailable ? 'danger' : 'success'}>
            {backendUnavailable ? 'Jaeger unavailable' : `${healthQuery.data?.services?.length ?? 0} services`}
          </Badge>
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<RefreshCw size={12} />}
            onClick={() => { healthQuery.refetch(); tracesQuery.refetch(); traceQuery.refetch() }}
          >
            Refresh
          </Button>
          {trace && config?.publicUrl && (
            <a
              href={`${config.publicUrl}/trace/${trace.traceId}`}
              target="_blank"
              rel="noreferrer"
              className="n8n-btn n8n-btn-secondary n8n-btn-sm"
            >
              <ExternalLink size={12} /> Open in Jaeger
            </a>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-3">
            <label className="n8n-label">Service</label>
            <select
              className="n8n-select-trigger w-full"
              value={service}
              onChange={(e) => setService(e.target.value)}
            >
              {(healthQuery.data?.services?.length ? healthQuery.data.services : [config?.serviceName || 'n8n']).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="n8n-label">Lookback</label>
            <select className="n8n-select-trigger w-full" value={lookback} onChange={(e) => setLookback(e.target.value)}>
              {LOOKBACKS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="n8n-label">Status</label>
            <select className="n8n-select-trigger w-full" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
              <option value="all">All statuses</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
              <option value="crashed">Crashed</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="n8n-label">Execution ID</label>
            <Input
              value={executionInput}
              onChange={(e) => setExecutionInput(e.target.value)}
              placeholder="e.g. 12345"
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            />
          </div>
          <div className="flex items-end md:col-span-2">
            <Button variant="primary" leadingIcon={<Search size={12} />} onClick={applyFilters} className="w-full">
              Search
            </Button>
          </div>
          <div className="md:col-span-4">
            <label className="n8n-label">Workflow ID</label>
            <Input
              value={workflowInput}
              onChange={(e) => setWorkflowInput(e.target.value)}
              placeholder="optional workflow ID"
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            />
          </div>
          <div className="md:col-span-2">
            <label className="n8n-label">Limit</label>
            <select className="n8n-select-trigger w-full" value={limit} onChange={(e) => setLimit(e.target.value)}>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
          <div className="flex items-end md:col-span-2">
            <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full">Clear</Button>
          </div>
        </CardContent>
      </Card>

      {backendUnavailable && (
        <Card>
          <CardContent>
            <div className="flex items-start gap-3 text-sm">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
              <div>
                <div className="font-medium text-text-dark">Trace backend is not reachable</div>
                <p className="mt-1 text-text-muted">
                  Check that Jaeger is running and that <code className="font-mono">OTEL_QUERY_URL</code> points to it.
                  The POC default is <code className="font-mono">http://jaeger:16686</code>.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Traces"
          description={`${traces.length} trace${traces.length === 1 ? '' : 's'} in the selected window`}
          action={tracesQuery.isFetching ? <span className="text-xs text-text-muted">Loading…</span> : undefined}
        />
        {tracesQuery.isError ? (
          <CardContent>
            <p className="text-sm text-danger">
              {tracesQuery.error instanceof ApiError ? tracesQuery.error.message : 'Failed to load traces'}
            </p>
          </CardContent>
        ) : traces.length === 0 ? (
          <CardContent>
            <div className="py-10 text-center">
              <Activity size={24} className="mx-auto mb-2 text-text-xmuted" />
              <p className="text-sm font-medium text-text-dark">No traces found</p>
              <p className="mt-1 text-xs text-text-muted">
                Run a workflow, then refresh. In n8n, enable Settings → OpenTelemetry and make sure the
                OTLP endpoint is reachable.
              </p>
            </div>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Trace</TableHead>
                <TableHead>Workflow</TableHead>
                <TableHead>Execution</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Spans</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {traces.map((item) => (
                <TableRow
                  key={item.traceId}
                  className={`cursor-pointer ${selectedTraceId === item.traceId ? 'bg-primary-light/60' : 'hover:bg-card-hover'}`}
                  onClick={() => { setSelectedTraceId(item.traceId); setSelectedSpanId(null) }}
                >
                  <TableCell><StatusIcon status={item.status} /></TableCell>
                  <TableCell>
                    <div className="font-medium text-text-dark">{item.name}</div>
                    <div className="max-w-[220px] truncate text-[11px] text-text-xmuted">{item.traceId}</div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[220px] truncate text-[13px] text-text-dark">{item.workflowName || '—'}</div>
                    <div className="text-[11px] text-text-xmuted">{item.workflowId || ''}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{item.executionId || '—'}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDuration(item.durationMs)}</TableCell>
                  <TableCell>{item.spanCount}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-text-muted">
                    {new Date(item.startTimeMs).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {trace && (
        <Card>
          <CardHeader
            title="Trace detail"
            description={`${trace.traceId} · ${trace.services.join(', ')} · ${formatDuration(trace.durationMs)}`}
            action={traceQuery.isFetching ? <span className="text-xs text-text-muted">Loading…</span> : undefined}
          />
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-2 text-xs">
              {trace.summary.workflowName && <Badge variant="primary">{trace.summary.workflowName}</Badge>}
              {trace.summary.executionId && <Badge>execution {trace.summary.executionId}</Badge>}
              {trace.summary.executionMode && <Badge>{trace.summary.executionMode}</Badge>}
              <Badge variant={statusVariant(trace.summary.status)}>{trace.summary.status}</Badge>
            </div>
            <TraceWaterfall
              trace={trace}
              spans={flatSpans}
              selectedSpanId={selectedSpanId}
              onSelect={setSelectedSpanId}
            />
            {selectedSpan && <SpanDetail span={selectedSpan} />}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function TraceWaterfall({
  trace,
  spans,
  selectedSpanId,
  onSelect,
}: {
  trace: TraceDetail
  spans: Array<TraceSpan & { depth: number }>
  selectedSpanId: string | null
  onSelect: (id: string | null) => void
}) {
  const total = Math.max(trace.durationMs, 1)
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        {spans.map((span) => {
          const offset = Math.max(0, span.startTimeMs - trace.startTimeMs)
          const width = Math.max(0.5, (span.durationMs / total) * 100)
          const left = Math.min(99, (offset / total) * 100)
          return (
            <div
              key={span.id}
              onClick={() => onSelect(selectedSpanId === span.id ? null : span.id)}
              className={`grid cursor-pointer grid-cols-[minmax(260px,1fr)_minmax(300px,2fr)_90px] items-center gap-3 border-b border-border-light px-2 py-1.5 text-[12px] last:border-0 ${
                selectedSpanId === span.id ? 'bg-primary-light/60' : 'hover:bg-card-hover'
              }`}
            >
              <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: span.depth * 16 }}>
                {span.children && span.children.length > 0 ? <ChevronDown size={12} className="shrink-0 text-text-xmuted" /> : <ChevronRight size={12} className="shrink-0 text-text-xmuted" />}
                <StatusIcon status={span.status} />
                <span className="truncate font-medium text-text-dark" title={span.name}>{span.name}</span>
                <span className="truncate text-[11px] text-text-xmuted">{span.service}</span>
              </div>
              <div className="relative h-5 rounded-sm bg-bg">
                <div
                  className={`absolute top-1 h-3 rounded-sm ${span.status === 'error' || span.status === 'crashed' ? 'bg-danger/70' : span.status === 'running' ? 'bg-warning/70' : 'bg-primary/70'}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${span.name} · ${formatDuration(span.durationMs)}`}
                />
              </div>
              <div className="text-right text-[11px] tabular-nums text-text-muted">{formatDuration(span.durationMs)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SpanDetail({ span }: { span: TraceSpan }) {
  const tagEntries = Object.entries(span.tags || {})
  return (
    <div className="mt-4 rounded-md border border-border bg-bg/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-text-dark">{span.name}</div>
          <div className="text-[11px] text-text-muted">{span.service} · {formatDuration(span.durationMs)} · {span.id}</div>
        </div>
        <Badge variant={statusVariant(span.status)}>{span.status}</Badge>
      </div>
      {tagEntries.length > 0 && (
        <div className="max-h-48 overflow-auto rounded-sm border border-border-light bg-card">
          <table className="n8n-table text-[11px]">
            <tbody>
              {tagEntries.map(([key, value]) => (
                <tr key={key}>
                  <td className="w-1/3 font-mono text-text-muted">{key}</td>
                  <td className="break-all font-mono text-text-dark">{String(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {span.logs.length > 0 && (
        <div className="mt-2 space-y-1">
          {span.logs.map((log, index) => (
            <div key={index} className="rounded-sm border border-border-light bg-card p-2 font-mono text-[11px] text-text-base">
              {Object.entries(log.fields).map(([key, value]) => (
                <div key={key}><span className="text-text-muted">{key}:</span> {String(value)}</div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
