<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  N8nBadge,
  N8nButton,
  N8nCheckbox,
  N8nDialog,
  N8nIcon,
  N8nInput,
  N8nOption,
  N8nSelect,
} from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'
import type { BadgeVariant } from '@n8n/design-system'

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

const toast = useToast()
const queryClient = useQueryClient()

/** null | 'create' | the alert being edited */
const modal = ref<'create' | Alert | null>(null)
const editing = computed<Alert | null>(() =>
  modal.value && modal.value !== 'create' ? (modal.value as Alert) : null,
)

// Shared form state, re-initialized every time the modal opens (mirrors the
// freshly-mounted React modal)
const form = reactive<AlertForm>({ ...EMPTY_FORM })

const { data, isLoading } = useQuery({
  queryKey: ['alerts'],
  queryFn: () => api.get<AlertsResponse>('/api/alerts'),
})

const alerts = computed(() => data.value?.alerts ?? [])
const conditions = computed(() => data.value?.conditions ?? {})

const conditionOptions = computed(() => [
  { value: '', label: 'Select condition...' },
  ...Object.entries(conditions.value).map(([key, label]) => ({ value: key, label: String(label) })),
])

function openModal(item: 'create' | Alert) {
  const initial = item === 'create' ? null : item
  modal.value = item
  form.name = initial?.name ?? ''
  form.condition = initial?.condition ?? ''
  form.threshold = initial && initial.threshold != null ? String(initial.threshold) : ''
  form.recipients = initial
    ? initial.recipients
        .map((r) =>
          typeof r === 'object' && r !== null ? (('email' in r ? r.email : r.name) || '') : String(r),
        )
        .join(', ')
    : ''
  form.enabled = initial?.enabled ?? true
}

function closeModal() {
  modal.value = null
}

function onModalOpenChange(open: boolean) {
  if (!open) closeModal()
}

