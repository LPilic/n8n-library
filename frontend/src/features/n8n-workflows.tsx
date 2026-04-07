import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/hooks/useToast'
import { esc, timeAgo, cn } from '@/lib/utils'
import { Search, Download, X, ChevronLeft, ChevronRight } from 'lucide-react'

// --- Types ---

interface N8nNode {
  type?: string
  name?: string
  displayName?: string
  group?: string
  position?: number[]
}

interface N8nWorkflow {
  id: string
  name: string
  active: boolean
  nodes: N8nNode[]
  connections: Record<string, unknown>
  updatedAt?: string
  createdAt?: string
}

interface Category {
  id: number
  name: string
}

// --- Node flow helpers (mirrors library.tsx) ---

const TRIGGER_KW = ['trigger', 'webhook', 'cron', 'schedule', 'start', 'event', 'formtrigger', 'chattrigger']

function isTrigger(node: { type?: string; name?: string; group?: string }): boolean {
  const g = (node.group || '').toLowerCase()
  if (g.includes('trigger')) return true
  const s = ((node.type || '') + (node.name || '')).toLowerCase()
  return TRIGGER_KW.some((k) => s.includes(k))
}

function getNodeLabel(node: { displayName?: string; name?: string; type?: string }): string {
  const name = node.displayName || node.name || node.type?.split('.').pop() || '?'
  return name.length > 16 ? name.slice(0, 14) + '\u2026' : name
}

function NodeFlow({ nodes }: { nodes: N8nNode[] }) {
  if (nodes.length === 0) {
    return <span className="text-text-xmuted text-xs">No nodes</span>
  }
  const sorted = [...nodes].sort((a, b) => {
    const at = isTrigger(a) ? 0 : 1
    const bt = isTrigger(b) ? 0 : 1
    if (at !== bt) return at - bt
    return (a.position?.[0] ?? 0) - (b.position?.[0] ?? 0)
  })
  const show = sorted.slice(0, 8)
  const remaining = nodes.length - 8
  return (
    <div className="flex items-center gap-1 flex-nowrap">
      {show.map((node, i) => (
        <div key={i} className="flex items-center gap-1">
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded',
              isTrigger(node) ? 'bg-success-light text-success' : 'bg-border-light text-text-muted',
            )}
          >
            {getNodeLabel(node)}
          </span>
          {i < show.length - 1 && <span className="text-text-xmuted text-[10px]">&rarr;</span>}
        </div>
      ))}
      {remaining > 0 && (
        <span className="text-text-xmuted text-[10px] ml-1">+{remaining} more</span>
      )}
    </div>
  )
}

// --- Import modal ---

