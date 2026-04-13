import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/hooks/useToast'
import { esc, timeAgo, cn } from '@/lib/utils'
import { Search, ChevronLeft, ChevronRight, Sparkles, FileText, Loader2, X, Tag, ChevronDown } from 'lucide-react'
import { NodeFlow } from '@/components/NodeFlow'
import CustomSelect from '@/components/CustomSelect'
import { PreviewModal, N8nDemoPreview } from '@/components/PreviewModal'
import { DocsModal } from '@/components/DocsModal'
import { RichTextEditor } from '@/components/RichTextEditor'
import { useInstanceStore } from '@/stores/instance'

// --- Types ---

interface N8nNode {
  type?: string
  name?: string
  displayName?: string
  group?: string
  position?: number[]
}

interface N8nTag {
  id: string
  name: string
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
  tags?: N8nTag[]
  ownerName?: string
  ownerProjectId?: string
}

interface N8nWorkflowLight {
  id: string
  name: string
  active: boolean
  nodeCount: number
  nodePreview: N8nNode[]
  updatedAt?: string
  tagIds: string[]
  tagNames: string[]
  ownerId?: string
  ownerName?: string
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
          <div style={{ height: '350px', overflow: 'hidden', position: 'relative' }}>
            <N8nDemoPreview workflow={{ nodes: workflow.nodes, connections: workflow.connections }} minHeight="350px" />
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
              <RichTextEditor
                content={description}
                onChange={(html) => setDescription(html)}
                placeholder="Describe what this workflow does..."
              />
            </div>
            {categories.length > 0 && (
              <div>
                <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-2">Categories</label>
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => {
                    const selected = selectedCats.includes(c.id)
                    return (
                      <button key={c.id} type="button"
                        onClick={() => setSelectedCats(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                        className={cn(
                          'text-[12px] font-semibold uppercase tracking-wide px-3 py-1.5 rounded-md border transition-colors',
                          selected
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'bg-bg-light border-border text-text-muted hover:border-text-muted',
                        )}>
                        {c.name}
                      </button>
                    )
                  })}
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
      <div className="text-[12px] text-text-muted mb-1.5">
        {workflow.nodeCount} node{workflow.nodeCount !== 1 ? 's' : ''}
        {workflow.updatedAt && <> &middot; Updated {timeAgo(workflow.updatedAt)}</>}
      </div>
      {workflow.tagNames.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {workflow.tagNames.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-bg border border-border-light rounded text-text-muted">
              {tag}
            </span>
          ))}
          {workflow.tagNames.length > 3 && (
            <span className="text-[10px] text-text-xmuted">+{workflow.tagNames.length - 3}</span>
          )}
        </div>
      )}
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

// --- Tags Dropdown ---

