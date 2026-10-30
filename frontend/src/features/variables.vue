<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton, N8nDialog, N8nIcon, N8nInput } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Variable {
  id: number
  key: string
  value: string
}

// ─── VariablesPage ────────────────────────────────────────────────────────────

const toast = useToast()
const queryClient = useQueryClient()

/** null | 'create' | the variable being edited */
const modal = ref<'create' | Variable | null>(null)
const editing = computed<Variable | null>(() =>
  modal.value && modal.value !== 'create' ? (modal.value as Variable) : null,
)

// Shared form state, re-initialized every time the modal opens
const formKey = ref('')
const formValue = ref('')

const { data, isLoading } = useQuery({
  queryKey: ['variables'],
  queryFn: async () => {
    const r = await api.get<{ data?: Variable[] } | Variable[]>('/api/variables')
    return Array.isArray(r) ? r : r.data ?? []
  },
})

const variables = computed(() => data.value ?? [])

function openModal(item: 'create' | Variable) {
  const initial = item === 'create' ? null : item
  modal.value = item
  formKey.value = initial?.key ?? ''
  formValue.value = initial?.value ?? ''
}

function closeModal() {
  modal.value = null
}

function onModalOpenChange(open: boolean) {
  if (!open) closeModal()
}

async function deleteVariable(variable: Variable) {
  const ok = await appConfirm('Delete this variable?', { danger: true, okLabel: 'Delete' })
  if (!ok) return
  try {
    await api.delete(`/api/variables/${variable.id}`)
    toast.success('Variable deleted')
    queryClient.invalidateQueries({ queryKey: ['variables'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Delete failed')
  }
}

const saving = ref(false)

async function save() {
  const initial = editing.value
  saving.value = true
  try {
    if (initial) await api.put(`/api/variables/${initial.id}`, { key: formKey.value, value: formValue.value })
    else await api.post('/api/variables', { key: formKey.value, value: formValue.value })
    toast.success(initial ? 'Variable updated' : 'Variable created')
    closeModal()
    queryClient.invalidateQueries({ queryKey: ['variables'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <!-- Toolbar -->
    <div class="mb-5 flex items-center justify-between">
      <span class="text-xs text-text-muted">
        {{ variables.length }} variable{{ variables.length !== 1 ? 's' : '' }}
      </span>
      <N8nButton icon="plus" label="New Variable" variant="brand" size="small" @click="openModal('create')" />
    </div>

    <!-- Table -->
    <div v-if="isLoading" class="text-sm text-text-muted">Loading variables...</div>
    <div v-else-if="variables.length === 0" class="py-12 text-center text-sm text-text-muted">
      No variables defined
    </div>
    <div v-else class="overflow-hidden rounded-xl border border-border bg-card">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border bg-bg-light">
            <th class="px-4 py-2 text-left text-[12px] font-medium text-text-muted">Key</th>
            <th class="px-4 py-2 text-left text-[12px] font-medium text-text-muted">Value</th>
            <th class="text-[12px] w-20 px-4 py-2" />
          </tr>
        </thead>
        <tbody class="divide-y divide-border-light">
          <tr v-for="v in variables" :key="v.id" class="transition-colors hover:bg-card-hover">
            <td class="text-[13px] px-4 py-2.5">
              <span class="rounded bg-primary-light px-1.5 py-0.5 font-mono text-xs text-primary">
                {{ v.key }}
              </span>
            </td>
            <td class="max-w-xs truncate px-4 py-2.5 font-mono text-xs text-text-muted">
              {{ v.value }}
            </td>
            <td class="text-[13px] px-4 py-2.5">
              <div class="flex items-center justify-end gap-1">
                <button
                  title="Edit"
                  class="rounded-sm p-1.5 text-text-xmuted transition-colors hover:text-text-dark"
                  @click="openModal(v)"
                >
                  <N8nIcon icon="pencil" :size="13" />
                </button>
                <button
                  title="Delete"
                  class="rounded-sm p-1.5 text-text-xmuted transition-colors hover:text-danger"
                  @click="deleteVariable(v)"
                >
                  <N8nIcon icon="trash-2" :size="13" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal -->
    <N8nDialog
      :open="modal !== null"
      size="small"
      :header="editing ? 'Edit Variable' : 'New Variable'"
      show-close-button
      @update:open="onModalOpenChange"
    >
      <div class="flex flex-col gap-3  p-4">
        <div>
          <label class="mb-1 block text-xs font-medium text-text-muted">Key *</label>
          <N8nInput v-model="formKey" type="text" placeholder="MY_VARIABLE" class="font-mono" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-text-muted">Value *</label>
          <N8nInput v-model="formValue" type="text" placeholder="value" class="font-mono" />
        </div>
      </div>
      <!-- Footer buttons live inside the dialog default slot -->
      <div class="flex justify-end gap-2 border-t border-border px-4 py-3">
        <N8nButton label="Cancel" variant="outline" size="small" @click="closeModal" />
        <N8nButton
          :label="editing ? 'Save Changes' : 'Create Variable'"
          variant="brand"
          size="small"
          :disabled="!formKey.trim() || !formValue.trim() || saving"
          :loading="saving"
          @click="save"
        />
      </div>
    </N8nDialog>
  </div>
</template>