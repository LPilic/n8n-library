import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { HitlFormBuilder } from './hitl-builder'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { appConfirm } from '@/components/ConfirmDialog'
import { useSse } from '@/hooks/useSse'
import { useToast } from '@/hooks/useToast'
import { esc, timeAgo, cn } from '@/lib/utils'
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  ToggleLeft,
  ToggleRight,
  ChevronLeft,
  ChevronRight,
  Inbox,
  ArrowLeft,
  Wrench,
} from 'lucide-react'

// --- Types --------------------------------------------------------------------

type RequestStatus = 'pending' | 'approved' | 'rejected' | 'expired'

interface HitlTemplate {
  id: number
  name: string
  description?: string
  slug: string
  is_active: boolean
  request_count: number
  pending_count: number
  created_at: string
  updated_at: string
  schema?: SchemaComponent[]
}

interface HitlRequest {
  id: number
  template_id: number
  template_name: string
  status: RequestStatus
  submitted_data: Record<string, unknown>
  response_data?: Record<string, unknown>
  created_at: string
  responded_at?: string
  responded_by_name?: string
  response_comment?: string
  schema?: SchemaComponent[]
}

interface RequestsResponse {
  requests: HitlRequest[]
  total: number
  pending_count: number
}

// --- Schema types -------------------------------------------------------------

type ComponentType =
  | 'heading' | 'text' | 'data-display' | 'json-viewer' | 'image' | 'badge' | 'divider' | 'spacer'
  | 'text-input' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'number'
  | 'columns' | 'section' | 'button-group'

interface SchemaComponent {
  type: ComponentType
  id?: string
  field?: string
  label?: string
  text?: string
  level?: number
  height?: number
  options?: Array<{ label: string; value: string }>
  children?: SchemaComponent[]
  title?: string
  thresholds?: Array<{ value: number; color: string; label: string }>
  src?: string
  alt?: string
  placeholder?: string
  required?: boolean
  format?: string
  name?: string
  props?: Record<string, unknown>
}

// --- Helpers ------------------------------------------------------------------

function statusColor(status: RequestStatus): string {
  switch (status) {
    case 'pending': return 'bg-warning-light text-warning'
    case 'approved': return 'bg-success-light text-success'
    case 'rejected': return 'bg-danger-light text-danger'
    case 'expired': return 'bg-border-light text-text-xmuted'
  }
}

function StatusIcon({ status }: { status: RequestStatus }) {
  switch (status) {
    case 'pending': return <Clock size={13} className="text-warning shrink-0" />
    case 'approved': return <CheckCircle size={13} className="text-success shrink-0" />
    case 'rejected': return <XCircle size={13} className="text-danger shrink-0" />
    case 'expired': return <Clock size={13} className="text-text-xmuted shrink-0" />
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const TAB_EMPTY_MESSAGES: Record<StatusTab, string> = {
  pending: 'No pending requests',
  approved: 'No approved requests',
  rejected: 'No rejected requests',
  expired: 'No expired requests',
  all: 'No requests found',
}

/** Resolve {{field.path}} templates with data values */
function resolveTemplate(text: string, data: Record<string, unknown>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_m, path: string) => {
    const parts = path.trim().split('.')
    let val: unknown = data
    for (const p of parts) {
      if (val && typeof val === 'object') val = (val as Record<string, unknown>)[p]
      else return `{{${path}}}`
    }
    return val !== undefined && val !== null ? String(val) : `{{${path}}}`
  })
}

// --- HitlFormRenderer ---------------------------------------------------------

interface FormRendererProps {
  schema: SchemaComponent[]
  data: Record<string, unknown>
  responseData: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
  readOnly?: boolean
}

