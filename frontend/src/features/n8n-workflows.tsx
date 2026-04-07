import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/hooks/useToast'
import { esc, timeAgo, cn } from '@/lib/utils'
import { Search, Download, X, ChevronLeft, ChevronRight, Sparkles, FileText } from 'lucide-react'
import { NodeFlow } from '@/components/NodeFlow'

// --- Types ---

interface N8nNode {
  type?: string
  name?: string
  displayName?: string
  group?: string
  position?: number[]
}

interface N8nWorkflowLight {
  id: string
  name: string
  active: boolean
  nodeCount: number
  nodePreview: N8nNode[] // first 8 nodes only
  updatedAt?: string
  createdAt?: string
}

interface N8nWorkflowFull {
  id: string
  name: string
  active: boolean
  nodes: N8nNode[]
  connections: Record<string, unknown>
  settings?: Record<string, unknown>
  updatedAt?: string
}

interface Category {
  id: number
  name: string
}

// NodeFlow imported from @/components/NodeFlow

// --- Import modal ---

function ImportModal({
  workflowId,
  workflowName,
  onClose,
}: {
  workflowId: string
  workflowName: string
  onClose: () => void
}) {
  const { error: showError, success: showSuccess } = useToast()
  const [name, setName] = useState(workflowName)
  const [description, setDescription] = useState('')
  const [selectedCats, setSelectedCats] = useState<number[]>([])

  // Fetch full workflow data only when importing
  const { data: fullWorkflow, isLoading: loadingWf } = useQuery({
    queryKey: ['n8n-workflow-full', workflowId],
    queryFn: () => api.get<{ data: N8nWorkflowFull[] }>('/api/monitoring/workflows').then(r => {
      const wf = r.data.find(w => String(w.id) === String(workflowId))
      if (!wf) throw new Error('Workflow not found')
      return wf
    }),
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ categories: Category[] }>('/api/categories').then(r => r.categories),
  })

  const importMut = useMutation({
    mutationFn: () => {
      if (!fullWorkflow) throw new Error('Workflow not loaded')
      return api.post('/api/templates', {
        name,
        description,
        categories: selectedCats,
        workflow: {
          nodes: fullWorkflow.nodes,
          connections: fullWorkflow.connections,
          settings: fullWorkflow.settings || {},
          pinData: {},
        },
      })
    },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-card border border-border rounded-md w-full max-w-md mx-4 shadow-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-dark">Import to Library</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-dark"><X size={16} /></button>
        </div>
        <div className="px-4 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="Describe what this workflow does..."
              className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus resize-none" />
          </div>
          {categories.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-text-muted mb-2">Categories</label>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={selectedCats.includes(c.id)} onChange={() => toggleCat(c.id)} className="accent-primary" />
                    <span className="text-xs text-text-muted">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button onClick={onClose} className="text-xs px-3 py-1.5 text-text-muted hover:text-text-dark hover:bg-card-hover rounded-sm">
            Cancel
          </button>
          <button
            onClick={() => importMut.mutate()}
            disabled={!name.trim() || importMut.isPending || loadingWf}
            className="text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5"
          >
            <Download size={12} />
            {loadingWf ? 'Loading...' : importMut.isPending ? 'Saving...' : 'Save to Library'}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Workflow card ---

function WorkflowCard({
  workflow, onImport, aiEnabled, onRename, onDocs,
}: {
  workflow: N8nWorkflowLight
  onImport: () => void
  aiEnabled: boolean
  onRename: () => void
  onDocs: () => void
}) {
  return (
    <div className="bg-card border border-border rounded-md overflow-hidden hover:border-border transition-colors">
      <div className="px-3 py-2 border-b border-border-light overflow-x-auto">
        <NodeFlow nodes={workflow.nodePreview} />
      </div>
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-text-dark truncate">{esc(workflow.name)}</h3>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded shrink-0',
            workflow.active ? 'bg-success-light text-success' : 'bg-border-light text-text-muted')}>
            {workflow.active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-text-xmuted">{workflow.nodeCount} node{workflow.nodeCount !== 1 ? 's' : ''}</span>
          {workflow.updatedAt && <span className="text-xs text-text-xmuted">Updated {timeAgo(workflow.updatedAt)}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 px-3 py-2 border-t border-border-light">
        <button onClick={onImport}
          className="text-xs px-2 py-1 text-primary hover:bg-primary-light rounded-sm flex items-center gap-1">
          <Download size={12} /> Import
        </button>
        {aiEnabled && (
          <>
            <button onClick={onRename}
              className="text-xs px-2 py-1 text-primary hover:bg-primary-light rounded-sm flex items-center gap-1">
              <Sparkles size={12} /> Rename
            </button>
            <button onClick={onDocs}
              className="text-xs px-2 py-1 text-primary hover:bg-primary-light rounded-sm flex items-center gap-1">
              <FileText size={12} /> Docs
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// --- Main page ---

const PAGE_SIZE = 20

export function N8nWorkflowsPage() {
  const { success: showSuccess, error: showError } = useToast()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [importingId, setImportingId] = useState<{ id: string; name: string } | null>(null)

  // Check if AI is configured
  const { data: aiStatus } = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api.get<{ configured: boolean }>('/api/ai/status'),
  })
  const aiEnabled = aiStatus?.configured ?? false

  async function aiRename(wfId: string) {
    try {
      const res = await api.post<{ name: string }>('/api/ai/name-workflow', { workflowId: wfId })
      showSuccess(`Renamed to: ${res.name}`)
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Rename failed')
    }
  }

  async function aiDocs(wfId: string, wfName: string) {
    try {
      // Fetch full workflow for docs generation
      const allWfs = await api.get<{ data: N8nWorkflowFull[] }>('/api/monitoring/workflows')
      const wf = allWfs.data.find(w => String(w.id) === String(wfId))
      if (!wf) throw new Error('Workflow not found')
      await api.post('/api/ai/document-workflow', {
        workflowName: wfName,
        nodes: wf.nodes,
        connections: wf.connections,
      })
      showSuccess('Documentation generated')
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Docs generation failed')
    }
  }

  // Fetch workflows and strip heavy data (keep only first 8 nodes for preview)
  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['n8n-workflows-light'],
    queryFn: async () => {
      const res = await api.get<{ data: Array<Record<string, unknown>> }>('/api/monitoring/workflows')
      return (res.data || []).map((w): N8nWorkflowLight => {
        const nodes = (w.nodes as N8nNode[]) || []
        return {
          id: String(w.id),
          name: String(w.name || ''),
          active: Boolean(w.active),
          nodeCount: nodes.length,
          nodePreview: nodes.slice(0, 8).map(n => ({
            type: n.type, name: n.name, displayName: n.displayName,
            group: n.group, position: n.position,
          })),
          updatedAt: w.updatedAt as string | undefined,
          createdAt: w.createdAt as string | undefined,
        }
      })
    },
    staleTime: 60_000,
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return workflows
    return workflows.filter((w) => w.name.toLowerCase().includes(q))
  }, [workflows, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-xmuted" />
          <input type="text" placeholder="Search workflows..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-8 pr-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus" />
        </div>
        <span className="text-sm text-text-muted">
          {filtered.length} workflow{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {isLoading ? (
        <div className="text-text-muted text-sm">Loading workflows...</div>
      ) : paged.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-text-muted">No workflows found</p>
          {search && <p className="text-xs text-text-xmuted mt-1">Try a different search term</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {paged.map((w) => (
            <WorkflowCard key={w.id} workflow={w}
              aiEnabled={aiEnabled}
              onImport={() => setImportingId({ id: w.id, name: w.name })}
              onRename={() => aiRename(w.id)}
              onDocs={() => aiDocs(w.id, w.name)} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-6">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
            className="p-1.5 text-text-muted hover:text-text-dark hover:bg-card-hover rounded-sm disabled:opacity-40">
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const start = Math.max(1, Math.min(currentPage - 3, totalPages - 6))
            return start + i
          }).filter(p => p <= totalPages).map((p) => (
            <button key={p} onClick={() => setPage(p)}
              className={cn('min-w-[28px] h-7 text-xs rounded-sm',
                currentPage === p ? 'bg-primary text-white' : 'text-text-muted hover:bg-card-hover')}>
              {p}
            </button>
          ))}
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
            className="p-1.5 text-text-muted hover:text-text-dark hover:bg-card-hover rounded-sm disabled:opacity-40">
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {importingId && (
        <ImportModal workflowId={importingId.id} workflowName={importingId.name}
          onClose={() => setImportingId(null)} />
      )}
    </>
  )
}
