<script setup lang="ts">
// Ported from ReportIssueModal in monitoring.tsx — creates a service-desk
// ticket pre-filled with the failing execution's context, optionally appending
// the AI error analysis, then links the execution to the created ticket.
// The bespoke React overlay is replaced by N8nDialog (only a #default slot —
// footer buttons live inside the content).

import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { N8nButton, N8nDialog, N8nIcon, N8nInput, N8nOption, N8nSelect } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { markdownToHtml } from '@/lib/markdown'
import { sanitizeHtml } from '@/lib/sanitize'

const props = defineProps<{
  workflowName: string
  workflowId: string
  executionId: string
  status: string
  startedAt: string
  errorMessage: string
  failedNode: string
  aiAnalysis: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', ticketId: number): void
}>()

const { error: showError } = useToast()

/** Local equivalent of the React `esc()` helper (escapes text embedded into HTML strings). */
function escHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Evaluated once on mount exactly like the React useState initializers —
// the parent v-if remounts this component for each report flow.
const title = ref(`Workflow failed: ${props.workflowName}`)
const initialDescription = (): string => {
  let desc = `<p><strong>Failed node:</strong> ${props.failedNode}</p><p><strong>Error:</strong> ${escHtml(props.errorMessage)}</p>`
  if (props.aiAnalysis) desc += `<p><strong>AI Analysis:</strong></p>${markdownToHtml(props.aiAnalysis)}`
  return desc
}
const description = ref(initialDescription())
const priority = ref('high')
const categoryId = ref('')
const assigneeId = ref('')
const saving = ref(false)

const { data: ticketCategories } = useQuery({
  queryKey: ['ticket-categories'],
  queryFn: async () => {
    const r = await api.get<Array<{ id: number; name: string }>>('/api/ticket-categories')
    return Array.isArray(r) ? r : []
  },
})

const { data: assignableUsers } = useQuery({
  queryKey: ['assignable-users'],
  queryFn: async () => {
    const r = await api.get<Array<{ id: number; username: string }>>('/api/tickets/assignable-users')
    return Array.isArray(r) ? r : []
  },
})

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

const categoryOptions = computed(() => [
  { value: '', label: 'None' },
  ...(ticketCategories.value ?? []).map((c) => ({ value: String(c.id), label: c.name })),
])

const assigneeOptions = computed(() => [
  { value: '', label: 'Unassigned' },
  ...(assignableUsers.value ?? []).map((u) => ({ value: String(u.id), label: u.username })),
])

async function handleCreate() {
  if (!title.value.trim()) {
    showError('Title is required')
    return
  }
  saving.value = true
  try {
    const res = await api.post<{ id: number }>('/api/tickets', {
      title: title.value.trim(),
      description: description.value,
      priority: priority.value,
      ...(categoryId.value ? { category_id: Number(categoryId.value) } : {}),
      ...(assigneeId.value ? { assigned_to: Number(assigneeId.value) } : {}),
      execution_data: {
        workflow_name: props.workflowName,
        execution_id: props.executionId,
        execution_status: props.status,
        started_at: props.startedAt || null,
        failed_node: props.failedNode || null,
        error_message: props.errorMessage || null,
        ai_analysis: props.aiAnalysis || null,
      },
    })
    // Link execution to ticket (non-critical)
    try {
      await api.post(`/api/tickets/${res.id}/executions`, {
        execution_id: props.executionId,
        workflow_id: props.workflowId,
        workflow_name: props.workflowName,
        status: props.status,
      })
    } catch {
      /* non-critical */
    }
    emit('created', res.id)
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Failed to create ticket')
  } finally {
    saving.value = false
  }
}

function onDescBlur(e: Event) {
  description.value = (e.currentTarget as HTMLElement).innerHTML
}

function onOpenChange(open: boolean) {
  if (!open) emit('close')
}
</script>

<template>
  <N8nDialog
    :open="true"
    size="xlarge"
    header="Report Execution Issue"
    show-close-button
    @update:open="onOpenChange"
  >
    <div class="flex flex-col gap-4  p-1 pt-2">
      <div class="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
        <div>
          <label class="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">Title *</label>
          <N8nInput v-model="title" type="text" />
        </div>
        <div>
          <label class="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">Description</label>
          <div class="overflow-hidden rounded-md border border-input-border bg-input-bg">
            <div
              class="min-h-[150px] max-h-[300px] overflow-y-auto px-3 py-2 text-sm text-text-dark"
              contenteditable="true"
              v-html="sanitizeHtml(description)"
              @blur="onDescBlur"
            />
          </div>
        </div>

        <!-- Execution context -->
        <div class="rounded-md border border-border-light bg-bg p-3">
          <h4 class="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            <N8nIcon icon="zap" :size="11" /> Execution Context
          </h4>
          <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span class="text-text-muted">Workflow:</span><span class="text-text-dark">{{ workflowName }}</span>
            <span class="text-text-muted">Execution:</span><span class="text-text-dark">#{{ executionId }}</span>
            <span class="text-text-muted">Status:</span><span class="text-text-dark">{{ status }}</span>
            <span class="text-text-muted">Time:</span><span class="text-text-dark">{{ startedAt ? new Date(startedAt).toLocaleString() : '-' }}</span>
            <template v-if="failedNode">
              <span class="text-text-muted">Failed Node:</span><span class="text-text-dark">{{ failedNode }}</span>
            </template>
            <template v-if="errorMessage">
              <span class="text-text-muted">Error:</span><span class="truncate text-text-dark">{{ errorMessage }}</span>
            </template>
          </div>
        </div>

        <!-- Priority, Category, Assign -->
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">Priority</label>
            <N8nSelect v-model="priority" :filterable="false" size="small" class="w-full">
              <N8nOption v-for="o in PRIORITY_OPTIONS" :key="o.value" :value="o.value" :label="o.label">
                {{ o.label }}
              </N8nOption>
            </N8nSelect>
          </div>
          <div>
            <label class="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">Category</label>
            <N8nSelect v-model="categoryId" :filterable="false" size="small" class="w-full">
              <N8nOption v-for="o in categoryOptions" :key="o.value" :value="o.value" :label="o.label">
                {{ o.label }}
              </N8nOption>
            </N8nSelect>
          </div>
          <div>
            <label class="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">Assign To</label>
            <N8nSelect v-model="assigneeId" :filterable="false" size="small" class="w-full">
              <N8nOption v-for="o in assigneeOptions" :key="o.value" :value="o.value" :label="o.label">
                {{ o.label }}
              </N8nOption>
            </N8nSelect>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-2 border-t border-border pt-3">
        <N8nButton label="Cancel" variant="outline" size="small" @click="emit('close')" />
        <N8nButton
          variant="brand"
          size="small"
          :disabled="saving"
          :label="saving ? 'Creating...' : 'Create Ticket'"
          @click="handleCreate"
        />
      </div>
    </div>
  </N8nDialog>
</template>