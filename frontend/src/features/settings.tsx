import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/hooks/useToast'
import { timeAgo, cn } from '@/lib/utils'
import { appConfirm } from '@/components/ConfirmDialog'
import { useAuthStore } from '@/stores/auth'
import {
  Users,
  Server,
  Mail,
  FileText,
  FolderOpen,
  Key,
  Webhook,
  Bot,
  ShieldCheck,
  Palette,
  Upload,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Check,
  Download,
  Cpu,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserItem {
  id: number
  username: string
  email: string
  role: string
  created_at: string
}

interface WorkerEntry {
  name: string
  url: string
}

interface Instance {
  id: number
  name: string
  base_url: string
  internal_url?: string
  is_default: boolean
  color?: string
  environment?: string
  workers?: WorkerEntry[]
}

interface SmtpSettings {
  host: string
  port: number
  user: string
  pass: string
  from_address: string
  app_url: string
}

interface Category {
  id: number
  name: string
  icon?: string
}

interface ApiKey {
  id: number
  name: string
  key_prefix: string
  role: string
  last_used_at?: string
  expires_at?: string
  created_at: string
}

interface BrandingSettings {
  brand_name: string
  brand_logo: string
  brand_primary: string
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

interface Tab {
  id: string
  label: string
  icon: React.ReactNode
}

const TABS: Tab[] = [
  { id: 'users',           label: 'Users',           icon: <Users size={14} /> },
  { id: 'instances',       label: 'Instances',       icon: <Server size={14} /> },
  { id: 'smtp',            label: 'SMTP',            icon: <Mail size={14} /> },
  { id: 'email_templates', label: 'Email Templates', icon: <FileText size={14} /> },
  { id: 'categories',      label: 'Categories',      icon: <FolderOpen size={14} /> },
  { id: 'api_keys',        label: 'API Keys',        icon: <Key size={14} /> },
  { id: 'webhooks',        label: 'Webhooks',        icon: <Webhook size={14} /> },
  { id: 'ai',              label: 'AI',              icon: <Bot size={14} /> },
  { id: 'mcp',             label: 'MCP',             icon: <Cpu size={14} /> },
  { id: '2fa',             label: '2FA',             icon: <ShieldCheck size={14} /> },
  { id: 'branding',        label: 'Branding',        icon: <Palette size={14} /> },
  { id: 'import_export',   label: 'Import / Export', icon: <Upload size={14} /> },
]

// ─── Shared helpers ───────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-muted mb-1">{label}</label>
      {children}
    </div>
  )
}

function Input({
  value,
  onChange,
  type = 'text',
  placeholder,
  className,
}: {
  value: string | number
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  className?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus',
        className,
      )}
    />
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'sm',
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer: React.ReactNode
  size?: 'sm' | 'md'
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={cn('bg-card border border-border rounded-md shadow-lg w-full', size === 'md' ? 'max-w-md' : 'max-w-sm')}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-dark">{title}</h2>
          <button onClick={onClose} className="text-text-xmuted hover:text-text-dark text-lg leading-none">&times;</button>
        </div>
        <div className="p-4 space-y-3">{children}</div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">{footer}</div>
      </div>
    </div>
  )
}

function CancelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-3 py-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover"
    >
      Cancel
    </button>
  )
}

function SaveBtn({ disabled, pending, label, pendingLabel, onClick }: { disabled?: boolean; pending: boolean; label: string; pendingLabel: string; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={onClick}
      className="text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  )
}

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center w-full py-16 border border-dashed border-border rounded-md">
      <p className="text-sm font-medium text-text-muted">Coming soon</p>
      <p className="text-xs text-text-xmuted mt-1">{title} settings will appear here.</p>
    </div>
  )
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-md overflow-hidden">
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={cn('px-4 py-2 text-xs font-semibold text-text-muted uppercase', right ? 'text-right' : 'text-left')}>
      {children}
    </th>
  )
}

function Toolbar({ count, noun, onNew }: { count: number; noun: string; onNew: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <span className="text-xs text-text-muted">{count} {noun}{count !== 1 ? 's' : ''}</span>
      <button
        onClick={onNew}
        className="flex items-center gap-1 text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover"
      >
        <Plus size={12} /> New {noun.charAt(0).toUpperCase() + noun.slice(1)}
      </button>
    </div>
  )
}

