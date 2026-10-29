<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nIcon, N8nInput, N8nSelect, N8nOption } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { useInstanceStore } from '@/stores/instance'
import { cn } from '@/lib/utils'
import PreviewModal from '@/components/PreviewModal.vue'
import DocsModal from '@/components/DocsModal.vue'
import N8nWorkflowsWorkflowCard from '@/features/n8n-workflows-workflow-card.vue'
import N8nWorkflowsImportModal from '@/features/n8n-workflows-import-modal.vue'
import N8nWorkflowsTagsDropdown from '@/features/n8n-workflows-tags-dropdown.vue'

// --- Types ---

interface N8nNode {
  type?: string
  name?: string
  displayName?: string
  group?: string
  position?: number[]
  iconData?: { type?: string; fileBuffer?: string; icon?: string }
  icon?: string
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

interface N8nWorkflowLight {
  id: string
  name: string
  active: boolean
  nodeCount: number
  nodePreview: N8nNode[]
  updatedAt?: string
  tagIds: string[]
  tagNames: string[]
  ownerId?: string
  ownerName?: string
}

// --- Main Page ---

const PAGE_SIZE = 20

const STATUS_FILTERS = ['all', 'active', 'inactive'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const toast = useToast()
const queryClient = useQueryClient()
const instanceStore = useInstanceStore()

const search = ref('')
const page = ref(1)
const statusFilter = ref<StatusFilter>('all')
const selectedTags = ref<string[]>([])
const selectedOwner = ref<string>('')
const importingWf = ref<N8nWorkflowFull | null>(null)
const previewWf = ref<{ title: string; data: { nodes: unknown[]; connections: unknown } } | null>(null)
const renamingId = ref<string | null>(null)
const docsTarget = ref<{ name: string; nodes: unknown[]; connections: unknown } | null>(null)

const { data: aiStatus } = useQuery({
  queryKey: ['ai-status'],
  queryFn: () => api.get<{ configured: boolean }>('/api/ai/status'),
})
const aiEnabled = computed(() => aiStatus.value?.configured ?? false)

// Store full workflow data for AI actions + preview (avoids re-fetching 59MB).
// Intentionally a plain (non-reactive) cache like React's useRef.
let fullDataCache: N8nWorkflowFull[] = []

const { data: workflowsData, isLoading } = useQuery({
  queryKey: ['n8n-workflows-light', () => instanceStore.activeId],
  queryFn: async () => {
    const res = await api.get<{ data: N8nWorkflowFull[] }>(instanceStore.url('/api/monitoring/workflows'))
    const all = res.data || []
    fullDataCache = all // cache full data for AI actions
    return all.map((w): N8nWorkflowLight => ({
      id: String(w.id),
      name: String(w.name || ''),
      active: Boolean(w.active),
      nodeCount: (w.nodes || []).length,
      nodePreview: (w.nodes || []).slice(0, 12).map((n) => ({
        type: n.type,
        name: n.name,
        displayName: n.displayName,
        group: n.group,
        position: n.position,
      })),
      updatedAt: w.updatedAt,
      tagIds: (w.tags || []).map((t) => String(t.id)),
      tagNames: (w.tags || []).map((t) => t.name),
      ownerId: w.ownerProjectId || undefined,
      ownerName: w.ownerName || undefined,
    }))
  },
  enabled: () => instanceStore.loaded && !!instanceStore.activeId,
  staleTime: 60_000,
})

const workflows = computed(() => workflowsData.value ?? [])

function getFullWf(id: string): N8nWorkflowFull | undefined {
  return fullDataCache.find((w) => String(w.id) === String(id))
}

function handlePreview(id: string, name: string) {
  const wf = getFullWf(id)
  if (wf) {
    previewWf.value = { title: name, data: { nodes: wf.nodes || [], connections: wf.connections || {} } }
  }
}

function handleImport(id: string) {
  const wf = getFullWf(id)
  if (wf) importingWf.value = wf
  else toast.error('Workflow data not available')
}

async function handleRename(id: string) {
  const wf = getFullWf(id)
  if (!wf) {
    toast.error('Workflow data not available')
    return
  }
  renamingId.value = id
  try {
    const res = await api.post<{ name: string }>('/api/ai/name-workflow', {
      nodes: wf.nodes || [],
      connections: wf.connections || {},
    })
    if (res.name) {
      toast.success(`Suggested name: ${res.name}`)
      // Update cached name
      wf.name = res.name
      queryClient.invalidateQueries({ queryKey: ['n8n-workflows-light', instanceStore.activeId] })
    }
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Rename failed')
  } finally {
    renamingId.value = null
  }
}

function handleDocs(id: string, name: string) {
  const wf = getFullWf(id)
  if (!wf) {
    toast.error('Workflow data not available')
    return
  }
  docsTarget.value = { name, nodes: wf.nodes || [], connections: wf.connections || {} }
}

const availableTags = computed(() => {
  const map = new Map<string, string>()
  for (const w of workflows.value) {
    for (let i = 0; i < w.tagIds.length; i++) {
      map.set(w.tagIds[i], w.tagNames[i])
    }
  }
  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const availableOwners = computed(() => {
  const map = new Map<string, string>()
  for (const w of workflows.value) {
    if (w.ownerId && w.ownerName) map.set(w.ownerId, w.ownerName)
  }
  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const activeFilterCount = computed(
  () =>
    (statusFilter.value !== 'all' ? 1 : 0) + (selectedTags.value.length > 0 ? 1 : 0) + (selectedOwner.value ? 1 : 0),
)

function clearAllFilters() {
  statusFilter.value = 'all'
  selectedTags.value = []
  selectedOwner.value = ''
  page.value = 1
}

const filtered = computed(() => {
  let list = workflows.value
  const q = search.value.trim().toLowerCase()
  if (q) list = list.filter((w) => w.name.toLowerCase().includes(q))
  if (statusFilter.value === 'active') list = list.filter((w) => w.active)
  if (statusFilter.value === 'inactive') list = list.filter((w) => !w.active)
  if (selectedTags.value.length > 0) list = list.filter((w) => selectedTags.value.every((t) => w.tagIds.includes(t)))
  if (selectedOwner.value) list = list.filter((w) => w.ownerId === selectedOwner.value)
  return list
})

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const currentPage = computed(() => Math.min(page.value, totalPages.value))
const paged = computed(() => filtered.value.slice((currentPage.value - 1) * PAGE_SIZE, currentPage.value * PAGE_SIZE))

// Replicates the React page-window logic: up to 7 buttons centered on the current page
const pageNumbers = computed(() => {
  const start = Math.max(1, Math.min(currentPage.value - 3, totalPages.value - 6))
  return Array.from({ length: Math.min(totalPages.value, 7) }, (_, i) => start + i).filter((p) => p <= totalPages.value)
})

function onSearch(value: string) {
  search.value = value
  page.value = 1
}

function setStatus(f: StatusFilter) {
  statusFilter.value = f
  page.value = 1
}

function setOwner(v: unknown) {
  selectedOwner.value = String(v)
  page.value = 1
}
</script>

<template>
  <div>
    <div class="mb-4 flex items-center gap-3">
      <N8nInput
        :model-value="search"
        placeholder="Search workflows..."
        type="text"
        class="max-w-md flex-1"
        @update:model-value="onSearch"
      >
        <template #prefix>
          <N8nIcon icon="search" :size="16" class="text-text-xmuted" />
        </template>
      </N8nInput>
      <span class="text-sm text-text-muted">
        {{ filtered.length }} workflow{{ filtered.length !== 1 ? 's' : '' }}
        <template v-if="activeFilterCount > 0 && workflows.length !== filtered.length"> of {{ workflows.length }}</template>
      </span>
    </div>

    <!-- Filter bar -->
    <div v-if="!isLoading && workflows.length > 0" class="mb-4 flex flex-wrap items-center gap-3">
      <!-- Status button group -->
      <div class="flex items-center gap-1">
        <button
          v-for="f in STATUS_FILTERS"
          :key="f"
          class="rounded-md border px-2.5 py-[5px] text-[12px] font-semibold capitalize"
          :class="cn(
            statusFilter === f
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-input-border bg-input-bg text-text-dark hover:bg-card-hover',
          )"
          @click="setStatus(f)"
        >
          {{ f }}
        </button>
      </div>

      <!-- Tags dropdown -->
      <N8nWorkflowsTagsDropdown
        v-if="availableTags.length > 0"
        :tags="availableTags"
        :selected="selectedTags"
        @change="(ids) => { selectedTags = ids; page = 1 }"
      />

      <!-- Owner select -->
      <N8nSelect
        v-if="availableOwners.length > 0"
        :model-value="selectedOwner"
        :filterable="false"
        size="small"
        class="w-[200px]"
        @update:model-value="setOwner"
      >
        <N8nOption value="" label="All Owners">All Owners</N8nOption>
        <N8nOption v-for="o in availableOwners" :key="o.id" :value="o.id" :label="o.name">{{ o.name }}</N8nOption>
      </N8nSelect>

      <!-- Clear all -->
      <button
        v-if="activeFilterCount > 0"
        class="flex items-center gap-1 px-2 py-1 text-[12px] font-semibold text-text-muted transition-colors hover:text-text-dark"
        @click="clearAllFilters"
      >
        <N8nIcon icon="x" :size="12" /> Clear filters
      </button>
    </div>

    <div v-if="isLoading" class="text-sm text-text-muted">Loading workflows...</div>
    <div v-else-if="paged.length === 0" class="py-12 text-center">
      <p class="text-text-muted">No workflows found</p>
      <p v-if="search || activeFilterCount > 0" class="mt-1 text-xs text-text-xmuted">Try adjusting your search or filters</p>
    </div>
    <div
      v-else
      class="grid gap-4"
      :style="{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', maxWidth: '1600px' }"
    >
      <N8nWorkflowsWorkflowCard
        v-for="w in paged"
        :key="w.id"
        :workflow="w"
        :ai-enabled="aiEnabled"
        :renaming="renamingId === w.id"
        :docs-generating="false"
        @preview="handlePreview(w.id, w.name)"
        @import="handleImport(w.id)"
        @rename="handleRename(w.id)"
        @docs="handleDocs(w.id, w.name)"
      />
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="mt-6 flex items-center justify-center gap-1">
      <button
        class="rounded-sm p-1.5 text-text-muted transition-colors hover:bg-card-hover hover:text-text-dark disabled:opacity-40"
        :disabled="currentPage === 1"
        @click="page = Math.max(1, currentPage - 1)"
      >
        <N8nIcon icon="chevron-left" :size="14" />
      </button>
      <button
        v-for="p in pageNumbers"
        :key="p"
        class="h-7 min-w-[28px] rounded-sm text-xs"
        :class="cn(currentPage === p ? 'bg-primary text-white' : 'text-text-muted hover:bg-card-hover')"
        @click="page = p"
      >
        {{ p }}
      </button>
      <button
        class="rounded-sm p-1.5 text-text-muted transition-colors hover:bg-card-hover hover:text-text-dark disabled:opacity-40"
        :disabled="currentPage === totalPages"
        @click="page = Math.min(totalPages, currentPage + 1)"
      >
        <N8nIcon icon="chevron-right" :size="14" />
      </button>
      <span class="ml-2 text-xs text-text-muted">
        {{ (currentPage - 1) * PAGE_SIZE + 1 }}&ndash;{{ Math.min(currentPage * PAGE_SIZE, filtered.length) }} of
        {{ filtered.length }}
      </span>
    </div>

    <!-- Preview modal with n8n-demo web component -->
    <PreviewModal
      v-if="previewWf"
      :title="previewWf.title"
      :workflow-data="previewWf.data"
      @close="previewWf = null"
    />

    <!-- Import modal -->
    <N8nWorkflowsImportModal v-if="importingWf" :workflow="importingWf" :ai-enabled="aiEnabled" @close="importingWf = null" />

    <!-- Docs modal -->
    <DocsModal
      v-if="docsTarget"
      :workflow-name="docsTarget.name"
      :nodes="docsTarget.nodes"
      :connections="docsTarget.connections"
      @close="docsTarget = null"
    />
  </div>
</template>