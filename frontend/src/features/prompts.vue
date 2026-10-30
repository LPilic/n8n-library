<script setup lang="ts">
// ─── PromptsPage (ported from prompts.tsx) ────────────────────────────────────
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton, N8nHeading, N8nIcon, N8nOption, N8nSelect } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'
import PromptCard from './prompt-parts/PromptCard.vue'
import CreatePromptModal from './prompt-parts/CreatePromptModal.vue'
import type { PromptListResponse } from './prompt-parts/shared'

const router = useRouter()
const { success: showSuccess, error: showError } = useToast()
const queryClient = useQueryClient()

const search = ref('')
const statusFilter = ref('')
const categoryFilter = ref('')
const page = ref(1)
const showCreate = ref(false)

const { data, isLoading } = useQuery({
  queryKey: [
    'prompts',
    () => page.value,
    () => search.value,
    () => statusFilter.value,
    () => categoryFilter.value,
  ],
  queryFn: () => {
    const params = new URLSearchParams({ page: String(page.value), limit: '20' })
    if (search.value) params.set('search', search.value)
    if (statusFilter.value) params.set('status', statusFilter.value)
    if (categoryFilter.value) params.set('category', categoryFilter.value)
    return api.get<PromptListResponse>(`/api/prompts?${params}`)
  },
})

const prompts = computed(() => data.value?.prompts ?? [])

const allCategories = computed(() =>
  Array.from(
    new Set(prompts.value.map((p) => p.category).filter(Boolean) as string[]),
  ),
)

// ─── Handlers ─────────────────────────────────────────────────────────────────

function onSearch(e: Event) {
  search.value = (e.target as HTMLInputElement).value
  page.value = 1
}

function setStatusFilter(v: unknown) {
  statusFilter.value = String(v ?? '')
  page.value = 1
}

function setCategoryFilter(v: unknown) {
  categoryFilter.value = String(v ?? '')
  page.value = 1
}

async function onDelete(id: number) {
  if (!(await appConfirm('Delete this prompt?', { danger: true, okLabel: 'Delete' }))) return
  try {
    await api.delete(`/api/prompts/${id}`)
    showSuccess('Prompt deleted')
    queryClient.invalidateQueries({ queryKey: ['prompts'] })
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Delete failed')
  }
}

function onCreated() {
  showCreate.value = false
  queryClient.invalidateQueries({ queryKey: ['prompts'] })
}
</script>

<template>
  <div>
    <!-- Page header -->
    <div class="mb-6">
      <N8nHeading size="xlarge" tag="h2">Prompts</N8nHeading>
    </div>

    <!-- Toolbar -->
    <div class="mb-5 flex flex-wrap items-center gap-2">
      <div class="relative min-w-0 max-w-sm flex-1">
        <N8nIcon icon="search" :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-xmuted" />
        <!-- Plain input: icon overlay + compact padding -->
        <input
          type="text"
          placeholder="Search prompts..."
          :value="search"
          class="w-full rounded-sm border border-input-border bg-input-bg py-1.5 pl-8 pr-3 text-sm text-text-dark outline-none focus:border-input-focus"
          @input="onSearch"
        />
      </div>
      <N8nSelect
        :model-value="statusFilter"
        :filterable="false"
        size="small"
        class="w-36"
        @update:model-value="setStatusFilter"
      >
        <N8nOption value="" label="All Statuses">All Statuses</N8nOption>
        <N8nOption value="draft" label="Draft">Draft</N8nOption>
        <N8nOption value="published" label="Published">Published</N8nOption>
        <N8nOption value="archived" label="Archived">Archived</N8nOption>
      </N8nSelect>
      <N8nSelect
        v-if="allCategories.length > 0"
        :model-value="categoryFilter"
        :filterable="false"
        size="small"
        class="w-44"
        @update:model-value="setCategoryFilter"
      >
        <N8nOption value="" label="All Categories">All Categories</N8nOption>
        <N8nOption v-for="c in allCategories" :key="c" :value="c" :label="c">{{ c }}</N8nOption>
      </N8nSelect>
      <span class="ml-auto hidden text-xs text-text-muted sm:inline">
        {{ data?.total ?? 0 }} prompt{{ (data?.total ?? 0) !== 1 ? 's' : '' }}
      </span>
      <N8nButton
        variant="brand"
        size="small"
        icon="plus"
        label="New Prompt"
        class="shrink-0"
        @click="showCreate = true"
      />
    </div>

    <!-- Create modal -->
    <CreatePromptModal v-if="showCreate" @close="showCreate = false" @created="onCreated" />

    <!-- Prompt grid -->
    <div v-if="isLoading" class="text-sm text-text-muted">Loading prompts...</div>
    <div v-else-if="prompts.length === 0" class="py-12 text-center">
      <p class="text-text-muted">No prompts found</p>
    </div>
    <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <PromptCard
        v-for="prompt in prompts"
        :key="prompt.id"
        :prompt="prompt"
        @open="router.push(`/prompts/${prompt.slug || prompt.id}`)"
        @delete="onDelete(prompt.id)"
      />
    </div>

    <!-- Pagination -->
    <div v-if="data && data.pages > 1" class="mt-5 flex items-center justify-center gap-2">
      <button
        :disabled="page <= 1"
        class="rounded-sm border border-input-border bg-input-bg px-3 py-1 text-xs text-text-muted hover:bg-card-hover disabled:opacity-40"
        @click="page = page - 1"
      >
        Prev
      </button>
      <span class="text-xs text-text-muted">Page {{ page }} of {{ data.pages }}</span>
      <button
        :disabled="page >= data.pages"
        class="rounded-sm border border-input-border bg-input-bg px-3 py-1 text-xs text-text-muted hover:bg-card-hover disabled:opacity-40"
        @click="page = page + 1"
      >
        Next
      </button>
    </div>
  </div>
</template>