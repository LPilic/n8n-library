<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { N8nButton, N8nDialog, N8nInput } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import CustomSelect from '@/components/CustomSelect.vue'
import { PRIORITY_OPTIONS, type TicketCategory } from './ticket-types'

// Ported from CreateTicketModal in tickets.tsx — the "New Ticket" modal.
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created'): void
}>()

const { error: showError } = useToast()

const title = ref('')
const description = ref('')
const priority = ref('medium')
const categoryId = ref('')
const creating = ref(false)

const { data: categories } = useQuery({
  queryKey: ['ticket-categories'],
  queryFn: () => api.get<TicketCategory[]>('/api/ticket-categories'),
})

const categoryOptions = computed(() => [
  { value: '', label: 'None' },
  ...(categories.value ?? []).map((c) => ({ value: String(c.id), label: c.name })),
])

const priorityOptions = PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))

async function createTicket() {
  creating.value = true
  try {
    await api.post('/api/tickets', {
      title: title.value,
      description: description.value,
      priority: priority.value,
      category_id: categoryId.value ? Number(categoryId.value) : undefined,
    })
    // Invalidation + closing happen in the parent (see TicketsPage).
    emit('created')
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Create failed')
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <N8nDialog
    :open="true"
    size="small"
    header="New Ticket"
    show-close-button
    @update:open="emit('close')"
  >
    <div class="flex flex-col gap-3 ">
      <div>
        <label class="mb-1 block text-xs font-medium text-text-muted">Title *</label>
        <N8nInput
          v-model="title"
          type="text"
          placeholder="Describe the issue..."
          class="w-full"
        />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-text-muted">Description</label>
        <textarea
          v-model="description"
          rows="3"
          placeholder="Additional details..."
          class="w-full resize-none rounded-sm border border-input-border bg-input-bg px-3 py-1.5 text-sm text-text-dark outline-none focus:border-input-focus"
        />
      </div>
      <div class="flex gap-2">
        <div class="flex-1">
          <label class="mb-1 block text-xs font-medium text-text-muted">Priority</label>
          <CustomSelect
            :value="priority"
            :options="priorityOptions"
            @change="priority = $event"
          />
        </div>
        <div class="flex-1">
          <label class="mb-1 block text-xs font-medium text-text-muted">Category</label>
          <CustomSelect
            :value="categoryId"
            :options="categoryOptions"
            @change="categoryId = $event"
          />
        </div>
      </div>
    </div>
    <div class="mt-4 flex justify-end gap-2 border-t border-border pt-3">
      <N8nButton variant="outline" size="small" label="Cancel" @click="emit('close')" />
      <N8nButton
        variant="brand"
        size="small"
        :label="creating ? 'Creating...' : 'Create Ticket'"
        :loading="creating"
        :disabled="!title.trim() || creating"
        @click="createTicket"
      />
    </div>
  </N8nDialog>
</template>