function ActionBtns({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button onClick={onEdit} className="p-1.5 text-text-xmuted hover:text-text-dark rounded-sm" title="Edit">
        <Pencil size={13} />
      </button>
      <button onClick={onDelete} className="p-1.5 text-text-xmuted hover:text-danger rounded-sm" title="Delete">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

// ─── UsersTab ─────────────────────────────────────────────────────────────────

function UsersTab() {
  const { error: showError, success: showSuccess } = useToast()
  const qc = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const [modal, setModal] = useState<null | 'create' | UserItem>(null)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['settings-users'],
    queryFn: async () => {
      const r = await api.get<{ users: UserItem[] }>('/api/users')
      return r.users ?? []
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/users/${id}`),
    onSuccess: () => { showSuccess('User deleted'); qc.invalidateQueries({ queryKey: ['settings-users'] }) },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Delete failed'),
  })

  async function handleDelete(u: UserItem) {
    const ok = await appConfirm(`Delete user "${u.username}"? This cannot be undone.`, { danger: true, okLabel: 'Delete' })
    if (ok) deleteMut.mutate(u.id)
  }

  const roleColors: Record<string, string> = {
    admin: 'bg-danger/10 text-danger',
    editor: 'bg-primary-light text-primary',
    viewer: 'bg-bg text-text-muted',
  }

  return (
    <div className="max-w-2xl">
      <Toolbar count={users.length} noun="user" onNew={() => setModal('create')} />
      {isLoading ? (
        <p className="text-sm text-text-muted">Loading users...</p>
      ) : users.length === 0 ? (
        <p className="text-center py-12 text-text-muted text-sm">No users found</p>
      ) : (
        <TableWrap>
          <thead>
            <tr className="border-b border-border-light bg-bg">
              <Th>Username</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Created</Th>
              <th className="w-20 px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-card-hover transition-colors">
                <td className="px-4 py-2.5 font-medium text-text-dark">
                  {u.username}
                  {currentUser && (currentUser as unknown as { id: number }).id === u.id && (
                    <span className="ml-1.5 text-[10px] font-semibold bg-primary-light text-primary px-1.5 py-0.5 rounded">you</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-text-muted text-xs">{u.email}</td>
                <td className="px-4 py-2.5">
                  <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase', roleColors[u.role] ?? 'bg-bg text-text-muted')}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-text-muted">{timeAgo(u.created_at)}</td>
                <td className="px-4 py-2.5">
                  <ActionBtns onEdit={() => setModal(u)} onDelete={() => handleDelete(u)} />
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      {modal !== null && (
        <UserModal
          initial={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); qc.invalidateQueries({ queryKey: ['settings-users'] }) }}
        />
      )}
    </div>
  )
}

function UserModal({ initial, onClose, onSaved }: { initial: UserItem | null; onClose: () => void; onSaved: () => void }) {
  const { error: showError, success: showSuccess } = useToast()
  const [username, setUsername] = useState(initial?.username ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(initial?.role ?? 'viewer')

  const saveMut = useMutation({
    mutationFn: () => {
      const body: Record<string, string> = { username, email, role }
      if (password) body.password = password
      return initial
        ? api.put(`/api/users/${initial.id}`, body)
        : api.post('/api/users', { ...body, password })
    },
    onSuccess: () => { showSuccess(initial ? 'User updated' : 'User created'); onSaved() },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Save failed'),
  })

  return (
    <Modal
      title={initial ? 'Edit User' : 'New User'}
      onClose={onClose}
      footer={
        <>
          <CancelBtn onClick={onClose} />
          <SaveBtn
            pending={saveMut.isPending}
            disabled={!username.trim() || !email.trim() || (!initial && !password.trim())}
            label={initial ? 'Save Changes' : 'Create User'}
            pendingLabel="Saving..."
            onClick={() => saveMut.mutate()}
          />
        </>
      }
    >
      <FieldRow label="Username *"><Input value={username} onChange={setUsername} placeholder="john" /></FieldRow>
      <FieldRow label="Email *"><Input value={email} onChange={setEmail} type="email" placeholder="john@example.com" /></FieldRow>
      <FieldRow label={initial ? 'New Password (leave blank to keep)' : 'Password *'}>
        <Input value={password} onChange={setPassword} type="password" placeholder="••••••••" />
      </FieldRow>
      <FieldRow label="Role">
        <Select value={role} onChange={setRole} options={[
          { value: 'viewer', label: 'Viewer' },
          { value: 'editor', label: 'Editor' },
          { value: 'admin', label: 'Admin' },
        ]} />
      </FieldRow>
    </Modal>
  )
}

// ─── InstancesTab ─────────────────────────────────────────────────────────────

function InstancesTab() {
  const { error: showError, success: showSuccess } = useToast()
  const qc = useQueryClient()
  const [modal, setModal] = useState<null | 'create' | Instance>(null)

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ['settings-instances'],
    queryFn: () => api.get<Instance[]>('/api/instances'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/instances/${id}`),
    onSuccess: () => { showSuccess('Instance deleted'); qc.invalidateQueries({ queryKey: ['settings-instances'] }) },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Delete failed'),
  })

  async function handleDelete(inst: Instance) {
    const ok = await appConfirm(`Delete instance "${inst.name}"?`, { danger: true, okLabel: 'Delete' })
    if (ok) deleteMut.mutate(inst.id)
  }

  return (
    <div className="max-w-2xl">
      <Toolbar count={instances.length} noun="instance" onNew={() => setModal('create')} />
      {isLoading ? (
        <p className="text-sm text-text-muted">Loading instances...</p>
      ) : instances.length === 0 ? (
        <p className="text-center py-12 text-text-muted text-sm">No instances configured</p>
      ) : (
        <TableWrap>
          <thead>
            <tr className="border-b border-border-light bg-bg">
              <Th>Name</Th>
              <Th>URL</Th>
              <Th>Default</Th>
              <th className="w-20 px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {instances.map((inst) => (
              <tr key={inst.id} className="hover:bg-card-hover transition-colors">
                <td className="px-4 py-2.5 font-medium text-text-dark flex items-center gap-2">
                  {inst.color && (
                    <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: inst.color }} />
                  )}
                  {inst.name}
                </td>
                <td className="px-4 py-2.5 text-xs text-text-muted font-mono truncate max-w-[200px]">{inst.base_url}</td>
                <td className="px-4 py-2.5">
                  {inst.is_default && (
                    <span className="text-[10px] font-semibold bg-primary-light text-primary px-1.5 py-0.5 rounded uppercase">default</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <ActionBtns onEdit={() => setModal(inst)} onDelete={() => handleDelete(inst)} />
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      {modal !== null && (
        <InstanceModal
          initial={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); qc.invalidateQueries({ queryKey: ['settings-instances'] }) }}
        />
      )}
    </div>
  )
}

