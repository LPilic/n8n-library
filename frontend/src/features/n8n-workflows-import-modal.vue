<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton, N8nHeading, N8nIcon, N8nInput } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { cn } from '@/lib/utils'
import N8nDemoPreview from '@/components/N8nDemoPreview.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'

interface N8nNode {
  type?: string
  name?: string
  displayName?: string
  group?: string
  position?: number[]
}

interface N8nTag {
  id: string
  name: string
}

interface N8nWorkflowFull {
  id: string
  name: string
  active: boolean
  nodes: N8nNode[]
  connections: Record<string, unknown>
  settings?: Record<string, unknown>
  pinData?: Record<string, unknown>
  updatedAt?: string
  createdAt?: string
  tags?: N8nTag[]
  ownerName?: string
  ownerProjectId?: string
}

interface Category {
  id: number
  name: string
}

const props = defineProps<{
  workflow: N8nWorkflowFull
  aiEnabled: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const toast = useToast()
const queryClient = useQueryClient()

const name = ref(props.workflow.name)
const description = ref('')
const selectedCats = ref<number[]>([])
const genNameLoading = ref(false)
const genDescLoading = ref(false)
const importing = ref(false)

const { data: categoriesData } = useQuery({
  queryKey: ['categories'],
  queryFn: () => api.get<{ categories: Category[] }>('/api/categories').then((r) => r.categories),
})
const categories = computed(() => categoriesData.value ?? [])

async function handleImport() {
  if (!name.value.trim() || importing.value) return
  importing.value = true
  try {
    await api.post('/api/templates', {
      name: name.value,
      description: description.value,
      categories: selectedCats.value,
      workflow: {
        nodes: props.workflow.nodes,
        connections: props.workflow.connections,
        settings: props.workflow.settings || {},
        pinData: props.workflow.pinData || {},
      },
    })
    toast.success('Workflow imported to library!')
    queryClient.invalidateQueries({ queryKey: ['library-templates'] })
    emit('close')
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Import failed')
  } finally {
    importing.value = false
  }
}

async function generateName() {
  genNameLoading.value = true
  try {
    const res = await api.post<{ name: string }>('/api/ai/name-workflow', {
      nodes: props.workflow.nodes,
      connections: props.workflow.connections,
    })
    if (res.name) name.value = res.name
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Name generation failed')
  } finally {
    genNameLoading.value = false
  }
}

async function generateDescription() {
  genDescLoading.value = true
  try {
    const res = await api.post<{ description: string }>('/api/ai/describe-workflow', {
      nodes: props.workflow.nodes,
      connections: props.workflow.connections,
    })
    if (res.description) description.value = res.description
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Description generation failed')
  } finally {
    genDescLoading.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-[120] flex items-center justify-center bg-black/30" @click.self="emit('close')">
    <div
      class="mx-4 flex flex-col overflow-hidden rounded-xl border border-border bg-bg-light shadow-lg"
      :style="{ width: '90vw', maxWidth: '1100px', maxHeight: '90vh' }"
    >
      <div class="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
        <N8nHeading size="medium" tag="h3">Import: {{ workflow.name }}</N8nHeading>
        <div class="flex items-center gap-2">
          <N8nButton variant="outline" size="small" label="Cancel" @click="emit('close')" />
          <N8nButton
            variant="brand"
            size="small"
            :label="importing ? 'Saving...' : 'Import'"
            :disabled="!name.trim() || importing"
            @click="handleImport"
          />
        </div>
      </div>
      <div class="flex-1 overflow-y-auto">
        <!-- n8n-demo workflow preview -->
        <div :style="{ height: '350px', overflow: 'hidden', position: 'relative' }">
          <N8nDemoPreview :workflow="{ nodes: workflow.nodes, connections: workflow.connections }" min-height="350px" />
        </div>
        <div class="flex flex-col gap-4  px-6 py-4">
          <div>
            <div class="mb-1 flex items-center justify-between">
              <label class="text-[12px] font-semibold uppercase tracking-wide text-text-muted">Name</label>
              <button
                v-if="aiEnabled"
                class="flex items-center gap-1 rounded-md border border-border bg-bg-light px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-bg disabled:opacity-50"
                :disabled="genNameLoading"
                @click="generateName"
              >
                <N8nIcon :icon="genNameLoading ? 'loader-circle' : 'sparkles'" :size="11" :class="genNameLoading ? 'animate-spin' : ''" />
                {{ genNameLoading ? 'Generating...' : '\u2728 Generate' }}
              </button>
            </div>
            <N8nInput v-model="name" type="text" />
          </div>
          <div>
            <div class="mb-1 flex items-center justify-between">
              <label class="text-[12px] font-semibold uppercase tracking-wide text-text-muted">Description</label>
              <button
                v-if="aiEnabled"
                class="flex items-center gap-1 rounded-md border border-border bg-bg-light px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-bg disabled:opacity-50"
                :disabled="genDescLoading"
                @click="generateDescription"
              >
                <N8nIcon :icon="genDescLoading ? 'loader-circle' : 'sparkles'" :size="11" :class="genDescLoading ? 'animate-spin' : ''" />
                {{ genDescLoading ? 'Generating...' : '\u2728 Generate' }}
              </button>
            </div>
            <RichTextEditor
              :content="description"
              placeholder="Describe what this workflow does..."
              @change="(html) => (description = html)"
            />
          </div>
          <div v-if="categories.length > 0">
            <label class="mb-2 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">Categories</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="c in categories"
                :key="c.id"
                type="button"
                class="rounded-md border px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide transition-colors"
                :class="cn(
                  selectedCats.includes(c.id)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-bg-light text-text-muted hover:border-text-muted',
                )"
                @click="selectedCats = selectedCats.includes(c.id) ? selectedCats.filter((x) => x !== c.id) : [...selectedCats, c.id]"
              >
                {{ c.name }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>