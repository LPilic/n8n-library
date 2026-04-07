import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/hooks/useToast'
import { esc } from '@/lib/utils'
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

export function LibraryPage() {
  const user = useAuthStore((s) => s.user)
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()
  const isWriter = user?.role === 'admin' || user?.role === 'editor'
  const isAdmin = user?.role === 'admin'

  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

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
                onDelete={() => {
                  if (confirm('Delete this template?')) deleteMut.mutate(t.id)
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TemplateCard({
  template,
  isWriter,
  isAdmin,
  aiEnabled,
  onDelete,
}: {
  template: Template
  isWriter: boolean
  isAdmin: boolean
  aiEnabled: boolean
  onDelete: () => void
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
              <button className="text-xs px-2 py-1 text-text-muted hover:text-text-dark hover:bg-card-hover rounded-sm flex items-center gap-1">
                <Pencil size={12} /> Edit
              </button>
              <button className="text-xs px-2 py-1 text-text-muted hover:text-text-dark hover:bg-card-hover rounded-sm flex items-center gap-1">
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
