<script setup lang="ts">
// ─── ApiKeysTab + ApiKeyModal ─────────────────────────────────────────────────
import { computed, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton, N8nDialog, N8nIcon, N8nInput, N8nOption, N8nSelect } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'
import { timeAgo } from '@/lib/utils'
import SettingsCard from './settings-card.vue'
import SettingsTable from './settings-table.vue'
import FieldRow from './field-row.vue'

interface ApiKey {
  id: number
  name: string
  key_prefix: string
  role: string
  last_used_at?: string
  expires_at?: string
  created_at: string
}

const toast = useToast()
const qc = useQueryClient()

const showCreate = ref(false)
const newKey = ref<string | null>(null)
const copied = ref(false)

const { data, isLoading } = useQuery({
  queryKey: ['settings-api-keys'],
  queryFn: async () => {
    const r = await api.get<{ keys: ApiKey[] }>('/api/api-keys')
    return r.keys ?? []
  },
})
const keys = computed(() => data.value ?? [])

async function handleDelete(k: ApiKey) {
  const ok = await appConfirm(`Revoke API key "${k.name}"? This cannot be undone.`, { danger: true, okLabel: 'Revoke' })
  if (!ok) return
  try {
    await api.delete(`/api/api-keys/${k.id}`)
    toast.success('API key revoked')
    await qc.invalidateQueries({ queryKey: ['settings-api-keys'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Revoke failed')
  }
}

function copyKey() {
  if (!newKey.value) return
  navigator.clipboard.writeText(newKey.value).then(() => {
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  })
}

// ─── ApiKeyModal ──────────────────────────────────────────────────────────────

const name = ref('')
const role = ref('viewer')
const expiresIn = ref('')
const saving = ref(false)

function openCreate() {
  name.value = ''
  role.value = 'viewer'
  expiresIn.value = ''
  showCreate.value = true
}

async function createKey() {
  saving.value = true
  try {
    const body: Record<string, unknown> = { name: name.value, role: role.value }
    if (expiresIn.value) body.expires_in_days = Number(expiresIn.value)
    const created = await api.post<ApiKey & { key: string }>('/api/api-keys', body)
    showCreate.value = false
    newKey.value = created.key
    await qc.invalidateQueries({ queryKey: ['settings-api-keys'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Create failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <SettingsCard icon="key" title="API Keys" description="Generate keys for programmatic API access">
    <template #action>
      <N8nButton variant="brand" size="small" @click="openCreate">
        <span class="flex items-center gap-1.5"><N8nIcon icon="plus" :size="12" />New Key</span>
      </N8nButton>
    </template>

    <!-- One-time key reveal -->
    <div v-if="newKey" class="mb-4 rounded-xl border border-primary/30 bg-primary-light p-4">
      <p class="mb-1 text-xs font-medium text-primary">API key created — copy it now, it won't be shown again.</p>
      <div class="flex items-center gap-2">
        <code class="flex-1 truncate rounded-sm border border-border bg-card px-2 py-1.5 font-mono text-xs text-text-dark">
          {{ newKey }}
        </code>
        <button
          type="button"
          class="shrink-0 rounded-sm border border-border bg-card p-1.5 text-text-muted transition-colors hover:text-text-dark"
          title="Copy"
          @click="copyKey"
        >
          <N8nIcon v-if="copied" icon="check" :size="13" class="text-success" />
          <N8nIcon v-else icon="copy" :size="13" />
        </button>
      </div>
      <button
        type="button"
        class="mt-2 text-xs text-text-xmuted underline hover:text-text-muted"
        @click="newKey = null"
      >
        Dismiss
      </button>
    </div>

    <p v-if="isLoading" class="text-sm text-text-muted">Loading API keys...</p>
    <p v-else-if="keys.length === 0" class="py-12 text-center text-sm text-text-muted">No API keys yet</p>
    <SettingsTable v-else>
      <thead>
        <tr class="border-b border-border bg-bg-light">
          <th class="px-4 py-2 text-left text-[12px] font-medium text-text-muted">Name</th>
          <th class="px-4 py-2 text-left text-[12px] font-medium text-text-muted">Prefix</th>
          <th class="px-4 py-2 text-left text-[12px] font-medium text-text-muted">Role</th>
          <th class="px-4 py-2 text-left text-[12px] font-medium text-text-muted">Last Used</th>
          <th class="px-4 py-2 text-left text-[12px] font-medium text-text-muted">Expires</th>
          <th class="w-16 px-4 py-2" />
        </tr>
      </thead>
      <tbody class="divide-y divide-border-light">
        <tr v-for="k in keys" :key="k.id" class="transition-colors hover:bg-card-hover">
          <td class="px-4 py-2.5 font-medium text-text-dark">{{ k.name }}</td>
          <td class="px-4 py-2.5 font-mono text-xs text-text-muted">{{ k.key_prefix }}…</td>
          <td class="px-4 py-2.5">
            <span class="rounded bg-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase text-text-muted">{{ k.role }}</span>
          </td>
          <td class="px-4 py-2.5 text-xs text-text-muted">{{ k.last_used_at ? timeAgo(k.last_used_at) : 'Never' }}</td>
          <td class="px-4 py-2.5 text-xs text-text-muted">{{ k.expires_at ? timeAgo(k.expires_at) : '—' }}</td>
          <td class="px-4 py-2.5">
            <div class="flex justify-end">
              <button
                type="button"
                class="rounded-sm p-1.5 text-text-xmuted transition-colors hover:text-danger"
                title="Revoke"
                @click="handleDelete(k)"
              >
                <N8nIcon icon="trash-2" :size="13" />
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </SettingsTable>

    <N8nDialog
      :open="showCreate"
      header="New API Key"
      size="small"
      show-close-button
      @update:open="(v: boolean) => { if (!v) showCreate = false }"
    >
      <div class="flex flex-col gap-3 ">
        <FieldRow label="Name *">
          <N8nInput v-model="name" placeholder="My integration" />
        </FieldRow>
        <FieldRow label="Role">
          <N8nSelect v-model="role" :filterable="false" size="medium">
            <N8nOption value="viewer" label="Viewer" />
            <N8nOption value="editor" label="Editor" />
            <N8nOption value="admin" label="Admin" />
          </N8nSelect>
        </FieldRow>
        <FieldRow label="Expires in (days, blank = never)">
          <N8nInput v-model="expiresIn" type="number" placeholder="90" />
        </FieldRow>
        <div class="flex justify-end gap-2 pt-2">
          <N8nButton variant="outline" size="small" label="Cancel" @click="showCreate = false" />
          <N8nButton
            variant="brand"
            size="small"
            :loading="saving"
            :disabled="!name.trim()"
            :label="saving ? 'Creating...' : 'Create Key'"
            @click="createKey"
          />
        </div>
      </div>
    </N8nDialog>
  </SettingsCard>
</template>