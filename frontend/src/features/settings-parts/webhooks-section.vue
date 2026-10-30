<script setup lang="ts">
// ─── WebhooksTab + WebhookModal ───────────────────────────────────────────────
import { computed, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton, N8nCheckbox, N8nDialog, N8nIcon, N8nInput } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'
import SettingsCard from './settings-card.vue'
import SettingsTable from './settings-table.vue'
import FieldRow from './field-row.vue'

interface WebhookItem {
  id: number
  name: string
  url: string
  events: string[]
  headers?: string
  secret?: string
  enabled: boolean
}

interface WebhooksResponse {
  webhooks: WebhookItem[]
  events: string[] | Record<string, string>
}

const toast = useToast()
const qc = useQueryClient()

// 'create' opens the fresh-webhook modal; a WebhookItem opens the edit modal
const modal = ref<null | 'create' | WebhookItem>(null)

const { data, isLoading } = useQuery({
  queryKey: ['settings-webhooks'],
  queryFn: () => api.get<WebhooksResponse>('/api/webhooks'),
})
const webhooks = computed(() => data.value?.webhooks ?? [])
const eventsObj = computed(() => data.value?.events ?? {})
const eventsList = computed(() =>
  Array.isArray(eventsObj.value) ? eventsObj.value : Object.keys(eventsObj.value),
)
const eventsLabels = computed<Record<string, string>>(() =>
  !Array.isArray(eventsObj.value) && typeof eventsObj.value === 'object'
    ? (eventsObj.value as Record<string, string>)
    : {},
)

