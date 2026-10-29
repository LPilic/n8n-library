<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nIcon, N8nInput } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'
import PreviewModal from '@/components/PreviewModal.vue'
import DocsModal from '@/components/DocsModal.vue'
import LibraryTemplateCard from '@/features/library-template-card.vue'
import LibraryEditTemplateModal from '@/features/library-edit-template-modal.vue'
import LibraryVersionHistoryModal from '@/features/library-version-history-modal.vue'

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

// ─── LibraryPage ──────────────────────────────────────────────────────────────

const auth = useAuthStore()
const toast = useToast()
const queryClient = useQueryClient()

const isWriter = computed(() => auth.user?.role === 'admin' || auth.user?.role === 'editor')
const isAdmin = computed(() => auth.user?.role === 'admin')

const search = ref('')
const selectedCategory = ref<string | null>(null)
const editingTemplateId = ref<number | null>(null)
const historyTemplateId = ref<number | null>(null)
const previewWf = ref<{ title: string; data: { nodes: unknown[]; connections: unknown } } | null>(null)
const docsTarget = ref<{ name: string; nodes: unknown[]; connections: unknown } | null>(null)

const { data: aiStatus } = useQuery({
  queryKey: ['ai-status'],
  queryFn: () => api.get<{ configured: boolean }>('/api/ai/status'),
})
const aiEnabled = computed(() => aiStatus.value?.configured ?? false)

const { data: templatesData, isLoading } = useQuery({
  queryKey: ['library-templates', search],
  queryFn: () =>
    api.get<{ workflows: Template[]; totalWorkflows: number }>(
      `/templates/search?search=${encodeURIComponent(search.value)}&rows=100&page=1`,
    ),
})

const { data: categoriesData } = useQuery({
  queryKey: ['categories'],
  queryFn: () => api.get<{ categories: Category[] }>('/api/categories').then((r) => r.categories),
})

const templates = computed(() => templatesData.value?.workflows ?? [])
const categories = computed(() => categoriesData.value ?? [])

const filtered = computed(() => {
  if (!selectedCategory.value) return templates.value
  return templates.value.filter((t) => t.categories?.some((c) => c.name === selectedCategory.value))
})

function categoryCount(categoryName: string): number {
  return templates.value.filter((t) => t.categories?.some((tc) => tc.name === categoryName)).length
}

