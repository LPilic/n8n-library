import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/hooks/useToast'
import { esc } from '@/lib/utils'
import { Plus, Pencil, Trash2 } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Variable {
  id: number
  key: string
  value: string
}

// ─── VariablesPage ────────────────────────────────────────────────────────────

export function VariablesPage() {
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()
  const [modal, setModal] = useState<null | 'create' | Variable>(null)

  const { data: variables = [], isLoading } = useQuery({
    queryKey: ['variables'],
    queryFn: () => api.get<Variable[]>('/api/variables'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/variables/${id}`),
    onSuccess: () => {
      showSuccess('Variable deleted')
      queryClient.invalidateQueries({ queryKey: ['variables'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Delete failed'),
  })

  return (
    <div className="max-w-2xl">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-text-muted">{variables.length} variable{variables.length !== 1 ? 's' : ''}</span>
        <button
          onClick={() => setModal('create')}
          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover"
        >
          <Plus size={12} /> New Variable
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-text-muted text-sm">Loading variables...</div>
      ) : variables.length === 0 ? (
        <div className="text-center py-12 text-text-muted text-sm">No variables defined</div>
      ) : (
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-light bg-bg">
                <th className="text-left px-4 py-2 text-xs font-semibold text-text-muted uppercase">Key</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-text-muted uppercase">Value</th>
                <th className="w-20 px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {variables.map((v) => (
                <tr key={v.id} className="hover:bg-card-hover transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs text-primary bg-primary-light px-1.5 py-0.5 rounded">
                      {esc(v.key)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-text-muted text-xs font-mono truncate max-w-xs">
                    {esc(v.value)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setModal(v)}
                        className="p-1.5 text-text-xmuted hover:text-text-dark rounded-sm"
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => { if (confirm('Delete this variable?')) deleteMut.mutate(v.id) }}
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
        <VariableModal
          initial={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            queryClient.invalidateQueries({ queryKey: ['variables'] })
          }}
        />
      )}
    </div>
  )
}

// ─── VariableModal ────────────────────────────────────────────────────────────

function VariableModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Variable | null
  onClose: () => void
  onSaved: () => void
}) {
  const { error: showError, success: showSuccess } = useToast()
  const [key, setKey] = useState(initial?.key ?? '')
  const [value, setValue] = useState(initial?.value ?? '')

  const saveMut = useMutation({
    mutationFn: () =>
      initial
        ? api.put(`/api/variables/${initial.id}`, { key, value })
        : api.post('/api/variables', { key, value }),
    onSuccess: () => {
      showSuccess(initial ? 'Variable updated' : 'Variable created')
      onSaved()
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Save failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-md w-full max-w-sm shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-dark">
            {initial ? 'Edit Variable' : 'New Variable'}
          </h2>
          <button onClick={onClose} className="text-text-xmuted hover:text-text-dark text-lg leading-none">&times;</button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Key *</label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm font-mono text-text-dark focus:outline-none focus:border-input-focus"
              placeholder="MY_VARIABLE"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Value *</label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm font-mono text-text-dark focus:outline-none focus:border-input-focus"
              placeholder="value"
            />
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
            disabled={!key.trim() || !value.trim() || saveMut.isPending}
            onClick={() => saveMut.mutate()}
            className="text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
          >
            {saveMut.isPending ? 'Saving...' : initial ? 'Save Changes' : 'Create Variable'}
          </button>
        </div>
      </div>
    </div>
  )
}
