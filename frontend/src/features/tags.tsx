import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/hooks/useToast'
import { esc } from '@/lib/utils'
import { Plus, Pencil, Trash2, Tag } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TagItem {
  id: number
  name: string
  workflow_count?: number
}

// ─── TagsPage ─────────────────────────────────────────────────────────────────

export function TagsPage() {
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()
  const [modal, setModal] = useState<null | 'create' | TagItem>(null)

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['tags'],
    queryFn: () => api.get<TagItem[]>('/api/tags'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/tags/${id}`),
    onSuccess: () => {
      showSuccess('Tag deleted')
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Delete failed'),
  })

  return (
    <div className="max-w-xl">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-text-muted">{tags.length} tag{tags.length !== 1 ? 's' : ''}</span>
        <button
          onClick={() => setModal('create')}
          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover"
        >
          <Plus size={12} /> New Tag
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-text-muted text-sm">Loading tags...</div>
      ) : tags.length === 0 ? (
        <div className="text-center py-12">
          <Tag size={28} className="text-text-xmuted mx-auto mb-2" />
          <p className="text-text-muted text-sm">No tags yet</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-light bg-bg">
                <th className="text-left px-4 py-2 text-xs font-semibold text-text-muted uppercase">Name</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-text-muted uppercase">Workflows</th>
                <th className="w-20 px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {tags.map((tag) => (
                <tr key={tag.id} className="hover:bg-card-hover transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-1.5">
                      <Tag size={12} className="text-text-xmuted shrink-0" />
                      <span className="text-text-dark font-medium">{esc(tag.name)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-text-muted">
                    {tag.workflow_count ?? 0}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setModal(tag)}
                        className="p-1.5 text-text-xmuted hover:text-text-dark rounded-sm"
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => { if (confirm('Delete this tag?')) deleteMut.mutate(tag.id) }}
                        className="p-1.5 text-text-xmuted hover:text-danger rounded-sm"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <TagModal
          initial={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            queryClient.invalidateQueries({ queryKey: ['tags'] })
          }}
        />
      )}
    </div>
  )
}

// ─── TagModal ─────────────────────────────────────────────────────────────────

function TagModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: TagItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const { error: showError, success: showSuccess } = useToast()
  const [name, setName] = useState(initial?.name ?? '')

  const saveMut = useMutation({
    mutationFn: () =>
      initial
        ? api.put(`/api/tags/${initial.id}`, { name })
        : api.post('/api/tags', { name }),
    onSuccess: () => {
      showSuccess(initial ? 'Tag updated' : 'Tag created')
      onSaved()
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Save failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-md w-full max-w-xs shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-dark">{initial ? 'Edit Tag' : 'New Tag'}</h2>
          <button onClick={onClose} className="text-text-xmuted hover:text-text-dark text-lg leading-none">&times;</button>
        </div>
        <div className="p-4">
          <label className="block text-xs font-medium text-text-muted mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) saveMut.mutate() }}
            className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
            placeholder="e.g. Production"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
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
            {saveMut.isPending ? 'Saving...' : initial ? 'Save Changes' : 'Create Tag'}
          </button>
        </div>
      </div>
    </div>
  )
}
