import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/hooks/useToast'
import { appConfirm } from '@/components/ConfirmDialog'
import { RefreshCw, Pencil, Trash2, Plus, Sparkles, Server, MessageSquareText, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import CustomSelect from '@/components/CustomSelect'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiSettings {
  ai_provider: string
  ai_model: string
  ai_base_url: string
  daily_summary_hour: number | null
  ai_api_key_masked: string
  ai_api_key_set: boolean
}

interface AiPrompts {
  ai_prompt_describe: string
  ai_prompt_document: string
  ai_prompt_error: string
  ai_prompt_summary: string
  ai_prompt_improve: string
}

interface McpServer {
  id: number
  name: string
  type: 'http' | 'stdio'
  url?: string
  command?: string
  args?: unknown[] | string
  env?: Record<string, string> | string
  auth_header?: string
  enabled: boolean
  status: string
  toolCount?: number
  error?: string
}

interface McpFormState {
  name: string
  type: 'http' | 'stdio'
  url: string
  auth_header: string
  command: string
  args: string
  env: string
  enabled: boolean
}

const DEFAULT_MCP_FORM: McpFormState = {
  name: '',
  type: 'http',
  url: '',
  auth_header: '',
  command: '',
  args: '[]',
  env: '{}',
  enabled: true,
}

// ─── MCP Server Modal ─────────────────────────────────────────────────────────

function McpServerModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: McpServer | null
  onClose: () => void
  onSaved: () => void
}) {
  const { error: showError, success: showSuccess } = useToast()
  const [form, setForm] = useState<McpFormState>(
    initial
      ? {
          name: initial.name,
          type: initial.type,
          url: initial.url ?? '',
          auth_header: initial.auth_header ?? '',
          command: initial.command ?? '',
          args: Array.isArray(initial.args) ? JSON.stringify(initial.args) : String(initial.args ?? '[]'),
          env: typeof initial.env === 'object' && initial.env !== null ? JSON.stringify(initial.env, null, 2) : String(initial.env ?? '{}'),
          enabled: initial.enabled ?? true,
        }
      : DEFAULT_MCP_FORM,
  )

  const set = (patch: Partial<McpFormState>) => setForm((f) => ({ ...f, ...patch }))

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        type: form.type,
        enabled: form.enabled,
      }
      if (form.type === 'http') {
        payload.url = form.url.trim()
        payload.auth_header = form.auth_header.trim()
      } else {
        payload.command = form.command.trim()
        try { payload.args = JSON.parse(form.args || '[]') } catch { payload.args = [] }
        try { payload.env = JSON.parse(form.env || '{}') } catch { payload.env = {} }
      }
      return initial
        ? api.put(`/api/mcp/servers/${initial.id}`, payload)
        : api.post('/api/mcp/servers', payload)
    },
    onSuccess: () => {
      showSuccess(initial ? 'MCP server updated' : 'MCP server added')
      onSaved()
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Save failed'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-md w-full max-w-md shadow-lg flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-text-dark">
            {initial ? 'Edit MCP Server' : 'Add MCP Server'}
          </h2>
          <button onClick={onClose} className="text-text-xmuted hover:text-text-dark text-lg leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="My MCP Server"
              autoFocus
              className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
            />
          </div>

          {/* Transport type */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Transport Type</label>
            <CustomSelect
              value={form.type}
              onChange={(v) => set({ type: v as 'http' | 'stdio' })}
              options={[
                { value: 'http', label: 'HTTP' },
                { value: 'stdio', label: 'stdio' },
              ]}
              className="w-full"
            />
          </div>

          {/* HTTP fields */}
          {form.type === 'http' && (
            <>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">URL *</label>
                <input
                  type="text"
                  value={form.url}
                  onChange={(e) => set({ url: e.target.value })}
                  placeholder="https://mcp.example.com/sse"
                  className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Auth Header</label>
                <input
                  type="text"
                  value={form.auth_header}
                  onChange={(e) => set({ auth_header: e.target.value })}
                  placeholder="Bearer sk-..."
                  className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
                />
                <p className="text-[10px] text-text-xmuted mt-0.5">Value for the Authorization header, if required</p>
              </div>
            </>
          )}

          {/* stdio fields */}
          {form.type === 'stdio' && (
            <>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Command *</label>
                <input
                  type="text"
                  value={form.command}
                  onChange={(e) => set({ command: e.target.value })}
                  placeholder="npx"
                  className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Args</label>
                <input
                  type="text"
                  value={form.args}
                  onChange={(e) => set({ args: e.target.value })}
                  placeholder='["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]'
                  className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Environment Variables</label>
                <textarea
                  value={form.env}
                  onChange={(e) => set({ env: e.target.value })}
                  placeholder={"KEY=VALUE\nANOTHER_KEY=VALUE"}
                  rows={4}
                  className="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus font-mono resize-y"
                />
                <p className="text-[10px] text-text-xmuted mt-0.5">JSON object, e.g. {`{"KEY": "VALUE"}`}</p>
              </div>
            </>
          )}

          {/* Enabled toggle */}
          <label className="flex items-center gap-2 text-sm text-text-dark cursor-pointer pt-1">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="accent-primary" />
            Enabled
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover"
          >
            Cancel
          </button>
          <button
            disabled={!form.name.trim() || saveMut.isPending}
            onClick={() => saveMut.mutate()}
            className="text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1"
          >
            {saveMut.isPending && <Loader2 size={11} className="animate-spin" />}
            {saveMut.isPending ? 'Saving...' : initial ? 'Save Changes' : 'Add Server'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Section 1: LLM Provider ──────────────────────────────────────────────────

function LlmProviderSection() {
  const { error: showError, success: showSuccess } = useToast()

  const { data: settings, isLoading } = useQuery<AiSettings>({
    queryKey: ['ai-settings'],
    queryFn: () => api.get<AiSettings>('/api/settings/ai'),
  })

  const [provider, setProvider] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [summaryHour, setSummaryHour] = useState<string>('')
  const [models, setModels] = useState<string[]>([])
  const [initialized, setInitialized] = useState(false)

  // Sync state from fetched settings once
  if (settings && !initialized) {
    setProvider(settings.ai_provider ?? 'openai')
    setModel(settings.ai_model ?? '')
    setBaseUrl(settings.ai_base_url ?? '')
    setSummaryHour(settings.daily_summary_hour != null ? String(settings.daily_summary_hour) : '')
    setInitialized(true)
  }

  const fetchModelsMut = useMutation({
    mutationFn: () => api.post<{ models: string[] }>('/api/ai/models', {}),
    onSuccess: (data) => {
      setModels(data.models ?? [])
      showSuccess(`Fetched ${data.models?.length ?? 0} models`)
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Failed to fetch models'),
  })

  const saveMut = useMutation({
    mutationFn: () =>
      api.put('/api/settings/ai', {
        provider,
        api_key: apiKey || undefined,
        model,
        base_url: baseUrl || undefined,
        daily_summary_hour: summaryHour !== '' ? Number(summaryHour) : null,
      }),
    onSuccess: () => showSuccess('AI settings saved'),
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Save failed'),
  })

  const inputCls = 'w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus'
  const labelCls = 'block text-xs font-medium text-text-muted mb-1'

  return (
    <div className="bg-card border border-border rounded-lg p-6 mb-6">
      <div className="flex items-center gap-3 mb-5">
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-light text-primary shrink-0">
          <Sparkles size={16} />
        </span>
        <div>
          <h2 className="text-base font-semibold text-text-dark">LLM Provider</h2>
          <p className="text-xs text-text-muted">Configure your AI provider, model, and API credentials</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 size={14} className="animate-spin" /> Loading settings...
        </div>
      ) : (
        <div className="space-y-4 max-w-lg">
          {/* Provider */}
          <div>
            <label className={labelCls}>Provider</label>
            <CustomSelect
              value={provider}
              onChange={setProvider}
              options={[
                { value: 'anthropic', label: 'Anthropic Claude' },
                { value: 'openai', label: 'OpenAI' },
                { value: 'ollama', label: 'Ollama' },
                { value: 'openai-compatible', label: 'OpenAI Compatible' },
              ]}
              className="w-full"
            />
          </div>

          {/* API Key */}
          <div>
            <label className={labelCls}>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                settings?.ai_api_key_set
                  ? settings.ai_api_key_masked || '••••••••••••'
                  : 'Enter API key...'
              }
              className={inputCls}
            />
            {settings?.ai_api_key_set && (
              <p className="text-[10px] text-text-xmuted mt-0.5">Leave blank to keep existing key</p>
            )}
          </div>

          {/* Base URL */}
          <div>
            <label className={labelCls}>Base URL</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className={inputCls}
            />
            <p className="text-[10px] text-text-xmuted mt-0.5">
              Required for Ollama. Optional for OpenAI-compatible endpoints.
            </p>
          </div>

          {/* Model */}
          <div>
            <label className={labelCls}>Model</label>
            <div className="flex gap-2">
              {models.length > 0 ? (
                <CustomSelect
                  value={model}
                  onChange={setModel}
                  placeholder="Select model..."
                  options={[
                    { value: '', label: 'Select model...' },
                    ...models.map((m) => ({ value: m, label: m })),
                  ]}
                  className="flex-1"
                />
              ) : (
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-4o"
                  className={cn(inputCls, 'flex-1')}
                />
              )}
              <button
                onClick={() => fetchModelsMut.mutate()}
                disabled={fetchModelsMut.isPending}
                className="flex items-center gap-1 text-xs px-3 py-1.5 border border-input-border rounded-sm text-text-muted hover:bg-card-hover disabled:opacity-50 shrink-0"
              >
                {fetchModelsMut.isPending
                  ? <Loader2 size={12} className="animate-spin" />
                  : <RefreshCw size={12} />
                }
                Fetch Models
              </button>
            </div>
          </div>

          {/* Daily Summary Hour */}
          <div>
            <label className={labelCls}>Daily Summary Hour (0–23)</label>
            <input
              type="number"
              min={0}
              max={23}
              value={summaryHour}
              onChange={(e) => setSummaryHour(e.target.value)}
              placeholder="Leave empty to disable"
              className={cn(inputCls, 'max-w-[140px]')}
            />
            <p className="text-[10px] text-text-xmuted mt-0.5">UTC hour to send daily workflow summary. Leave empty to disable.</p>
          </div>

          {/* Save */}
          <div className="pt-1">
            <button
              disabled={saveMut.isPending}
              onClick={() => saveMut.mutate()}
              className="flex items-center gap-1.5 text-sm px-4 py-2 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
            >
              {saveMut.isPending && <Loader2 size={13} className="animate-spin" />}
              {saveMut.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Section 2: System Prompts ────────────────────────────────────────────────

const PROMPT_FIELDS: { key: keyof AiPrompts; label: string }[] = [
  { key: 'ai_prompt_describe', label: 'Workflow Description' },
  { key: 'ai_prompt_document', label: 'Workflow Documentation' },
  { key: 'ai_prompt_error', label: 'Error Analysis' },
  { key: 'ai_prompt_summary', label: 'Daily Summary' },
]

function SystemPromptsSection() {
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()

  const { data: promptsData, isLoading } = useQuery<AiPrompts>({
    queryKey: ['ai-prompts'],
    queryFn: () => api.get<AiPrompts>('/api/settings/ai-prompts'),
  })

  const [prompts, setPrompts] = useState<Partial<AiPrompts>>({})
  const [initialized, setInitialized] = useState(false)

  if (promptsData && !initialized) {
    setPrompts(promptsData)
    setInitialized(true)
  }

  const setPrompt = (key: keyof AiPrompts, value: string) =>
    setPrompts((p) => ({ ...p, [key]: value }))

  const resetMut = useMutation({
    mutationFn: (key: keyof AiPrompts) =>
      api.delete<{ value: string }>(`/api/settings/ai-prompts/${key}`),
    onSuccess: (data, key) => {
      setPrompts((p) => ({ ...p, [key]: (data as { value: string }).value ?? '' }))
      queryClient.invalidateQueries({ queryKey: ['ai-prompts'] })
      showSuccess('Prompt reset to default')
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Reset failed'),
  })

  const saveMut = useMutation({
    mutationFn: () => api.put('/api/settings/ai-prompts', prompts),
    onSuccess: () => showSuccess('Prompts saved'),
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Save failed'),
  })

  return (
    <div className="bg-card border border-border rounded-lg p-6 mb-6">
      <div className="flex items-center gap-3 mb-5">
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-light text-primary shrink-0">
          <MessageSquareText size={16} />
        </span>
        <div>
          <h2 className="text-base font-semibold text-text-dark">System Prompts</h2>
          <p className="text-xs text-text-muted">Customize the prompts used for each AI feature</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 size={14} className="animate-spin" /> Loading prompts...
        </div>
      ) : (
        <div className="space-y-5">
          {PROMPT_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-text-muted">{label}</label>
                <button
                  onClick={async () => {
                    const confirmed = await appConfirm(`Reset the "${label}" prompt to its built-in default?`, { okLabel: 'Reset' })
                    if (confirmed) resetMut.mutate(key)
                  }}
                  disabled={resetMut.isPending}
                  className="text-[10px] px-2 py-0.5 border border-input-border rounded-sm text-text-xmuted hover:text-text-muted hover:bg-card-hover disabled:opacity-50"
                >
                  Reset to Default
                </button>
              </div>
              <textarea
                value={(prompts[key] as string) ?? ''}
                onChange={(e) => setPrompt(key, e.target.value)}
                rows={5}
                className="w-full px-3 py-2 border border-input-border rounded-sm bg-input-bg text-xs text-text-dark focus:outline-none focus:border-input-focus font-mono resize-y"
              />
            </div>
          ))}

          <div className="pt-1">
            <button
              disabled={saveMut.isPending}
              onClick={() => saveMut.mutate()}
              className="flex items-center gap-1.5 text-sm px-4 py-2 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
            >
              {saveMut.isPending && <Loader2 size={13} className="animate-spin" />}
              {saveMut.isPending ? 'Saving...' : 'Save Prompts'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Section 3: MCP Servers ───────────────────────────────────────────────────

function McpStatusBadge({ server }: { server: McpServer }) {
  const connected = server.status === 'connected'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium',
        connected
          ? 'bg-success-light text-success'
          : 'bg-danger-light text-danger',
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', connected ? 'bg-success' : 'bg-danger')} />
      {connected
        ? `connected${server.toolCount != null ? ` (${server.toolCount} tools)` : ''}`
        : `error${server.error ? `: ${server.error}` : ''}`}
    </span>
  )
}

function McpServersSection() {
  const { error: showError, success: showSuccess } = useToast()
  const queryClient = useQueryClient()
  const [modalServer, setModalServer] = useState<McpServer | null | 'new'>(null)

  const { data: serversData, isLoading } = useQuery<{ servers: McpServer[] }>({
    queryKey: ['mcp-servers'],
    queryFn: () => api.get<{ servers: McpServer[] }>('/api/mcp/servers'),
  })

  const servers = serversData?.servers ?? []

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/mcp/servers/${id}`),
    onSuccess: () => {
      showSuccess('MCP server removed')
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Delete failed'),
  })

  const reconnectMut = useMutation({
    mutationFn: (id: number) => api.post(`/api/mcp/servers/${id}/reconnect`, {}),
    onSuccess: () => {
      showSuccess('Reconnecting...')
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Reconnect failed'),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })

  return (
    <div className="bg-card border border-border rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-light text-primary shrink-0">
            <Server size={16} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-text-dark">MCP Servers</h2>
            <p className="text-xs text-text-muted">Connect Model Context Protocol servers to extend AI capabilities</p>
          </div>
        </div>
        <button
          onClick={() => setModalServer('new')}
          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-primary text-white rounded-sm hover:bg-primary-hover shrink-0"
        >
          <Plus size={12} /> Add MCP Server
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 size={14} className="animate-spin" /> Loading servers...
        </div>
      ) : servers.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-md">
          <Server size={24} className="text-text-xmuted mx-auto mb-2" />
          <p className="text-text-muted text-sm">No MCP servers configured</p>
          <p className="text-text-xmuted text-xs mt-0.5">Add a server to enable tool use in AI features</p>
        </div>
      ) : (
        <div className="divide-y divide-border-light border border-border rounded-md overflow-hidden">
          {servers.map((srv) => (
            <div key={srv.id} className="flex items-center gap-3 px-4 py-3 hover:bg-card-hover transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-dark truncate">{srv.name}</p>
                <p className="text-xs text-text-xmuted truncate mt-0.5">
                  {srv.type === 'http' ? srv.url : `${srv.type ?? 'stdio'} — ${srv.command}`}
                </p>
              </div>
              <McpStatusBadge server={srv} />
              <div className="flex items-center gap-1 shrink-0">
                <button
                  title="Reconnect"
                  onClick={() => reconnectMut.mutate(srv.id)}
                  disabled={reconnectMut.isPending}
                  className="p-1.5 text-text-xmuted hover:text-primary rounded-sm hover:bg-primary-light transition-colors"
                >
                  <RefreshCw size={13} />
                </button>
                <button
                  title="Edit"
                  onClick={() => setModalServer(srv)}
                  className="p-1.5 text-text-xmuted hover:text-text-dark rounded-sm hover:bg-card-hover transition-colors"
                >
                  <Pencil size={13} />
                </button>
                <button
                  title="Delete"
                  onClick={async () => {
                    const confirmed = await appConfirm(`Remove "${srv.name}"? This cannot be undone.`, { danger: true, okLabel: 'Remove' })
                    if (confirmed) deleteMut.mutate(srv.id)
                  }}
                  className="p-1.5 text-text-xmuted hover:text-danger rounded-sm hover:bg-danger-light transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {modalServer !== null && (
        <McpServerModal
          initial={modalServer === 'new' ? null : modalServer}
          onClose={() => setModalServer(null)}
          onSaved={() => { setModalServer(null); invalidate() }}
        />
      )}
    </div>
  )
}

// ─── AiConfigPage ─────────────────────────────────────────────────────────────

export function AiConfigPage() {
  return (
    <div>
      <LlmProviderSection />
      <SystemPromptsSection />
      <McpServersSection />
    </div>
  )
}
