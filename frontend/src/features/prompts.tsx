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
  Pencil,
  Sparkles,
  RotateCcw,
} from 'lucide-react'
import CustomSelect from '@/components/CustomSelect'

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
  tags?: string[]
  version?: number
  author_username?: string
  created_by_name?: string
  created_at: string
  updated_at: string
}

interface PromptVersion {
  id: number
  prompt_id: number
  version: number
  content: string
  variables?: string[]
  change_note?: string
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

// ─── Word-level diff ──────────────────────────────────────────────────────────

type DiffToken = { text: string; type: 'same' | 'added' | 'removed' }

function wordDiff(oldText: string, newText: string): { left: DiffToken[]; right: DiffToken[] } {
  const oldWords = oldText.split(/(\s+)/)
  const newWords = newText.split(/(\s+)/)

  // Simple LCS-based diff
  const m = oldWords.length
  const n = newWords.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const left: DiffToken[] = []
  const right: DiffToken[] = []

  let i = m
  let j = n
  const ops: Array<'same' | 'del' | 'ins'> = []
  const opI: number[] = []
  const opJ: number[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      ops.push('same'); opI.push(i - 1); opJ.push(j - 1)
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push('ins'); opI.push(-1); opJ.push(j - 1)
      j--
    } else {
      ops.push('del'); opI.push(i - 1); opJ.push(-1)
      i--
    }
  }

  ops.reverse(); opI.reverse(); opJ.reverse()

  for (let k = 0; k < ops.length; k++) {
    const op = ops[k]
    if (op === 'same') {
      left.push({ text: oldWords[opI[k]], type: 'same' })
      right.push({ text: newWords[opJ[k]], type: 'same' })
    } else if (op === 'del') {
      left.push({ text: oldWords[opI[k]], type: 'removed' })
    } else {
      right.push({ text: newWords[opJ[k]], type: 'added' })
    }
  }

  return { left, right }
}

