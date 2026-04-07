import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/hooks/useToast'
import { esc } from '@/lib/utils'
import { Search, Trash2, History, Pencil } from 'lucide-react'

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
  onDelete,
}: {
  template: Template
  isWriter: boolean
  isAdmin: boolean
  onDelete: () => void
}) {
  const nodes = template.nodes ?? []

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

// --- Node flow preview (simplified version) ---

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

function NodeFlow({ nodes }: { nodes: Array<{ type?: string; name?: string; displayName?: string; group?: string; position?: number[] }> }) {
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
            className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded ${
              isTrigger(node) ? 'bg-success-light text-success' : 'bg-border-light text-text-muted'
            }`}
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
