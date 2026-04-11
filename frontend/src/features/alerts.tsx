import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/hooks/useToast'
import { esc, cn } from '@/lib/utils'
import { Plus, Trash2, Pencil, Bell, BellOff } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Alert {
  id: number
  name: string
  condition: string
  threshold?: number
  recipients: Array<string | { email?: string; name?: string }>
  enabled: boolean
}

interface AlertsResponse {
  alerts: Alert[]
  conditions: Record<string, string>
}

interface AlertForm {
  name: string
  condition: string
  threshold: string
  recipients: string
  enabled: boolean
}

const EMPTY_FORM: AlertForm = { name: '', condition: '', threshold: '', recipients: '', enabled: true }

// ─── AlertsPage ───────────────────────────────────────────────────────────────

export function AlertsPage() {
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()
  const [modal, setModal] = useState<null | 'create' | Alert>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.get<AlertsResponse>('/api/alerts'),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.put(`/api/alerts/${id}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Update failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/alerts/${id}`),
    onSuccess: () => {
      showSuccess('Alert deleted')
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Delete failed'),
  })

  const alerts = data?.alerts ?? []
  const conditions = data?.conditions ?? {}

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-text-muted">{alerts.length} alert{alerts.length !== 1 ? 's' : ''}</span>
        <button
          onClick={() => setModal('create')}
          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover"
        >
          <Plus size={12} /> New Alert
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-text-muted text-sm">Loading alerts...</div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-12 text-text-muted text-sm">No alerts configured</div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="bg-card border border-border rounded-md p-3 flex items-start gap-3"
            >
              <div className="mt-0.5">
                {alert.enabled
                  ? <Bell size={14} className="text-primary" />
                  : <BellOff size={14} className="text-text-xmuted" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-text-dark">{esc(alert.name)}</span>
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded',
                    alert.enabled ? 'bg-success-light text-success' : 'bg-border-light text-text-xmuted',
                  )}>
                    {alert.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="text-xs text-text-muted mt-0.5">
                  <span className="font-medium">{esc(conditions[alert.condition] || alert.condition)}</span>
                  {alert.threshold != null && <span className="ml-1">threshold: {alert.threshold}</span>}
                </div>
                {alert.recipients.length > 0 && (
                  <div className="text-xs text-text-xmuted mt-0.5 truncate">
                    {alert.recipients.map((r) => {
                      if (r && typeof r === 'object' && 'email' in r) return (r as {email: string}).email
                      if (r && typeof r === 'object' && 'name' in r) return (r as {name: string}).name
                      return String(r)
                    }).join(', ')}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => toggleMut.mutate({ id: alert.id, enabled: !alert.enabled })}
                  className="p-1.5 text-text-xmuted hover:text-primary rounded-sm"
                  title={alert.enabled ? 'Disable' : 'Enable'}
                >
                  {alert.enabled ? <BellOff size={13} /> : <Bell size={13} />}
                </button>
                <button
                  onClick={() => setModal(alert)}
                  className="p-1.5 text-text-xmuted hover:text-text-dark rounded-sm"
                  title="Edit"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => { if (confirm('Delete this alert?')) deleteMut.mutate(alert.id) }}
                  className="p-1.5 text-text-xmuted hover:text-danger rounded-sm"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <AlertModal
          initial={modal === 'create' ? null : modal}
          conditions={conditions}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            queryClient.invalidateQueries({ queryKey: ['alerts'] })
          }}
        />
      )}
    </div>
  )
}

// ─── AlertModal ───────────────────────────────────────────────────────────────

function AlertModal({
  initial,
  conditions,
  onClose,
  onSaved,
}: {
  initial: Alert | null
  conditions: Record<string, string>
  onClose: () => void
  onSaved: () => void
}) {
  const { error: showError, success: showSuccess } = useToast()
  const [form, setForm] = useState<AlertForm>(
    initial
      ? {
          name: initial.name,
          condition: initial.condition,
          threshold: initial.threshold != null ? String(initial.threshold) : '',
          recipients: initial.recipients.map((r) => typeof r === 'object' && r !== null ? ('email' in r ? r.email : r.name) || '' : String(r)).join(', '),
          enabled: initial.enabled,
        }
      : EMPTY_FORM,
  )

  const set = (k: keyof AlertForm, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }))

  const saveMut = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        condition: form.condition,
        threshold: form.threshold ? Number(form.threshold) : undefined,
        recipients: form.recipients.split(',').map((s) => s.trim()).filter(Boolean),
        enabled: form.enabled,
      }
      return initial
        ? api.put(`/api/alerts/${initial.id}`, body)
        : api.post('/api/alerts', body)
    },
    onSuccess: () => {
      showSuccess(initial ? 'Alert updated' : 'Alert created')
      onSaved()
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Save failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-md w-full max-w-md shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-dark">{initial ? 'Edit Alert' : 'New Alert'}</h2>
          <button onClick={onClose} className="text-text-xmuted hover:text-text-dark text-lg leading-none">&times;</button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
              placeholder="e.g. High failure rate"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-text-muted mb-1">Condition *</label>
              <select
                value={form.condition}
                onChange={(e) => set('condition', e.target.value)}
                className="w-full text-sm px-2 py-1.5 border border-input-border rounded-sm bg-input-bg text-text-dark"
              >
                <option value="">Select condition...</option>
                {Object.entries(conditions).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div className="w-28">
              <label className="block text-xs font-medium text-text-muted mb-1">Threshold</label>
              <input
                type="number"
                value={form.threshold}
                onChange={(e) => set('threshold', e.target.value)}
                className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
                placeholder="e.g. 5"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Email Recipients</label>
            <input
              type="text"
              value={form.recipients}
              onChange={(e) => set('recipients', e.target.value)}
              className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
              placeholder="user@example.com, another@example.com"
            />
            <p className="text-[10px] text-text-xmuted mt-0.5">Comma-separated email addresses</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => set('enabled', e.target.checked)}
              className="w-3.5 h-3.5"
            />
            <span className="text-xs text-text-muted">Enabled</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover"
          >
            Cancel
          </button>
          <button
            disabled={!form.name.trim() || !form.condition || saveMut.isPending}
            onClick={() => saveMut.mutate()}
            className="text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
          >
            {saveMut.isPending ? 'Saving...' : initial ? 'Save Changes' : 'Create Alert'}
          </button>
        </div>
      </div>
    </div>
  )
}