async function handleDelete(w: WebhookItem) {
  const ok = await appConfirm(`Delete webhook "${w.name}"?`, { danger: true, okLabel: 'Delete' })
  if (!ok) return
  try {
    await api.delete(`/api/webhooks/${w.id}`)
    toast.success('Webhook deleted')
    await qc.invalidateQueries({ queryKey: ['settings-webhooks'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Delete failed')
  }
}

const testing = ref(false)
async function handleTest(id: number) {
  testing.value = true
  try {
    const d = await api.post<{ status: number; ok: boolean }>(`/api/webhooks/${id}/test`)
    if (d.ok) toast.success(`Test delivered (HTTP ${d.status})`)
    else toast.error(`Test failed — HTTP ${d.status}`)
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Test failed')
  } finally {
    testing.value = false
  }
}

// ─── WebhookModal ─────────────────────────────────────────────────────────────

const editingWebhook = ref<WebhookItem | null>(null)
const name = ref('')
const url = ref('')
const selectedEvents = ref<string[]>([])
const headers = ref('')
const secret = ref('')
const enabled = ref(true)
const saving = ref(false)

function openModal(mod: null | 'create' | WebhookItem) {
  modal.value = mod
  const initial = !mod || mod === 'create' ? null : mod
  editingWebhook.value = initial
  name.value = initial?.name ?? ''
  url.value = initial?.url ?? ''
  selectedEvents.value = [...(initial?.events ?? [])]
  headers.value = initial?.headers ?? ''
  secret.value = ''
  enabled.value = initial?.enabled ?? true
}

function toggleEvent(ev: string) {
  selectedEvents.value = selectedEvents.value.includes(ev)
    ? selectedEvents.value.filter((e) => e !== ev)
    : [...selectedEvents.value, ev]
}

async function saveWebhook() {
  const initial = editingWebhook.value
  saving.value = true
  try {
    const body: Record<string, unknown> = {
      name: name.value,
      url: url.value,
      events: selectedEvents.value,
      headers: headers.value,
      enabled: enabled.value,
    }
    if (secret.value) body.secret = secret.value
    if (initial) await api.put(`/api/webhooks/${initial.id}`, body)
    else await api.post('/api/webhooks', body)
    toast.success(initial ? 'Webhook updated' : 'Webhook created')
    openModal(null)
    await qc.invalidateQueries({ queryKey: ['settings-webhooks'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <SettingsCard icon="external-link" title="Webhook Integrations" description="Send event notifications to external services">
    <template #action>
      <N8nButton variant="brand" size="small" @click="openModal('create')">
        <span class="flex items-center gap-1.5"><N8nIcon icon="plus" :size="12" />New Webhook</span>
      </N8nButton>
    </template>

    <p v-if="isLoading" class="text-sm text-text-muted">Loading webhooks...</p>
    <p v-else-if="webhooks.length === 0" class="py-12 text-center text-sm text-text-muted">No webhooks configured.</p>
    <SettingsTable v-else>
      <thead>
        <tr class="border-b border-border bg-bg-light">
          <th class="px-4 py-2 text-left text-[12px] font-medium text-text-muted">Name</th>
          <th class="px-4 py-2 text-left text-[12px] font-medium text-text-muted">URL</th>
          <th class="px-4 py-2 text-left text-[12px] font-medium text-text-muted">Events</th>
          <th class="w-32 px-4 py-2" />
        </tr>
      </thead>
      <tbody class="divide-y divide-border-light">
        <tr v-for="w in webhooks" :key="w.id" class="transition-colors hover:bg-card-hover">
          <td class="flex items-center gap-2 px-4 py-2.5 font-medium text-text-dark">
            <span class="h-2 w-2 shrink-0 rounded-full" :class="w.enabled ? 'bg-success' : 'bg-text-xmuted'" />
            {{ w.name }}
          </td>
          <td class="max-w-[220px] truncate px-4 py-2.5 font-mono text-xs text-text-muted">{{ w.url }}</td>
          <td class="px-4 py-2.5 text-xs text-text-muted">{{ w.events.length }} event{{ w.events.length !== 1 ? 's' : '' }}</td>
          <td class="px-4 py-2.5">
            <div class="flex items-center justify-end gap-1">
              <button
                type="button"
                class="rounded-sm p-1.5 text-[11px] font-medium text-text-xmuted transition-colors hover:text-primary"
                title="Test"
                :disabled="testing"
                @click="handleTest(w.id)"
              >
                Test
              </button>
              <button
                type="button"
                class="rounded-sm p-1.5 text-text-xmuted transition-colors hover:text-text-dark"
                title="Edit"
                @click="openModal(w)"
              >
                <N8nIcon icon="pencil" :size="13" />
              </button>
              <button
                type="button"
                class="rounded-sm p-1.5 text-text-xmuted transition-colors hover:text-danger"
                title="Delete"
                @click="handleDelete(w)"
              >
                <N8nIcon icon="trash-2" :size="13" />
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </SettingsTable>

    <N8nDialog
      :open="modal !== null"
      :header="editingWebhook ? 'Edit Webhook' : 'New Webhook'"
      size="medium"
      show-close-button
      @update:open="(v: boolean) => { if (!v) openModal(null) }"
    >
      <div class="flex flex-col gap-3 ">
        <FieldRow label="Name *">
          <N8nInput v-model="name" placeholder="My webhook" />
        </FieldRow>
        <FieldRow label="URL *">
          <N8nInput v-model="url" placeholder="https://example.com/hook" />
        </FieldRow>
        <div>
          <label class="mb-1.5 block text-xs font-medium text-text-muted">Events</label>
          <div class="grid max-h-40 grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto pr-1">
            <N8nCheckbox
              v-for="ev in eventsList"
              :key="ev"
              :model-value="selectedEvents.includes(ev)"
              :label="eventsLabels[ev] || ev"
              @update:model-value="toggleEvent(ev)"
            />
          </div>
        </div>
        <FieldRow label="Headers (JSON)">
          <textarea
            v-model="headers"
            rows="3"
            placeholder='{"X-Custom": "value"}'
            class="w-full resize-none rounded-sm border border-input-border bg-input-bg px-3 py-2 font-mono text-sm text-text-dark outline-none"
          />
        </FieldRow>
        <FieldRow :label="editingWebhook ? 'Secret (leave blank to keep)' : 'Secret'">
          <N8nInput v-model="secret" type="password" placeholder="••••••••" />
        </FieldRow>
        <N8nCheckbox v-model="enabled" label="Enabled" />
        <div class="flex justify-end gap-2 pt-2">
          <N8nButton variant="outline" size="small" label="Cancel" @click="openModal(null)" />
          <N8nButton
            variant="brand"
            size="small"
            :loading="saving"
            :disabled="!name.trim() || !url.trim()"
            :label="saving ? 'Saving...' : editingWebhook ? 'Save Changes' : 'Create Webhook'"
            @click="saveWebhook"
          />
        </div>
      </div>
    </N8nDialog>
  </SettingsCard>
</template>