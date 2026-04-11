import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/hooks/useToast'
import { useAuthStore } from '@/stores/auth'
import { appConfirm } from '@/components/ConfirmDialog'
import { cn, timeAgo } from '@/lib/utils'
import { useInstanceStore } from '@/stores/instance'
import { Plus, Pencil, Trash2, Users, Eye, EyeOff, RefreshCw, Server } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserItem {
  id: number
  username: string
  email: string
  role: string
  created_at: string
  n8n_user_id?: string | null
  n8n_instance_id?: number | null
  instance_name?: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-danger/10 text-danger',
  editor: 'bg-primary/10 text-primary',
  viewer: 'bg-bg text-text-muted',
}

// ─── UsersPage ────────────────────────────────────────────────────────────────

export function UsersPage() {
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const [modal, setModal] = useState<null | 'create' | UserItem>(null)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const r = await api.get<{ users: UserItem[] }>('/api/users')
      return r.users ?? []
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/users/${id}`),
    onSuccess: () => {
      showSuccess('User deleted')
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Delete failed'),
  })

  async function handleDelete(u: UserItem) {
    const ok = await appConfirm(`Delete user "${u.username}"? This cannot be undone.`, { danger: true, okLabel: 'Delete' })
    if (ok) deleteMut.mutate(u.id)
  }

  const currentId = currentUser ? (currentUser as unknown as { id: number }).id : null
  const instances = useInstanceStore((s) => s.instances)
  const [syncInstanceId, setSyncInstanceId] = useState<number | null>(instances[0]?.id ?? null)

  const syncMut = useMutation({
    mutationFn: (instanceId: number) => api.post<{ created: number; skipped: number; total: number }>('/api/users/sync-n8n', { instance_id: instanceId }),
    onSuccess: (data) => {
      showSuccess(`Synced: ${data.created} new, ${data.skipped} existing (${data.total} total in n8n)`)
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Sync failed'),
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-text-muted" />
          <span className="text-xs text-text-muted font-medium">{users.length} user{users.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-2">
          {instances.length > 0 && (
            <div className="flex items-center gap-1.5">
              {instances.length > 1 && (
                <select
                  value={syncInstanceId ?? ''}
                  onChange={(e) => setSyncInstanceId(Number(e.target.value))}
                  className="text-[12px] px-2 py-1.5 border border-input-border rounded-md bg-input-bg text-text-dark"
                >
                  {instances.map((inst) => (
                    <option key={inst.id} value={inst.id}>{inst.name}</option>
                  ))}
                </select>
              )}
              <button
                onClick={() => syncInstanceId && syncMut.mutate(syncInstanceId)}
                disabled={syncMut.isPending || !syncInstanceId}
                className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 border border-border text-text-dark rounded-md hover:bg-bg disabled:opacity-50"
              >
                <RefreshCw size={12} className={syncMut.isPending ? 'animate-spin' : ''} />
                {syncMut.isPending ? 'Syncing...' : 'Sync from n8n'}
              </button>
            </div>
          )}
          <button
            onClick={() => setModal('create')}
            className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 bg-primary text-white rounded-md hover:bg-primary-hover"
          >
            <Plus size={12} /> Add User
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-sm text-text-muted py-8 text-center">Loading users...</div>
      ) : users.length === 0 ? (
        <div className="text-center py-16">
          <Users size={28} className="text-text-xmuted mx-auto mb-2" />
          <p className="text-text-muted text-sm">No users found</p>
        </div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg">
                <th className="text-left px-4 py-2 text-[11px] font-semibold text-text-muted uppercase tracking-wider">User</th>
                <th className="text-left px-4 py-2 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Role</th>
                <th className="text-left px-4 py-2 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Source</th>
                <th className="text-left px-4 py-2 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Created</th>
                <th className="w-20 px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-card-hover transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold text-white shrink-0',
                        u.role === 'admin' ? 'bg-danger' : u.role === 'editor' ? 'bg-primary' : 'bg-text-muted',
                      )}>
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-text-dark truncate">{u.username}</span>
                          {currentId === u.id && (
                            <span className="text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded">you</span>
                          )}
                        </div>
                        <div className="text-xs text-text-muted truncate">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'text-[10px] font-semibold px-2 py-0.5 rounded uppercase',
                      ROLE_COLORS[u.role] ?? 'bg-bg text-text-muted',
                    )}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.n8n_instance_id ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        <Server size={10} /> {u.instance_name || 'n8n'}
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-bg text-text-muted">Local</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">{timeAgo(u.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => setModal(u)}
                        className="p-1 text-text-xmuted hover:text-primary rounded"
                        title="Edit user"
                      >
                        <Pencil size={13} />
                      </button>
                      {currentId !== u.id && (
                        <button
                          onClick={() => handleDelete(u)}
                          className="p-1 text-text-xmuted hover:text-danger rounded"
                          title="Delete user"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
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
        <UserModal
          initial={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            queryClient.invalidateQueries({ queryKey: ['users'] })
          }}
        />
      )}
    </div>
  )
}

// ─── UserModal ────────────────────────────────────────────────────────────────

function UserModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: UserItem | null
  onClose: () => void
  onSaved: () => void
}) {
  const { error: showError, success: showSuccess } = useToast()
  const [username, setUsername] = useState(initial?.username ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(initial?.role ?? 'viewer')
  const [showPw, setShowPw] = useState(false)

  const saveMut = useMutation({
    mutationFn: () => {
      const body: Record<string, string> = { username, email, role }
      if (password) body.password = password
      return initial
        ? api.put(`/api/users/${initial.id}`, body)
        : api.post('/api/users', { ...body, password })
    },
    onSuccess: () => {
      showSuccess(initial ? 'User updated' : 'User created')
      onSaved()
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Save failed'),
  })

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-[15px] font-semibold text-text-dark">{initial ? 'Edit User' : 'New User'}</h2>
          <button onClick={onClose} className="text-text-xmuted hover:text-text-dark text-lg">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-1">Username *</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="john"
              className="w-full px-3 py-2 border border-input-border rounded-md bg-input-bg text-sm text-text-dark focus-ring"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-1">Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
              className="w-full px-3 py-2 border border-input-border rounded-md bg-input-bg text-sm text-text-dark focus-ring"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-1">
              {initial ? 'New Password (leave blank to keep)' : 'Password *'}
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 border border-input-border rounded-md bg-input-bg text-sm text-text-dark focus-ring pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-dark"
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 border border-input-border rounded-md bg-input-bg text-sm text-text-dark focus-ring"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} className="text-[12px] font-semibold px-3 py-1.5 border border-border text-text-muted rounded-md hover:bg-bg">
            Cancel
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={!username.trim() || !email.trim() || (!initial && !password.trim()) || saveMut.isPending}
            className="text-[12px] font-semibold px-3 py-1.5 bg-primary text-white rounded-md hover:bg-primary-hover disabled:opacity-50"
          >
            {saveMut.isPending ? 'Saving...' : initial ? 'Save Changes' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  )
}
