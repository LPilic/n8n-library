<script setup lang="ts">
// ─── InstancesTab + InstanceModal (incl. worker config) ───────────────────────
import { computed, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton, N8nCheckbox, N8nDialog, N8nIcon, N8nInput, N8nOption, N8nSelect } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'
import SettingsCard from './settings-card.vue'
import SettingsTable from './settings-table.vue'
import FieldRow from './field-row.vue'
import ActionBtns from './action-btns.vue'

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

const toast = useToast()
const qc = useQueryClient()

// 'create' opens the fresh-instance modal; an Instance opens the edit modal
const modal = ref<null | 'create' | Instance>(null)

const { data, isLoading } = useQuery({
  queryKey: ['settings-instances'],
  queryFn: () => api.get<Instance[]>('/api/instances'),
})
const instances = computed(() => data.value ?? [])

async function handleDelete(inst: Instance) {
  const ok = await appConfirm(`Delete instance "${inst.name}"?`, { danger: true, okLabel: 'Delete' })
  if (!ok) return
  try {
    await api.delete(`/api/instances/${inst.id}`)
    toast.success('Instance deleted')
    await qc.invalidateQueries({ queryKey: ['settings-instances'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Delete failed')
  }
}

function envBadgeClass(inst: Instance): string {
  return inst.environment === 'production'
    ? 'bg-danger text-white'
    : inst.environment === 'staging'
      ? 'bg-warning text-white'
      : 'bg-success text-white'
}

function envBadgeLabel(inst: Instance): string {
  return inst.environment === 'production'
    ? 'PROD'
    : inst.environment === 'staging'
      ? 'STG'
      : inst.environment === 'development'
        ? 'DEV'
        : ''
}

// ─── InstanceModal ────────────────────────────────────────────────────────────

const editingInstance = ref<Instance | null>(null)
const name = ref('')
const baseUrl = ref('')
const internalUrl = ref('')
const apiKey = ref('')
const isDefault = ref(false)
const color = ref('#22c55e')
const environment = ref('production')
const workers = ref<WorkerEntry[]>([])
const saving = ref(false)

function openModal(mod: null | 'create' | Instance) {
  modal.value = mod
  const initial = !mod || mod === 'create' ? null : mod
  editingInstance.value = initial
  name.value = initial?.name ?? ''
  baseUrl.value = initial?.base_url ?? ''
  internalUrl.value = initial?.internal_url ?? ''
  apiKey.value = ''
  isDefault.value = initial?.is_default ?? false
  color.value = initial?.color ?? '#22c55e'
  environment.value = initial?.environment ?? 'production'
  workers.value = initial?.workers ? initial.workers.map((w) => ({ ...w })) : []
}

function addWorker() {
  workers.value = [...workers.value, { name: `Worker ${workers.value.length + 1}`, url: '' }]
}
function removeWorker(i: number) {
  workers.value = workers.value.filter((_, idx) => idx !== i)
}

async function saveInstance() {
  const initial = editingInstance.value
  saving.value = true
  try {
    const body: Record<string, unknown> = {
      name: name.value,
      base_url: baseUrl.value,
      internal_url: internalUrl.value,
      is_default: isDefault.value,
      color: color.value,
      environment: environment.value,
      workers: workers.value.filter((w) => w.url.trim()),
    }
    if (apiKey.value) body.api_key = apiKey.value
    if (initial) await api.put(`/api/instances/${initial.id}`, body)
    else await api.post('/api/instances', body)
    toast.success(initial ? 'Instance updated' : 'Instance created')
    openModal(null)
    await qc.invalidateQueries({ queryKey: ['settings-instances'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <SettingsCard icon="cpu" title="n8n Instances" description="Manage your n8n environments">
    <template #action>
      <N8nButton variant="brand" size="small" @click="openModal('create')">
        <span class="flex items-center gap-1.5"><N8nIcon icon="plus" :size="12" />Add Instance</span>
      </N8nButton>
    </template>

    <p v-if="isLoading" class="text-sm text-text-muted">Loading instances...</p>
    <p v-else-if="instances.length === 0" class="py-12 text-center text-sm text-text-muted">No instances configured</p>
    <SettingsTable v-else>
      <thead>
        <tr class="border-b border-border bg-bg-light">
          <th class="px-4 py-2 text-left text-[12px] font-medium text-text-muted">Instance</th>
          <th class="px-4 py-2 text-left text-[12px] font-medium text-text-muted">Status</th>
          <th class="text-[12px] w-20 px-4 py-2" />
        </tr>
      </thead>
      <tbody class="divide-y divide-border-light">
        <tr v-for="inst in instances" :key="inst.id" class="transition-colors hover:bg-card-hover">
          <td class="text-[13px] px-4 py-2.5">
            <div class="flex items-center gap-2">
              <span
                v-if="inst.color"
                class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                :style="{ background: inst.color }"
              />
              <div>
                <div class="font-medium text-text-dark">{{ inst.name }}</div>
                <div v-if="inst.base_url" class="max-w-[250px] truncate font-mono text-[11px] text-text-muted">
                  {{ inst.base_url }}
                </div>
              </div>
            </div>
          </td>
          <td class="text-[13px] px-4 py-2.5">
            <div class="flex items-center gap-1.5">
              <span v-if="envBadgeLabel(inst)" class="rounded px-1.5 py-0.5 text-[9px] font-bold" :class="envBadgeClass(inst)">
                {{ envBadgeLabel(inst) }}
              </span>
              <span v-if="inst.is_default" class="rounded bg-primary-light px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">
                default
              </span>
            </div>
          </td>
          <td class="text-[13px] px-4 py-2.5">
            <ActionBtns @edit="openModal(inst)" @delete="handleDelete(inst)" />
          </td>
        </tr>
      </tbody>
    </SettingsTable>

    <N8nDialog
      :open="modal !== null"
      :header="editingInstance ? 'Edit Instance' : 'New Instance'"
      size="medium"
      show-close-button
      @update:open="(v: boolean) => { if (!v) openModal(null) }"
    >
      <div class="flex flex-col gap-3 ">
        <FieldRow label="Name *">
          <N8nInput v-model="name" placeholder="Production" />
        </FieldRow>
        <FieldRow label="Base URL *">
          <N8nInput v-model="baseUrl" placeholder="https://n8n.example.com" />
        </FieldRow>
        <FieldRow label="Internal URL">
          <N8nInput v-model="internalUrl" placeholder="http://n8n:5678" />
        </FieldRow>
        <FieldRow :label="editingInstance ? 'API Key (leave blank to keep)' : 'API Key'">
          <N8nInput v-model="apiKey" type="password" placeholder="n8n_api_..." />
        </FieldRow>
        <FieldRow label="Environment">
          <N8nSelect v-model="environment" :filterable="false" size="medium">
            <N8nOption value="production" label="Production" />
            <N8nOption value="staging" label="Staging" />
            <N8nOption value="development" label="Development" />
          </N8nSelect>
        </FieldRow>

        <!-- Workers -->
        <div>
          <div class="mb-2 flex items-center justify-between">
            <label class="text-[12px] font-medium text-text-muted">Workers (Queue Mode)</label>
            <button type="button" class="text-[11px] font-semibold text-primary hover:text-primary-hover" @click="addWorker">
              + Add Worker
            </button>
          </div>
          <p v-if="workers.length === 0" class="text-xs text-text-xmuted">
            No workers configured. Add worker URLs for queue mode monitoring.
          </p>
          <div v-else class="flex flex-col gap-2 ">
            <div v-for="(w, i) in workers" :key="i" class="flex items-center gap-2">
              <input
                v-model="w.name"
                type="text"
                placeholder="Worker name"
                class="min-w-0 flex-1 rounded-md border border-input-border bg-input-bg px-2 py-1.5 text-sm text-text-dark"
              />
              <input
                v-model="w.url"
                type="text"
                placeholder="http://n8n-worker:5678"
                class="min-w-0 flex-[2] rounded-md border border-input-border bg-input-bg px-2 py-1.5 text-sm text-text-dark"
              />
              <button type="button" class="shrink-0 p-1 text-danger hover:text-danger/80" @click="removeWorker(i)">
                &times;
              </button>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <FieldRow label="Color">
            <input
              v-model="color"
              type="color"
              class="h-8 w-16 cursor-pointer rounded-sm border border-input-border bg-input-bg"
            />
          </FieldRow>
          <N8nCheckbox v-model="isDefault" label="Set as default" class="mt-4" />
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <N8nButton variant="outline" size="small" label="Cancel" @click="openModal(null)" />
          <N8nButton
            variant="brand"
            size="small"
            :loading="saving"
            :disabled="!name.trim() || !baseUrl.trim()"
            :label="saving ? 'Saving...' : editingInstance ? 'Save Changes' : 'Create Instance'"
            @click="saveInstance"
          />
        </div>
      </div>
    </N8nDialog>
  </SettingsCard>
</template>