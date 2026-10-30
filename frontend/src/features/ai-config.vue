<script setup lang="ts">
// Port of src/features/ai-config.tsx — admin AI settings page.
// Sections: LLM Provider, System Prompts, MCP Servers (+ add/edit modal).
import { ref, computed, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton, N8nCard, N8nHeading, N8nIcon, N8nSpinner } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'
import { cn } from '@/lib/utils'
import CustomSelect from '@/components/CustomSelect.vue'

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

const { success: showSuccess, error: showError } = useToast()
const queryClient = useQueryClient()

const inputCls = 'w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus'
const labelCls = 'block text-xs font-medium text-text-muted mb-1'

// ─── Section 1: LLM Provider ──────────────────────────────────────────────────

const { data: settingsData, isLoading: settingsLoading } = useQuery({
  queryKey: ['ai-settings'],
  queryFn: () => api.get<AiSettings>('/api/settings/ai'),
})

const provider = ref('')
const apiKey = ref('')
const model = ref('')
const baseUrl = ref('')
const summaryHour = ref('')
const models = ref<string[]>([])
const settingsSynced = ref(false)

// Sync state from fetched settings once
watch(
  () => settingsData.value,
  (settings) => {
    if (settings && !settingsSynced.value) {
      provider.value = settings.ai_provider ?? 'openai'
      model.value = settings.ai_model ?? ''
      baseUrl.value = settings.ai_base_url ?? ''
      summaryHour.value = settings.daily_summary_hour != null ? String(settings.daily_summary_hour) : ''
      settingsSynced.value = true
    }
  },
  { immediate: true },
)

const fetchModelsPending = ref(false)

async function fetchModels() {
  fetchModelsPending.value = true
  try {
    const data = await api.post<{ models: string[] }>('/api/ai/models', {})
    models.value = data.models ?? []
    showSuccess(`Fetched ${data.models?.length ?? 0} models`)
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Failed to fetch models')
  } finally {
    fetchModelsPending.value = false
  }
}

const settingsSavePending = ref(false)

async function saveSettings() {
  settingsSavePending.value = true
  try {
    await api.put('/api/settings/ai', {
      provider: provider.value,
      api_key: apiKey.value || undefined,
      model: model.value,
      base_url: baseUrl.value || undefined,
      daily_summary_hour: summaryHour.value !== '' ? Number(summaryHour.value) : null,
    })
    showSuccess('AI settings saved')
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    settingsSavePending.value = false
  }
}

// ─── Section 2: System Prompts ────────────────────────────────────────────────

const PROMPT_FIELDS: { key: keyof AiPrompts; label: string }[] = [
  { key: 'ai_prompt_describe', label: 'Workflow Description' },
  { key: 'ai_prompt_document', label: 'Workflow Documentation' },
  { key: 'ai_prompt_error', label: 'Error Analysis' },
  { key: 'ai_prompt_summary', label: 'Daily Summary' },
]

const { data: promptsData, isLoading: promptsLoading } = useQuery({
  queryKey: ['ai-prompts'],
  queryFn: () => api.get<AiPrompts>('/api/settings/ai-prompts'),
})

const prompts = ref<Partial<AiPrompts>>({})
const promptsSynced = ref(false)

watch(
  () => promptsData.value,
  (data) => {
    if (data && !promptsSynced.value) {
      prompts.value = { ...data }
      promptsSynced.value = true
    }
  },
  { immediate: true },
)

function setPrompt(key: keyof AiPrompts, value: string) {
  prompts.value = { ...prompts.value, [key]: value } as Partial<AiPrompts>
}

const resetPending = ref(false)

async function resetPrompt(key: keyof AiPrompts) {
  resetPending.value = true
  try {
    const data = await api.delete<{ value: string }>(`/api/settings/ai-prompts/${key}`)
    prompts.value = { ...prompts.value, [key]: (data as { value: string }).value ?? '' } as Partial<AiPrompts>
    queryClient.invalidateQueries({ queryKey: ['ai-prompts'] })
    showSuccess('Prompt reset to default')
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Reset failed')
  } finally {
    resetPending.value = false
  }
}

