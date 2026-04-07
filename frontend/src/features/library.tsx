import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/hooks/useToast'
import { esc } from '@/lib/utils'
import { appConfirm } from '@/components/ConfirmDialog'
import { Search, Trash2, History, Pencil, Sparkles } from 'lucide-react'
import { NodeFlow } from '@/components/NodeFlow'

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

// ─── EditTemplateModal ────────────────────────────────────────────────────────

interface EditTemplateModalProps {
  templateId: number
  allCategories: Category[]
  onClose: () => void
  onSaved: () => void
}

function EditTemplateModal({ templateId, allCategories, onClose, onSaved }: EditTemplateModalProps) {
  const { error: showError, success: showSuccess } = useToast()

  // Fetch full template metadata
  const { data: tplData, isLoading } = useQuery({
    queryKey: ['template-meta', templateId],
    queryFn: () => api.get<{ workflow: Template }>(`/templates/workflows/${templateId}`),
  })

  const template = tplData?.workflow

  const [name, setName] = useState<string | null>(null)
  const [description, setDescription] = useState<string | null>(null)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[] | null>(null)
  const [saving, setSaving] = useState(false)

  // Once template is loaded, initialise form state (only on first load)
  if (template && name === null) {
    setName(template.name)
    setDescription(template.description ?? '')
    setSelectedCategoryIds((template.categories ?? []).map((c) => c.id))
  }

  function toggleCategory(id: number) {
    setSelectedCategoryIds((prev) =>
      prev == null
        ? [id]
        : prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id],
    )
  }

  async function handleSave() {
    if (!name?.trim()) {
      showError('Name is required')
      return
    }
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center modal-overlay bg-black/30">
      <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-xl mx-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-light">
          <h2 className="text-sm font-semibold text-text-dark">Edit Template</h2>
          <button
            onClick={onClose}
            className="text-text-xmuted hover:text-text-muted text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {isLoading || name === null ? (
            <p className="text-text-muted text-sm">Loading template…</p>
          ) : (
            <>
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
                  placeholder="Template name"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">
                  Description {/* TODO: replace with TipTap editor in Phase 6 */}
                </label>
                <textarea
                  value={description ?? ''}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus resize-y"
                  placeholder="Template description (HTML)"
                />
              </div>

              {/* Categories */}
              {allCategories.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-2">Categories</label>
                  <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                    {allCategories.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 text-xs text-text-dark cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={(selectedCategoryIds ?? []).includes(c.id)}
                          onChange={() => toggleCategory(c.id)}
                          className="rounded border-input-border"
                        />
                        {esc(c.name)}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-light">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-text-muted hover:text-text-dark border border-input-border rounded-sm bg-input-bg hover:bg-card-hover"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || isLoading || name === null}
            className="px-4 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── VersionHistoryModal ───────────────────────────────────────────────────────

interface VersionHistoryModalProps {
  templateId: number
  onClose: () => void
  onRestored: () => void
}

function VersionHistoryModal({ templateId, onClose, onRestored }: VersionHistoryModalProps) {
  const { error: showError, success: showSuccess } = useToast()
  const [restoringId, setRestoringId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['template-versions', templateId],
    queryFn: () =>
      api.get<{ versions: TemplateVersion[] }>(`/api/templates/${templateId}/versions`),
  })

  const versions = data?.versions ?? []

  async function handleRestore(versionId: number) {
    const ok = await appConfirm(
      'Restore this version? The current template will be replaced.',
      { okLabel: 'Restore' },
    )
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
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-light">
          <h2 className="text-sm font-semibold text-text-dark">Version History</h2>
          <button
            onClick={onClose}
            className="text-text-xmuted hover:text-text-muted text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <p className="text-text-muted text-sm">Loading versions…</p>
          ) : versions.length === 0 ? (
            <p className="text-text-muted text-sm">No version history found.</p>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-3 py-2 border-b border-border-light last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-text-dark truncate block">
                      {esc(v.name)}
                    </span>
                    {v.version_note && (
                      <span className="text-[11px] text-text-muted block truncate">
                        {esc(v.version_note)}
                      </span>
                    )}
                    <div className="text-[11px] text-text-xmuted mt-0.5 flex gap-2">
                      {v.edited_by_name && <span>by {esc(v.edited_by_name)}</span>}
                      <span>{new Date(v.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestore(v.id)}
                    disabled={restoringId === v.id}
                    className="text-xs px-2.5 py-1 border border-input-border rounded-sm text-text-muted hover:text-primary hover:border-primary bg-input-bg disabled:opacity-50 shrink-0"
                  >
                    {restoringId === v.id ? 'Restoring…' : 'Restore'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-border-light">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-text-muted hover:text-text-dark border border-input-border rounded-sm bg-input-bg hover:bg-card-hover"
          >
            Close
          </button>
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

  // Check if AI is configured
  const { data: aiStatus } = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api.get<{ configured: boolean }>('/api/ai/status'),
  })
  const aiEnabled = aiStatus?.configured ?? false

  // Fetch templates
  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['library-templates', search],
    queryFn: () =>
      api.get<{ workflows: Template[]; totalWorkflows: number }>(
        `/templates/search?search=${encodeURIComponent(search)}&rows=100&page=1`,
      ),
  })

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ categories: Category[] }>('/api/categories').then(r => r.categories),
  })

  // Delete template
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/templates/${id}`),
    onSuccess: () => {
      showSuccess('Template deleted')
      queryClient.invalidateQueries({ queryKey: ['library-templates'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Delete failed'),
  })

  const templates = templatesData?.workflows ?? []
  const categories = categoriesData ?? []

  // Filter by category client-side
  const filtered = useMemo(() => {
    if (!selectedCategory) return templates
    return templates.filter((t) =>
      t.categories?.some((c) => c.name === selectedCategory),
    )
  }, [templates, selectedCategory])

  async function handleDelete(id: number) {
    const ok = await appConfirm('Delete this template? This action cannot be undone.', {
      danger: true,
      okLabel: 'Delete',
    })
    if (ok) deleteMut.mutate(id)
  }

  function handleTemplateSaved() {
    queryClient.invalidateQueries({ queryKey: ['library-templates'] })
  }

  return (
    <div className="flex gap-6">
      {/* Sidebar: categories */}
      <aside className="w-48 shrink-0 hidden lg:block">
        <h3 className="text-xs font-semibold text-text-muted uppercase mb-2">Categories</h3>
        <button
          onClick={() => setSelectedCategory(null)}
          className={`block w-full text-left text-sm px-2 py-1 rounded-sm mb-0.5 ${
            !selectedCategory ? 'bg-primary-light text-primary font-medium' : 'text-text-muted hover:bg-card-hover'
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCategory(c.name)}
            className={`block w-full text-left text-sm px-2 py-1 rounded-sm mb-0.5 truncate ${
              selectedCategory === c.name ? 'bg-primary-light text-primary font-medium' : 'text-text-muted hover:bg-card-hover'
            }`}
          >
            {c.name}
          </button>
        ))}
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-xmuted" />
            <input
              type="text"
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
            />
          </div>
          <span className="text-sm text-text-muted">
            {filtered.length} template{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Template grid */}
        {isLoading ? (
          <div className="text-text-muted text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-muted">No templates found</p>
            <p className="text-xs text-text-xmuted mt-1">Import workflows from your n8n instance</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                isWriter={isWriter}
                isAdmin={isAdmin}
                aiEnabled={aiEnabled}
                onDelete={() => handleDelete(t.id)}
                onEdit={() => setEditingTemplateId(t.id)}
                onHistory={() => setHistoryTemplateId(t.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editingTemplateId != null && (
        <EditTemplateModal
          templateId={editingTemplateId}
          allCategories={categories}
          onClose={() => setEditingTemplateId(null)}
          onSaved={handleTemplateSaved}
        />
      )}

      {/* Version history modal */}
      {historyTemplateId != null && (
        <VersionHistoryModal
          templateId={historyTemplateId}
          onClose={() => setHistoryTemplateId(null)}
          onRestored={handleTemplateSaved}
        />
      )}
    </div>
  )
}

// ─── TemplateCard ─────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  isWriter,
  isAdmin,
  aiEnabled,
  onDelete,
  onEdit,
  onHistory,
}: {
  template: Template
  isWriter: boolean
  isAdmin: boolean
  aiEnabled: boolean
  onDelete: () => void
  onEdit: () => void
  onHistory: () => void
}) {
  const { success: showSuccess, error: showError } = useToast()
  const [docsLoading, setDocsLoading] = useState(false)
  const nodes = template.nodes ?? []

  async function generateDocs() {
    setDocsLoading(true)
    try {
      const wfRes = await api.get<{ workflow: Record<string, unknown> }>(`/workflows/templates/${template.id}`)
      const wf = wfRes.workflow || {}
      const res = await api.post<{ documentation: string }>('/api/ai/document-workflow', {
        workflowName: template.name,
        nodes: wf.nodes || [],
        connections: wf.connections || {},
      })
      if (res.documentation) {
        showSuccess('Documentation generated — check Knowledge Base')
      }
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Failed to generate docs')
    } finally {
      setDocsLoading(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-md overflow-hidden hover:border-border transition-colors">
      {/* Node flow preview */}
      <div className="px-3 py-2 border-b border-border-light overflow-x-auto">
        <NodeFlow nodes={nodes} />
      </div>

      {/* Header */}
      <div className="px-3 py-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-dark truncate">{esc(template.name)}</h3>
          <span className="text-[11px] text-text-xmuted ml-2 shrink-0">#{template.id}</span>
        </div>

        {/* Description */}
        {template.description && (
          <p
            className="text-xs text-text-muted mt-1 line-clamp-2"
            // TODO: sanitize with DOMPurify
            dangerouslySetInnerHTML={{ __html: template.description }}
          />
        )}

        {/* Categories */}
        {template.categories && template.categories.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {template.categories.map((c) => (
              <span key={c.id} className="text-[10px] px-1.5 py-0.5 bg-border-light text-text-muted rounded">
                {c.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      {(isWriter || isAdmin) && (
        <div className="flex items-center gap-1 px-3 py-2 border-t border-border-light">
          {isWriter && (
            <>
              <button
                onClick={onEdit}
                className="text-xs px-2 py-1 text-text-muted hover:text-text-dark hover:bg-card-hover rounded-sm flex items-center gap-1"
              >
                <Pencil size={12} /> Edit
              </button>
              <button
                onClick={onHistory}
                className="text-xs px-2 py-1 text-text-muted hover:text-text-dark hover:bg-card-hover rounded-sm flex items-center gap-1"
              >
                <History size={12} /> History
              </button>
              {aiEnabled && (
                <button
                  onClick={generateDocs}
                  disabled={docsLoading}
                  className="text-xs px-2 py-1 text-primary hover:bg-primary-light rounded-sm flex items-center gap-1 disabled:opacity-50"
                >
                  <Sparkles size={12} /> {docsLoading ? 'Generating...' : 'Docs'}
                </button>
              )}
            </>
          )}
          {isAdmin && (
            <button
              onClick={onDelete}
              className="text-xs px-2 py-1 text-danger hover:bg-danger-light rounded-sm flex items-center gap-1 ml-auto"
            >
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// NodeFlow is imported from @/components/NodeFlow