function ImportModal({
  workflow,
  onClose,
}: {
  workflow: N8nWorkflow
  onClose: () => void
}) {
  const { error: showError, success: showSuccess } = useToast()
  const [name, setName] = useState(workflow.name)
  const [description, setDescription] = useState('')
  const [selectedCats, setSelectedCats] = useState<number[]>([])

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/api/categories'),
  })

  const { data: aiStatus } = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api.get<{ configured: boolean }>('/api/ai/status'),
  })

  const importMut = useMutation({
    mutationFn: () =>
      api.post('/api/templates', {
        name,
        description,
        categories: selectedCats,
        workflow: {
          nodes: workflow.nodes,
          connections: workflow.connections,
          settings: {},
          pinData: {},
        },
      }),
    onSuccess: () => {
      showSuccess('Workflow imported to library')
      onClose()
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Import failed'),
  })

  function toggleCat(id: number) {
    setSelectedCats((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border-border rounded-md w-full max-w-md mx-4 shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-dark">Import to Library</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-dark">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              Description
              {aiStatus?.configured && (
                <span className="ml-1.5 text-[10px] text-primary">(AI available)</span>
              )}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe what this workflow does..."
              className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus resize-none"
            />
          </div>

          {/* Categories */}
          {categories.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-text-muted mb-2">Categories</label>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCats.includes(c.id)}
                      onChange={() => toggleCat(c.id)}
                      className="accent-primary"
                    />
                    <span className="text-xs text-text-muted">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 text-text-muted hover:text-text-dark hover:bg-card-hover rounded-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => importMut.mutate()}
            disabled={!name.trim() || importMut.isPending}
            className="text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <Download size={12} />
            {importMut.isPending ? 'Saving…' : 'Save to Library'}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Workflow card ---

function WorkflowCard({
  workflow,
  onImport,
}: {
  workflow: N8nWorkflow
  onImport: () => void
}) {
  return (
    <div className="bg-card border border-border rounded-md overflow-hidden hover:border-border transition-colors">
      {/* Node flow preview */}
      <div className="px-3 py-2 border-b border-border-light overflow-x-auto">
        <NodeFlow nodes={workflow.nodes} />
      </div>

      {/* Info */}
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-text-dark truncate">{esc(workflow.name)}</h3>
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded shrink-0',
              workflow.active
                ? 'bg-success-light text-success'
                : 'bg-border-light text-text-muted',
            )}
          >
            {workflow.active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-text-xmuted">{workflow.nodes.length} node{workflow.nodes.length !== 1 ? 's' : ''}</span>
          {workflow.updatedAt && (
            <span className="text-xs text-text-xmuted">Updated {timeAgo(workflow.updatedAt)}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-3 py-2 border-t border-border-light">
        <button
          onClick={onImport}
          className="text-xs px-2 py-1 text-primary hover:bg-primary-light rounded-sm flex items-center gap-1"
        >
          <Download size={12} /> Import to Library
        </button>
      </div>
    </div>
  )
}

// --- Main page ---

const PAGE_SIZE = 20

export function N8nWorkflowsPage() {
  const { error: showError } = useToast()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [importing, setImporting] = useState<N8nWorkflow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['n8n-workflows'],
    queryFn: () => api.get<{ data: N8nWorkflow[] }>('/api/monitoring/workflows'),
    onError: (err: unknown) => showError(err instanceof ApiError ? err.message : 'Failed to load workflows'),
  } as Parameters<typeof useQuery>[0])

  const workflows = (data as { data?: N8nWorkflow[] } | undefined)?.data ?? []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return workflows
    return workflows.filter((w: N8nWorkflow) => w.name.toLowerCase().includes(q))
  }, [workflows, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function handleSearchChange(val: string) {
    setSearch(val)
    setPage(1)
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-xmuted" />
          <input
            type="text"
            placeholder="Search workflows..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
          />
        </div>
        <span className="text-sm text-text-muted">
          {filtered.length} workflow{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="text-text-muted text-sm">Loading…</div>
      ) : paged.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-text-muted">No workflows found</p>
          {search && (
            <p className="text-xs text-text-xmuted mt-1">Try a different search term</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {paged.map((w: N8nWorkflow) => (
            <WorkflowCard
              key={w.id}
              workflow={w}
              onImport={() => setImporting(w)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-1.5 text-text-muted hover:text-text-dark hover:bg-card-hover rounded-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
            .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
              if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis')
              acc.push(p)
              return acc
            }, [])
            .map((item, i) =>
              item === 'ellipsis' ? (
                <span key={`e${i}`} className="px-1 text-text-xmuted text-xs">…</span>
              ) : (
                <button
                  key={item}
                  onClick={() => setPage(item as number)}
                  className={cn(
                    'min-w-[28px] h-7 text-xs rounded-sm',
                    currentPage === item
                      ? 'bg-primary text-white'
                      : 'text-text-muted hover:bg-card-hover',
                  )}
                >
                  {item}
                </button>
              ),
            )}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="p-1.5 text-text-muted hover:text-text-dark hover:bg-card-hover rounded-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Import modal */}
      {importing && (
        <ImportModal workflow={importing} onClose={() => setImporting(null)} />
      )}
    </>
  )
}
