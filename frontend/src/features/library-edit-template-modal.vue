<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { N8nButton, N8nHeading, N8nInput } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import N8nDemoPreview from '@/components/N8nDemoPreview.vue'
import DocsModal from '@/components/DocsModal.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'

interface TemplateNode {
  type?: string
  name?: string
  displayName?: string
  group?: string
  position?: number[]
  iconData?: { type?: string; fileBuffer?: string; icon?: string }
  icon?: string
}

interface Template {
  id: number
  name: string
  description?: string
  nodes?: TemplateNode[]
  categories?: Array<{ id: number; name: string }>
  createdAt?: string
}

interface Category {
  id: number
  name: string
  icon?: string
  description?: string
}

interface WorkflowData {
  nodes: unknown[]
  connections: unknown
  settings?: unknown
  pinData?: unknown
}

const props = defineProps<{
  templateId: number
  allCategories: Category[]
  aiEnabled: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const toast = useToast()
const showDocs = ref(false)

// Fetch template metadata
const { data: tplData, isLoading: metaLoading } = useQuery({
  queryKey: ['template-meta', () => props.templateId],
  queryFn: () => api.get<{ workflow: Template }>(`/templates/workflows/${props.templateId}`),
})

// Fetch full workflow JSON for the n8n-demo preview
const { data: wfData } = useQuery({
  queryKey: ['template-workflow', () => props.templateId],
  queryFn: () => api.get<{ workflow: WorkflowData }>(`/workflows/templates/${props.templateId}`),
})

const template = computed(() => tplData.value?.workflow)
const workflow = computed(() => wfData.value?.workflow)

const name = ref<string | null>(null)
const description = ref<string | null>(null)
const selectedCategoryIds = ref<number[] | null>(null)
const saving = ref(false)

// Initialize the form once template metadata arrives (React set state during render)
watch(
  template,
  (t) => {
    if (t && name.value === null) {
      name.value = t.name
      description.value = t.description ?? ''
      selectedCategoryIds.value = (t.categories ?? []).map((c) => c.id)
    }
  },
  { immediate: true },
)

function toggleCategory(id: number) {
  const prev = selectedCategoryIds.value
  selectedCategoryIds.value =
    prev == null ? [id] : prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
}

async function handleSave() {
  if (!name.value?.trim()) {
    toast.error('Name is required')
    return
  }
  saving.value = true
  try {
    await api.put(`/api/templates/${props.templateId}`, {
      name: name.value.trim(),
      description: description.value ?? '',
      categories: selectedCategoryIds.value ?? [],
    })
    toast.success('Template updated')
    emit('saved')
    emit('close')
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-[120] flex items-center justify-center bg-black/30">
    <div
      class="mx-4 flex flex-col overflow-hidden rounded-xl border border-border bg-bg-light shadow-lg"
      :style="{ width: '90vw', maxWidth: '1100px', maxHeight: '90vh' }"
    >
      <!-- Header -->
      <div class="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
        <N8nHeading size="medium" tag="h3">Edit Template #{{ templateId }}</N8nHeading>
        <div class="flex items-center gap-2">
          <N8nButton
            v-if="aiEnabled && workflow"
            variant="outline"
            size="small"
            icon="sparkles"
            label="Generate Docs"
            @click="showDocs = true"
          />
          <N8nButton variant="outline" size="small" label="Cancel" @click="emit('close')" />
          <N8nButton
            variant="brand"
            size="small"
            :label="saving ? 'Saving...' : 'Save'"
            :disabled="saving || metaLoading || name === null"
            @click="handleSave"
          />
        </div>
      </div>

      <div class="flex-1 overflow-y-auto">
        <!-- n8n-demo workflow preview -->
        <div v-if="workflow" :style="{ height: '350px', overflow: 'hidden', position: 'relative' }">
          <N8nDemoPreview
            :workflow="{ nodes: workflow.nodes || [], connections: workflow.connections || {} }"
            min-height="350px"
          />
        </div>

        <!-- Form fields -->
        <div class="flex flex-col gap-4  px-6 py-4">
          <p v-if="metaLoading || name === null" class="text-sm text-text-muted">Loading template...</p>
          <template v-else>
            <div>
              <label class="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">Name</label>
              <N8nInput v-model="name" type="text" />
            </div>
            <div>
              <label class="block text-[12px] font-semibold uppercase tracking-wide text-text-muted">Description</label>
              <RichTextEditor
                :content="description ?? ''"
                placeholder="Template description..."
                @change="(html) => (description = html)"
              />
            </div>
            <div v-if="allCategories.length > 0">
              <label class="mb-2 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">Categories</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="c in allCategories"
                  :key="c.id"
                  type="button"
                  class="rounded-md border px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide transition-colors"
                  :class="(selectedCategoryIds ?? []).includes(c.id)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-bg-light text-text-muted hover:border-text-muted'"
                  @click="toggleCategory(c.id)"
                >
                  {{ c.name }}
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>

  <!-- Docs modal triggered from edit -->
  <DocsModal
    v-if="showDocs && workflow"
    :workflow-name="name || `Template #${props.templateId}`"
    :nodes="(workflow.nodes as unknown[]) || []"
    :connections="workflow.connections"
    @close="showDocs = false"
  />
</template>