function InstanceModal({ initial, onClose, onSaved }: { initial: Instance | null; onClose: () => void; onSaved: () => void }) {
  const { error: showError, success: showSuccess } = useToast()
  const [name, setName] = useState(initial?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(initial?.base_url ?? '')
  const [internalUrl, setInternalUrl] = useState(initial?.internal_url ?? '')
  const [apiKey, setApiKey] = useState('')
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false)
  const [color, setColor] = useState(initial?.color ?? '#22c55e')
  const [environment, setEnvironment] = useState(initial?.environment ?? 'production')
  const [workers, setWorkers] = useState<WorkerEntry[]>(initial?.workers ?? [])

  function addWorker() { setWorkers((w) => [...w, { name: `Worker ${w.length + 1}`, url: '' }]) }
  function removeWorker(i: number) { setWorkers((w) => w.filter((_, idx) => idx !== i)) }
  function updateWorker(i: number, field: keyof WorkerEntry, val: string) {
    setWorkers((w) => w.map((wr, idx) => idx === i ? { ...wr, [field]: val } : wr))
  }

  const saveMut = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name, base_url: baseUrl, internal_url: internalUrl, is_default: isDefault, color, environment,
        workers: workers.filter((w) => w.url.trim()),
      }
      if (apiKey) body.api_key = apiKey
      return initial
        ? api.put(`/api/instances/${initial.id}`, body)
        : api.post('/api/instances', body)
    },
    onSuccess: () => { showSuccess(initial ? 'Instance updated' : 'Instance created'); onSaved() },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Save failed'),
  })

  return (
    <Modal
      title={initial ? 'Edit Instance' : 'New Instance'}
      onClose={onClose}
      size="md"
      footer={
        <>
          <CancelBtn onClick={onClose} />
          <SaveBtn
            pending={saveMut.isPending}
            disabled={!name.trim() || !baseUrl.trim()}
            label={initial ? 'Save Changes' : 'Create Instance'}
            pendingLabel="Saving..."
            onClick={() => saveMut.mutate()}
          />
        </>
      }
    >
      <FieldRow label="Name *"><Input value={name} onChange={setName} placeholder="Production" /></FieldRow>
      <FieldRow label="Base URL *"><Input value={baseUrl} onChange={setBaseUrl} placeholder="https://n8n.example.com" /></FieldRow>
      <FieldRow label="Internal URL"><Input value={internalUrl} onChange={setInternalUrl} placeholder="http://n8n:5678" /></FieldRow>
      <FieldRow label={initial ? 'API Key (leave blank to keep)' : 'API Key'}>
        <Input value={apiKey} onChange={setApiKey} type="password" placeholder="n8n_api_..." />
      </FieldRow>
      <FieldRow label="Environment">
        <select value={environment} onChange={(e) => setEnvironment(e.target.value)}
          className="w-full px-3 py-2 border border-input-border rounded-md bg-input-bg text-sm text-text-dark">
          <option value="production">Production</option>
          <option value="staging">Staging</option>
          <option value="development">Development</option>
        </select>
      </FieldRow>

      {/* Workers */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[12px] font-semibold uppercase tracking-wide text-text-muted">Workers (Queue Mode)</label>
          <button type="button" onClick={addWorker}
            className="text-[11px] font-semibold text-primary hover:text-primary-hover">+ Add Worker</button>
        </div>
        {workers.length === 0 ? (
          <p className="text-xs text-text-xmuted">No workers configured. Add worker URLs for queue mode monitoring.</p>
        ) : (
          <div className="space-y-2">
            {workers.map((w, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="text" value={w.name} onChange={(e) => updateWorker(i, 'name', e.target.value)}
                  placeholder="Worker name" className="flex-1 px-2 py-1.5 border border-input-border rounded-md bg-input-bg text-sm text-text-dark min-w-0" />
                <input type="text" value={w.url} onChange={(e) => updateWorker(i, 'url', e.target.value)}
                  placeholder="http://n8n-worker:5678" className="flex-[2] px-2 py-1.5 border border-input-border rounded-md bg-input-bg text-sm text-text-dark min-w-0" />
                <button type="button" onClick={() => removeWorker(i)}
                  className="text-danger hover:text-danger/80 shrink-0 p-1">&times;</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <FieldRow label="Color">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-16 border border-input-border rounded-sm bg-input-bg cursor-pointer"
          />
        </FieldRow>
        <label className="flex items-center gap-2 text-sm text-text-dark cursor-pointer mt-4">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="accent-primary"
          />
          Set as default
        </label>
      </div>
    </Modal>
  )
}

// ─── SmtpTab ──────────────────────────────────────────────────────────────────

function SmtpTab() {
  const { error: showError, success: showSuccess, info: showInfo } = useToast()
  const [host, setHost] = useState('')
  const [port, setPort] = useState('587')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [fromAddress, setFromAddress] = useState('')
  const [appUrl, setAppUrl] = useState('')
  const [loaded, setLoaded] = useState(false)

  useQuery({
    queryKey: ['settings-smtp'],
    queryFn: async () => {
      const r = await api.get<SmtpSettings>('/api/settings/smtp')
      setHost(r.host ?? '')
      setPort(String(r.port ?? 587))
      setUser(r.user ?? '')
      setPass(r.pass ?? '')
      setFromAddress(r.from_address ?? '')
      setAppUrl(r.app_url ?? '')
      setLoaded(true)
      return r
    },
  })

  const saveMut = useMutation({
    mutationFn: () => api.put('/api/settings/smtp', { host, port: Number(port), user, pass, from_address: fromAddress, app_url: appUrl }),
    onSuccess: () => showSuccess('SMTP settings saved'),
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Save failed'),
  })

  const testMut = useMutation({
    mutationFn: () => api.post('/api/settings/smtp/test'),
    onSuccess: () => showInfo('Test email sent — check your inbox'),
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Test failed'),
  })

  if (!loaded) return <p className="text-sm text-text-muted">Loading SMTP settings...</p>

  return (
    <div className="max-w-md space-y-3">
      <FieldRow label="Host"><Input value={host} onChange={setHost} placeholder="smtp.example.com" /></FieldRow>
      <FieldRow label="Port"><Input value={port} onChange={setPort} type="number" placeholder="587" /></FieldRow>
      <FieldRow label="Username"><Input value={user} onChange={setUser} placeholder="smtp-user" /></FieldRow>
      <FieldRow label="Password"><Input value={pass} onChange={setPass} type="password" placeholder="••••••••" /></FieldRow>
      <FieldRow label="From Address"><Input value={fromAddress} onChange={setFromAddress} type="email" placeholder="noreply@example.com" /></FieldRow>
      <FieldRow label="App URL"><Input value={appUrl} onChange={setAppUrl} placeholder="https://library.example.com" /></FieldRow>
      <div className="flex items-center gap-2 pt-2">
        <button
          disabled={saveMut.isPending}
          onClick={() => saveMut.mutate()}
          className="text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
        >
          {saveMut.isPending ? 'Saving...' : 'Save'}
        </button>
        <button
          disabled={testMut.isPending}
          onClick={() => testMut.mutate()}
          className="text-xs px-3 py-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover disabled:opacity-50"
        >
          {testMut.isPending ? 'Sending...' : 'Send Test Email'}
        </button>
      </div>
    </div>
  )
}

// ─── CategoriesTab ────────────────────────────────────────────────────────────

function CategoriesTab() {
  const { error: showError, success: showSuccess } = useToast()
  const qc = useQueryClient()
  const [modal, setModal] = useState<null | 'create' | Category>(null)

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['settings-categories'],
    queryFn: async () => {
      const r = await api.get<{ categories: Category[] }>('/api/categories')
      return r.categories ?? []
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/categories/${id}`),
    onSuccess: () => { showSuccess('Category deleted'); qc.invalidateQueries({ queryKey: ['settings-categories'] }) },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Delete failed'),
  })

  async function handleDelete(c: Category) {
    const ok = await appConfirm(`Delete category "${c.name}"?`, { danger: true, okLabel: 'Delete' })
    if (ok) deleteMut.mutate(c.id)
  }

  return (
    <div className="max-w-xl">
      <Toolbar count={categories.length} noun="category" onNew={() => setModal('create')} />
      {isLoading ? (
        <p className="text-sm text-text-muted">Loading categories...</p>
      ) : categories.length === 0 ? (
        <p className="text-center py-12 text-text-muted text-sm">No categories defined</p>
      ) : (
        <TableWrap>
          <thead>
            <tr className="border-b border-border-light bg-bg">
              <Th>Name</Th>
              <Th>Icon</Th>
              <th className="w-20 px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {categories.map((c) => (
              <tr key={c.id} className="hover:bg-card-hover transition-colors">
                <td className="px-4 py-2.5 font-medium text-text-dark">{c.name}</td>
                <td className="px-4 py-2.5 text-text-muted text-sm">{c.icon ?? '—'}</td>
                <td className="px-4 py-2.5">
                  <ActionBtns onEdit={() => setModal(c)} onDelete={() => handleDelete(c)} />
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      {modal !== null && (
        <CategoryModal
          initial={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); qc.invalidateQueries({ queryKey: ['settings-categories'] }) }}
        />
      )}
    </div>
  )
}

function CategoryModal({ initial, onClose, onSaved }: { initial: Category | null; onClose: () => void; onSaved: () => void }) {
  const { error: showError, success: showSuccess } = useToast()
  const [name, setName] = useState(initial?.name ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? '')

  const saveMut = useMutation({
    mutationFn: () =>
      initial
        ? api.put(`/api/categories/${initial.id}`, { name, icon })
        : api.post('/api/categories', { name, icon }),
    onSuccess: () => { showSuccess(initial ? 'Category updated' : 'Category created'); onSaved() },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Save failed'),
  })

  return (
    <Modal
      title={initial ? 'Edit Category' : 'New Category'}
      onClose={onClose}
      footer={
        <>
          <CancelBtn onClick={onClose} />
          <SaveBtn
            pending={saveMut.isPending}
            disabled={!name.trim()}
            label={initial ? 'Save Changes' : 'Create Category'}
            pendingLabel="Saving..."
            onClick={() => saveMut.mutate()}
          />
        </>
      }
    >
      <FieldRow label="Name *"><Input value={name} onChange={setName} placeholder="e.g. Automation" /></FieldRow>
      <FieldRow label="Icon (emoji or text)"><Input value={icon} onChange={setIcon} placeholder="e.g. ⚙️" /></FieldRow>
    </Modal>
  )
}

// ─── ApiKeysTab ───────────────────────────────────────────────────────────────

function ApiKeysTab() {
  const { error: showError, success: showSuccess } = useToast()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['settings-api-keys'],
    queryFn: async () => {
      const r = await api.get<{ keys: ApiKey[] }>('/api/api-keys')
      return r.keys ?? []
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/api-keys/${id}`),
    onSuccess: () => { showSuccess('API key revoked'); qc.invalidateQueries({ queryKey: ['settings-api-keys'] }) },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Revoke failed'),
  })

  async function handleDelete(k: ApiKey) {
    const ok = await appConfirm(`Revoke API key "${k.name}"? This cannot be undone.`, { danger: true, okLabel: 'Revoke' })
    if (ok) deleteMut.mutate(k.id)
  }

  function copyKey() {
    if (!newKey) return
    navigator.clipboard.writeText(newKey).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="max-w-2xl">
      <Toolbar count={keys.length} noun="key" onNew={() => setShowCreate(true)} />

      {newKey && (
        <div className="mb-4 p-3 bg-primary-light border border-primary/30 rounded-md">
          <p className="text-xs font-medium text-primary mb-1">API key created — copy it now, it won't be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono text-text-dark bg-card border border-border px-2 py-1.5 rounded-sm truncate">
              {newKey}
            </code>
            <button
              onClick={copyKey}
              className="shrink-0 p-1.5 text-text-muted hover:text-text-dark rounded-sm border border-border bg-card"
              title="Copy"
            >
              {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="mt-2 text-xs text-text-xmuted hover:text-text-muted underline">Dismiss</button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-text-muted">Loading API keys...</p>
      ) : keys.length === 0 ? (
        <p className="text-center py-12 text-text-muted text-sm">No API keys yet</p>
      ) : (
        <TableWrap>
          <thead>
            <tr className="border-b border-border-light bg-bg">
              <Th>Name</Th>
              <Th>Prefix</Th>
              <Th>Role</Th>
              <Th>Last Used</Th>
              <Th>Expires</Th>
              <th className="w-16 px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {keys.map((k) => (
              <tr key={k.id} className="hover:bg-card-hover transition-colors">
                <td className="px-4 py-2.5 font-medium text-text-dark">{k.name}</td>
                <td className="px-4 py-2.5 text-xs font-mono text-text-muted">{k.key_prefix}…</td>
                <td className="px-4 py-2.5">
                  <span className="text-[10px] font-semibold bg-bg text-text-muted px-1.5 py-0.5 rounded uppercase">{k.role}</span>
                </td>
                <td className="px-4 py-2.5 text-xs text-text-muted">{k.last_used_at ? timeAgo(k.last_used_at) : 'Never'}</td>
                <td className="px-4 py-2.5 text-xs text-text-muted">{k.expires_at ? timeAgo(k.expires_at) : '—'}</td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end">
                    <button onClick={() => handleDelete(k)} className="p-1.5 text-text-xmuted hover:text-danger rounded-sm" title="Revoke">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {showCreate && (
        <ApiKeyModal
          onClose={() => setShowCreate(false)}
          onCreated={(key) => {
            setShowCreate(false)
            setNewKey(key)
            qc.invalidateQueries({ queryKey: ['settings-api-keys'] })
          }}
        />
      )}
    </div>
  )
}

function ApiKeyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (key: string) => void }) {
  const { error: showError } = useToast()
  const [name, setName] = useState('')
  const [role, setRole] = useState('viewer')
  const [expiresIn, setExpiresIn] = useState('')

  const saveMut = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { name, role }
      if (expiresIn) body.expires_in_days = Number(expiresIn)
      return api.post<ApiKey & { key: string }>('/api/api-keys', body)
    },
    onSuccess: (data) => onCreated(data.key),
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Create failed'),
  })

  return (
    <Modal
      title="New API Key"
      onClose={onClose}
      footer={
        <>
          <CancelBtn onClick={onClose} />
          <SaveBtn
            pending={saveMut.isPending}
            disabled={!name.trim()}
            label="Create Key"
            pendingLabel="Creating..."
            onClick={() => saveMut.mutate()}
          />
        </>
      }
    >
      <FieldRow label="Name *"><Input value={name} onChange={setName} placeholder="My integration" /></FieldRow>
      <FieldRow label="Role">
        <Select value={role} onChange={setRole} options={[
          { value: 'viewer', label: 'Viewer' },
          { value: 'editor', label: 'Editor' },
          { value: 'admin', label: 'Admin' },
        ]} />
      </FieldRow>
      <FieldRow label="Expires in (days, blank = never)">
        <Input value={expiresIn} onChange={setExpiresIn} type="number" placeholder="90" />
      </FieldRow>
    </Modal>
  )
}

// ─── BrandingTab ──────────────────────────────────────────────────────────────

function BrandingTab() {
  const { error: showError, success: showSuccess } = useToast()
  const [brandName, setBrandName] = useState('')
  const [brandLogo, setBrandLogo] = useState('')
  const [brandPrimary, setBrandPrimary] = useState('#6366f1')
  const [loaded, setLoaded] = useState(false)

  useQuery({
    queryKey: ['settings-branding'],
    queryFn: async () => {
      const r = await api.get<BrandingSettings>('/api/settings/branding')
      setBrandName(r.brand_name ?? '')
      setBrandLogo(r.brand_logo ?? '')
      setBrandPrimary(r.brand_primary ?? '#6366f1')
      setLoaded(true)
      return r
    },
  })

  const saveMut = useMutation({
    mutationFn: () => api.put('/api/settings/branding', { brand_name: brandName, brand_logo: brandLogo, brand_primary: brandPrimary }),
    onSuccess: () => showSuccess('Branding saved'),
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Save failed'),
  })

  if (!loaded) return <p className="text-sm text-text-muted">Loading branding settings...</p>

  return (
    <div className="max-w-md space-y-3">
      <FieldRow label="App Name"><Input value={brandName} onChange={setBrandName} placeholder="n8n Library" /></FieldRow>
      <FieldRow label="Logo URL"><Input value={brandLogo} onChange={setBrandLogo} placeholder="https://example.com/logo.png" /></FieldRow>
      <FieldRow label="Primary Colour">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={brandPrimary}
            onChange={(e) => setBrandPrimary(e.target.value)}
            className="h-8 w-16 border border-input-border rounded-sm bg-input-bg cursor-pointer"
          />
          <input
            type="text"
            value={brandPrimary}
            onChange={(e) => setBrandPrimary(e.target.value)}
            className="flex-1 px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm font-mono text-text-dark focus:outline-none focus:border-input-focus"
            placeholder="#6366f1"
          />
        </div>
      </FieldRow>
      {brandLogo && (
        <div className="pt-1">
          <p className="text-xs text-text-muted mb-1">Preview</p>
          <img src={brandLogo} alt="Logo preview" className="h-10 object-contain rounded border border-border bg-bg p-1" />
        </div>
      )}
      <div className="pt-2">
        <button
          disabled={saveMut.isPending}
          onClick={() => saveMut.mutate()}
          className="text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
        >
          {saveMut.isPending ? 'Saving...' : 'Save Branding'}
        </button>
      </div>
    </div>
  )
}

// ─── TwoFaTab ─────────────────────────────────────────────────────────────────

function TwoFaTab() {
  const { error: showError, success: showSuccess } = useToast()
  const qc = useQueryClient()
  const [code, setCode] = useState('')
  const [qrData, setQrData] = useState<{ secret: string; qr: string } | null>(null)
  const [showDisable, setShowDisable] = useState(false)
  const [disableCode, setDisableCode] = useState('')

  const { data: status, isLoading } = useQuery({
    queryKey: ['settings-2fa'],
    queryFn: () => api.get<{ enabled: boolean }>('/api/auth/2fa/status'),
  })

  const setupMut = useMutation({
    mutationFn: () => api.post<{ secret: string; qr: string }>('/api/auth/2fa/setup'),
    onSuccess: (data) => setQrData(data),
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Setup failed'),
  })

  const verifyMut = useMutation({
    mutationFn: () => api.post('/api/auth/2fa/verify', { token: code }),
    onSuccess: () => {
      showSuccess('2FA enabled')
      setQrData(null)
      setCode('')
      qc.invalidateQueries({ queryKey: ['settings-2fa'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Invalid code'),
  })

  const disableMut = useMutation({
    mutationFn: () => api.post('/api/auth/2fa/disable', { token: disableCode }),
    onSuccess: () => {
      showSuccess('2FA disabled')
      setShowDisable(false)
      setDisableCode('')
      qc.invalidateQueries({ queryKey: ['settings-2fa'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Disable failed'),
  })

  if (isLoading) return <p className="text-sm text-text-muted">Loading 2FA status...</p>

  const enabled = status?.enabled ?? false

  return (
    <div className="max-w-sm space-y-4">
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium',
        enabled ? 'bg-success/10 text-success' : 'bg-bg text-text-muted border border-border',
      )}>
        <ShieldCheck size={15} />
        {enabled ? '2FA is enabled' : '2FA is disabled'}
      </div>

      {!enabled && !qrData && (
        <button
          onClick={() => setupMut.mutate()}
          disabled={setupMut.isPending}
          className="text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
        >
          {setupMut.isPending ? 'Generating...' : 'Set Up 2FA'}
        </button>
      )}

      {qrData && (
        <div className="space-y-3">
          <p className="text-xs text-text-muted">Scan this QR code with your authenticator app, then enter the 6-digit code below.</p>
          <img src={qrData.qr} alt="2FA QR code" className="w-40 h-40 border border-border rounded-md" />
          <p className="text-xs text-text-xmuted font-mono break-all">Secret: {qrData.secret}</p>
          <FieldRow label="Verification Code">
            <Input value={code} onChange={setCode} placeholder="123456" />
          </FieldRow>
          <div className="flex gap-2">
            <button
              disabled={verifyMut.isPending || code.length < 6}
              onClick={() => verifyMut.mutate()}
              className="text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
            >
              {verifyMut.isPending ? 'Verifying...' : 'Verify & Enable'}
            </button>
            <button onClick={() => { setQrData(null); setCode('') }} className="text-xs px-3 py-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover">
              Cancel
            </button>
          </div>
        </div>
      )}

      {enabled && !showDisable && (
        <button
          onClick={() => setShowDisable(true)}
          className="text-xs px-3 py-1.5 border border-danger/40 text-danger rounded-sm hover:bg-danger/5"
        >
          Disable 2FA
        </button>
      )}

      {enabled && showDisable && (
        <div className="space-y-3 p-3 border border-border rounded-md bg-bg">
          <p className="text-xs text-text-muted">Enter your current 2FA code to disable.</p>
          <FieldRow label="Code">
            <Input value={disableCode} onChange={setDisableCode} placeholder="123456" />
          </FieldRow>
          <div className="flex gap-2">
            <button
              disabled={disableMut.isPending || disableCode.length < 6}
              onClick={() => disableMut.mutate()}
              className="text-xs px-3 py-1.5 bg-danger text-white rounded-sm hover:bg-danger/90 disabled:opacity-50"
            >
              {disableMut.isPending ? 'Disabling...' : 'Confirm Disable'}
            </button>
            <button onClick={() => { setShowDisable(false); setDisableCode('') }} className="text-xs px-3 py-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ImportExportTab ──────────────────────────────────────────────────────────

function ImportExportTab() {
  const { error: showError, success: showSuccess } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      const blob = await fetch('/api/settings/export').then((r) => {
        if (!r.ok) throw new Error('Export failed')
        return r.blob()
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `n8n-library-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      showSuccess('Export downloaded')
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  async function handleImport() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      await api.post('/api/settings/import', JSON.parse(text))
      showSuccess('Import successful — settings applied')
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="max-w-md space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-text-dark">Export</h3>
        <p className="text-xs text-text-muted">Download a JSON snapshot of all settings, categories, instances, and configuration.</p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
        >
          <Download size={12} />
          {exporting ? 'Exporting...' : 'Download Export'}
        </button>
      </div>

      <div className="border-t border-border-light pt-4 space-y-2">
        <h3 className="text-sm font-semibold text-text-dark">Import</h3>
        <p className="text-xs text-text-muted">Upload a previously exported JSON file to restore settings. Existing data may be overwritten.</p>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="text-xs text-text-muted file:mr-2 file:text-xs file:px-3 file:py-1 file:border file:border-input-border file:rounded-sm file:bg-bg file:text-text-dark file:hover:bg-card-hover file:cursor-pointer"
          />
          <button
            onClick={handleImport}
            disabled={importing}
            className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover disabled:opacity-50"
          >
            <Upload size={12} />
            {importing ? 'Importing...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── SettingsPage ─────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('users')

  const current = TABS.find((t) => t.id === activeTab) ?? TABS[0]

  return (
    <div className="flex gap-0 min-h-[400px]">
      {/* Sidebar */}
      <nav className="w-44 shrink-0 border-r border-border hidden sm:block">
        <ul className="space-y-0.5 py-1">
          {TABS.map((tab) => (
            <li key={tab.id}>
              <button
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 text-sm px-3 py-2 rounded-sm text-left transition-colors',
                  activeTab === tab.id
                    ? 'bg-primary-light text-primary font-medium'
                    : 'text-text-muted hover:bg-card-hover hover:text-text-dark',
                )}
              >
                <span className={cn('shrink-0', activeTab === tab.id ? 'text-primary' : 'text-text-xmuted')}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0 pl-6">
        <div className="mb-4 pb-3 border-b border-border-light">
          <h2 className="text-base font-semibold text-text-dark flex items-center gap-2">
            <span className="text-text-muted">{current.icon}</span>
            {current.label}
          </h2>
        </div>
        <ActiveTabContent tabId={activeTab} />
      </div>
    </div>
  )
}

// ─── ActiveTabContent ─────────────────────────────────────────────────────────

function ActiveTabContent({ tabId }: { tabId: string }) {
  switch (tabId) {
    case 'users':         return <UsersTab />
    case 'instances':     return <InstancesTab />
    case 'smtp':          return <SmtpTab />
    case 'categories':    return <CategoriesTab />
    case 'api_keys':      return <ApiKeysTab />
    case 'branding':      return <BrandingTab />
    case '2fa':           return <TwoFaTab />
    case 'import_export': return <ImportExportTab />
    case 'email_templates': return <ComingSoon title="Email Templates" />
    case 'webhooks':      return <ComingSoon title="Webhooks" />
    case 'ai':            return <ComingSoon title="AI Settings" />
    case 'mcp':           return <ComingSoon title="MCP" />
    default:              return <ComingSoon title={tabId} />
  }
}
