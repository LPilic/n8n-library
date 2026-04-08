import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/hooks/useToast'
import { esc, timeAgo, cn } from '@/lib/utils'
import { useHighlight } from '@/hooks/useHighlight'
import { markdownToHtml } from '@/lib/markdown'
import { sanitizeHtml } from '@/lib/sanitize'
import {
  Search,
  Trash2,
  Plus,
  MessageSquare,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Loader2,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ticket {
  id: number
  title: string
  description?: string
  status: string
  priority: string
  category_id?: number
  category_name?: string
  assignee_id?: number
  assignee_username?: string
  reporter_id?: number
  reporter_username?: string
  created_at: string
  updated_at: string
  comment_count?: number
}

interface TicketComment {
  id: number
  ticket_id: number
  author_id: number
  author_username: string
  comment: string
  is_internal: boolean
  created_at: string
}

interface TicketDetail extends Ticket {
  comments?: TicketComment[]
  activity?: Array<{ id: number; action: string; created_at: string; actor_username: string }>
  executions?: Array<{ ticket_id: number; execution_id: string; workflow_id: string; workflow_name: string; status: string; linked_at: string }>
  execution_data?: {
    workflow_name?: string; execution_id?: string; execution_status?: string
    started_at?: string; failed_node?: string; error_message?: string; ai_analysis?: string
  }
}

interface TicketStats {
  byStatus: Array<{ status: string; count: number | string }>
  byPriority: Array<{ priority: string; count: number | string }>
  unassigned: number
  avgResolutionHours: string | number | null
}

interface AssignableUser {
  id: number
  username: string
  email: string
}

interface TicketCategory {
  id: number
  name: string
}

interface TicketListResponse {
  tickets: Ticket[]
  total: number
  page: number
  pages: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['open', 'in_progress', 'pending', 'resolved', 'closed']
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical']

function statusColor(status: string): string {
  switch (status) {
    case 'open': return 'bg-primary-light text-primary'
    case 'in_progress': return 'bg-warning-light text-warning'
    case 'pending': return 'bg-border-light text-text-muted'
    case 'resolved': return 'bg-success-light text-success'
    case 'closed': return 'bg-border-light text-text-xmuted'
    default: return 'bg-border-light text-text-muted'
  }
}

function priorityColor(priority: string): string {
  switch (priority) {
    case 'critical': return 'bg-danger-light text-danger'
    case 'high': return 'bg-danger-light text-danger'
    case 'medium': return 'bg-warning-light text-warning'
    case 'low': return 'bg-success-light text-success'
    default: return 'bg-border-light text-text-muted'
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'open': return <AlertCircle size={14} className="text-primary shrink-0" />
    case 'in_progress': return <Loader2 size={14} className="text-warning shrink-0 animate-spin" />
    case 'resolved': return <CheckCircle size={14} className="text-success shrink-0" />
    case 'closed': return <XCircle size={14} className="text-text-muted shrink-0" />
    default: return <Clock size={14} className="text-text-muted shrink-0" />
  }
}

// ─── TicketsPage ──────────────────────────────────────────────────────────────

export function TicketsPage() {
  const navigate = useNavigate()
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', page, search, status, priority],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (search) params.set('search', search)
      if (status) params.set('status', status)
      if (priority) params.set('priority', priority)
      return api.get<TicketListResponse>(`/api/tickets?${params}`)
    },
  })

  const { data: stats } = useQuery({
    queryKey: ['ticket-stats'],
    queryFn: () => api.get<TicketStats>('/api/tickets/stats'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/tickets/${id}`),
    onSuccess: () => {
      showSuccess('Ticket deleted')
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      queryClient.invalidateQueries({ queryKey: ['ticket-stats'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Delete failed'),
  })

  const tickets = data?.tickets ?? []

  return (
    <div className="flex gap-6">
      {/* KPI Sidebar */}
      <aside className="w-64 shrink-0 hidden lg:block space-y-3">
        {stats && (
          <>
            {/* Overview KPI cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-card border border-border rounded-lg p-3 text-center">
                <div className="text-2xl font-extrabold text-primary">{stats.unassigned}</div>
                <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mt-0.5">Unassigned</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-3 text-center">
                <div className="text-2xl font-extrabold text-text-dark">
                  {stats.avgResolutionHours && Number(stats.avgResolutionHours) > 0 ? `${Number(stats.avgResolutionHours).toFixed(0)}h` : '—'}
                </div>
                <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mt-0.5">Avg Resolve</div>
              </div>
            </div>

            {/* By Status */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-border-light">
                <h3 className="text-[10px] font-bold text-text-xmuted uppercase tracking-[0.08em]">By Status</h3>
              </div>
              <div className="p-1">
                {(stats.byStatus ?? []).map((item) => (
                  <button
                    key={item.status}
                    onClick={() => { setStatus(status === item.status ? '' : item.status); setPage(1) }}
                    className={cn(
                      'w-full flex items-center justify-between text-[12px] px-2.5 py-1.5 rounded-md transition-colors',
                      status === item.status
                        ? 'bg-primary-light text-primary font-semibold'
                        : 'text-text-muted hover:bg-bg',
                    )}
                  >
                    <span className="capitalize">{item.status.replace('_', ' ')}</span>
                    <span className="text-[11px] font-bold tabular-nums">{item.count}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* By Priority */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-border-light">
                <h3 className="text-[10px] font-bold text-text-xmuted uppercase tracking-[0.08em]">By Priority</h3>
              </div>
              <div className="p-1">
                {(stats.byPriority ?? []).map((item) => (
                  <button
                    key={item.priority}
                    onClick={() => { setPriority(priority === item.priority ? '' : item.priority); setPage(1) }}
                    className={cn(
                      'w-full flex items-center justify-between text-[12px] px-2.5 py-1.5 rounded-md transition-colors',
                      priority === item.priority
                        ? 'bg-primary-light text-primary font-semibold'
                        : 'text-text-muted hover:bg-bg',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn('w-2 h-2 rounded-full',
                        item.priority === 'critical' && 'bg-danger',
                        item.priority === 'high' && 'bg-warning',
                        item.priority === 'medium' && 'bg-[#3b82f6]',
                        item.priority === 'low' && 'bg-text-xmuted',
                      )} />
                      <span className="capitalize">{item.priority}</span>
                    </div>
                    <span className="text-[11px] font-bold tabular-nums">{item.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-0 max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-xmuted" />
            <input
              type="text"
              placeholder="Search tickets..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-8 pr-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
            />
          </div>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            className="text-xs px-2 py-1.5 border border-input-border rounded-sm bg-input-bg text-text-dark"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(e) => { setPriority(e.target.value); setPage(1) }}
            className="text-xs px-2 py-1.5 border border-input-border rounded-sm bg-input-bg text-text-dark"
          >
            <option value="">All Priorities</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <span className="text-xs text-text-muted ml-auto hidden sm:inline">
            {data?.total ?? 0} ticket{(data?.total ?? 0) !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover"
          >
            <Plus size={12} /> New Ticket
          </button>
        </div>

        {/* Create modal */}
        {showCreate && (
          <CreateTicketModal
            onClose={() => setShowCreate(false)}
            onCreated={() => {
              setShowCreate(false)
              queryClient.invalidateQueries({ queryKey: ['tickets'] })
              queryClient.invalidateQueries({ queryKey: ['ticket-stats'] })
            }}
          />
        )}

        {/* Ticket list */}
        {isLoading ? (
          <div className="text-text-muted text-sm">Loading tickets...</div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-muted">No tickets found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onClick={() => navigate(`/tickets/${ticket.id}`)}
                onDelete={() => { if (confirm('Delete this ticket?')) deleteMut.mutate(ticket.id) }}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="text-xs px-3 py-1 border border-input-border rounded-sm bg-input-bg text-text-muted hover:bg-card-hover disabled:opacity-40"
            >
              Prev
            </button>
            <span className="text-xs text-text-muted">
              Page {page} of {data.pages}
            </span>
            <button
              disabled={page >= data.pages}
              onClick={() => setPage(page + 1)}
              className="text-xs px-3 py-1 border border-input-border rounded-sm bg-input-bg text-text-muted hover:bg-card-hover disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── TicketCard ───────────────────────────────────────────────────────────────

function TicketCard({
  ticket,
  onClick,
  onDelete,
}: {
  ticket: Ticket
  onClick: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="bg-card border border-border rounded-md p-3 hover:border-border-focus cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <StatusIcon status={ticket.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-medium text-text-dark truncate">{esc(ticket.title)}</h3>
            <span className="text-[10px] text-text-xmuted shrink-0">#{ticket.id}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded capitalize', statusColor(ticket.status))}>
              {ticket.status.replace('_', ' ')}
            </span>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded capitalize', priorityColor(ticket.priority))}>
              {ticket.priority}
            </span>
            {ticket.category_name && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-border-light text-text-muted">
                {ticket.category_name}
              </span>
            )}
            {ticket.assignee_username ? (
              <span className="text-[10px] text-text-muted">
                Assigned to <strong>{ticket.assignee_username}</strong>
              </span>
            ) : (
              <span className="text-[10px] text-text-xmuted">Unassigned</span>
            )}
            <span className="text-[10px] text-text-xmuted ml-auto">{timeAgo(ticket.created_at)}</span>
            {(ticket.comment_count ?? 0) > 0 && (
              <span className="text-[10px] text-text-muted flex items-center gap-0.5">
                <MessageSquare size={10} /> {ticket.comment_count}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="p-1 text-text-xmuted hover:text-danger ml-1 shrink-0"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── CreateTicketModal ────────────────────────────────────────────────────────

function CreateTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { error: showError } = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [categoryId, setCategoryId] = useState('')

  const { data: categories } = useQuery({
    queryKey: ['ticket-categories'],
    queryFn: () => api.get<TicketCategory[]>('/api/ticket-categories'),
  })

  const createMut = useMutation({
    mutationFn: () =>
      api.post('/api/tickets', {
        title,
        description,
        priority,
        category_id: categoryId ? Number(categoryId) : undefined,
      }),
    onSuccess: onCreated,
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Create failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-md w-full max-w-md shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-dark">New Ticket</h2>
          <button onClick={onClose} className="text-text-xmuted hover:text-text-dark">
            <XCircle size={16} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
              placeholder="Describe the issue..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus resize-none"
              placeholder="Additional details..."
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-text-muted mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full text-sm px-2 py-1.5 border border-input-border rounded-sm bg-input-bg text-text-dark"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-text-muted mb-1">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full text-sm px-2 py-1.5 border border-input-border rounded-sm bg-input-bg text-text-dark"
              >
                <option value="">None</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover"
          >
            Cancel
          </button>
          <button
            disabled={!title.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}
            className="text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
          >
            {createMut.isPending ? 'Creating...' : 'Create Ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── TicketDetailPage ─────────────────────────────────────────────────────────

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()

  const highlightRef = useHighlight([id])
  const [comment, setComment] = useState('')
  const [isInternal, setIsInternal] = useState(false)

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['ticket-detail', id],
    queryFn: () => api.get<TicketDetail>(`/api/tickets/${id}`),
    enabled: !!id,
  })

  const { data: assignableUsers } = useQuery({
    queryKey: ['assignable-users'],
    queryFn: () => api.get<AssignableUser[]>('/api/tickets/assignable-users'),
  })

  const { data: categories } = useQuery({
    queryKey: ['ticket-categories'],
    queryFn: () => api.get<TicketCategory[]>('/api/ticket-categories'),
  })

  const updateMut = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.put(`/api/tickets/${id}`, patch),
    onSuccess: () => {
      showSuccess('Ticket updated')
      queryClient.invalidateQueries({ queryKey: ['ticket-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      queryClient.invalidateQueries({ queryKey: ['ticket-stats'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Update failed'),
  })

  const commentMut = useMutation({
    mutationFn: () => api.post(`/api/tickets/${id}/comments`, { comment, is_internal: isInternal }),
    onSuccess: () => {
      showSuccess('Comment added')
      setComment('')
      queryClient.invalidateQueries({ queryKey: ['ticket-detail', id] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Comment failed'),
  })

  if (isLoading) return <div className="text-text-muted text-sm">Loading ticket...</div>
  if (!ticket) return <div className="text-danger text-sm">Ticket not found</div>

  return (
    <div>
      <button
        onClick={() => navigate('/tickets')}
        className="text-sm text-primary hover:text-primary-hover mb-4 inline-block"
      >
        &larr; Back to Tickets
      </button>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Header card */}
          <div className="bg-card border border-border rounded-md p-4">
            <div className="flex items-start gap-2 mb-3">
              <StatusIcon status={ticket.status} />
              <h2 className="text-base font-semibold text-text-dark leading-snug">{esc(ticket.title)}</h2>
              <span className="text-xs text-text-xmuted shrink-0 ml-auto">#{ticket.id}</span>
            </div>
            {ticket.description && (
              <div
                className="text-sm text-text-muted prose prose-sm max-w-none"
                ref={highlightRef}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(markdownToHtml(ticket.description || '')) }}
              />
            )}
            <div className="text-xs text-text-xmuted mt-3">
              Opened {timeAgo(ticket.created_at)}
              {ticket.reporter_username && <> by <strong>{ticket.reporter_username}</strong></>}
            </div>
          </div>

          {/* Comments */}
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <div className="px-4 py-2 border-b border-border-light bg-bg">
              <h3 className="text-xs font-semibold text-text-muted uppercase">
                Comments ({(ticket.comments ?? []).length})
              </h3>
            </div>
            {(ticket.comments ?? []).length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-text-muted">No comments yet</div>
            ) : (
              <div className="divide-y divide-border-light">
                {(ticket.comments ?? []).map((c) => (
                  <div
                    key={c.id}
                    className={cn('px-4 py-3', c.is_internal ? 'bg-warning-light/30' : '')}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-text-dark">{esc(c.author_username)}</span>
                      {c.is_internal && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning-light text-warning">
                          Internal
                        </span>
                      )}
                      <span className="text-[10px] text-text-xmuted ml-auto">{timeAgo(c.created_at)}</span>
                    </div>
                    <p className="text-sm text-text-muted whitespace-pre-wrap">{c.comment}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Add comment form */}
            <div className="px-4 py-3 border-t border-border-light bg-bg">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Add a comment..."
                className="w-full px-3 py-2 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus resize-none"
              />
              <div className="flex items-center gap-3 mt-2">
                <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                    className="w-3 h-3"
                  />
                  Internal note
                </label>
                <button
                  disabled={!comment.trim() || commentMut.isPending}
                  onClick={() => commentMut.mutate()}
                  className="ml-auto text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1"
                >
                  <MessageSquare size={12} />
                  {commentMut.isPending ? 'Posting...' : 'Post Comment'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar: metadata */}
        <aside className="w-full lg:w-72 shrink-0 space-y-3">
          <TicketMetaCard label="Status">
            <select
              value={ticket.status}
              onChange={(e) => updateMut.mutate({ status: e.target.value })}
              className={cn(
                'w-full text-xs px-2 py-1.5 border rounded-sm focus:outline-none focus:border-input-focus',
                'border-input-border bg-input-bg text-text-dark',
              )}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </TicketMetaCard>

          <TicketMetaCard label="Priority">
            <select
              value={ticket.priority}
              onChange={(e) => updateMut.mutate({ priority: e.target.value })}
              className="w-full text-xs px-2 py-1.5 border border-input-border rounded-sm bg-input-bg text-text-dark focus:outline-none focus:border-input-focus"
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </TicketMetaCard>

          <TicketMetaCard label="Assignee">
            <select
              value={ticket.assignee_id ?? ''}
              onChange={(e) =>
                updateMut.mutate({ assignee_id: e.target.value ? Number(e.target.value) : null })
              }
              className="w-full text-xs px-2 py-1.5 border border-input-border rounded-sm bg-input-bg text-text-dark focus:outline-none focus:border-input-focus"
            >
              <option value="">Unassigned</option>
              {(assignableUsers ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.username}</option>
              ))}
            </select>
          </TicketMetaCard>

          <TicketMetaCard label="Category">
            <select
              value={ticket.category_id ?? ''}
              onChange={(e) =>
                updateMut.mutate({ category_id: e.target.value ? Number(e.target.value) : null })
              }
              className="w-full text-xs px-2 py-1.5 border border-input-border rounded-sm bg-input-bg text-text-dark focus:outline-none focus:border-input-focus"
            >
              <option value="">None</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </TicketMetaCard>

          {/* Linked Executions */}
          {(ticket.executions ?? []).length > 0 && (
            <div className="bg-card border border-border rounded-md overflow-hidden">
              <div className="px-3 py-2 border-b border-border-light bg-bg">
                <h3 className="text-[10px] font-semibold text-text-muted uppercase">Linked Executions</h3>
              </div>
              <div className="px-3 py-2 space-y-1.5">
                {(ticket.executions ?? []).map((ex) => (
                  <div key={ex.execution_id} className="flex items-center gap-2 text-xs">
                    <span className={cn('px-1 py-0.5 rounded text-[10px] font-semibold',
                      ex.status === 'error' ? 'bg-danger-light text-danger' : 'bg-success-light text-success')}>
                      {ex.status}
                    </span>
                    <button onClick={() => navigate(`/monitoring/${ex.execution_id}`)}
                      className="text-primary hover:text-primary-hover truncate">
                      {ex.workflow_name} #{ex.execution_id}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execution Context */}
          {ticket.execution_data && (
            <div className="bg-card border border-border rounded-md overflow-hidden">
              <div className="px-3 py-2 border-b border-border-light bg-bg">
                <h3 className="text-[10px] font-semibold text-text-muted uppercase">Execution Context</h3>
              </div>
              <div className="px-3 py-2 space-y-1">
                {ticket.execution_data.workflow_name && (
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">Workflow</span>
                    <span className="text-text-dark font-medium">{ticket.execution_data.workflow_name}</span>
                  </div>
                )}
                {ticket.execution_data.execution_id && (
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">Execution ID</span>
                    <button onClick={() => navigate(`/monitoring/${ticket.execution_data!.execution_id}`)}
                      className="text-primary hover:text-primary-hover font-medium">
                      {ticket.execution_data.execution_id}
                    </button>
                  </div>
                )}
                {ticket.execution_data.execution_status && (
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">Status</span>
                    <span className={cn('font-medium', ticket.execution_data.execution_status === 'error' ? 'text-danger' : 'text-success')}>
                      {ticket.execution_data.execution_status}
                    </span>
                  </div>
                )}
                {ticket.execution_data.started_at && (
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">Time</span>
                    <span className="text-text-dark">{new Date(ticket.execution_data.started_at).toLocaleString()}</span>
                  </div>
                )}
                {ticket.execution_data.failed_node && (
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">Failed Node</span>
                    <span className="text-text-dark font-medium">{ticket.execution_data.failed_node}</span>
                  </div>
                )}
                {ticket.execution_data.error_message && (
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">Error</span>
                    <span className="text-text-dark truncate max-w-[150px]" title={ticket.execution_data.error_message}>
                      {ticket.execution_data.error_message}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Activity */}
          {(ticket.activity ?? []).length > 0 && (
            <div className="bg-card border border-border rounded-md overflow-hidden">
              <div className="px-3 py-2 border-b border-border-light bg-bg">
                <h3 className="text-[10px] font-semibold text-text-muted uppercase">Activity</h3>
              </div>
              <div className="px-3 py-2 space-y-1.5">
                {(ticket.activity ?? []).slice(0, 10).map((a) => (
                  <div key={a.id} className="text-[11px] text-text-muted">
                    <span className="font-medium text-text-dark">{a.actor_username}</span>{' '}
                    {a.action}{' '}
                    <span className="text-text-xmuted">{timeAgo(a.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function TicketMetaCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-md overflow-hidden">
      <div className="px-3 py-1.5 border-b border-border-light bg-bg">
        <span className="text-[10px] font-semibold text-text-muted uppercase">{label}</span>
      </div>
      <div className="px-3 py-2">{children}</div>
    </div>
  )
}
