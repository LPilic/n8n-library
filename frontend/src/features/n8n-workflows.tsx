import { useState, useMemo, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/hooks/useToast'
import { esc, timeAgo, cn } from '@/lib/utils'
import { Search, ChevronLeft, ChevronRight, Sparkles, FileText, Loader2 } from 'lucide-react'
import { NodeFlow } from '@/components/NodeFlow'
import { PreviewModal, N8nDemoPreview } from '@/components/PreviewModal'
import { DocsModal } from '@/components/DocsModal'

// --- Types ---

interface N8nNode {
  type?: string
  name?: string
  displayName?: string
  group?: string
  position?: number[]
}

interface N8nWorkflowFull {
  id: string
  name: string
  active: boolean
  nodes: N8nNode[]
  connections: Record<string, unknown>
  settings?: Record<string, unknown>
  pinData?: Record<string, unknown>
  updatedAt?: string
  createdAt?: string
}

interface N8nWorkflowLight {
  id: string
  name: string
  active: boolean
  nodeCount: number
  nodePreview: N8nNode[]
  updatedAt?: string
}

interface Category {
  id: number
  name: string
}

// N8nDemoPreview/PreviewModal/DocsModal imported from shared components

// Local N8nDemoPreview and PreviewModal removed — using shared components from @/components/PreviewModal

// --- Import Modal ---

function ImportModal({
  workflow,
  aiEnabled,
  onClose,
}: {
  workflow: N8nWorkflowFull
  aiEnabled: boolean
  onClose: () => void
}) {
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()
  const [name, setName] = useState(workflow.name)
  const [description, setDescription] = useState('')
  const [selectedCats, setSelectedCats] = useState<number[]>([])
  const [genNameLoading, setGenNameLoading] = useState(false)
  const [genDescLoading, setGenDescLoading] = useState(false)

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ categories: Category[] }>('/api/categories').then(r => r.categories),
  })

  const importMut = useMutation({
    mutationFn: () =>
      api.post('/api/templates', {
        name, description, categories: selectedCats,
        workflow: { nodes: workflow.nodes, connections: workflow.connections, settings: workflow.settings || {}, pinData: workflow.pinData || {} },
      }),
    onSuccess: () => { showSuccess('Workflow imported to library!'); queryClient.invalidateQueries({ queryKey: ['library-templates'] }); onClose() },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Import failed'),
  })

  async function generateName() {
    setGenNameLoading(true)
    try {
      const res = await api.post<{ name: string }>('/api/ai/name-workflow', { nodes: workflow.nodes, connections: workflow.connections })
      if (res.name) setName(res.name)
    } catch (err) { showError(err instanceof ApiError ? err.message : 'Name generation failed') }
    finally { setGenNameLoading(false) }
  }

  async function generateDescription() {
    setGenDescLoading(true)
    try {
      const res = await api.post<{ description: string }>('/api/ai/describe-workflow', { nodes: workflow.nodes, connections: workflow.connections })
      if (res.description) setDescription(res.description)
    } catch (err) { showError(err instanceof ApiError ? err.message : 'Description generation failed') }
    finally { setGenDescLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center modal-overlay bg-black/30" onClick={onClose}>
      <div className="bg-bg-light border border-border rounded-lg shadow-lg mx-4 flex flex-col overflow-hidden"
        style={{ width: '90vw', maxWidth: '1100px', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
          <h3 className="text-[15px] font-bold text-text-dark">Import: {esc(workflow.name)}</h3>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-[12px] font-semibold px-3 py-1.5 bg-bg-light border border-border text-text-base rounded-md hover:bg-bg">Cancel</button>
            <button onClick={() => importMut.mutate()} disabled={!name.trim() || importMut.isPending}
              className="text-[12px] font-semibold px-3 py-1.5 bg-primary text-white rounded-md hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5">
              {importMut.isPending ? 'Saving...' : 'Import'}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* n8n-demo workflow preview */}
          <div style={{ height: '300px', overflow: 'hidden' }}>
            <N8nDemoPreview workflow={{ nodes: workflow.nodes, connections: workflow.connections }} />
          </div>
          <div className="px-6 py-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[12px] font-semibold uppercase tracking-wide text-text-muted">Name</label>
                {aiEnabled && (
                  <button onClick={generateName} disabled={genNameLoading}
                    className="text-[11px] font-semibold px-2 py-1 bg-bg-light border border-border text-primary rounded-md hover:bg-bg flex items-center gap-1 disabled:opacity-50">
                    {genNameLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    {genNameLoading ? 'Generating...' : '\u2728 Generate'}
                  </button>
                )}
              </div>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-input-border rounded-md bg-input-bg text-sm text-text-dark focus-ring" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[12px] font-semibold uppercase tracking-wide text-text-muted">Description</label>
                {aiEnabled && (
                  <button onClick={generateDescription} disabled={genDescLoading}
                    className="text-[11px] font-semibold px-2 py-1 bg-bg-light border border-border text-primary rounded-md hover:bg-bg flex items-center gap-1 disabled:opacity-50">
                    {genDescLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    {genDescLoading ? 'Generating...' : '\u2728 Generate'}
                  </button>
                )}
              </div>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
                placeholder="Describe what this workflow does..."
                className="w-full px-3 py-2 border border-input-border rounded-md bg-input-bg text-sm text-text-dark focus-ring resize-y" />
            </div>
            {categories.length > 0 && (
              <div>
                <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-2">Categories</label>
                <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
                  {categories.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-xs text-text-dark cursor-pointer select-none">
                      <input type="checkbox" checked={selectedCats.includes(c.id)}
                        onChange={() => setSelectedCats(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                        className="rounded border-input-border" />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Workflow Card ---

function WorkflowCard({
  workflow,
  aiEnabled,
  onPreview,
  onImport,
  onRename,
  onDocs,
  renaming,
  docsGenerating,
}: {
  workflow: N8nWorkflowLight
  aiEnabled: boolean
  onPreview: () => void
  onImport: () => void
  onRename: () => void
  onDocs: () => void
  renaming: boolean
  docsGenerating: boolean
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-5 flex flex-col shadow-sm card-hover-effect">
      <div className="mb-3">
        <NodeFlow nodes={workflow.nodePreview} maxShow={12} onClick={onPreview} />
      </div>
      <div className="flex items-start justify-between mb-1.5">
        <h3 className="text-[14px] font-semibold text-text-dark leading-tight flex-1 mr-2 line-clamp-1">{esc(workflow.name)}</h3>
        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0',
          workflow.active ? 'bg-success-light text-success' : 'bg-bg border border-border-light text-text-muted')}>
          {workflow.active ? '\u25CF Active' : '\u25CB Inactive'}
        </span>
      </div>
      <div className="text-[12px] text-text-muted mb-3">
        {workflow.nodeCount} node{workflow.nodeCount !== 1 ? 's' : ''}
        {workflow.updatedAt && <> &middot; Updated {timeAgo(workflow.updatedAt)}</>}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap pt-3 mt-auto border-t border-border-light">
        <button onClick={onImport}
          className="text-[12px] font-semibold px-2.5 py-[5px] bg-success text-white rounded-md hover:bg-success/90 transition-colors">
          Import to Library
        </button>
        {aiEnabled && (
          <>
            <button onClick={onRename} disabled={renaming}
              className="text-[11px] font-semibold px-2.5 py-[5px] bg-bg-light border border-border text-text-base rounded-md hover:bg-bg transition-colors flex items-center gap-1 disabled:opacity-50">
              {renaming ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              {renaming ? 'Renaming...' : 'Rename'}
            </button>
            <button onClick={onDocs} disabled={docsGenerating}
              className="text-[11px] font-semibold px-2.5 py-[5px] bg-bg-light border border-border text-text-base rounded-md hover:bg-bg transition-colors flex items-center gap-1 disabled:opacity-50">
              {docsGenerating ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />}
              {docsGenerating ? 'Generating...' : 'Docs'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// --- Main Page ---

const PAGE_SIZE = 20

export function N8nWorkflowsPage() {
  const { success: showSuccess, error: showError } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [importingWf, setImportingWf] = useState<N8nWorkflowFull | null>(null)
  const [previewWf, setPreviewWf] = useState<{ title: string; data: { nodes: unknown[]; connections: unknown } } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [docsTarget, setDocsTarget] = useState<{ name: string; nodes: unknown[]; connections: unknown } | null>(null)

  const { data: aiStatus } = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api.get<{ configured: boolean }>('/api/ai/status'),
  })
  const aiEnabled = aiStatus?.configured ?? false

  // Store full workflow data in a ref for AI actions + preview (avoids re-fetching 59MB)
  const fullDataRef = useRef<N8nWorkflowFull[]>([])

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['n8n-workflows-light'],
    queryFn: async () => {
      const res = await api.get<{ data: N8nWorkflowFull[] }>('/api/monitoring/workflows')
      const all = res.data || []
      fullDataRef.current = all // cache full data for AI actions
      return all.map((w): N8nWorkflowLight => ({
        id: String(w.id),
        name: String(w.name || ''),
        active: Boolean(w.active),
        nodeCount: (w.nodes || []).length,
        nodePreview: (w.nodes || []).slice(0, 12).map(n => ({
          type: n.type, name: n.name, displayName: n.displayName,
          group: n.group, position: n.position,
        })),
        updatedAt: w.updatedAt,
      }))
    },
    staleTime: 60_000,
  })

  const getFullWf = useCallback((id: string) =>
    fullDataRef.current.find(w => String(w.id) === String(id)), [])

  async function handlePreview(id: string, name: string) {
    const wf = getFullWf(id)
    if (wf) {
      setPreviewWf({ title: name, data: { nodes: wf.nodes || [], connections: wf.connections || {} } })
    }
  }

  async function handleImport(id: string) {
    const wf = getFullWf(id)
    if (wf) setImportingWf(wf)
    else showError('Workflow data not available')
  }

  async function handleRename(id: string) {
    const wf = getFullWf(id)
    if (!wf) return showError('Workflow data not available')
    setRenamingId(id)
    try {
      const res = await api.post<{ name: string }>('/api/ai/name-workflow', {
        nodes: wf.nodes || [],
        connections: wf.connections || {},
      })
      if (res.name) {
        showSuccess(`Suggested name: ${res.name}`)
        // Update cached name
        wf.name = res.name
        queryClient.invalidateQueries({ queryKey: ['n8n-workflows-light'] })
      }
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Rename failed')
    } finally {
      setRenamingId(null)
    }
  }

  function handleDocs(id: string, name: string) {
    const wf = getFullWf(id)
    if (!wf) return showError('Workflow data not available')
    setDocsTarget({ name, nodes: wf.nodes || [], connections: wf.connections || {} })
  }

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
            className="w-full pl-8 pr-3 py-2 border border-input-border rounded-md bg-input-bg text-sm text-text-dark focus-ring" />
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
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', maxWidth: '1600px' }}>
          {paged.map((w) => (
            <WorkflowCard
              key={w.id}
              workflow={w}
              aiEnabled={aiEnabled}
              renaming={renamingId === w.id}
              docsGenerating={false}
              onPreview={() => handlePreview(w.id, w.name)}
              onImport={() => handleImport(w.id)}
              onRename={() => handleRename(w.id)}
              onDocs={() => handleDocs(w.id, w.name)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
            className="p-1.5 text-text-muted hover:text-text-dark hover:bg-card-hover rounded-sm disabled:opacity-40">
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const start = Math.max(1, Math.min(currentPage - 3, totalPages - 6))
            return start + i
          }).filter(p => p <= totalPages).map((p) => (
            <button key={p} onClick={() => setPage(p)}
              className={cn('min-w-[28px] h-7 text-xs rounded-sm', currentPage === p ? 'bg-primary text-white' : 'text-text-muted hover:bg-card-hover')}>
              {p}
            </button>
          ))}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
            className="p-1.5 text-text-muted hover:text-text-dark hover:bg-card-hover rounded-sm disabled:opacity-40">
            <ChevronRight size={14} />
          </button>
          <span className="text-xs text-text-muted ml-2">
            {(currentPage - 1) * PAGE_SIZE + 1}&ndash;{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
        </div>
      )}

      {/* Preview modal with n8n-demo web component */}
      {previewWf && (
        <PreviewModal
          title={previewWf.title}
          workflowData={previewWf.data}
          onClose={() => setPreviewWf(null)}
        />
      )}

      {/* Import modal */}
      {importingWf && (
        <ImportModal workflow={importingWf} aiEnabled={aiEnabled} onClose={() => setImportingWf(null)} />
      )}

      {/* Docs modal */}
      {docsTarget && (
        <DocsModal workflowName={docsTarget.name} nodes={docsTarget.nodes} connections={docsTarget.connections} onClose={() => setDocsTarget(null)} />
      )}
    </>
  )
}