async function confirmResetPrompt(key: keyof AiPrompts, label: string) {
  const confirmed = await appConfirm(`Reset the "${label}" prompt to its built-in default?`, { okLabel: 'Reset' })
  if (confirmed) void resetPrompt(key)
}

const promptsSavePending = ref(false)

async function savePrompts() {
  promptsSavePending.value = true
  try {
    await api.put('/api/settings/ai-prompts', prompts.value)
    showSuccess('Prompts saved')
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    promptsSavePending.value = false
  }
}

// ─── Section 3: MCP Servers ───────────────────────────────────────────────────

const { data: serversData, isLoading: serversLoading } = useQuery({
  queryKey: ['mcp-servers'],
  queryFn: () => api.get<{ servers: McpServer[] }>('/api/mcp/servers'),
})

const servers = computed(() => serversData.value?.servers ?? [])

const invalidateServers = () => queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })

// 'new' = creation modal, McpServer = edit modal
const modalServer = ref<McpServer | 'new' | null>(null)
const mcpForm = ref<McpFormState>({ ...DEFAULT_MCP_FORM })
const saveServerPending = ref(false)

const isEditing = computed(() => modalServer.value !== null && modalServer.value !== 'new')

function openServerModal(srv: McpServer | 'new') {
  const initial = srv === 'new' ? null : srv
  mcpForm.value = initial
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
    : { ...DEFAULT_MCP_FORM }
  modalServer.value = srv
}

async function saveServer() {
  const initial = modalServer.value === 'new' ? null : modalServer.value
  saveServerPending.value = true
  try {
    const form = mcpForm.value
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
    if (initial) {
      await api.put(`/api/mcp/servers/${initial.id}`, payload)
    } else {
      await api.post('/api/mcp/servers', payload)
    }
    showSuccess(initial ? 'MCP server updated' : 'MCP server added')
    modalServer.value = null
    invalidateServers()
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    saveServerPending.value = false
  }
}

async function removeServer(id: number) {
  try {
    await api.delete(`/api/mcp/servers/${id}`)
    showSuccess('MCP server removed')
    invalidateServers()
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Delete failed')
  }
}

async function confirmRemoveServer(server: McpServer) {
  const confirmed = await appConfirm(`Remove "${server.name}"? This cannot be undone.`, { danger: true, okLabel: 'Remove' })
  if (confirmed) void removeServer(server.id)
}

const reconnectPending = ref(false)

async function reconnectServer(id: number) {
  reconnectPending.value = true
  try {
    await api.post(`/api/mcp/servers/${id}/reconnect`, {})
    showSuccess('Reconnecting...')
    invalidateServers()
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Reconnect failed')
  } finally {
    reconnectPending.value = false
  }
}

// MCP status badge helpers (McpStatusBadge in the React version)
function mcpBadgeClass(srv: McpServer): string {
  return cn(
    'inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-medium',
    srv.status === 'connected' ? 'bg-success-light text-success' : 'bg-danger-light text-danger',
  )
}
function mcpDotClass(srv: McpServer): string {
  return cn('w-1.5 h-1.5 rounded-full', srv.status === 'connected' ? 'bg-success' : 'bg-danger')
}
function mcpStatusLabel(srv: McpServer): string {
  const connected = srv.status === 'connected'
  return connected
    ? `connected${srv.toolCount != null ? ` (${srv.toolCount} tools)` : ''}`
    : `error${srv.error ? `: ${srv.error}` : ''}`
}
function serverSubtitle(srv: McpServer): string {
  return srv.type === 'http' ? (srv.url ?? '') : `${srv.type ?? 'stdio'} — ${srv.command}`
}
</script>