function RenderComponent({
  comp,
  data,
  responseData,
  onChange,
  readOnly,
}: {
  comp: SchemaComponent
  data: Record<string, unknown>
  responseData: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
  readOnly?: boolean
}) {
  const field = comp.field ?? ''
  const displayValue = field ? String(data[field] ?? '') : ''
  const inputValue = field ? (responseData[field] ?? '') : ''

  switch (comp.type) {
    case 'heading': {
      const Tag = (['h1', 'h2', 'h3', 'h4'] as const)[Math.min((comp.level ?? 3) - 1, 3)]
      return (
        <Tag className={cn(
          'font-semibold text-text-dark',
          comp.level === 1 ? 'text-base' : comp.level === 2 ? 'text-sm' : 'text-sm',
        )}>
          {resolveTemplate(String(comp.text ?? comp.label ?? ''), data)}
        </Tag>
      )
    }

    case 'text':
      return <p className="text-sm text-text-muted">{resolveTemplate(String(comp.text ?? displayValue), data)}</p>

    case 'data-display': {
      let formatted = displayValue
      if (comp.format === 'currency' && displayValue) formatted = `$${Number(displayValue).toLocaleString()}`
      else if (comp.format === 'date' && displayValue) formatted = new Date(displayValue).toLocaleDateString()
      return (
        <div className="flex flex-col gap-0.5">
          {comp.label && <span className="text-[10px] font-semibold uppercase text-text-xmuted">{resolveTemplate(String(comp.label), data)}</span>}
          <span className="text-sm text-text-dark">{formatted || <span className="text-text-xmuted italic">--</span>}</span>
        </div>
      )
    }

    case 'json-viewer':
      return (
        <div className="flex flex-col gap-0.5">
          {comp.label && <span className="text-[10px] font-semibold uppercase text-text-xmuted">{comp.label}</span>}
          <pre className="text-[11px] font-mono bg-bg border border-border rounded-sm p-2 overflow-auto max-h-40 text-text-muted">
            {JSON.stringify(field ? data[field] : data, null, 2)}
          </pre>
        </div>
      )

    case 'image':
      return comp.src || displayValue ? (
        <img
          src={String(comp.src || displayValue)}
          alt={comp.alt ?? ''}
          className="max-h-40 rounded border border-border object-contain"
        />
      ) : null

    case 'badge': {
      const numVal = Number(displayValue)
      const matched = (comp.thresholds ?? []).find((t) => numVal >= t.value)
      const color = matched?.color ?? 'bg-border-light text-text-muted'
      const label = matched?.label ?? displayValue
      return (
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', color)}>
          {label}
        </span>
      )
    }

    case 'divider':
      return <hr className="border-border-light" />

    case 'spacer':
      return <div style={{ height: comp.height ?? 16 }} />

    case 'text-input':
      return (
        <div className="flex flex-col gap-1">
          {comp.label && <label className="text-xs font-medium text-text-muted">{comp.label}{comp.required && <span className="text-danger ml-0.5">*</span>}</label>}
          <input
            type="text"
            value={String(inputValue)}
            onChange={(e) => onChange(field, e.target.value)}
            disabled={readOnly}
            placeholder={comp.placeholder ?? ''}
            className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus disabled:opacity-60"
          />
        </div>
      )

    case 'textarea':
      return (
        <div className="flex flex-col gap-1">
          {comp.label && <label className="text-xs font-medium text-text-muted">{comp.label}{comp.required && <span className="text-danger ml-0.5">*</span>}</label>}
          <textarea
            value={String(inputValue)}
            onChange={(e) => onChange(field, e.target.value)}
            disabled={readOnly}
            rows={3}
            placeholder={comp.placeholder ?? ''}
            className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus resize-none disabled:opacity-60"
          />
        </div>
      )

    case 'select':
      return (
        <div className="flex flex-col gap-1">
          {comp.label && <label className="text-xs font-medium text-text-muted">{comp.label}{comp.required && <span className="text-danger ml-0.5">*</span>}</label>}
          <select
            value={String(inputValue)}
            onChange={(e) => onChange(field, e.target.value)}
            disabled={readOnly}
            className="w-full text-sm px-2 py-1.5 border border-input-border rounded-sm bg-input-bg text-text-dark disabled:opacity-60"
          >
            <option value="">Select...</option>
            {(comp.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )

    case 'checkbox':
      return (
        <label className={cn('flex items-center gap-2 cursor-pointer', readOnly && 'pointer-events-none opacity-60')}>
          <input
            type="checkbox"
            checked={Boolean(inputValue)}
            onChange={(e) => onChange(field, e.target.checked)}
            disabled={readOnly}
            className="w-3.5 h-3.5"
          />
          <span className="text-xs text-text-muted">{comp.label ?? field}</span>
        </label>
      )

    case 'radio':
      return (
        <div className="flex flex-col gap-1">
          {comp.label && <span className="text-xs font-medium text-text-muted">{comp.label}{comp.required && <span className="text-danger ml-0.5">*</span>}</span>}
          <div className="flex flex-wrap gap-3">
            {(comp.options ?? []).map((o) => (
              <label key={o.value} className={cn('flex items-center gap-1.5 cursor-pointer', readOnly && 'pointer-events-none opacity-60')}>
                <input
                  type="radio"
                  name={field}
                  value={o.value}
                  checked={String(inputValue) === o.value}
                  onChange={() => onChange(field, o.value)}
                  disabled={readOnly}
                  className="w-3 h-3"
                />
                <span className="text-xs text-text-muted">{o.label}</span>
              </label>
            ))}
          </div>
        </div>
      )

    case 'number':
      return (
        <div className="flex flex-col gap-1">
          {comp.label && <label className="text-xs font-medium text-text-muted">{comp.label}{comp.required && <span className="text-danger ml-0.5">*</span>}</label>}
          <input
            type="number"
            value={String(inputValue)}
            onChange={(e) => onChange(field, e.target.value)}
            disabled={readOnly}
            placeholder={comp.placeholder ?? ''}
            className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus disabled:opacity-60"
          />
        </div>
      )

    case 'section':
      return (
        <div className="border border-border rounded-md overflow-hidden">
          {comp.title && (
            <div className="px-3 py-2 border-b border-border-light bg-bg">
              <span className="text-xs font-semibold text-text-muted uppercase">{comp.title}</span>
            </div>
          )}
          <div className="p-3 space-y-3">
            {(comp.children ?? []).map((child, i) => (
              <RenderComponent key={i} comp={child} data={data} responseData={responseData} onChange={onChange} readOnly={readOnly} />
            ))}
          </div>
        </div>
      )

    case 'columns':
      return (
        <div className="flex gap-3 flex-wrap">
          {(comp.children ?? []).map((child, i) => (
            <div key={i} className="flex-1 min-w-0 space-y-3">
              <RenderComponent comp={child} data={data} responseData={responseData} onChange={onChange} readOnly={readOnly} />
            </div>
          ))}
        </div>
      )

    case 'button-group':
      return null // handled externally by approve/reject buttons

    default:
      return null
  }
}

function HitlFormRenderer({ schema, data, responseData, onChange, readOnly }: FormRendererProps) {
  return (
    <div className="space-y-3">
      {schema.map((comp, i) => (
        <RenderComponent key={i} comp={comp} data={data} responseData={responseData} onChange={onChange} readOnly={readOnly} />
      ))}
    </div>
  )
}

// --- ApprovalsPage ------------------------------------------------------------

type StatusTab = 'pending' | 'approved' | 'rejected' | 'expired' | 'all'

export function ApprovalsPage() {
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [tab, setTab] = useState<StatusTab>('pending')
  const [page, setPage] = useState(1)
  const [selectedRequest, setSelectedRequest] = useState<HitlRequest | null>(null)

  const statusParam = tab === 'all' ? '' : tab

  const { data, isLoading } = useQuery({
    queryKey: ['hitl-requests', statusParam, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (statusParam) params.set('status', statusParam)
      return api.get<RequestsResponse>(`/api/hitl/requests?${params}`)
    },
  })

  // SSE for real-time new request notifications
  const handleSse = useCallback((event: string, _data: unknown) => {
    if (event === 'hitl') {
      queryClient.invalidateQueries({ queryKey: ['hitl-requests'] })
      queryClient.invalidateQueries({ queryKey: ['hitl-pending-count'] })
    }
  }, [queryClient])

  useSse('/api/hitl/stream', { onMessage: handleSse })

  const { data: pendingCountData } = useQuery({
    queryKey: ['hitl-pending-count'],
    queryFn: () => api.get<{ count: number }>('/api/hitl/pending-count'),
    refetchInterval: 30_000,
  })

  const pendingCount = pendingCountData?.count ?? data?.pending_count ?? 0
  const requests = data?.requests ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  const TABS: { key: StatusTab; label: string }[] = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'expired', label: 'Expired' },
    { key: 'all', label: 'All' },
  ]

  return (
    <div className="flex gap-6">
      {/* Request list */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-sm font-semibold text-text-dark">Approval Requests</h2>
          {pendingCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning text-white font-semibold">
              {pendingCount}
            </span>
          )}
          <button
            onClick={() => navigate('/approvals-builder')}
            className="ml-auto flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-[5px] rounded-md border border-input-border text-text-muted hover:bg-card-hover"
          >
            <Wrench size={13} /> Form Builder
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setPage(1); setSelectedRequest(null) }}
              className={cn(
                'text-xs px-3 py-2 -mb-px border-b-2 transition-colors',
                tab === t.key
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-text-muted hover:text-text-dark',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-text-muted text-sm">Loading requests...</div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12">
            <Inbox size={32} className="mx-auto text-text-xmuted mb-2" />
            <p className="text-text-muted text-sm">{TAB_EMPTY_MESSAGES[tab]}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((req) => (
              <RequestCard
                key={req.id}
                request={req}
                isSelected={selectedRequest?.id === req.id}
                onClick={() => setSelectedRequest(selectedRequest?.id === req.id ? null : req)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="p-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover disabled:opacity-40"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-xs text-text-muted">Page {page} of {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="p-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover disabled:opacity-40"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedRequest && (
        <RequestDetailPanel
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onResponded={() => {
            setSelectedRequest(null)
            queryClient.invalidateQueries({ queryKey: ['hitl-requests'] })
            queryClient.invalidateQueries({ queryKey: ['hitl-pending-count'] })
            showSuccess('Response submitted')
          }}
          onError={(msg) => showError(msg)}
        />
      )}
    </div>
  )
}

// --- RequestCard --------------------------------------------------------------

function RequestCard({
  request,
  isSelected,
  onClick,
}: {
  request: HitlRequest
  isSelected: boolean
  onClick: () => void
}) {
  const previewEntries = Object.entries(request.submitted_data || {}).slice(0, 3)

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-card border rounded-md p-3 cursor-pointer transition-colors',
        isSelected ? 'border-primary' : 'border-border hover:border-border-focus',
      )}
    >
      <div className="flex items-start gap-2">
        <StatusIcon status={request.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-text-dark truncate">{esc(request.template_name)}</span>
            <span className="text-[10px] text-text-xmuted shrink-0">#{request.id}</span>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded capitalize ml-auto', statusColor(request.status))}>
              {request.status}
            </span>
          </div>
          {previewEntries.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
              {previewEntries.map(([k, v]) => (
                <span key={k} className="text-[11px] text-text-muted">
                  <span className="text-text-xmuted">{k}:</span> {String(v).slice(0, 40)}
                </span>
              ))}
            </div>
          )}
          <div className="text-[10px] text-text-xmuted mt-1">{timeAgo(request.created_at)}</div>
        </div>
      </div>
    </div>
  )
}