async function toggleAlert(alert: Alert) {
  try {
    await api.put(`/api/alerts/${alert.id}`, { enabled: !alert.enabled })
    queryClient.invalidateQueries({ queryKey: ['alerts'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Update failed')
  }
}

async function deleteAlert(alert: Alert) {
  const ok = await appConfirm('Delete this alert?', { danger: true, okLabel: 'Delete' })
  if (!ok) return
  try {
    await api.delete(`/api/alerts/${alert.id}`)
    toast.success('Alert deleted')
    queryClient.invalidateQueries({ queryKey: ['alerts'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Delete failed')
  }
}

const saving = ref(false)

async function save() {
  const initial = editing.value
  const body = {
    name: form.name,
    condition: form.condition,
    threshold: form.threshold ? Number(form.threshold) : undefined,
    recipients: form.recipients.split(',').map((s) => s.trim()).filter(Boolean),
    enabled: form.enabled,
  }
  saving.value = true
  try {
    if (initial) await api.put(`/api/alerts/${initial.id}`, body)
    else await api.post('/api/alerts', body)
    toast.success(initial ? 'Alert updated' : 'Alert created')
    closeModal()
    queryClient.invalidateQueries({ queryKey: ['alerts'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    saving.value = false
  }
}

function recipientLabel(r: Alert['recipients'][number]): string {
  if (r && typeof r === 'object' && 'email' in r) return (r as { email: string }).email
  if (r && typeof r === 'object' && 'name' in r) return (r as { name: string }).name
  return String(r)
}
</script>

<template>
  <div>
    <!-- Toolbar -->
    <div class="mb-5 flex items-center justify-between">
      <span class="text-xs text-text-muted">
        {{ alerts.length }} alert{{ alerts.length !== 1 ? 's' : '' }}
      </span>
      <N8nButton icon="plus" label="New Alert" variant="brand" size="small" @click="openModal('create')" />
    </div>

    <!-- List -->
    <div v-if="isLoading" class="text-sm text-text-muted">Loading alerts...</div>
    <div v-else-if="alerts.length === 0" class="py-12 text-center text-sm text-text-muted">
      No alerts configured
    </div>
    <div v-else class="space-y-4">
      <div
        v-for="alert in alerts"
        :key="alert.id"
        class="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
      >
        <div class="mt-0.5">
          <N8nIcon
            :icon="alert.enabled ? 'bell' : 'bell-off'"
            :size="14"
            :class="alert.enabled ? 'text-primary' : 'text-text-xmuted'"
          />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-medium text-text-dark">{{ alert.name }}</span>
            <N8nBadge :variant="(alert.enabled ? 'success' : 'subtle') as BadgeVariant" size="xsmall">
              {{ alert.enabled ? 'Enabled' : 'Disabled' }}
            </N8nBadge>
          </div>
          <div class="mt-0.5 text-xs text-text-muted">
            <span class="font-medium">{{ conditions[alert.condition] || alert.condition }}</span>
            <span v-if="alert.threshold != null" class="ml-1">threshold: {{ alert.threshold }}</span>
          </div>
          <div v-if="alert.recipients.length > 0" class="mt-0.5 truncate text-xs text-text-xmuted">
            {{ alert.recipients.map((r) => recipientLabel(r)).join(', ') }}
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <button
            :title="alert.enabled ? 'Disable' : 'Enable'"
            class="rounded-sm p-1.5 text-text-xmuted transition-colors hover:text-primary"
            @click="toggleAlert(alert)"
          >
            <N8nIcon :icon="alert.enabled ? 'bell-off' : 'bell'" :size="13" />
          </button>
          <button
            title="Edit"
            class="rounded-sm p-1.5 text-text-xmuted transition-colors hover:text-text-dark"
            @click="openModal(alert)"
          >
            <N8nIcon icon="pencil" :size="13" />
          </button>
          <button
            title="Delete"
            class="rounded-sm p-1.5 text-text-xmuted transition-colors hover:text-danger"
            @click="deleteAlert(alert)"
          >
            <N8nIcon icon="trash-2" :size="13" />
          </button>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <N8nDialog
      :open="modal !== null"
      size="medium"
      :header="editing ? 'Edit Alert' : 'New Alert'"
      show-close-button
      @update:open="onModalOpenChange"
    >
      <div class="space-y-3 p-4">
        <div>
          <label class="mb-1 block text-xs font-medium text-text-muted">Name *</label>
          <N8nInput
            v-model="form.name"
            type="text"
            placeholder="e.g. High failure rate"
          />
        </div>
        <div class="flex gap-2">
          <div class="flex-1">
            <label class="mb-1 block text-xs font-medium text-text-muted">Condition *</label>
            <N8nSelect
              v-model="form.condition"
              :filterable="false"
              placeholder="Select condition..."
              class="w-full"
            >
              <N8nOption v-for="o in conditionOptions" :key="o.value" :value="o.value" :label="o.label" />
            </N8nSelect>
          </div>
          <div class="w-28">
            <label class="mb-1 block text-xs font-medium text-text-muted">Threshold</label>
            <N8nInput v-model="form.threshold" type="number" placeholder="e.g. 5" />
          </div>
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-text-muted">Email Recipients</label>
          <N8nInput
            v-model="form.recipients"
            type="text"
            placeholder="user@example.com, another@example.com"
          />
          <p class="mt-0.5 text-[10px] text-text-xmuted">Comma-separated email addresses</p>
        </div>
        <N8nCheckbox v-model="form.enabled" label="Enabled" />
      </div>
      <!-- Footer buttons live inside the dialog default slot -->
      <div class="flex justify-end gap-2 border-t border-border px-4 py-3">
        <N8nButton label="Cancel" variant="outline" size="small" @click="closeModal" />
        <N8nButton
          :label="editing ? 'Save Changes' : 'Create Alert'"
          variant="brand"
          size="small"
          :disabled="!form.name.trim() || !form.condition || saving"
          :loading="saving"
          @click="save"
        />
      </div>
    </N8nDialog>
  </div>
</template>