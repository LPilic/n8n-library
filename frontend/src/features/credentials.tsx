import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/hooks/useToast'
import { esc, timeAgo, cn } from '@/lib/utils'
import { useInstanceStore } from '@/stores/instance'
import {
  Plus, Search, KeyRound, ArrowRightLeft, Trash2, Pencil,
  ShieldCheck, User, Clock, ChevronRight, Package, Eye, EyeOff,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SharedWith { name: string; role: string }

interface Credential {
  id: string
  name: string
  type: string
  createdAt: string
  updatedAt: string
  shared?: SharedWith[]
}

interface CredType { name: string; displayName: string }

interface Project { id: string; name: string }

interface SchemaProperty {
  type: string
  displayName?: string
  description?: string
  required?: boolean
}

interface CredSchema {
  properties?: Record<string, SchemaProperty>
}

interface AuditEntry {
  action: string
  username: string
  credential_name: string
  n8n_credential_id: string
  detail: string
  created_at: string
}

interface StoreTemplate {
  id: string
  name: string
  type: string
  description?: string
  allowed_roles?: string[]
  creator?: string
  schema?: Record<string, SchemaProperty>
  instanceId?: number
  instance_id?: number
  instance_name?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCredType(type: string): string {
  if (!type) return 'Unknown'
  return type
    .replace(/Api$/, ' API')
    .replace(/OAuth2$/, ' OAuth2')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^ /, '')
    .trim()
}

function getCredOwner(cred: Credential): string {
  if (!cred.shared?.length) return ''
  const owner = cred.shared.find((s) => s.role?.includes('owner'))
  const name = owner?.name || cred.shared[0]?.name || ''
  return name.split('<')[0].trim()
}

function camelToLabel(s: string): string {
  return s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()
}

function isSensitiveField(name: string): boolean {
  const lower = name.toLowerCase()
  return ['password', 'secret', 'token', 'apikey', 'api_key', 'private'].some((k) =>
    lower.includes(k),
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-primary-light text-primary font-medium whitespace-nowrap">
      {formatCredType(type)}
    </span>
  )
}

function SensitiveInput({
  name,
  value,
  onChange,
}: {
  name: string
  value: string
  onChange: (v: string) => void
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={camelToLabel(name)}
        className="w-full px-3 py-1.5 pr-8 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-xmuted hover:text-text-muted"
      >
        {show ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  )
}

// ─── KPI Sidebar ──────────────────────────────────────────────────────────────

function CredentialsSidebar({
  credentials,
  typeFilter,
  onTypeFilter,
}: {
  credentials: Credential[]
  typeFilter: string
  onTypeFilter: (t: string) => void
}) {
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    credentials.forEach((c) => { counts[c.type] = (counts[c.type] ?? 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [credentials])

  const uniqueTypes = typeCounts.length

  return (
    <aside className="w-48 shrink-0">
      <div className="bg-card border border-border rounded-md p-3 space-y-4">
        <div>
          <p className="text-[10px] font-semibold text-text-xmuted uppercase mb-2">Overview</p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Total</span>
              <span className="font-semibold text-text-dark">{credentials.length}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Types</span>
              <span className="font-semibold text-text-dark">{uniqueTypes}</span>
            </div>
          </div>
        </div>

        {typeCounts.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-text-xmuted uppercase mb-2">By Type</p>
            <div className="space-y-0.5">
              {typeCounts.map(([type, count]) => (
                <button
                  key={type}
                  onClick={() => onTypeFilter(typeFilter === type ? '' : type)}
                  className={cn(
                    'w-full flex items-center justify-between px-1.5 py-1 rounded-sm text-xs transition-colors',
                    typeFilter === type
                      ? 'bg-primary-light text-primary'
                      : 'text-text-muted hover:bg-card-hover',
                  )}
                >
                  <span className="truncate text-left">{formatCredType(type)}</span>
                  <span className="shrink-0 ml-1 font-medium">{count}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

// ─── Credential Detail Modal ──────────────────────────────────────────────────

function CredentialDetailModal({
  cred,
  audit,
  onClose,
  onEdit,
  onTransfer,
  onDelete,
}: {
  cred: Credential
  audit: AuditEntry[]
  onClose: () => void
  onEdit: () => void
  onTransfer: () => void
  onDelete: () => void
}) {
  const credAudit = audit.filter(
    (a) => a.n8n_credential_id === cred.id || a.credential_name === cred.name,
  ).slice(0, 10)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-md w-full max-w-lg shadow-lg flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex-1 min-w-0 mr-3">
            <h2 className="text-sm font-semibold text-text-dark truncate">{esc(cred.name)}</h2>
            <div className="mt-1">
              <TypeBadge type={cred.type} />
            </div>
          </div>
          <button onClick={onClose} className="text-text-xmuted hover:text-text-dark text-lg leading-none shrink-0">&times;</button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-text-xmuted mb-0.5">ID</p>
              <p className="font-mono text-text-muted truncate">{esc(cred.id)}</p>
            </div>
            <div>
              <p className="text-text-xmuted mb-0.5">Owner</p>
              <p className="text-text-dark">{esc(getCredOwner(cred)) || <span className="text-text-xmuted">—</span>}</p>
            </div>
            <div>
              <p className="text-text-xmuted mb-0.5">Created</p>
              <p className="text-text-muted">{timeAgo(cred.createdAt)}</p>
            </div>
            <div>
              <p className="text-text-xmuted mb-0.5">Updated</p>
              <p className="text-text-muted">{timeAgo(cred.updatedAt)}</p>
            </div>
          </div>

          {/* Shared with */}
          {(cred.shared?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-text-xmuted uppercase mb-2">Shared With</p>
              <div className="space-y-1">
                {cred.shared!.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 px-2 bg-bg rounded-sm">
                    <span className="flex items-center gap-1.5 text-text-dark">
                      <User size={11} className="text-text-xmuted" />
                      {esc(s.name.split('<')[0].trim())}
                    </span>
                    <span className="text-text-xmuted capitalize">{s.role?.replace('credential:', '')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audit trail */}
          {credAudit.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-text-xmuted uppercase mb-2">Recent Activity</p>
              <div className="space-y-1">
                {credAudit.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-text-muted">
                    <Clock size={11} className="text-text-xmuted shrink-0 mt-0.5" />
                    <span className="flex-1">
                      <span className="text-text-dark capitalize">{a.action}</span>
                      {a.username && <> by <span className="text-primary">{esc(a.username)}</span></>}
                      {a.detail && <> — {esc(a.detail)}</>}
                    </span>
                    <span className="text-text-xmuted shrink-0 whitespace-nowrap">{timeAgo(a.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border shrink-0">
          <button
            onClick={onEdit}
            className="flex items-center gap-1 text-xs px-3 py-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover"
          >
            <Pencil size={12} /> Edit
          </button>
          <button
            onClick={onTransfer}
            className="flex items-center gap-1 text-xs px-3 py-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover"
          >
            <ArrowRightLeft size={12} /> Transfer
          </button>
          <div className="flex-1" />
          <button
            onClick={onDelete}
            className="flex items-center gap-1 text-xs px-3 py-1.5 border border-danger/30 rounded-sm text-danger hover:bg-danger-light"
          >
            <Trash2 size={12} /> Delete
          </button>
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create / Edit Credential Modal ──────────────────────────────────────────

function CredentialFormModal({
  initial,
  credTypes,
  onClose,
  onSaved,
}: {
  initial: Credential | null
  credTypes: CredType[]
  onClose: () => void
  onSaved: () => void
}) {
  const { error: showError, success: showSuccess } = useToast()
  const [step, setStep] = useState<'pick-type' | 'fill-form'>(initial ? 'fill-form' : 'pick-type')
  const [typeSearch, setTypeSearch] = useState('')
  const [selectedType, setSelectedType] = useState(initial?.type ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [fields, setFields] = useState<Record<string, string>>({})

  const { data: schema } = useQuery<CredSchema>({
    queryKey: ['cred-schema', selectedType],
    queryFn: () => api.get<CredSchema>(`/api/credentials/schema/${selectedType}`),
    enabled: !!selectedType && step === 'fill-form',
  })

  const properties = schema?.properties ?? {}
  const fieldNames = Object.keys(properties)

  const saveMut = useMutation({
    mutationFn: () =>
      initial
        ? api.patch(`/api/credentials/${initial.id}`, { name, data: fields })
        : api.post('/api/credentials', { name, type: selectedType, data: fields }),
    onSuccess: () => {
      showSuccess(initial ? 'Credential updated' : 'Credential created')
      onSaved()
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Save failed'),
  })

  const filteredTypes = credTypes.filter((t) =>
    !typeSearch ||
    t.displayName.toLowerCase().includes(typeSearch.toLowerCase()) ||
    t.name.toLowerCase().includes(typeSearch.toLowerCase()),
  )

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-md w-full max-w-md shadow-lg flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-text-dark">
            {initial ? 'Edit Credential' : step === 'pick-type' ? 'Select Credential Type' : `New ${formatCredType(selectedType)}`}
          </h2>
          <button onClick={onClose} className="text-text-xmuted hover:text-text-dark text-lg leading-none">&times;</button>
        </div>

        {/* Step 1: Pick type */}
        {step === 'pick-type' && (
          <>
            <div className="px-4 pt-3 pb-2 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-xmuted" />
                <input
                  type="text"
                  placeholder="Search types..."
                  value={typeSearch}
                  onChange={(e) => setTypeSearch(e.target.value)}
                  autoFocus
                  className="w-full pl-8 pr-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-2 pb-3">
              {filteredTypes.length === 0 ? (
                <p className="text-xs text-text-xmuted text-center py-6">No types found</p>
              ) : (
                filteredTypes.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => { setSelectedType(t.name); setStep('fill-form') }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-sm hover:bg-card-hover transition-colors text-left"
                  >
                    <span className="text-sm text-text-dark">{esc(t.displayName)}</span>
                    <ChevronRight size={13} className="text-text-xmuted shrink-0" />
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {/* Step 2: Fill form */}
        {step === 'fill-form' && (
          <>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`My ${formatCredType(selectedType)}`}
                  autoFocus
                  className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
                />
              </div>

              {fieldNames.map((fieldName) => {
                const prop = properties[fieldName]
                const label = prop.displayName || camelToLabel(fieldName)
                const sensitive = isSensitiveField(fieldName)
                const val = fields[fieldName] ?? ''
                return (
                  <div key={fieldName}>
                    <label className="block text-xs font-medium text-text-muted mb-1">
                      {esc(label)}
                      {prop.required && <span className="text-danger ml-0.5">*</span>}
                    </label>
                    {sensitive ? (
                      <SensitiveInput
                        name={fieldName}
                        value={val}
                        onChange={(v) => setFields((f) => ({ ...f, [fieldName]: v }))}
                      />
                    ) : (
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => setFields((f) => ({ ...f, [fieldName]: e.target.value }))}
                        placeholder={prop.description || label}
                        className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
                      />
                    )}
                    {prop.description && (
                      <p className="text-[10px] text-text-xmuted mt-0.5">{esc(prop.description)}</p>
                    )}
                  </div>
                )
              })}

              {fieldNames.length === 0 && selectedType && (
                <p className="text-xs text-text-xmuted text-center py-4">No configurable fields for this type</p>
              )}
            </div>

            <div className="flex items-center gap-2 px-4 py-3 border-t border-border shrink-0">
              {!initial && (
                <button
                  onClick={() => setStep('pick-type')}
                  className="text-xs px-3 py-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover"
                >
                  Back
                </button>
              )}
              <div className="flex-1" />
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
                {saveMut.isPending ? 'Saving...' : initial ? 'Save Changes' : 'Create Credential'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Transfer Modal ───────────────────────────────────────────────────────────

function TransferModal({
  cred,
  projects,
  onClose,
  onDone,
}: {
  cred: Credential
  projects: Project[]
  onClose: () => void
  onDone: () => void
}) {
  const { error: showError, success: showSuccess } = useToast()
  const [projectId, setProjectId] = useState('')

  const transferMut = useMutation({
    mutationFn: () => api.put(`/api/credentials/${cred.id}/transfer`, { projectId }),
    onSuccess: () => { showSuccess('Credential transferred'); onDone() },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Transfer failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-md w-full max-w-sm shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-dark">Transfer Credential</h2>
          <button onClick={onClose} className="text-text-xmuted hover:text-text-dark text-lg leading-none">&times;</button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-text-muted">
            Transfer <span className="font-medium text-text-dark">{esc(cred.name)}</span> to a project:
          </p>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full text-sm px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-text-dark focus:outline-none focus:border-input-focus"
          >
            <option value="">Select project...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button onClick={onClose} className="text-xs px-3 py-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover">
            Cancel
          </button>
          <button
            disabled={!projectId || transferMut.isPending}
            onClick={() => transferMut.mutate()}
            className="text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
          >
            {transferMut.isPending ? 'Transferring...' : 'Transfer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Provision Modal ──────────────────────────────────────────────────────────

function ProvisionModal({
  template,
  onClose,
  onDone,
}: {
  template: StoreTemplate
  onClose: () => void
  onDone: () => void
}) {
  const { error: showError, success: showSuccess } = useToast()
  const [name, setName] = useState(`My ${template.name}`)
  const [userData, setUserData] = useState<Record<string, string>>({})

  const schemaFields = Object.entries(template.schema ?? {})

  const provisionMut = useMutation({
    mutationFn: () =>
      api.post(`/api/credential-store/${template.id}/provision`, { name, data: userData }),
    onSuccess: () => { showSuccess('Credential provisioned'); onDone() },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Provision failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-md w-full max-w-md shadow-lg flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-text-dark">Provision: {esc(template.name)}</h2>
            <TypeBadge type={template.type} />
          </div>
          <button onClick={onClose} className="text-text-xmuted hover:text-text-dark text-lg leading-none">&times;</button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Credential Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
            />
          </div>
          {schemaFields.map(([fieldName, prop]) => {
            const label = prop.displayName || camelToLabel(fieldName)
            const sensitive = isSensitiveField(fieldName)
            const val = userData[fieldName] ?? ''
            return (
              <div key={fieldName}>
                <label className="block text-xs font-medium text-text-muted mb-1">{esc(label)}</label>
                {sensitive ? (
                  <SensitiveInput
                    name={fieldName}
                    value={val}
                    onChange={(v) => setUserData((d) => ({ ...d, [fieldName]: v }))}
                  />
                ) : (
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => setUserData((d) => ({ ...d, [fieldName]: e.target.value }))}
                    placeholder={label}
                    className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
                  />
                )}
              </div>
            )
          })}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <button onClick={onClose} className="text-xs px-3 py-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover">
            Cancel
          </button>
          <button
            disabled={!name.trim() || provisionMut.isPending}
            onClick={() => provisionMut.mutate()}
            className="text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
          >
            {provisionMut.isPending ? 'Provisioning...' : 'Provision'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Credentials Tab ──────────────────────────────────────────────────────────

function CredentialsTab() {
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [detailCred, setDetailCred] = useState<Credential | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<Credential | null>(null)
  const [transferCred, setTransferCred] = useState<Credential | null>(null)

  const { data: credsResp, isLoading } = useQuery({
    queryKey: ['credentials'],
    queryFn: () => api.get<{ data: Credential[] }>('/api/credentials'),
  })

  const { data: credTypes = [] } = useQuery({
    queryKey: ['cred-types'],
    queryFn: () => api.get<CredType[]>('/api/credentials/types'),
  })

  const { data: projectsResp } = useQuery({
    queryKey: ['cred-projects'],
    queryFn: () => api.get<{ data: Project[] }>('/api/credentials/projects'),
  })

  const { data: auditData = [] } = useQuery({
    queryKey: ['cred-audit'],
    queryFn: () => api.get<AuditEntry[]>('/api/credentials/audit'),
  })

  const credentials = credsResp?.data ?? []
  const projects = projectsResp?.data ?? []

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/credentials/${id}`),
    onSuccess: () => {
      showSuccess('Credential deleted')
      setDetailCred(null)
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Delete failed'),
  })

  const owners = useMemo(() => {
    const names = new Set<string>()
    credentials.forEach((c) => { const o = getCredOwner(c); if (o) names.add(o) })
    return Array.from(names).sort()
  }, [credentials])

  const filtered = useMemo(() => {
    return credentials.filter((c) => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
      if (typeFilter && c.type !== typeFilter) return false
      if (ownerFilter && getCredOwner(c) !== ownerFilter) return false
      return true
    })
  }, [credentials, search, typeFilter, ownerFilter])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['credentials'] })

  return (
    <div className="flex gap-4">
      {/* Sidebar */}
      <CredentialsSidebar
        credentials={credentials}
        typeFilter={typeFilter}
        onTypeFilter={setTypeFilter}
      />

      {/* Main */}
      <div className="flex-1 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-0 max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-xmuted" />
            <input
              type="text"
              placeholder="Search credentials..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-xs px-2 py-1.5 border border-input-border rounded-sm bg-input-bg text-text-dark"
          >
            <option value="">All Types</option>
            {credTypes.map((t) => (
              <option key={t.name} value={t.name}>{t.displayName}</option>
            ))}
          </select>
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="text-xs px-2 py-1.5 border border-input-border rounded-sm bg-input-bg text-text-dark"
          >
            <option value="">All Owners</option>
            {owners.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover ml-auto"
          >
            <Plus size={12} /> New Credential
          </button>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="text-text-muted text-sm">Loading credentials...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <KeyRound size={28} className="text-text-xmuted mx-auto mb-2" />
            <p className="text-text-muted text-sm">No credentials found</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-light bg-bg">
                    <th className="text-left px-4 py-2 text-xs font-semibold text-text-muted uppercase">Name</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-text-muted uppercase">Type</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-text-muted uppercase">Owner</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-text-muted uppercase whitespace-nowrap">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {filtered.map((cred) => (
                    <tr
                      key={cred.id}
                      onClick={() => setDetailCred(cred)}
                      className="hover:bg-card-hover transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5">
                          <KeyRound size={12} className="text-text-xmuted shrink-0" />
                          <span className="text-text-dark font-medium">{esc(cred.name)}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <TypeBadge type={cred.type} />
                      </td>
                      <td className="px-4 py-2.5 text-text-muted text-xs">
                        {getCredOwner(cred) || <span className="text-text-xmuted">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-text-xmuted text-xs whitespace-nowrap">
                        {timeAgo(cred.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailCred && (
        <CredentialDetailModal
          cred={detailCred}
          audit={auditData}
          onClose={() => setDetailCred(null)}
          onEdit={() => { setEditTarget(detailCred); setDetailCred(null) }}
          onTransfer={() => { setTransferCred(detailCred); setDetailCred(null) }}
          onDelete={() => {
            if (confirm(`Delete credential "${detailCred.name}"?`)) {
              deleteMut.mutate(detailCred.id)
            }
          }}
        />
      )}

      {/* Create Modal */}
      {showCreate && (
        <CredentialFormModal
          initial={null}
          credTypes={credTypes}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); invalidate() }}
        />
      )}

      {/* Edit Modal */}
      {editTarget && (
        <CredentialFormModal
          initial={editTarget}
          credTypes={credTypes}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); invalidate() }}
        />
      )}

      {/* Transfer Modal */}
      {transferCred && (
        <TransferModal
          cred={transferCred}
          projects={projects}
          onClose={() => setTransferCred(null)}
          onDone={() => { setTransferCred(null); invalidate() }}
        />
      )}
    </div>
  )
}

// ─── Credential Store Tab ─────────────────────────────────────────────────────

function CredentialStoreTab() {
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()
  const [provisionTarget, setProvisionTarget] = useState<StoreTemplate | null>(null)

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['cred-store'],
    queryFn: () => api.get<StoreTemplate[]>('/api/credential-store'),
  })

  const { data: auditData = [] } = useQuery({
    queryKey: ['cred-audit'],
    queryFn: () => api.get<AuditEntry[]>('/api/credentials/audit'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/credential-store/${id}`),
    onSuccess: () => {
      showSuccess('Template deleted')
      queryClient.invalidateQueries({ queryKey: ['cred-store'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Delete failed'),
  })

  const recentActivity = auditData.slice(0, 10)

  const [showCreateModal, setShowCreateModal] = useState(false)

  return (
    <div>
      {/* Template grid */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-text-muted uppercase">Available Templates</h3>
          <button onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 bg-primary text-white rounded-md hover:bg-primary-hover">
            <Plus size={12} /> New Template
          </button>
        </div>
        {isLoading ? (
          <div className="text-text-muted text-sm">Loading templates...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-10">
            <Package size={28} className="text-text-xmuted mx-auto mb-2" />
            <p className="text-text-muted text-sm">No credential templates available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="bg-card border border-border rounded-md p-3 flex flex-col gap-2 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-dark truncate">{esc(tpl.name)}</p>
                    <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <TypeBadge type={tpl.type} />
                      {tpl.instance_name && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{tpl.instance_name}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => { if (confirm(`Delete template "${tpl.name}"?`)) deleteMut.mutate(tpl.id) }}
                      className="p-1 text-text-xmuted hover:text-danger rounded-sm"
                      title="Delete template"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {tpl.description && (
                  <p className="text-xs text-text-muted line-clamp-2">{esc(tpl.description)}</p>
                )}

                <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                  <div className="flex flex-wrap gap-1">
                    {tpl.allowed_roles?.map((role) => (
                      <span
                        key={role}
                        className="text-[10px] px-1 py-0.5 rounded bg-bg border border-border text-text-xmuted"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={() => setProvisionTarget(tpl)}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 bg-primary text-white rounded-sm hover:bg-primary-hover shrink-0"
                  >
                    <Plus size={11} /> Use
                  </button>
                </div>

                {tpl.creator && (
                  <p className="text-[10px] text-text-xmuted flex items-center gap-1">
                    <User size={10} /> {esc(tpl.creator)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-text-muted uppercase mb-3">Recent Activity</h3>
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <div className="divide-y divide-border-light">
              {recentActivity.map((a, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                  <ShieldCheck size={13} className="text-text-xmuted shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-dark">
                      <span className="capitalize font-medium">{a.action}</span>
                      {' — '}
                      <span className="text-text-muted">{esc(a.credential_name)}</span>
                    </p>
                    {a.detail && <p className="text-[10px] text-text-xmuted">{esc(a.detail)}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-text-xmuted whitespace-nowrap">{timeAgo(a.created_at)}</p>
                    {a.username && <p className="text-[10px] text-text-xmuted">{esc(a.username)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Provision Modal */}
      {provisionTarget && (
        <ProvisionModal
          template={provisionTarget}
          onClose={() => setProvisionTarget(null)}
          onDone={() => {
            setProvisionTarget(null)
            queryClient.invalidateQueries({ queryKey: ['credentials'] })
          }}
        />
      )}

      {/* Create Store Template Modal */}
      {showCreateModal && (
        <CreateStoreTemplateModal
          onClose={() => setShowCreateModal(false)}
          onSaved={() => {
            setShowCreateModal(false)
            queryClient.invalidateQueries({ queryKey: ['cred-store'] })
            showSuccess('Template created')
          }}
        />
      )}
    </div>
  )
}

// ─── Create Store Template Modal ─────────────────────────────────────────────

interface CredSchema { properties?: Record<string, { type?: string; description?: string }>; required?: string[] }

function CreateStoreTemplateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { error: showError } = useToast()
  const instances = useInstanceStore((s) => s.instances)
  const activeInstanceId = useInstanceStore((s) => s.activeId)
  const [step, setStep] = useState<'pick-type' | 'configure'>('pick-type')
  const [typeSearch, setTypeSearch] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [allowedRoles, setAllowedRoles] = useState<string[]>(['editor', 'viewer'])
  const [saving, setSaving] = useState(false)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [userFields, setUserFields] = useState<string[]>([])
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set())
  const [jsonFallback, setJsonFallback] = useState('')
  const [instanceId, setInstanceId] = useState<number | null>(activeInstanceId)

  const { data: allTypes = [] } = useQuery({
    queryKey: ['cred-types'],
    queryFn: async () => {
      const r = await api.get<Array<{ name: string; displayName: string }>>('/api/credentials/types')
      return Array.isArray(r) ? r : []
    },
  })

  const { data: schema, isLoading: schemaLoading } = useQuery({
    queryKey: ['cred-schema', selectedType],
    queryFn: () => api.get<CredSchema>(`/api/credentials/schema/${encodeURIComponent(selectedType)}`),
    enabled: !!selectedType,
  })

  const schemaFields = useMemo(() => {
    if (!schema?.properties) return []
    return Object.entries(schema.properties)
      .filter(([k, p]) => p.type !== 'notice' && k !== 'oauthTokenData' && k !== 'notice')
      .map(([k, p]) => ({ key: k, type: p.type, desc: p.description, required: (schema.required || []).includes(k) }))
  }, [schema])

  const filteredTypes = typeSearch
    ? allTypes.filter((t) => t.displayName.toLowerCase().includes(typeSearch.toLowerCase()) || t.name.toLowerCase().includes(typeSearch.toLowerCase())).slice(0, 50)
    : allTypes.slice(0, 50)

  function setFieldValue(key: string, val: string) {
    setFieldValues((prev) => ({ ...prev, [key]: val }))
  }

  function toggleUserField(key: string) {
    setUserFields((prev) => prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key])
  }

  function toggleVisibility(key: string) {
    setVisibleFields((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  async function handleSave() {
    if (!name.trim() || !selectedType) return showError('Name and type are required')

    let sharedData: Record<string, unknown> = {}
    if (schemaFields.length > 0) {
      for (const f of schemaFields) {
        if (fieldValues[f.key]) sharedData[f.key] = fieldValues[f.key]
      }
    } else if (jsonFallback.trim()) {
      try { sharedData = JSON.parse(jsonFallback) } catch { return showError('Invalid JSON in shared data') }
    }

    if (Object.keys(sharedData).length === 0) return showError('At least one shared data field is required')

    setSaving(true)
    try {
      await api.post('/api/credential-store', {
        name: name.trim(),
        description,
        credential_type: selectedType,
        shared_data: sharedData,
        user_fields: userFields,
        allowed_roles: allowedRoles,
        instance_id: instanceId,
      })
      onSaved()
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center modal-overlay bg-black/30" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-lg mx-4 flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <h2 className="text-[15px] font-semibold text-text-dark">New Credential Template</h2>
          <button onClick={onClose} className="text-text-xmuted hover:text-text-dark text-lg">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {step === 'pick-type' ? (
            <>
              <div>
                <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-1">Search Credential Type</label>
                <input type="text" value={typeSearch} onChange={(e) => setTypeSearch(e.target.value)} autoFocus
                  placeholder="Search types..."
                  className="w-full px-3 py-2 border border-input-border rounded-md bg-input-bg text-sm text-text-dark focus-ring" />
              </div>
              <div className="text-[11px] text-text-xmuted text-center">
                Showing first {filteredTypes.length} of {allTypes.length}. Type to search...
              </div>
              <div className="border border-border rounded-md max-h-[300px] overflow-y-auto divide-y divide-border-light">
                {filteredTypes.map((t) => (
                  <button key={t.name} onClick={() => { setSelectedType(t.name); setName(t.displayName + ' Template'); setStep('configure') }}
                    className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-bg transition-colors">
                    <span className="text-sm text-text-dark">{t.displayName}</span>
                    <span className="text-[10px] font-mono text-text-xmuted">{t.name}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-1">
                  Type: <span className="text-primary">{formatCredType(selectedType)}</span>
                </label>
                <button onClick={() => { setStep('pick-type'); setFieldValues({}); setUserFields([]) }} className="text-[11px] text-primary hover:text-primary-hover">Change type</button>
              </div>
              <div>
                <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-1">Name *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-input-border rounded-md bg-input-bg text-sm text-text-dark focus-ring" />
              </div>
              <div>
                <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-1">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                  className="w-full px-3 py-2 border border-input-border rounded-md bg-input-bg text-sm text-text-dark focus-ring resize-none"
                  placeholder="Optional description" />
              </div>

              {/* Schema fields */}
              <div>
                <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-2">Credential Fields</label>
                {schemaLoading ? (
                  <div className="text-sm text-text-muted py-2">Loading schema...</div>
                ) : schemaFields.length > 0 ? (
                  <div className="space-y-3">
                    {schemaFields.map((f) => {
                      const sensitive = isSensitiveField(f.key)
                      const visible = visibleFields.has(f.key)
                      return (
                        <div key={f.key} className="border border-border rounded-md p-3 bg-bg/50">
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[13px] font-medium text-text-dark">
                              {camelToLabel(f.key)}
                              {f.required && <span className="text-danger ml-0.5">*</span>}
                            </label>
                            <label className="flex items-center gap-1 text-[11px] text-text-muted cursor-pointer">
                              <input type="checkbox" checked={userFields.includes(f.key)} onChange={() => toggleUserField(f.key)}
                                className="accent-primary" />
                              User field
                            </label>
                          </div>
                          {f.type === 'boolean' ? (
                            <label className="flex items-center gap-2 text-sm text-text-dark">
                              <input type="checkbox" checked={fieldValues[f.key] === 'true'}
                                onChange={(e) => setFieldValue(f.key, e.target.checked ? 'true' : '')}
                                className="accent-primary" />
                              {camelToLabel(f.key)}
                            </label>
                          ) : (
                            <div className="relative">
                              <input
                                type={sensitive && !visible ? 'password' : 'text'}
                                value={fieldValues[f.key] || ''}
                                onChange={(e) => setFieldValue(f.key, e.target.value)}
                                placeholder={f.desc || f.type || 'string'}
                                className="w-full px-3 py-1.5 border border-input-border rounded-md bg-input-bg text-sm text-text-dark focus-ring pr-8"
                              />
                              {sensitive && (
                                <button type="button" onClick={() => toggleVisibility(f.key)}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-dark">
                                  {visible ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div>
                    <div className="text-[13px] text-text-muted mb-2">Could not load schema. Enter shared data as JSON.</div>
                    <textarea value={jsonFallback} onChange={(e) => setJsonFallback(e.target.value)} rows={4}
                      className="w-full px-3 py-2 border border-input-border rounded-md bg-input-bg text-sm text-text-dark font-mono focus-ring resize-none"
                      placeholder='{"clientId": "...", "clientSecret": "..."}' />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-1">Target Instance *</label>
                <select
                  value={instanceId ?? ''}
                  onChange={(e) => setInstanceId(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-input-border rounded-md bg-input-bg text-sm text-text-dark focus-ring"
                >
                  {instances.map((inst) => (
                    <option key={inst.id} value={inst.id}>{inst.name}</option>
                  ))}
                </select>
                <p className="text-[11px] text-text-xmuted mt-1">Credentials from this template will be provisioned to this instance</p>
              </div>

              <div>
                <label className="block text-[12px] font-semibold uppercase tracking-wide text-text-muted mb-1">Allowed Roles</label>
                <div className="flex gap-3">
                  {['editor', 'viewer'].map((r) => (
                    <label key={r} className="flex items-center gap-1.5 text-sm text-text-dark cursor-pointer capitalize">
                      <input type="checkbox" checked={allowedRoles.includes(r)}
                        onChange={(e) => setAllowedRoles(e.target.checked ? [...allowedRoles, r] : allowedRoles.filter((x) => x !== r))}
                        className="accent-primary" />
                      {r}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
          <button onClick={onClose} className="text-[12px] font-semibold px-3 py-1.5 border border-border text-text-muted rounded-md hover:bg-bg">Cancel</button>
          {step === 'configure' && (
            <button onClick={handleSave} disabled={saving || !name.trim()}
              className="text-[12px] font-semibold px-3 py-1.5 bg-primary text-white rounded-md hover:bg-primary-hover disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Template'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── CredentialsPage ──────────────────────────────────────────────────────────

export function CredentialsPage() {
  const [tab, setTab] = useState<'credentials' | 'store'>('credentials')

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-5 border-b border-border">
        {([
          { id: 'credentials', label: 'Credentials', icon: KeyRound },
          { id: 'store', label: 'Credential Store', icon: Package },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
              tab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text-dark',
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'credentials' ? <CredentialsTab /> : <CredentialStoreTab />}
    </div>
  )
}
