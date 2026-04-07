import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/hooks/useToast'
import { esc, timeAgo, cn } from '@/lib/utils'
import {
  Search,
  Trash2,
  Plus,
  History,
  GitCompare,
  Variable,
  Copy,
  Check,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type PromptStatus = 'draft' | 'published' | 'archived'

interface Prompt {
  id: number
  name: string
  slug?: string
  description?: string
  content?: string
  status: PromptStatus
  category?: string
  variables?: string[]
  version?: number
  author_username?: string
  created_at: string
  updated_at: string
}

interface PromptVersion {
  id: number
  prompt_id: number
  version: number
  content: string
  variables?: string[]
  message?: string
  author_username?: string
  created_at: string
}

interface PromptDiff {
  from: PromptVersion
  to: PromptVersion
}

interface PromptListResponse {
  prompts: Prompt[]
  total: number
  page: number
  pages: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: PromptStatus): string {
  switch (status) {
    case 'published': return 'bg-success-light text-success'
    case 'draft': return 'bg-warning-light text-warning'
    case 'archived': return 'bg-border-light text-text-xmuted'
    default: return 'bg-border-light text-text-muted'
  }
}

// ─── PromptsPage ──────────────────────────────────────────────────────────────

export function PromptsPage() {
  const navigate = useNavigate()
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['prompts', page, search, statusFilter, categoryFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      if (categoryFilter) params.set('category', categoryFilter)
      return api.get<PromptListResponse>(`/api/prompts?${params}`)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/prompts/${id}`),
    onSuccess: () => {
      showSuccess('Prompt deleted')
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Delete failed'),
  })

  const prompts = data?.prompts ?? []

  // Derive unique categories from results for a simple client-side filter hint
  const allCategories = Array.from(
    new Set(prompts.map((p) => p.category).filter(Boolean) as string[]),
  )

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-0 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-xmuted" />
          <input
            type="text"
            placeholder="Search prompts..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-8 pr-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="text-xs px-2 py-1.5 border border-input-border rounded-sm bg-input-bg text-text-dark"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        {allCategories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1) }}
            className="text-xs px-2 py-1.5 border border-input-border rounded-sm bg-input-bg text-text-dark"
          >
            <option value="">All Categories</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        <span className="text-xs text-text-muted ml-auto hidden sm:inline">
          {data?.total ?? 0} prompt{(data?.total ?? 0) !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover"
        >
          <Plus size={12} /> New Prompt
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreatePromptModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            queryClient.invalidateQueries({ queryKey: ['prompts'] })
          }}
        />
      )}

      {/* Prompt grid */}
      {isLoading ? (
        <div className="text-text-muted text-sm">Loading prompts...</div>
      ) : prompts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-text-muted">No prompts found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {prompts.map((prompt) => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              onClick={() => navigate(`/prompts/${prompt.slug || prompt.id}`)}
              onDelete={() => { if (confirm('Delete this prompt?')) deleteMut.mutate(prompt.id) }}
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
          <span className="text-xs text-text-muted">Page {page} of {data.pages}</span>
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
  )
}

// ─── PromptCard ───────────────────────────────────────────────────────────────

function PromptCard({
  prompt,
  onClick,
  onDelete,
}: {
  prompt: Prompt
  onClick: () => void
  onDelete: () => void
}) {
  const varCount = prompt.variables?.length ?? 0

  return (
    <div
      className="bg-card border border-border rounded-md p-3 hover:border-border-focus cursor-pointer transition-colors group"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-medium text-text-dark truncate group-hover:text-primary transition-colors">
          {esc(prompt.name)}
        </h3>
        <div className="flex items-center gap-1 shrink-0">
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded capitalize', statusBadge(prompt.status))}>
            {prompt.status}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-1 text-text-xmuted hover:text-danger rounded-sm"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {prompt.description && (
        <p className="text-xs text-text-muted mb-2 line-clamp-2">{esc(prompt.description)}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {prompt.category && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-border-light text-text-muted">
            {esc(prompt.category)}
          </span>
        )}
        {varCount > 0 && (
          <span className="text-[10px] flex items-center gap-0.5 text-text-muted">
            <Variable size={10} /> {varCount} var{varCount !== 1 ? 's' : ''}
          </span>
        )}
        {prompt.version != null && (
          <span className="text-[10px] text-text-xmuted flex items-center gap-0.5">
            <History size={10} /> v{prompt.version}
          </span>
        )}
        <span className="text-[10px] text-text-xmuted ml-auto">{timeAgo(prompt.updated_at)}</span>
      </div>
    </div>
  )
}

// ─── CreatePromptModal ────────────────────────────────────────────────────────

function CreatePromptModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { error: showError } = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<PromptStatus>('draft')

  const createMut = useMutation({
    mutationFn: () =>
      api.post('/api/prompts', { name, description, content, category, status }),
    onSuccess: onCreated,
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Create failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-md w-full max-w-lg shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-dark">New Prompt</h2>
          <button onClick={onClose} className="text-text-xmuted hover:text-text-dark text-lg leading-none">&times;</button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-text-muted mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
                placeholder="e.g. Customer Support Reply"
              />
            </div>
            <div className="w-32">
              <label className="block text-xs font-medium text-text-muted mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PromptStatus)}
                className="w-full text-sm px-2 py-1.5 border border-input-border rounded-sm bg-input-bg text-text-dark"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-text-muted mb-1">Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
                placeholder="e.g. Support, Marketing"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
              placeholder="Brief description..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-input-border rounded-sm bg-input-bg text-sm font-mono text-text-dark focus:outline-none focus:border-input-focus resize-y"
              placeholder="You are a helpful assistant. {{variable_name}} ..."
            />
            <p className="text-[10px] text-text-xmuted mt-0.5">
              Use {'{{variable_name}}'} syntax for template variables
            </p>
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
            disabled={!name.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}
            className="text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
          >
            {createMut.isPending ? 'Creating...' : 'Create Prompt'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── PromptDetailPage ─────────────────────────────────────────────────────────

export function PromptDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()

  const [diffFrom, setDiffFrom] = useState<number | null>(null)
  const [diffTo, setDiffTo] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const { data: prompt, isLoading } = useQuery({
    queryKey: ['prompt-detail', slug],
    queryFn: () => api.get<Prompt>(`/api/prompts/${slug}`),
    enabled: !!slug,
  })

  const { data: versions } = useQuery({
    queryKey: ['prompt-versions', prompt?.id],
    queryFn: async () => {
      const r = await api.get<{ versions?: PromptVersion[] } | PromptVersion[]>(`/api/prompts/${prompt!.id}/versions`)
      return Array.isArray(r) ? r : r.versions ?? []
    },
    enabled: !!prompt?.id,
  })

  const { data: diff } = useQuery({
    queryKey: ['prompt-diff', prompt?.id, diffFrom, diffTo],
    queryFn: () =>
      api.get<PromptDiff>(
        `/api/prompts/${prompt!.id}/diff?from=${diffFrom}&to=${diffTo}`,
      ),
    enabled: !!prompt?.id && diffFrom !== null && diffTo !== null,
  })

  const statusMut = useMutation({
    mutationFn: (status: PromptStatus) =>
      api.patch(`/api/prompts/${prompt?.id}/status`, { status }),
    onSuccess: () => {
      showSuccess('Status updated')
      queryClient.invalidateQueries({ queryKey: ['prompt-detail', slug] })
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Update failed'),
  })

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/api/prompts/${prompt?.id}`),
    onSuccess: () => {
      showSuccess('Prompt deleted')
      navigate('/prompts')
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Delete failed'),
  })

  const copyContent = () => {
    if (!prompt?.content) return
    navigator.clipboard.writeText(prompt.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (isLoading) return <div className="text-text-muted text-sm">Loading prompt...</div>
  if (!prompt) return <div className="text-danger text-sm">Prompt not found</div>

  const varList = prompt.variables ?? []

  return (
    <div>
      {/* Back */}
      <button
        onClick={() => navigate('/prompts')}
        className="text-sm text-primary hover:text-primary-hover mb-4 inline-block"
      >
        &larr; Back to Prompts
      </button>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Main */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Header */}
          <div className="bg-card border border-border rounded-md p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-text-dark">{esc(prompt.name)}</h2>
                {prompt.description && (
                  <p className="text-sm text-text-muted mt-0.5">{esc(prompt.description)}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn('text-xs px-2 py-0.5 rounded capitalize', statusBadge(prompt.status))}>
                  {prompt.status}
                </span>
                <button
                  onClick={() => { if (confirm('Delete this prompt?')) deleteMut.mutate() }}
                  className="p-1.5 text-text-xmuted hover:text-danger rounded-sm"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs text-text-xmuted flex-wrap mb-4">
              {prompt.category && (
                <span className="px-1.5 py-0.5 rounded bg-border-light text-text-muted">{esc(prompt.category)}</span>
              )}
              {prompt.version != null && (
                <span className="flex items-center gap-0.5">
                  <History size={11} /> v{prompt.version}
                </span>
              )}
              {prompt.author_username && (
                <span>By <strong className="text-text-muted">{prompt.author_username}</strong></span>
              )}
              <span>Updated {timeAgo(prompt.updated_at)}</span>
            </div>

            {/* Status controls */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">Set status:</span>
              {(['draft', 'published', 'archived'] as PromptStatus[]).map((s) => (
                <button
                  key={s}
                  disabled={prompt.status === s || statusMut.isPending}
                  onClick={() => statusMut.mutate(s)}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-sm capitalize border transition-colors disabled:opacity-40',
                    prompt.status === s
                      ? cn(statusBadge(s), 'border-transparent')
                      : 'border-input-border text-text-muted hover:bg-card-hover',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border-light bg-bg">
              <h3 className="text-xs font-semibold text-text-muted uppercase">Prompt Content</h3>
              <button
                onClick={copyContent}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text-dark px-2 py-1 rounded-sm hover:bg-card-hover"
              >
                {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {prompt.content ? (
              <pre className="p-4 text-sm font-mono text-text-dark whitespace-pre-wrap break-words leading-relaxed">
                {prompt.content}
              </pre>
            ) : (
              <div className="px-4 py-6 text-center text-sm text-text-muted">No content</div>
            )}
          </div>

          {/* Diff viewer */}
          {(versions ?? []).length >= 2 && (
            <div className="bg-card border border-border rounded-md overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2 border-b border-border-light bg-bg flex-wrap">
                <h3 className="text-xs font-semibold text-text-muted uppercase flex items-center gap-1">
                  <GitCompare size={12} /> Version Diff
                </h3>
                <div className="flex items-center gap-2 ml-auto">
                  <select
                    value={diffFrom ?? ''}
                    onChange={(e) => setDiffFrom(e.target.value ? Number(e.target.value) : null)}
                    className="text-xs px-2 py-1 border border-input-border rounded-sm bg-input-bg text-text-dark"
                  >
                    <option value="">From version...</option>
                    {(versions ?? []).map((v) => (
                      <option key={v.id} value={v.version}>v{v.version}</option>
                    ))}
                  </select>
                  <span className="text-text-xmuted text-xs">&rarr;</span>
                  <select
                    value={diffTo ?? ''}
                    onChange={(e) => setDiffTo(e.target.value ? Number(e.target.value) : null)}
                    className="text-xs px-2 py-1 border border-input-border rounded-sm bg-input-bg text-text-dark"
                  >
                    <option value="">To version...</option>
                    {(versions ?? []).map((v) => (
                      <option key={v.id} value={v.version}>v{v.version}</option>
                    ))}
                  </select>
                </div>
              </div>
              {diff ? (
                <div className="grid grid-cols-2 divide-x divide-border-light">
                  <div className="p-3">
                    <div className="text-[10px] font-semibold text-text-muted uppercase mb-2">
                      v{diff.from.version}
                      {diff.from.created_at && <span className="font-normal ml-1">({timeAgo(diff.from.created_at)})</span>}
                    </div>
                    <pre className="text-xs font-mono text-text-muted whitespace-pre-wrap break-words leading-relaxed">
                      {diff.from.content}
                    </pre>
                  </div>
                  <div className="p-3">
                    <div className="text-[10px] font-semibold text-text-muted uppercase mb-2">
                      v{diff.to.version}
                      {diff.to.created_at && <span className="font-normal ml-1">({timeAgo(diff.to.created_at)})</span>}
                    </div>
                    <pre className="text-xs font-mono text-text-dark whitespace-pre-wrap break-words leading-relaxed">
                      {diff.to.content}
                    </pre>
                  </div>
                </div>
              ) : (
                diffFrom !== null && diffTo !== null ? (
                  <div className="px-4 py-4 text-sm text-text-muted text-center">Loading diff...</div>
                ) : (
                  <div className="px-4 py-4 text-sm text-text-muted text-center">
                    Select two versions above to compare
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="w-full lg:w-56 shrink-0 space-y-3">
          {/* Variables */}
          {varList.length > 0 && (
            <div className="bg-card border border-border rounded-md overflow-hidden">
              <div className="px-3 py-2 border-b border-border-light bg-bg">
                <h3 className="text-[10px] font-semibold text-text-muted uppercase flex items-center gap-1">
                  <Variable size={10} /> Variables ({varList.length})
                </h3>
              </div>
              <div className="px-3 py-2 space-y-1">
                {varList.map((v) => (
                  <div key={v} className="text-xs font-mono text-primary bg-primary-light px-2 py-0.5 rounded truncate">
                    {'{{'}{v}{'}}'}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Version history */}
          {(versions ?? []).length > 0 && (
            <div className="bg-card border border-border rounded-md overflow-hidden">
              <div className="px-3 py-2 border-b border-border-light bg-bg">
                <h3 className="text-[10px] font-semibold text-text-muted uppercase flex items-center gap-1">
                  <History size={10} /> Version History
                </h3>
              </div>
              <div className="divide-y divide-border-light">
                {(versions ?? []).map((v) => (
                  <div key={v.id} className="px-3 py-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium text-text-dark">v{v.version}</span>
                      <span className="text-[10px] text-text-xmuted">{timeAgo(v.created_at)}</span>
                    </div>
                    {v.author_username && (
                      <div className="text-[10px] text-text-muted">{v.author_username}</div>
                    )}
                    {v.message && (
                      <div className="text-[10px] text-text-muted italic truncate">{esc(v.message)}</div>
                    )}
                    {(v.variables ?? []).length > 0 && (
                      <div className="text-[10px] text-text-xmuted flex items-center gap-0.5 mt-0.5">
                        <Variable size={8} /> {(v.variables ?? []).length} var{(v.variables ?? []).length !== 1 ? 's' : ''}
                      </div>
                    )}
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