<template>
  <div>
    <!-- Section 1: LLM Provider -->
    <N8nCard class="mb-6">
      <template #header>
        <div class="flex w-full items-center gap-3 mb-5">
          <span class="flex shrink-0 items-center justify-center w-8 h-8 rounded-full bg-primary-light text-primary">
            <N8nIcon icon="sparkles" :size="16" />
          </span>
          <div>
            <N8nHeading size="medium" tag="h2">LLM Provider</N8nHeading>
            <p class="text-xs text-text-muted">Configure your AI provider, model, and API credentials</p>
          </div>
        </div>
      </template>

      <div v-if="settingsLoading" class="flex items-center gap-2 text-sm text-text-muted">
        <N8nSpinner /> Loading settings...
      </div>
      <div v-else class="flex flex-col gap-4  max-w-lg">
        <!-- Provider -->
        <div>
          <label :class="labelCls">Provider</label>
          <CustomSelect
            :value="provider"
            :options="[
              { value: 'anthropic', label: 'Anthropic Claude' },
              { value: 'openai', label: 'OpenAI' },
              { value: 'ollama', label: 'Ollama' },
              { value: 'openai-compatible', label: 'OpenAI Compatible' },
            ]"
            class="w-full"
            @change="(v) => (provider = v)"
          />
        </div>

        <!-- API Key -->
        <div>
          <label :class="labelCls">API Key</label>
          <input
            v-model="apiKey"
            type="password"
            :placeholder="settingsData?.ai_api_key_set ? settingsData?.ai_api_key_masked || '••••••••••••' : 'Enter API key...'"
            :class="inputCls"
          />
          <p v-if="settingsData?.ai_api_key_set" class="text-[11px] text-text-xmuted mt-0.5">Leave blank to keep existing key</p>
        </div>

        <!-- Base URL -->
        <div>
          <label :class="labelCls">Base URL</label>
          <input
            v-model="baseUrl"
            type="text"
            placeholder="https://api.openai.com/v1"
            :class="inputCls"
          />
          <p class="text-[11px] text-text-xmuted mt-0.5">
            Required for Ollama. Optional for OpenAI-compatible endpoints.
          </p>
        </div>

        <!-- Model -->
        <div>
          <label :class="labelCls">Model</label>
          <div class="flex gap-2">
            <CustomSelect
              v-if="models.length > 0"
              :value="model"
              placeholder="Select model..."
              :options="[{ value: '', label: 'Select model...' }, ...models.map((m) => ({ value: m, label: m }))]"
              class="flex-1"
              @change="(v) => (model = v)"
            />
            <input
              v-else
              v-model="model"
              type="text"
              placeholder="gpt-4o"
              :class="cn(inputCls, 'flex-1')"
            />
            <N8nButton
              variant="outline"
              size="small"
              :disabled="fetchModelsPending"
              class="shrink-0"
              @click="fetchModels"
            >
              <N8nIcon :icon="fetchModelsPending ? 'loader-circle' : 'refresh-cw'" :size="12" :spin="fetchModelsPending" />
              Fetch Models
            </N8nButton>
          </div>
        </div>

        <!-- Daily Summary Hour -->
        <div>
          <label :class="labelCls">Daily Summary Hour (0–23)</label>
          <input
            v-model="summaryHour"
            type="number"
            min="0"
            max="23"
            placeholder="Empty = off"
            :class="cn(inputCls, 'max-w-[180px]')"
          />
          <p class="text-[11px] text-text-xmuted mt-0.5">UTC hour to send daily workflow summary. Leave empty to disable.</p>
        </div>

        <!-- Save -->
        <div class="pt-1">
          <N8nButton
            variant="brand"
            :disabled="settingsSavePending"
            :loading="settingsSavePending"
            :label="settingsSavePending ? 'Saving...' : 'Save'"
            @click="saveSettings"
          />
        </div>
      </div>
    </N8nCard>

    <!-- Section 2: System Prompts -->
    <N8nCard class="mb-6">
      <template #header>
        <div class="flex w-full items-center gap-3 mb-5">
          <span class="flex shrink-0 items-center justify-center w-8 h-8 rounded-full bg-primary-light text-primary">
            <N8nIcon icon="message-square-text" :size="16" />
          </span>
          <div>
            <N8nHeading size="medium" tag="h2">System Prompts</N8nHeading>
            <p class="text-xs text-text-muted">Customize the prompts used for each AI feature</p>
          </div>
        </div>
      </template>

      <div v-if="promptsLoading" class="flex items-center gap-2 text-sm text-text-muted">
        <N8nSpinner /> Loading prompts...
      </div>
      <div v-else class="flex flex-col gap-5 ">
        <div v-for="{ key, label } in PROMPT_FIELDS" :key="key">
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs font-medium text-text-muted">{{ label }}</label>
            <button
              class="cursor-pointer border border-input-border rounded-sm px-2 py-0.5 text-[11px] text-text-xmuted transition-colors hover:bg-card-hover hover:text-text-muted disabled:opacity-50"
              :disabled="resetPending"
              @click="confirmResetPrompt(key, label)"
            >
              Reset to Default
            </button>
          </div>
          <textarea
            :value="(prompts[key] as string | undefined) ?? ''"
            rows="5"
            class="w-full px-3 py-2 border border-input-border rounded-sm bg-input-bg text-xs text-text-dark font-mono resize-y focus:outline-none focus:border-input-focus"
            @input="setPrompt(key, String(($event.target as HTMLTextAreaElement).value))"
          />
        </div>

        <div class="pt-1">
          <N8nButton
            variant="brand"
            :disabled="promptsSavePending"
            :loading="promptsSavePending"
            :label="promptsSavePending ? 'Saving...' : 'Save Prompts'"
            @click="savePrompts"
          />
        </div>
      </div>
    </N8nCard>

    <!-- Section 3: MCP Servers -->
    <N8nCard class="mb-6">
      <template #header>
        <div class="flex w-full items-center justify-between gap-3 mb-5">
          <div class="flex items-center gap-3">
            <span class="flex shrink-0 items-center justify-center w-8 h-8 rounded-full bg-primary-light text-primary">
              <N8nIcon icon="server" :size="16" />
            </span>
            <div>
              <N8nHeading size="medium" tag="h2">MCP Servers</N8nHeading>
              <p class="text-xs text-text-muted">Connect Model Context Protocol servers to extend AI capabilities</p>
            </div>
          </div>
          <N8nButton
            variant="brand"
            size="small"
            icon="plus"
            label="Add MCP Server"
            class="shrink-0"
            @click="openServerModal('new')"
          />
        </div>
      </template>

      <div v-if="serversLoading" class="flex items-center gap-2 text-sm text-text-muted">
        <N8nSpinner /> Loading servers...
      </div>
      <div v-else-if="servers.length === 0" class="text-center border border-dashed border-border rounded-xl py-10">
        <N8nIcon icon="server" :size="24" class="mx-auto mb-2 text-text-xmuted" />
        <p class="text-sm text-text-muted">No MCP servers configured</p>
        <p class="text-xs text-text-xmuted mt-0.5">Add a server to enable tool use in AI features</p>
      </div>
      <div v-else class="border border-border rounded-xl overflow-hidden divide-y divide-border-light">
        <div v-for="srv in servers" :key="srv.id" class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-card-hover">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-text-dark truncate">{{ srv.name }}</p>
            <p class="text-xs text-text-xmuted truncate mt-0.5">{{ serverSubtitle(srv) }}</p>
          </div>
          <span :class="mcpBadgeClass(srv)">
            <span :class="mcpDotClass(srv)" />
            {{ mcpStatusLabel(srv) }}
          </span>
          <div class="flex shrink-0 items-center gap-1">
            <button
              title="Reconnect"
              :disabled="reconnectPending"
              class="cursor-pointer p-1.5 rounded-sm text-text-xmuted transition-colors hover:bg-primary-light hover:text-primary"
              @click="reconnectServer(srv.id)"
            >
              <N8nIcon icon="refresh-cw" :size="13" />
            </button>
            <button
              title="Edit"
              class="cursor-pointer p-1.5 rounded-sm text-text-xmuted transition-colors hover:bg-card-hover hover:text-text-dark"
              @click="openServerModal(srv)"
            >
              <N8nIcon icon="pencil" :size="13" />
            </button>
            <button
              title="Delete"
              class="cursor-pointer p-1.5 rounded-sm text-text-xmuted transition-colors hover:bg-danger-light hover:text-danger"
              @click="confirmRemoveServer(srv)"
            >
              <N8nIcon icon="trash-2" :size="13" />
            </button>
          </div>
        </div>
      </div>

      <!-- Add/Edit modal -->
      <div v-if="modalServer !== null" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-border bg-card shadow-lg">
          <!-- Header -->
          <div class="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <N8nHeading size="medium" tag="h3">
              {{ isEditing ? 'Edit MCP Server' : 'Add MCP Server' }}
            </N8nHeading>
            <button class="cursor-pointer text-lg leading-none text-text-xmuted hover:text-text-dark" @click="modalServer = null">&times;</button>
          </div>

          <!-- Body -->
          <div class=" flex-1 overflow-y-auto p-4">
            <!-- Name -->
            <div>
              <label class="mb-1 block text-xs font-medium text-text-muted">Name *</label>
              <input
                v-model="mcpForm.name"
                type="text"
                placeholder="My MCP Server"
                autofocus
                :class="inputCls"
              />
            </div>

            <!-- Transport type -->
            <div>
              <label class="mb-1 block text-xs font-medium text-text-muted">Transport Type</label>
              <CustomSelect
                :value="mcpForm.type"
                :options="[
                  { value: 'http', label: 'HTTP' },
                  { value: 'stdio', label: 'stdio' },
                ]"
                class="w-full"
                @change="(v) => (mcpForm.type = v as 'http' | 'stdio')"
              />
            </div>

            <!-- HTTP fields -->
            <template v-if="mcpForm.type === 'http'">
              <div>
                <label class="mb-1 block text-xs font-medium text-text-muted">URL *</label>
                <input
                  v-model="mcpForm.url"
                  type="text"
                  placeholder="https://mcp.example.com/sse"
                  :class="inputCls"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-text-muted">Auth Header</label>
                <input
                  v-model="mcpForm.auth_header"
                  type="text"
                  placeholder="Bearer sk-..."
                  :class="inputCls"
                />
                <p class="mt-0.5 text-[11px] text-text-xmuted">Value for the Authorization header, if required</p>
              </div>
            </template>

            <!-- stdio fields -->
            <template v-if="mcpForm.type === 'stdio'">
              <div>
                <label class="mb-1 block text-xs font-medium text-text-muted">Command *</label>
                <input
                  v-model="mcpForm.command"
                  type="text"
                  placeholder="npx"
                  :class="inputCls"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-text-muted">Args</label>
                <input
                  v-model="mcpForm.args"
                  type="text"
                  placeholder='["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]'
                  :class="inputCls"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-text-muted">Environment Variables</label>
                <textarea
                  v-model="mcpForm.env"
                  :placeholder="'KEY=VALUE\nANOTHER_KEY=VALUE'"
                  rows="4"
                  class="w-full px-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark font-mono resize-y focus:outline-none focus:border-input-focus"
                />
                <p class="mt-0.5 text-[11px] text-text-xmuted">JSON object, e.g. {"KEY": "VALUE"}</p>
              </div>
            </template>

            <!-- Enabled toggle -->
            <label class="flex cursor-pointer items-center gap-2 pt-1 text-sm text-text-dark">
              <input v-model="mcpForm.enabled" type="checkbox" class="accent-primary" />
              Enabled
            </label>
          </div>

          <!-- Footer -->
          <div class="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
            <N8nButton
              variant="outline"
              size="small"
              label="Cancel"
              @click="modalServer = null"
            />
            <N8nButton
              variant="brand"
              size="small"
              :disabled="!mcpForm.name.trim() || saveServerPending"
              :loading="saveServerPending"
              :label="saveServerPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Server'"
              @click="saveServer"
            />
          </div>
        </div>
      </div>
    </N8nCard>
  </div>
</template>