function TagsDropdown({ tags, selected, onChange }: {
  tags: { id: string; name: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className={cn('text-[12px] font-semibold px-2.5 py-[5px] rounded-md border flex items-center gap-1.5',
          selected.length > 0
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-input-border bg-input-bg text-text-dark hover:bg-card-hover')}>
        <Tag size={12} />
        Tags{selected.length > 0 && ` (${selected.length})`}
        <ChevronDown size={10} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 max-h-60 overflow-y-auto bg-bg-light border border-border rounded-md shadow-lg z-50 py-1">
          {tags.map((t) => (
            <label key={t.id}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-card-hover cursor-pointer text-xs text-text-dark">
              <input type="checkbox" checked={selected.includes(t.id)}
                onChange={() => toggle(t.id)}
                className="rounded border-border" />
              {t.name}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Main Page ---

const PAGE_SIZE = 20

export function N8nWorkflowsPage() {
  const { success: showSuccess, error: showError } = useToast()
  const queryClient = useQueryClient()
  const iUrl = useInstanceStore((s) => s.url)
  const activeInstanceId = useInstanceStore((s) => s.activeId)
  const instanceLoaded = useInstanceStore((s) => s.loaded)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedOwner, setSelectedOwner] = useState<string>('')
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
    queryKey: ['n8n-workflows-light', activeInstanceId],
    queryFn: async () => {
      const res = await api.get<{ data: N8nWorkflowFull[] }>(iUrl('/api/monitoring/workflows'))
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
        tagIds: (w.tags || []).map(t => String(t.id)),
        tagNames: (w.tags || []).map(t => t.name),
        ownerId: w.ownerProjectId || undefined,
        ownerName: w.ownerName || undefined,
      }))
    },
    enabled: instanceLoaded && !!activeInstanceId,
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
        queryClient.invalidateQueries({ queryKey: ['n8n-workflows-light', activeInstanceId] })
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

  const availableTags = useMemo(() => {
    const map = new Map<string, string>()
    for (const w of workflows) {
      for (let i = 0; i < w.tagIds.length; i++) {
        map.set(w.tagIds[i], w.tagNames[i])
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [workflows])

  const availableOwners = useMemo(() => {
    const map = new Map<string, string>()
    for (const w of workflows) {
      if (w.ownerId && w.ownerName) map.set(w.ownerId, w.ownerName)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [workflows])

  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (selectedTags.length > 0 ? 1 : 0) + (selectedOwner ? 1 : 0)

  function clearAllFilters() {
    setStatusFilter('all')
    setSelectedTags([])
    setSelectedOwner('')
    setPage(1)
  }

  const filtered = useMemo(() => {
    let list = workflows
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((w) => w.name.toLowerCase().includes(q))
    if (statusFilter === 'active') list = list.filter((w) => w.active)
    if (statusFilter === 'inactive') list = list.filter((w) => !w.active)
    if (selectedTags.length > 0) list = list.filter((w) => selectedTags.every((t) => w.tagIds.includes(t)))
    if (selectedOwner) list = list.filter((w) => w.ownerId === selectedOwner)
    return list
  }, [workflows, search, statusFilter, selectedTags, selectedOwner])

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
          {activeFilterCount > 0 && workflows.length !== filtered.length && (
            <> of {workflows.length}</>
          )}
        </span>
      </div>

      {/* Filter bar */}
      {!isLoading && workflows.length > 0 && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {/* Status button group */}
          <div className="flex items-center gap-1">
            {(['all', 'active', 'inactive'] as const).map((f) => (
              <button key={f} onClick={() => { setStatusFilter(f); setPage(1) }}
                className={cn('text-[12px] font-semibold px-2.5 py-[5px] rounded-md border capitalize',
                  statusFilter === f
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input-border bg-input-bg text-text-dark hover:bg-card-hover')}>
                {f}
              </button>
            ))}
          </div>

          {/* Tags dropdown */}
          {availableTags.length > 0 && (
            <TagsDropdown
              tags={availableTags}
              selected={selectedTags}
              onChange={(ids) => { setSelectedTags(ids); setPage(1) }}
            />
          )}

          {/* Owner select */}
          {availableOwners.length > 0 && (
            <CustomSelect
              value={selectedOwner}
              onChange={(v) => { setSelectedOwner(v); setPage(1) }}
              options={[
                { value: '', label: 'All Owners' },
                ...availableOwners.map((o) => ({ value: o.id, label: o.name })),
              ]}
              size="sm"
              triggerClassName="text-xs px-2 py-1.5 rounded-md max-w-[200px]"
            />
          )}

          {/* Clear all */}
          {activeFilterCount > 0 && (
            <button onClick={clearAllFilters}
              className="text-[12px] font-semibold px-2 py-1 text-text-muted hover:text-text-dark flex items-center gap-1">
              <X size={12} /> Clear filters
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="text-text-muted text-sm">Loading workflows...</div>
      ) : paged.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-text-muted">No workflows found</p>
          {(search || activeFilterCount > 0) && <p className="text-xs text-text-xmuted mt-1">Try adjusting your search or filters</p>}
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