async function handleDelete(id: number) {
  const ok = await appConfirm('Delete this template? This action cannot be undone.', { danger: true, okLabel: 'Delete' })
  if (!ok) return
  try {
    await api.delete(`/api/templates/${id}`)
    toast.success('Template deleted')
    queryClient.invalidateQueries({ queryKey: ['library-templates'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Delete failed')
  }
}

function handleTemplateSaved() {
  queryClient.invalidateQueries({ queryKey: ['library-templates'] })
}

// Fetch workflow data for preview/docs
async function openPreview(templateId: number, templateName: string) {
  try {
    const res = await api.get<{ workflow: WorkflowData }>(`/workflows/templates/${templateId}`)
    const wf = res.workflow || ({} as WorkflowData)
    previewWf.value = {
      title: templateName,
      data: { nodes: (wf.nodes as unknown[]) || [], connections: wf.connections || {} },
    }
  } catch {
    toast.error('Failed to load workflow preview')
  }
}

async function openDocs(templateId: number, templateName: string) {
  try {
    const res = await api.get<{ workflow: WorkflowData }>(`/workflows/templates/${templateId}`)
    const wf = res.workflow || ({} as WorkflowData)
    docsTarget.value = { name: templateName, nodes: (wf.nodes as unknown[]) || [], connections: wf.connections || {} }
  } catch {
    toast.error('Failed to load workflow data')
  }
}
</script>

<template>
  <div class="flex gap-6">
    <!-- Sidebar -->
    <aside class="hidden w-64 shrink-0 space-y-3 lg:block">
      <!-- Template count -->
      <div class="rounded-lg border border-border bg-card p-4 text-center">
        <div class="text-3xl font-extrabold text-primary">{{ templates.length }}</div>
        <div class="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Templates</div>
      </div>

      <!-- Categories -->
      <div class="overflow-hidden rounded-lg border border-border bg-card">
        <div class="border-b border-border-light px-3 py-2">
          <h3 class="text-[10px] font-bold uppercase tracking-[0.08em] text-text-xmuted">Categories</h3>
        </div>
        <div class="p-1">
          <button
            class="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[12px] transition-colors"
            :class="!selectedCategory ? 'bg-primary-light font-semibold text-primary' : 'text-text-muted hover:bg-bg'"
            @click="selectedCategory = null"
          >
            <span>All</span>
            <span class="text-[10px] font-bold tabular-nums text-text-xmuted">{{ templates.length }}</span>
          </button>
          <button
            v-for="c in categories"
            :key="c.id"
            class="flex w-full items-center justify-between truncate rounded-md px-2.5 py-1.5 text-[12px] transition-colors"
            :class="selectedCategory === c.name ? 'bg-primary-light font-semibold text-primary' : 'text-text-muted hover:bg-bg'"
            @click="selectedCategory = c.name"
          >
            <span class="truncate">{{ c.name }}</span>
            <span v-if="categoryCount(c.name) > 0" class="ml-1 shrink-0 text-[10px] font-bold tabular-nums text-text-xmuted">
              {{ categoryCount(c.name) }}
            </span>
          </button>
        </div>
      </div>
    </aside>

    <div class="min-w-0 flex-1">
      <div class="mb-4 flex items-center gap-3">
        <N8nInput
          v-model="search"
          placeholder="Search templates..."
          type="text"
          class="max-w-md flex-1"
        >
          <template #prefix>
            <N8nIcon icon="search" :size="16" class="text-text-xmuted" />
          </template>
        </N8nInput>
        <span class="text-sm text-text-muted">
          {{ filtered.length }} template{{ filtered.length !== 1 ? 's' : '' }}
        </span>
      </div>

      <div v-if="isLoading" class="text-sm text-text-muted">Loading...</div>
      <div v-else-if="filtered.length === 0" class="py-12 text-center">
        <p class="text-text-muted">No templates found</p>
        <p class="mt-1 text-xs text-text-xmuted">Import workflows from your n8n instance</p>
      </div>
      <div
        v-else
        class="grid gap-4"
        :style="{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', maxWidth: '1600px' }"
      >
        <LibraryTemplateCard
          v-for="t in filtered"
          :key="t.id"
          :template="t"
          :is-writer="isWriter"
          :is-admin="isAdmin"
          :ai-enabled="aiEnabled"
          @delete="handleDelete(t.id)"
          @edit="editingTemplateId = t.id"
          @history="historyTemplateId = t.id"
          @preview="openPreview(t.id, t.name)"
          @docs="openDocs(t.id, t.name)"
        />
      </div>
    </div>

    <!-- Modals -->
    <LibraryEditTemplateModal
      v-if="editingTemplateId != null"
      :template-id="editingTemplateId"
      :all-categories="categories"
      :ai-enabled="aiEnabled"
      @close="editingTemplateId = null"
      @saved="handleTemplateSaved"
    />
    <LibraryVersionHistoryModal
      v-if="historyTemplateId != null"
      :template-id="historyTemplateId"
      @close="historyTemplateId = null"
      @restored="handleTemplateSaved"
    />
    <PreviewModal
      v-if="previewWf"
      :title="previewWf.title"
      :workflow-data="previewWf.data"
      @close="previewWf = null"
    />
    <DocsModal
      v-if="docsTarget"
      :workflow-name="docsTarget.name"
      :nodes="docsTarget.nodes"
      :connections="docsTarget.connections"
      @close="docsTarget = null"
    />
  </div>
</template>