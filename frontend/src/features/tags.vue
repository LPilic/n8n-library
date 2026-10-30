<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton, N8nDialog, N8nIcon, N8nInput } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TagItem {
  id: number
  name: string
  workflow_count?: number
}

// ─── TagsPage ─────────────────────────────────────────────────────────────────

const toast = useToast()
const queryClient = useQueryClient()

/** null | 'create' | the tag being edited */
const modal = ref<'create' | TagItem | null>(null)
const editing = computed<TagItem | null>(() =>
  modal.value && modal.value !== 'create' ? (modal.value as TagItem) : null,
)

// Shared form state, re-initialized every time the modal opens
const formName = ref('')

const { data, isLoading } = useQuery({
  queryKey: ['tags'],
  queryFn: async () => {
    const r = await api.get<{ data?: TagItem[] } | TagItem[]>('/api/tags')
    return Array.isArray(r) ? r : r.data ?? []
  },
})

const tags = computed(() => data.value ?? [])

function openModal(item: 'create' | TagItem) {
  const initial = item === 'create' ? null : item
  modal.value = item
  formName.value = initial?.name ?? ''
}

function closeModal() {
  modal.value = null
}

function onModalOpenChange(open: boolean) {
  if (!open) closeModal()
}

async function deleteTag(tag: TagItem) {
  const ok = await appConfirm('Delete this tag?', { danger: true, okLabel: 'Delete' })
  if (!ok) return
  try {
    await api.delete(`/api/tags/${tag.id}`)
    toast.success('Tag deleted')
    queryClient.invalidateQueries({ queryKey: ['tags'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Delete failed')
  }
}

const saving = ref(false)

async function save() {
  const initial = editing.value
  saving.value = true
  try {
    if (initial) await api.put(`/api/tags/${initial.id}`, { name: formName.value })
    else await api.post('/api/tags', { name: formName.value })
    toast.success(initial ? 'Tag updated' : 'Tag created')
    closeModal()
    queryClient.invalidateQueries({ queryKey: ['tags'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    saving.value = false
  }
}

function onNameEnter() {
  if (formName.value.trim() && !saving.value) save()
}
</script>

<template>
  <div class="max-w-xl">
    <!-- Toolbar -->
    <div class="mb-5 flex items-center justify-between">
      <span class="text-xs text-text-muted">
        {{ tags.length }} tag{{ tags.length !== 1 ? 's' : '' }}
      </span>
      <N8nButton icon="plus" label="New Tag" variant="brand" size="small" @click="openModal('create')" />
    </div>

    <!-- Table -->
    <div v-if="isLoading" class="text-sm text-text-muted">Loading tags...</div>
    <div v-else-if="tags.length === 0" class="py-12 text-center">
      <N8nIcon icon="tags" :size="28" class="mx-auto mb-2 text-text-xmuted" />
      <p class="text-sm text-text-muted">No tags yet</p>
    </div>
    <div v-else class="overflow-hidden rounded-xl border border-border bg-card">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border bg-bg-light">
            <th class="px-4 py-2 text-left text-[12px] font-medium text-text-muted">Name</th>
            <th class="px-4 py-2 text-right text-[12px] font-medium text-text-muted">Workflows</th>
            <th class="text-[12px] w-20 px-4 py-2" />
          </tr>
        </thead>
        <tbody class="divide-y divide-border-light">
          <tr v-for="tag in tags" :key="tag.id" class="transition-colors hover:bg-card-hover">
            <td class="text-[13px] px-4 py-2.5">
              <span class="flex items-center gap-1.5">
                <N8nIcon icon="tags" :size="12" class="shrink-0 text-text-xmuted" />
                <span class="font-medium text-text-dark">{{ tag.name }}</span>
              </span>
            </td>
            <td class="px-4 py-2.5 text-right text-xs text-text-muted">
              {{ tag.workflow_count ?? 0 }}
            </td>
            <td class="text-[13px] px-4 py-2.5">
              <div class="flex items-center justify-end gap-1">
                <button
                  title="Edit"
                  class="rounded-sm p-1.5 text-text-xmuted transition-colors hover:text-text-dark"
                  @click="openModal(tag)"
                >
                  <N8nIcon icon="pencil" :size="13" />
                </button>
                <button
                  title="Delete"
                  class="rounded-sm p-1.5 text-text-xmuted transition-colors hover:text-danger"
                  @click="deleteTag(tag)"
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
      :header="editing ? 'Edit Tag' : 'New Tag'"
      show-close-button
      @update:open="onModalOpenChange"
    >
      <div class="p-4">
        <label class="mb-1 block text-xs font-medium text-text-muted">Name *</label>
        <N8nInput
          v-model="formName"
          type="text"
          placeholder="e.g. Production"
          autofocus
          @keydown.enter="onNameEnter"
        />
      </div>
      <!-- Footer buttons live inside the dialog default slot -->
      <div class="flex justify-end gap-2 border-t border-border px-4 py-3">
        <N8nButton label="Cancel" variant="outline" size="small" @click="closeModal" />
        <N8nButton
          :label="editing ? 'Save Changes' : 'Create Tag'"
          variant="brand"
          size="small"
          :disabled="!formName.trim() || saving"
          :loading="saving"
          @click="save"
        />
      </div>
    </N8nDialog>
  </div>
</template>