// --- RequestDetailPanel -------------------------------------------------------

function RequestDetailPanel({
  request,
  onClose,
  onResponded,
  onError,
}: {
  request: HitlRequest
  onClose: () => void
  onResponded: () => void
  onError: (msg: string) => void
}) {
  const [responseData, setResponseData] = useState<Record<string, unknown>>({})

  const { data: detail, isLoading } = useQuery({
    queryKey: ['hitl-request-detail', request.id],
    queryFn: () => api.get<HitlRequest>(`/api/hitl/requests/${request.id}`),
  })

  const respondMut = useMutation({
    mutationFn: (action: 'approve' | 'reject') =>
      api.post(`/api/hitl/requests/${request.id}/respond`, { action, response_data: responseData }),
    onSuccess: onResponded,
    onError: (err) => onError(err instanceof ApiError ? err.message : 'Response failed'),
  })

  const handleReject = async () => {
    const ok = await appConfirm('Reject this request?', { danger: true, okLabel: 'Reject' })
    if (ok) respondMut.mutate('reject')
  }

  const req = detail ?? request
  const schema = req.schema ?? []
  const isPending = req.status === 'pending'

  const handleChange = (field: string, value: unknown) => {
    setResponseData((prev) => ({ ...prev, [field]: value }))
  }

  const hasResponseData = req.response_data && Object.keys(req.response_data).length > 0

  return (
    <div className="w-96 shrink-0">
      <div className="bg-card border border-border rounded-md overflow-hidden sticky top-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <StatusIcon status={req.status} />
            <h3 className="text-sm font-semibold text-text-dark">{esc(req.template_name)}</h3>
          </div>
          <button onClick={onClose} className="text-text-xmuted hover:text-text-dark text-lg leading-none">&times;</button>
        </div>

        <div className="p-4 max-h-[70vh] overflow-y-auto space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded capitalize', statusColor(req.status))}>
              {req.status}
            </span>
            <span className="text-[10px] text-text-xmuted">{timeAgo(req.created_at)}</span>
            {req.responded_at && (
              <span className="text-[10px] text-text-xmuted">· responded {timeAgo(req.responded_at)}</span>
            )}
          </div>

          {/* Responded-by info */}
          {!isPending && req.responded_at && (
            <div className="text-xs text-text-muted">
              {req.status === 'approved' ? 'Approved' : req.status === 'rejected' ? 'Rejected' : 'Expired'}
              {req.responded_by_name && <> by <strong className="font-semibold text-text-dark">{req.responded_by_name}</strong></>}
              {req.responded_at && <> on {new Date(req.responded_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</>}
            </div>
          )}

          {/* Response comment */}
          {req.response_comment && (
            <div className="text-xs text-text-muted bg-bg border border-border-light rounded-sm px-3 py-2 italic">
              {req.response_comment}
            </div>
          )}

          {isLoading ? (
            <div className="text-text-muted text-sm">Loading details...</div>
          ) : schema.length > 0 ? (
            <HitlFormRenderer
              schema={schema}
              data={req.submitted_data}
              responseData={responseData}
              onChange={handleChange}
              readOnly={!isPending}
            />
          ) : (
            /* Fallback: show raw submitted data */
            <div className="space-y-2">
              {Object.entries(req.submitted_data || {}).map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-semibold uppercase text-text-xmuted">{k}</span>
                  <span className="text-sm text-text-dark">{String(v)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Response data (for completed requests) */}
          {!isPending && (
            <div className="border-t border-border-light pt-3">
              <div className="text-[10px] font-semibold uppercase text-text-xmuted mb-2">Reviewer Response</div>
              {hasResponseData ? (
                <div className="space-y-1">
                  {Object.entries(req.response_data!).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-xs">
                      <span className="text-text-xmuted">{k}:</span>
                      <span className="text-text-dark">{String(v)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-xmuted italic">No additional data</p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        {isPending && (
          <div className="flex gap-2 px-4 py-3 border-t border-border bg-bg">
            <button
              disabled={respondMut.isPending}
              onClick={handleReject}
              className="flex-1 text-xs px-3 py-2 border border-danger text-danger rounded-sm hover:bg-danger-light disabled:opacity-50 flex items-center justify-center gap-1"
            >
              <XCircle size={13} /> Reject
            </button>
            <button
              disabled={respondMut.isPending}
              onClick={() => respondMut.mutate('approve')}
              className="flex-1 text-xs px-3 py-2 bg-success text-white rounded-sm hover:bg-success/90 disabled:opacity-50 flex items-center justify-center gap-1"
            >
              <CheckCircle size={13} /> Approve
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// --- ApprovalsBuilderPage -----------------------------------------------------

export function ApprovalsBuilderPage() {
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [modal, setModal] = useState<null | 'create' | HitlTemplate>(null)

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['hitl-templates'],
    queryFn: () =>
      api.get<{ templates: HitlTemplate[] }>('/api/hitl/templates').then((r) => r.templates),
  })

  const toggleMut = useMutation({
    mutationFn: (id: number) => api.patch(`/api/hitl/templates/${id}/toggle`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hitl-templates'] }),
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Toggle failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/hitl/templates/${id}`),
    onSuccess: () => {
      showSuccess('Template deleted')
      queryClient.invalidateQueries({ queryKey: ['hitl-templates'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Delete failed'),
  })

  const handleDelete = async (tpl: HitlTemplate) => {
    const ok = await appConfirm(`Delete template "${tpl.name}"?`, { danger: true, okLabel: 'Delete' })
    if (ok) deleteMut.mutate(tpl.id)
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate('/approvals')}
          className="flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-[5px] rounded-md border border-input-border text-text-muted hover:bg-card-hover"
        >
          <ArrowLeft size={13} /> Back to Approvals
        </button>
        <button
          onClick={() => setModal('create')}
          className="flex items-center gap-1 text-[12px] font-semibold px-2.5 py-[5px] rounded-md bg-primary text-white hover:bg-primary-hover"
        >
          <Plus size={12} /> New Template
        </button>
      </div>

      {/* Template table */}
      {isLoading ? (
        <div className="text-text-muted text-sm">Loading templates...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-text-muted text-sm">No templates yet</div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-bg border-b border-border">
                <th className="text-[11px] font-semibold uppercase tracking-wide text-text-xmuted px-3 py-2 w-12">Active</th>
                <th className="text-[11px] font-semibold uppercase tracking-wide text-text-xmuted px-3 py-2">Template</th>
                <th className="text-[11px] font-semibold uppercase tracking-wide text-text-xmuted px-3 py-2">Slug</th>
                <th className="text-[11px] font-semibold uppercase tracking-wide text-text-xmuted px-3 py-2 text-center">Requests</th>
                <th className="text-[11px] font-semibold uppercase tracking-wide text-text-xmuted px-3 py-2">Status</th>
                <th className="text-[11px] font-semibold uppercase tracking-wide text-text-xmuted px-3 py-2">Updated</th>
                <th className="text-[11px] font-semibold uppercase tracking-wide text-text-xmuted px-3 py-2 w-20 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {templates.map((tpl) => (
                <tr key={tpl.id} className="hover:bg-card-hover transition-colors">
                  {/* Active toggle */}
                  <td className="px-3 py-2">
                    <button
                      onClick={() => toggleMut.mutate(tpl.id)}
                      className="text-text-xmuted hover:text-primary"
                      title={tpl.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {tpl.is_active
                        ? <ToggleRight size={18} className="text-success" />
                        : <ToggleLeft size={18} />}
                    </button>
                  </td>
                  {/* Template name + description */}
                  <td className="px-3 py-2">
                    <div className="text-sm font-medium text-text-dark">{esc(tpl.name)}</div>
                    {tpl.description && (
                      <div className="text-[11px] text-text-xmuted truncate max-w-xs">{esc(tpl.description)}</div>
                    )}
                  </td>
                  {/* Slug */}
                  <td className="px-3 py-2">
                    <span className="text-xs font-mono text-text-muted">{tpl.slug}</span>
                  </td>
                  {/* Requests count + pending badge */}
                  <td className="px-3 py-2 text-center">
                    <span className="text-xs text-text-dark">{tpl.request_count}</span>
                    {tpl.pending_count > 0 && (
                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-warning text-white font-semibold">
                        {tpl.pending_count}
                      </span>
                    )}
                  </td>
                  {/* Status badge */}
                  <td className="px-3 py-2">
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded',
                      tpl.is_active ? 'bg-success-light text-success' : 'bg-border-light text-text-xmuted',
                    )}>
                      {tpl.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {/* Updated */}
                  <td className="px-3 py-2">
                    <span className="text-xs text-text-xmuted">{timeAgo(tpl.updated_at)}</span>
                  </td>
                  {/* Actions */}
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setModal(tpl)}
                        className="p-1.5 text-text-xmuted hover:text-text-dark rounded-sm"
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(tpl)}
                        className="p-1.5 text-text-xmuted hover:text-danger rounded-sm"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Table footer */}
          <div className="px-3 py-2 border-t border-border bg-bg">
            <span className="text-xs text-text-muted">
              {templates.length} template{templates.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {/* Full-page builder */}
      {modal !== null && (
        <div className="fixed inset-0 z-[100] bg-bg overflow-auto">
          <HitlFormBuilder
            templateId={modal === 'create' ? undefined : modal.id}
            onSave={() => {
              setModal(null)
              queryClient.invalidateQueries({ queryKey: ['hitl-templates'] })
              showSuccess(modal === 'create' ? 'Template created' : 'Template updated')
            }}
            onCancel={() => setModal(null)}
          />
        </div>
      )}
    </div>
  )
}

// --- TemplateModal ------------------------------------------------------------

const COMPONENT_TYPES: ComponentType[] = [
  'heading', 'text', 'data-display', 'json-viewer', 'badge', 'divider', 'spacer',
  'text-input', 'textarea', 'select', 'checkbox', 'radio', 'number',
  'section', 'columns',
]

/** @deprecated — replaced by HitlFormBuilder full-page editor */
export function TemplateModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: HitlTemplate | null
  onClose: () => void
  onSaved: () => void
}) {
  const { error: showError } = useToast()
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [slugManual, setSlugManual] = useState(!!initial)
  const [schemaMode, setSchemaMode] = useState<'json' | 'list'>('json')
  const [schemaJson, setSchemaJson] = useState(
    initial?.schema ? JSON.stringify(initial.schema, null, 2) : '[]',
  )
  const [schemaError, setSchemaError] = useState('')
  const [listComponents, setListComponents] = useState<SchemaComponent[]>(initial?.schema ?? [])
  const [newCompType, setNewCompType] = useState<ComponentType>('text-input')

  const handleNameChange = (v: string) => {
    setName(v)
    if (!slugManual) setSlug(slugify(v))
  }

  const addComponent = () => {
    const comp: SchemaComponent = { type: newCompType, id: `field_${Date.now()}`, label: newCompType, field: newCompType === 'heading' || newCompType === 'text' || newCompType === 'divider' || newCompType === 'spacer' ? undefined : `field_${listComponents.length + 1}` }
    setListComponents((prev) => [...prev, comp])
  }

  const removeComponent = (i: number) => {
    setListComponents((prev) => prev.filter((_, idx) => idx !== i))
  }

  const getSchema = (): SchemaComponent[] | null => {
    if (schemaMode === 'list') return listComponents
    try {
      const parsed = JSON.parse(schemaJson)
      setSchemaError('')
      return parsed
    } catch {
      setSchemaError('Invalid JSON')
      return null
    }
  }

  const handleSave = () => {
    const schema = getSchema()
    if (!schema) return
    if (schema.length === 0) {
      showError('Template must have at least one component')
      return
    }
    saveMut.mutate()
  }

  const saveMut = useMutation({
    mutationFn: () => {
      const schema = getSchema()
      if (!schema) return Promise.reject(new Error('Invalid schema'))
      const body = { name, description, slug, schema }
      return initial
        ? api.put(`/api/hitl/templates/${initial.id}`, body)
        : api.post('/api/hitl/templates', body)
    },
    onSuccess: onSaved,
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Save failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-md w-full max-w-2xl shadow-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-text-dark">
            {initial ? 'Edit Template' : 'New Template'}
          </h2>
          <button onClick={onClose} className="text-text-xmuted hover:text-text-dark text-lg leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {/* Name + Slug */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-text-muted mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
                placeholder="My Approval Flow"
              />
            </div>
            <div className="w-48">
              <label className="block text-xs font-medium text-text-muted mb-1">Slug *</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setSlugManual(true) }}
                className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm font-mono text-text-dark focus:outline-none focus:border-input-focus"
                placeholder="my-approval-flow"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
              placeholder="What does this approval form do?"
            />
          </div>

          {/* Schema editor */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs font-medium text-text-muted">Schema</label>
              <div className="flex gap-1 ml-auto">
                {(['json', 'list'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setSchemaMode(m)}
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded-sm border',
                      schemaMode === m
                        ? 'border-primary bg-primary-light text-primary'
                        : 'border-input-border text-text-muted hover:bg-card-hover',
                    )}
                  >
                    {m === 'json' ? 'JSON' : 'List'}
                  </button>
                ))}
              </div>
            </div>

            {schemaMode === 'json' ? (
              <>
                <textarea
                  value={schemaJson}
                  onChange={(e) => { setSchemaJson(e.target.value); setSchemaError('') }}
                  rows={10}
                  className={cn(
                    'w-full px-3 py-2 border rounded-sm bg-input-bg text-xs font-mono text-text-dark focus:outline-none resize-none',
                    schemaError ? 'border-danger focus:border-danger' : 'border-input-border focus:border-input-focus',
                  )}
                  placeholder='[{"type": "heading", "text": "Review Request"}, {"type": "data-display", "field": "email", "label": "Email"}]'
                />
                {schemaError && <p className="text-[10px] text-danger mt-0.5">{schemaError}</p>}
              </>
            ) : (
              <div className="space-y-2">
                {/* Add component row */}
                <div className="flex gap-2">
                  <select
                    value={newCompType}
                    onChange={(e) => setNewCompType(e.target.value as ComponentType)}
                    className="flex-1 text-xs px-2 py-1.5 border border-input-border rounded-sm bg-input-bg text-text-dark"
                  >
                    {COMPONENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <button
                    onClick={addComponent}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover"
                  >
                    <Plus size={12} /> Add
                  </button>
                </div>

                {/* Component list */}
                {listComponents.length === 0 ? (
                  <p className="text-[11px] text-text-xmuted italic text-center py-3">No components yet</p>
                ) : (
                  <div className="border border-border rounded-sm divide-y divide-border-light">
                    {listComponents.map((comp, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2">
                        <span className="text-[10px] font-mono bg-border-light text-text-muted px-1.5 py-0.5 rounded">{comp.type}</span>
                        <input
                          type="text"
                          value={comp.label ?? ''}
                          onChange={(e) => {
                            const updated = [...listComponents]
                            updated[i] = { ...updated[i], label: e.target.value }
                            setListComponents(updated)
                          }}
                          placeholder="Label"
                          className="flex-1 px-2 py-1 border border-input-border rounded-sm bg-input-bg text-xs text-text-dark focus:outline-none focus:border-input-focus"
                        />
                        {comp.field !== undefined && (
                          <input
                            type="text"
                            value={comp.field ?? ''}
                            onChange={(e) => {
                              const updated = [...listComponents]
                              updated[i] = { ...updated[i], field: e.target.value }
                              setListComponents(updated)
                            }}
                            placeholder="field_name"
                            className="w-28 px-2 py-1 border border-input-border rounded-sm bg-input-bg text-xs font-mono text-text-dark focus:outline-none focus:border-input-focus"
                          />
                        )}
                        <button
                          onClick={() => removeComponent(i)}
                          className="p-1 text-text-xmuted hover:text-danger shrink-0"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover"
          >
            Cancel
          </button>
          <button
            disabled={!name.trim() || !slug.trim() || saveMut.isPending}
            onClick={handleSave}
            className="text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
          >
            {saveMut.isPending ? 'Saving...' : initial ? 'Save Changes' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  )
}