function DiffPane({ tokens }: { tokens: DiffToken[] }) {
  return (
    <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
      {tokens.map((t, i) => {
        if (t.type === 'added') {
          return <mark key={i} className="bg-success-light text-success rounded px-0.5">{t.text}</mark>
        }
        if (t.type === 'removed') {
          return <mark key={i} className="bg-danger-light text-danger line-through rounded px-0.5">{t.text}</mark>
        }
        return <span key={i}>{t.text}</span>
      })}
    </pre>
  )
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
        <CustomSelect
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1) }}
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'draft', label: 'Draft' },
            { value: 'published', label: 'Published' },
            { value: 'archived', label: 'Archived' },
          ]}
          size="sm"
        />
        {allCategories.length > 0 && (
          <CustomSelect
            value={categoryFilter}
            onChange={(v) => { setCategoryFilter(v); setPage(1) }}
            options={[
              { value: '', label: 'All Categories' },
              ...allCategories.map((c) => ({ value: c, label: c })),
            ]}
            size="sm"
          />
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
        {prompt.created_by_name && (
          <span className="text-[10px] text-text-xmuted truncate max-w-[80px]" title={prompt.created_by_name}>
            {esc(prompt.created_by_name)}
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
              <CustomSelect
                value={status}
                onChange={(v) => setStatus(v as PromptStatus)}
                options={[
                  { value: 'draft', label: 'Draft' },
                  { value: 'published', label: 'Published' },
                  { value: 'archived', label: 'Archived' },
                ]}
                className="w-full"
              />
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

// ─── EditPromptModal ──────────────────────────────────────────────────────────

function EditPromptModal({
  prompt,
  allCategories,
  onClose,
  onSaved,
}: {
  prompt: Prompt
  allCategories: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const { error: showError } = useToast()
  const [name, setName] = useState(prompt.name)
  const [content, setContent] = useState(prompt.content ?? '')
  const [category, setCategory] = useState(prompt.category ?? '')
  const [status, setStatus] = useState<PromptStatus>(prompt.status)
  const [variables, setVariables] = useState((prompt.variables ?? []).join(', '))
  const [tags, setTags] = useState((prompt.tags ?? []).join(', '))
  const [changeNote, setChangeNote] = useState('')

  const saveMut = useMutation({
    mutationFn: () => {
      const vars = variables
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
      const tagArr = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      return api.put(`/api/prompts/${prompt.id}`, {
        name,
        content,
        category,
        status,
        variables: vars,
        tags: tagArr,
        change_note: changeNote,
      })
    },
    onSuccess: onSaved,
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Save failed'),
  })

  const catlistId = `edit-categories-${prompt.id}`

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-md w-full max-w-2xl shadow-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-text-dark">Edit Prompt</h2>
          <button onClick={onClose} className="text-text-xmuted hover:text-text-dark text-lg leading-none">&times;</button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-text-muted mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
              />
            </div>
            <div className="w-32">
              <label className="block text-xs font-medium text-text-muted mb-1">Status</label>
              <CustomSelect
                value={status}
                onChange={(v) => setStatus(v as PromptStatus)}
                options={[
                  { value: 'draft', label: 'Draft' },
                  { value: 'published', label: 'Published' },
                  { value: 'archived', label: 'Archived' },
                ]}
                className="w-full"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-text-muted mb-1">Category</label>
              <input
                type="text"
                list={catlistId}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
                placeholder="e.g. Support"
              />
              {allCategories.length > 0 && (
                <datalist id={catlistId}>
                  {allCategories.map((c) => <option key={c} value={c} />)}
                </datalist>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Variables <span className="font-normal text-text-xmuted">(comma-separated)</span></label>
            <input
              type="text"
              value={variables}
              onChange={(e) => setVariables(e.target.value)}
              className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm font-mono text-text-dark focus:outline-none focus:border-input-focus"
              placeholder="customer_name, product_id"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Tags <span className="font-normal text-text-xmuted">(comma-separated)</span></label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
              placeholder="support, v2"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 border border-input-border rounded-sm bg-input-bg text-sm font-mono text-text-dark focus:outline-none focus:border-input-focus resize-y"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Change Note <span className="font-normal text-text-xmuted">(optional)</span></label>
            <input
              type="text"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
              placeholder="Describe what changed..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover"
          >
            Cancel
          </button>
          <button
            disabled={!name.trim() || saveMut.isPending}
            onClick={() => saveMut.mutate()}
            className="text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
          >
            {saveMut.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── AIImproveModal ───────────────────────────────────────────────────────────

function AIImproveModal({
  prompt,
  onClose,
  onAccepted,
}: {
  prompt: Prompt
  onClose: () => void
  onAccepted: () => void
}) {
  const { error: showError, success: showSuccess } = useToast()
  const [instruction, setInstruction] = useState('')
  const [improved, setImproved] = useState<string | null>(null)

  const improveMut = useMutation({
    mutationFn: () =>
      api.post<{ content: string }>('/api/ai/improve', {
        promptId: prompt.id,
        content: prompt.content ?? '',
        instruction,
      }),
    onSuccess: (data) => setImproved(data.content),
    onError: (err) => showError(err instanceof ApiError ? err.message : 'AI improve failed'),
  })

  const acceptMut = useMutation({
    mutationFn: () =>
      api.put(`/api/prompts/${prompt.id}`, {
        name: prompt.name,
        content: improved,
        category: prompt.category,
        status: prompt.status,
        variables: prompt.variables,
        tags: prompt.tags,
        change_note: 'AI-improved content',
      }),
    onSuccess: () => {
      showSuccess('Improved content saved')
      onAccepted()
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Save failed'),
  })

  const diff = improved != null ? wordDiff(prompt.content ?? '', improved) : null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-md w-full max-w-4xl shadow-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-text-dark flex items-center gap-1.5">
            <Sparkles size={14} className="text-primary" /> AI Improve
          </h2>
          <button onClick={onClose} className="text-text-xmuted hover:text-text-dark text-lg leading-none">&times;</button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {/* Original content */}
          {improved === null && (
            <div>
              <div className="text-xs font-medium text-text-muted mb-1">Current content</div>
              <pre className="p-3 bg-bg border border-border-light rounded-sm text-xs font-mono text-text-muted whitespace-pre-wrap break-words leading-relaxed max-h-48 overflow-y-auto">
                {prompt.content || '(empty)'}
              </pre>
            </div>
          )}

          {/* Side-by-side after improvement */}
          {diff !== null && (
            <div className="grid grid-cols-2 divide-x divide-border-light border border-border-light rounded-sm overflow-hidden">
              <div className="p-3">
                <div className="text-[10px] font-semibold text-text-muted uppercase mb-2">Original</div>
                <DiffPane tokens={diff.left} />
              </div>
              <div className="p-3">
                <div className="text-[10px] font-semibold text-success uppercase mb-2">Improved</div>
                <DiffPane tokens={diff.right} />
              </div>
            </div>
          )}

          {/* Instruction */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              How should this prompt be improved?
            </label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus resize-y"
              placeholder="e.g. Make it more concise, add clearer instructions for formatting, improve tone..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover"
          >
            Cancel
          </button>
          {improved !== null && (
            <button
              disabled={acceptMut.isPending}
              onClick={() => acceptMut.mutate()}
              className="text-xs px-3 py-1.5 bg-success text-white rounded-sm hover:opacity-90 disabled:opacity-50"
            >
              {acceptMut.isPending ? 'Saving...' : 'Accept & Save'}
            </button>
          )}
          <button
            disabled={!instruction.trim() || improveMut.isPending}
            onClick={() => improveMut.mutate()}
            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
          >
            <Sparkles size={11} />
            {improveMut.isPending ? 'Improving...' : improved !== null ? 'Re-improve' : 'Improve'}
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
  const [showEdit, setShowEdit] = useState(false)
  const [showAI, setShowAI] = useState(false)

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

  const revertMut = useMutation({
    mutationFn: (version: number) =>
      api.post(`/api/prompts/${prompt?.id}/revert/${version}`, {}),
    onSuccess: () => {
      showSuccess('Version restored')
      queryClient.invalidateQueries({ queryKey: ['prompt-detail', slug] })
      queryClient.invalidateQueries({ queryKey: ['prompt-versions', prompt?.id] })
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Restore failed'),
  })

  const copyContent = () => {
    if (!prompt?.content) return
    navigator.clipboard.writeText(prompt.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const invalidatePrompt = () => {
    queryClient.invalidateQueries({ queryKey: ['prompt-detail', slug] })
    queryClient.invalidateQueries({ queryKey: ['prompt-versions', prompt?.id] })
    queryClient.invalidateQueries({ queryKey: ['prompts'] })
  }

  if (isLoading) return <div className="text-text-muted text-sm">Loading prompt...</div>
  if (!prompt) return <div className="text-danger text-sm">Prompt not found</div>

  const varList = prompt.variables ?? []

  // Derive categories from version list for datalist in edit modal
  const editCategories = prompt.category ? [prompt.category] : []

  // Compute diff tokens if diff data available
  const diffTokens =
    diff != null ? wordDiff(diff.from.content, diff.to.content) : null

  return (
    <div>
      {/* Back */}
      <button
        onClick={() => navigate('/prompts')}
        className="text-sm text-primary hover:text-primary-hover mb-4 inline-block"
      >
        &larr; Back to Prompts
      </button>

      {/* Modals */}
      {showEdit && (
        <EditPromptModal
          prompt={prompt}
          allCategories={editCategories}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); invalidatePrompt() }}
        />
      )}
      {showAI && (
        <AIImproveModal
          prompt={prompt}
          onClose={() => setShowAI(false)}
          onAccepted={() => { setShowAI(false); invalidatePrompt() }}
        />
      )}

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
                  onClick={() => setShowEdit(true)}
                  className="p-1.5 text-text-xmuted hover:text-primary rounded-sm"
                  title="Edit prompt"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setShowAI(true)}
                  className="p-1.5 text-text-xmuted hover:text-primary rounded-sm"
                  title="AI Improve"
                >
                  <Sparkles size={14} />
                </button>
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
                  <CustomSelect
                    value={String(diffFrom ?? '')}
                    onChange={(v) => setDiffFrom(v ? Number(v) : null)}
                    placeholder="From version..."
                    options={[
                      { value: '', label: 'From version...' },
                      ...(versions ?? []).map((ver) => ({ value: String(ver.version), label: `v${ver.version}` })),
                    ]}
                    size="sm"
                  />
                  <span className="text-text-xmuted text-xs">&rarr;</span>
                  <CustomSelect
                    value={String(diffTo ?? '')}
                    onChange={(v) => setDiffTo(v ? Number(v) : null)}
                    placeholder="To version..."
                    options={[
                      { value: '', label: 'To version...' },
                      ...(versions ?? []).map((ver) => ({ value: String(ver.version), label: `v${ver.version}` })),
                    ]}
                    size="sm"
                  />
                </div>
              </div>
              {diff && diffTokens ? (
                <div className="grid grid-cols-2 divide-x divide-border-light">
                  <div className="p-3">
                    <div className="text-[10px] font-semibold text-text-muted uppercase mb-2">
                      v{diff.from.version}
                      {diff.from.created_at && <span className="font-normal ml-1">({timeAgo(diff.from.created_at)})</span>}
                    </div>
                    <DiffPane tokens={diffTokens.left} />
                  </div>
                  <div className="p-3">
                    <div className="text-[10px] font-semibold text-text-muted uppercase mb-2">
                      v{diff.to.version}
                      {diff.to.created_at && <span className="font-normal ml-1">({timeAgo(diff.to.created_at)})</span>}
                    </div>
                    <DiffPane tokens={diffTokens.right} />
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
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-text-xmuted">{timeAgo(v.created_at)}</span>
                        {v.version !== prompt.version && (
                          <button
                            onClick={() => {
                              if (confirm(`Restore to v${v.version}?`)) revertMut.mutate(v.version)
                            }}
                            disabled={revertMut.isPending}
                            title={`Restore v${v.version}`}
                            className="p-0.5 text-text-xmuted hover:text-primary rounded-sm disabled:opacity-40"
                          >
                            <RotateCcw size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                    {v.author_username && (
                      <div className="text-[10px] text-text-muted">{v.author_username}</div>
                    )}
                    {(v.change_note || v.message) && (
                      <div className="text-[10px] text-text-muted italic truncate">
                        {esc(v.change_note ?? v.message ?? '')}
                      </div>
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
