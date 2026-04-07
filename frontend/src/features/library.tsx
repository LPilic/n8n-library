import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/hooks/useToast'
import { esc, cn } from '@/lib/utils'
import { appConfirm } from '@/components/ConfirmDialog'
import { Search, History, Sparkles } from 'lucide-react'
import { NodeFlow } from '@/components/NodeFlow'
import { PreviewModal, N8nDemoPreview } from '@/components/PreviewModal'
import { DocsModal } from '@/components/DocsModal'
import { RichTextEditor } from '@/components/RichTextEditor'

interface Template {
  id: number
  name: string
  description?: string
  nodes?: Array<{ type: string; name: string; displayName?: string; iconData?: Record<string, unknown>; icon?: string; group?: string; position?: number[] }>
  categories?: Array<{ id: number; name: string }>
  createdAt?: string
}

interface Category {
  id: number
  name: string
  icon?: string
  description?: string
}

interface TemplateVersion {
  id: number
  name: string
  version_note?: string
  created_at: string
  edited_by_name?: string
}

interface WorkflowData {
  nodes: unknown[]
  connections: unknown
  settings?: unknown
  pinData?: unknown
}

// ─── EditTemplateModal ────────────────────────────────────────────────────────

function EditTemplateModal({
  templateId,
  allCategories,
  aiEnabled,
  onClose,
  onSaved,
}: {
  templateId: number
  allCategories: Category[]
  aiEnabled: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { error: showError, success: showSuccess } = useToast()
  const [showDocs, setShowDocs] = useState(false)

  // Fetch template metadata
  const { data: tplData, isLoading: metaLoading } = useQuery({
    queryKey: ['template-meta', templateId],
    queryFn: () => api.get<{ workflow: Template }>(`/templates/workflows/${templateId}`),
  })

  // Fetch full workflow JSON for the n8n-demo preview
  const { data: wfData } = useQuery({
    queryKey: ['template-workflow', templateId],
    queryFn: () => api.get<{ workflow: WorkflowData }>(`/workflows/templates/${templateId}`),
  })

  const template = tplData?.workflow
  const workflow = wfData?.workflow

  const [name, setName] = useState<string | null>(null)
  const [description, setDescription] = useState<string | null>(null)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[] | null>(null)
  const [saving, setSaving] = useState(false)

  if (template && name === null) {
    setName(template.name)
    setDescription(template.description ?? '')
    setSelectedCategoryIds((template.categories ?? []).map((c) => c.id))
  }

  function toggleCategory(id: number) {
    setSelectedCategoryIds((prev) =>
      prev == null ? [id] : prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function handleSave() {
    if (!name?.trim()) { showError('Name is required'); return }
    setSaving(true)
    try {
      await api.put(`/api/templates/${templateId}`, {
        name: name.trim(),
        description: description ?? '',
        categories: selectedCategoryIds ?? [],
      })
      showSuccess('Template updated')
      onSaved()
      onClose()
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[120] flex items-center justify-center modal-overlay bg-black/30">
        <div
          className="bg-bg-light border border-border rounded-lg shadow-lg mx-4 flex flex-col overflow-hidden"
          style={{ width: '90vw', maxWidth: '1100px', maxHeight: '90vh' }}
        >
          {/* Header — matches legacy preview-modal-header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
            <h3 className="text-[15px] font-bold text-text-dark">Edit Template #{templateId}</h3>
            <div className="flex items-center gap-2">
              {aiEnabled && workflow && (
                <button onClick={() => setShowDocs(true)}
                  className="text-[12px] font-semibold px-3 py-1.5 bg-bg-light border border-border text-text-base rounded-md hover:bg-bg flex items-center gap-1">
                  <Sparkles size={12} /> Generate Docs
                </button>
              )}
              <button onClick={onClose}
                className="text-[12px] font-semibold px-3 py-1.5 bg-bg-light border border-border text-text-base rounded-md hover:bg-bg">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || metaLoading || name === null}
                className="text-[12px] font-semibold px-3 py-1.5 bg-primary text-white rounded-md hover:bg-primary-hover disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* n8n-demo workflow preview — matches legacy #editPreviewBody */}
            {workflow && (
              <div style={{ height: '350px', overflow: 'hidden', position: 'relative' }}>
                <N8nDemoPreview workflow={{ nodes: workflow.nodes || [], connections: workflow.connections || {} }} minHeight="350px" />
              </div>
            )}

            {/* Form fields */}
            <div className="px-6 py-4 space-y-4">
              {metaLoading || name === null ? (
                <p className="text-text-muted text-sm">Loading template...</p>
              ) : (
                <>
                  <div>
                    <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-1">Name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                      className="w-full px-3 py-2 border border-input-border rounded-md bg-input-bg text-sm text-text-dark focus-ring" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-1">Description</label>
                    <RichTextEditor
                      content={description ?? ''}
                      onChange={(html) => setDescription(html)}
                      placeholder="Template description..."
                    />
                  </div>
                  {allCategories.length > 0 && (
                    <div>
                      <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-2">Categories</label>
                      <div className="flex flex-wrap gap-2">
                        {allCategories.map((c) => {
                          const selected = (selectedCategoryIds ?? []).includes(c.id)
                          return (
                            <button key={c.id} type="button" onClick={() => toggleCategory(c.id)}
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
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Docs modal triggered from edit */}
      {showDocs && workflow && (
        <DocsModal
          workflowName={name || `Template #${templateId}`}
          nodes={(workflow.nodes as unknown[]) || []}
          connections={workflow.connections}
          onClose={() => setShowDocs(false)}
        />
      )}
    </>
  )
}

// ─── VersionHistoryModal ───────────────────────────────────────────────────────

function VersionHistoryModal({ templateId, onClose, onRestored }: { templateId: number; onClose: () => void; onRestored: () => void }) {
  const { error: showError, success: showSuccess } = useToast()
  const [restoringId, setRestoringId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['template-versions', templateId],
    queryFn: () => api.get<{ versions: TemplateVersion[] }>(`/api/templates/${templateId}/versions`),
  })

  const versions = data?.versions ?? []

  async function handleRestore(versionId: number) {
    const ok = await appConfirm('Restore this version? The current template will be replaced.', { okLabel: 'Restore' })
    if (!ok) return
    setRestoringId(versionId)
    try {
      await api.post(`/api/templates/${templateId}/versions/${versionId}/restore`, {})
      showSuccess('Version restored')
      onRestored()
      onClose()
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Restore failed')
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center modal-overlay bg-black/30">
      <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-light">
          <h2 className="text-sm font-semibold text-text-dark">Version History</h2>
          <button onClick={onClose} className="text-text-xmuted hover:text-text-muted text-lg">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? <p className="text-text-muted text-sm">Loading...</p> : versions.length === 0 ? <p className="text-text-muted text-sm">No version history.</p> : (
            <div className="space-y-2">
              {versions.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-3 py-2 border-b border-border-light last:border-0">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-text-dark truncate block">{esc(v.name)}</span>
                    {v.version_note && <span className="text-[11px] text-text-muted block truncate">{esc(v.version_note)}</span>}
                    <div className="text-[11px] text-text-xmuted mt-0.5 flex gap-2">
                      {v.edited_by_name && <span>by {esc(v.edited_by_name)}</span>}
                      <span>{new Date(v.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button onClick={() => handleRestore(v.id)} disabled={restoringId === v.id}
                    className="text-xs px-2.5 py-1 border border-input-border rounded-sm text-text-muted hover:text-primary hover:border-primary bg-input-bg disabled:opacity-50 shrink-0">
                    {restoringId === v.id ? 'Restoring...' : 'Restore'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end px-5 py-3 border-t border-border-light">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-text-muted hover:text-text-dark border border-input-border rounded-sm bg-input-bg hover:bg-card-hover">Close</button>
        </div>
      </div>
    </div>
  )
}

// ─── LibraryPage ──────────────────────────────────────────────────────────────

export function LibraryPage() {
  const user = useAuthStore((s) => s.user)
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()
  const isWriter = user?.role === 'admin' || user?.role === 'editor'
  const isAdmin = user?.role === 'admin'

  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null)
  const [historyTemplateId, setHistoryTemplateId] = useState<number | null>(null)
  const [previewWf, setPreviewWf] = useState<{ title: string; data: { nodes: unknown[]; connections: unknown } } | null>(null)
  const [docsTarget, setDocsTarget] = useState<{ name: string; nodes: unknown[]; connections: unknown } | null>(null)

  const { data: aiStatus } = useQuery({ queryKey: ['ai-status'], queryFn: () => api.get<{ configured: boolean }>('/api/ai/status') })
  const aiEnabled = aiStatus?.configured ?? false

  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['library-templates', search],
    queryFn: () => api.get<{ workflows: Template[]; totalWorkflows: number }>(`/templates/search?search=${encodeURIComponent(search)}&rows=100&page=1`),
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ categories: Category[] }>('/api/categories').then(r => r.categories),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/templates/${id}`),
    onSuccess: () => { showSuccess('Template deleted'); queryClient.invalidateQueries({ queryKey: ['library-templates'] }) },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Delete failed'),
  })

  const templates = templatesData?.workflows ?? []
  const categories = categoriesData ?? []

  const filtered = useMemo(() => {
    if (!selectedCategory) return templates
    return templates.filter((t) => t.categories?.some((c) => c.name === selectedCategory))
  }, [templates, selectedCategory])

  async function handleDelete(id: number) {
    const ok = await appConfirm('Delete this template? This action cannot be undone.', { danger: true, okLabel: 'Delete' })
    if (ok) deleteMut.mutate(id)
  }

  function handleTemplateSaved() {
    queryClient.invalidateQueries({ queryKey: ['library-templates'] })
  }

  // Fetch workflow data for preview/docs
  async function openPreview(templateId: number, templateName: string) {
    try {
      const res = await api.get<{ workflow: WorkflowData }>(`/workflows/templates/${templateId}`)
      const wf = res.workflow || {}
      setPreviewWf({ title: templateName, data: { nodes: (wf.nodes as unknown[]) || [], connections: wf.connections || {} } })
    } catch {
      showError('Failed to load workflow preview')
    }
  }

  async function openDocs(templateId: number, templateName: string) {
    try {
      const res = await api.get<{ workflow: WorkflowData }>(`/workflows/templates/${templateId}`)
      const wf = res.workflow || {}
      setDocsTarget({ name: templateName, nodes: (wf.nodes as unknown[]) || [], connections: wf.connections || {} })
    } catch {
      showError('Failed to load workflow data')
    }
  }

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <aside className="w-48 shrink-0 hidden lg:block">
        <h3 className="text-xs font-semibold text-text-muted uppercase mb-2">Categories</h3>
        <button onClick={() => setSelectedCategory(null)}
          className={`block w-full text-left text-sm px-2 py-1 rounded-sm mb-0.5 ${!selectedCategory ? 'bg-primary-light text-primary font-medium' : 'text-text-muted hover:bg-card-hover'}`}>
          All
        </button>
        {categories.map((c) => (
          <button key={c.id} onClick={() => setSelectedCategory(c.name)}
            className={`block w-full text-left text-sm px-2 py-1 rounded-sm mb-0.5 truncate ${selectedCategory === c.name ? 'bg-primary-light text-primary font-medium' : 'text-text-muted hover:bg-card-hover'}`}>
            {c.name}
          </button>
        ))}
      </aside>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-xmuted" />
            <input type="text" placeholder="Search templates..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-input-border rounded-md bg-input-bg text-sm text-text-dark focus-ring" />
          </div>
          <span className="text-sm text-text-muted">{filtered.length} template{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {isLoading ? (
          <div className="text-text-muted text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-muted">No templates found</p>
            <p className="text-xs text-text-xmuted mt-1">Import workflows from your n8n instance</p>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', maxWidth: '1600px' }}>
            {filtered.map((t) => (
              <TemplateCard key={t.id} template={t} isWriter={isWriter} isAdmin={isAdmin} aiEnabled={aiEnabled}
                onDelete={() => handleDelete(t.id)}
                onEdit={() => setEditingTemplateId(t.id)}
                onHistory={() => setHistoryTemplateId(t.id)}
                onPreview={() => openPreview(t.id, t.name)}
                onDocs={() => openDocs(t.id, t.name)} />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {editingTemplateId != null && (
        <EditTemplateModal templateId={editingTemplateId} allCategories={categories} aiEnabled={aiEnabled}
          onClose={() => setEditingTemplateId(null)} onSaved={handleTemplateSaved} />
      )}
      {historyTemplateId != null && (
        <VersionHistoryModal templateId={historyTemplateId} onClose={() => setHistoryTemplateId(null)} onRestored={handleTemplateSaved} />
      )}
      {previewWf && (
        <PreviewModal title={previewWf.title} workflowData={previewWf.data} onClose={() => setPreviewWf(null)} />
      )}
      {docsTarget && (
        <DocsModal workflowName={docsTarget.name} nodes={docsTarget.nodes} connections={docsTarget.connections} onClose={() => setDocsTarget(null)} />
      )}
    </div>
  )
}

// ─── TemplateCard ─────────────────────────────────────────────────────────────

function TemplateCard({
  template, isWriter, isAdmin, aiEnabled, onDelete, onEdit, onHistory, onPreview, onDocs,
}: {
  template: Template; isWriter: boolean; isAdmin: boolean; aiEnabled: boolean
  onDelete: () => void; onEdit: () => void; onHistory: () => void; onPreview: () => void; onDocs: () => void
}) {
  const nodes = template.nodes ?? []

  return (
    <div className="bg-card border border-border rounded-lg p-5 flex flex-col shadow-sm card-hover-effect">
      {/* Node flow preview — clickable to open full n8n-demo preview */}
      <div className="mb-3">
        <NodeFlow nodes={nodes} maxShow={12} onClick={onPreview} />
      </div>

      <div className="flex items-start justify-between mb-1.5 min-h-[20px]">
        <h3 className="text-[14px] font-semibold text-text-dark leading-tight flex-1 mr-2 line-clamp-1">{esc(template.name)}</h3>
        <span className="text-[11px] text-text-muted bg-bg px-2 py-0.5 rounded-full border border-border-light shrink-0">#{template.id}</span>
      </div>

      <div className="text-[13px] text-text-muted leading-relaxed mb-2.5 h-10 line-clamp-2 overflow-hidden [&_strong]:text-text-dark [&_a]:text-primary [&_code]:bg-bg [&_code]:px-1 [&_code]:rounded [&_code]:text-xs"
        dangerouslySetInnerHTML={{ __html: template.description || '<span class="text-text-xmuted">No description</span>' }} />

      <div className="flex flex-wrap gap-1.5 mb-2.5 min-h-[22px]">
        {(template.categories ?? []).map((c) => (
          <span key={c.id} className="text-[11px] px-2 py-0.5 bg-bg border border-border-light text-text-muted rounded-full font-medium">{c.name}</span>
        ))}
      </div>

      {(isWriter || isAdmin) && (
        <div className="flex items-center gap-1.5 flex-wrap pt-3 mt-auto border-t border-border-light">
          {isWriter && (
            <>
              <button onClick={onEdit} className="text-[12px] font-semibold px-2.5 py-[5px] bg-bg-light border border-border text-text-base rounded-md hover:bg-bg transition-colors">Edit</button>
              <button onClick={onHistory} className="text-[11px] font-semibold px-2.5 py-[5px] bg-bg-light border border-border text-text-base rounded-md hover:bg-bg transition-colors flex items-center gap-1">
                <History size={11} /> History
              </button>
              {aiEnabled && (
                <button onClick={onDocs} className="text-[11px] font-semibold px-2.5 py-[5px] bg-bg-light border border-border text-text-base rounded-md hover:bg-bg transition-colors flex items-center gap-1">
                  <Sparkles size={11} /> Docs
                </button>
              )}
            </>
          )}
          {isAdmin && (
            <button onClick={onDelete} className="text-[12px] font-semibold px-2.5 py-[5px] border border-danger text-danger rounded-md hover:bg-danger-light transition-colors ml-auto">Delete</button>
          )}
        </div>
      )}
    </div>
  )
}
