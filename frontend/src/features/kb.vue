<script setup lang="ts">
// ─── KbPage (list) ────────────────────────────────────────────────────────────

import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton, N8nHeading, N8nIcon, N8nSpinner } from '@n8n/design-system'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/lib/utils'
import CustomSelect from '@/components/CustomSelect.vue'
import ArticleFormModal from './kb-parts/ArticleFormModal.vue'
import ArticleCard from './kb-parts/ArticleCard.vue'

// ─── Types ────────────────────────────────────────────────────────────────────

interface KbTag {
  id: number
  name: string
  article_count: number
}

interface KbCategory {
  id: number
  name: string
  slug?: string
  article_count: number
}

interface KbStats {
  total: number
  byCategory?: Array<{ id: number; name: string; count: number }>
  popular?: Array<{ id: number; title: string; view_count: number }>
  recent?: Array<{ id: number; title: string; updated_at: string }>
}

interface KbTagRef {
  id: number
  name: string
  slug?: string
}

interface KbArticle {
  id: number
  title: string
  slug: string
  excerpt?: string
  status: string
  category_name?: string
  tags?: Array<KbTagRef | string>
  view_count?: number
  pinned?: boolean
  is_pinned?: boolean
  featured?: boolean
  is_featured?: boolean
  updated_at: string
}

interface KbListResponse {
  articles: KbArticle[]
  total: number
  page: number
  pages: number
}

const router = useRouter()
const auth = useAuthStore()
const queryClient = useQueryClient()

const isWriter = computed(() => auth.user?.role === 'admin' || auth.user?.role === 'editor')

const search = ref('')
const categoryFilter = ref('')
const tagFilter = ref('')
const statusFilter = ref('')
const page = ref(1)
const showCreateModal = ref(false)

const { data, isLoading } = useQuery({
  queryKey: [
    'kb-articles',
    () => page.value,
    () => search.value,
    () => categoryFilter.value,
    () => tagFilter.value,
    () => statusFilter.value,
  ],
  queryFn: () => {
    const params = new URLSearchParams({ page: String(page.value), limit: '20' })
    if (search.value) params.set('search', search.value)
    if (categoryFilter.value) params.set('category', categoryFilter.value)
    if (tagFilter.value) params.set('tag', tagFilter.value)
    if (statusFilter.value) params.set('status', statusFilter.value)
    return api.get<KbListResponse>(`/api/kb/articles?${params}`)
  },
})

const { data: categories } = useQuery({
  queryKey: ['kb-categories'],
  queryFn: () => api.get<KbCategory[]>('/api/kb/categories'),
})

const { data: tags } = useQuery({
  queryKey: ['kb-tags'],
  queryFn: () => api.get<KbTag[]>('/api/kb/tags'),
})

const { data: stats } = useQuery({
  queryKey: ['kb-stats'],
  queryFn: () => api.get<KbStats>('/api/kb/stats'),
})

const articles = computed(() => data.value?.articles ?? [])

const STATUS_OPTIONS = ['', 'published', 'draft', 'archived']

const mobileCategoryOptions = computed(() => [
  { value: '', label: 'All Categories' },
  ...(categories.value ?? []).map((c) => ({ value: c.name, label: c.name })),
])

const mobileStatusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
]

function handleArticleSaved() {
  void queryClient.invalidateQueries({ queryKey: ['kb-articles'] })
  void queryClient.invalidateQueries({ queryKey: ['kb-stats'] })
  void queryClient.invalidateQueries({ queryKey: ['kb-categories'] })
}

function onSearchInput(e: Event) {
  search.value = (e.target as HTMLInputElement).value
  page.value = 1
}
</script>

<template>
  <div>
    <!-- Page header -->
    <div class="mb-6">
      <N8nHeading size="xlarge" tag="h2">Knowledge Base</N8nHeading>
    </div>

    <div class="flex gap-6">
      <!-- Sidebar -->
      <aside class="hidden w-64 shrink-0 space-y-4 lg:block">
        <!-- Stats KPI -->
        <div v-if="stats" class="rounded-xl border border-border bg-card p-5 text-center">
          <div class="text-[20px] leading-tight font-semibold text-primary">{{ stats.total }}</div>
          <div class="mt-0.5 text-[12px] font-medium text-text-muted">Articles</div>
        </div>

        <!-- Popular articles -->
        <div v-if="stats?.popular && stats.popular.length > 0" class="overflow-hidden rounded-xl border border-border bg-card">
          <div class="border-b border-border-light px-4 py-2.5">
            <N8nHeading size="medium" tag="h3">Popular</N8nHeading>
          </div>
          <div class="p-1.5">
            <button
              v-for="a in stats.popular.slice(0, 5)"
              :key="a.id"
              class="w-full truncate rounded-md px-2 py-1.5 text-left text-[12px] text-text-muted transition-colors hover:bg-bg hover:text-primary"
              @click="router.push(`/kb/${a.id}`)"
            >
              {{ a.title }}
            </button>
          </div>
        </div>

        <!-- Status filter -->
        <div class="overflow-hidden rounded-xl border border-border bg-card">
          <div class="border-b border-border-light px-4 py-2.5">
            <N8nHeading size="medium" tag="h3">Status</N8nHeading>
          </div>
          <div class="p-1">
            <button
              v-for="s in STATUS_OPTIONS"
              :key="s"
              :class="cn(
                'w-full text-left text-[12px] px-2.5 py-1.5 rounded-md capitalize transition-colors',
                statusFilter === s
                  ? 'bg-primary-light text-primary font-semibold'
                  : 'text-text-muted hover:bg-bg',
              )"
              @click="statusFilter = s; page = 1"
            >
              {{ s === '' ? 'All' : s }}
            </button>
          </div>
        </div>

        <!-- Categories -->
        <div v-if="(categories ?? []).length > 0" class="overflow-hidden rounded-xl border border-border bg-card">
          <div class="border-b border-border-light px-4 py-2.5">
            <N8nHeading size="medium" tag="h3">Categories</N8nHeading>
          </div>
          <div class="p-1">
            <button
              :class="cn(
                'flex w-full items-center justify-between text-[12px] px-2.5 py-1.5 rounded-md transition-colors',
                categoryFilter === '' ? 'bg-primary-light text-primary font-semibold' : 'text-text-muted hover:bg-bg',
              )"
              @click="categoryFilter = ''; page = 1"
            >
              <span>All</span>
            </button>
            <button
              v-for="c in categories ?? []"
              :key="c.id"
              :class="cn(
                'flex w-full items-center justify-between text-[12px] px-2.5 py-1.5 rounded-md transition-colors truncate',
                categoryFilter === c.name ? 'bg-primary-light text-primary font-semibold' : 'text-text-muted hover:bg-bg',
              )"
              @click="categoryFilter = c.name; page = 1"
            >
              <span class="truncate">{{ c.name }}</span>
              <span class="ml-1 shrink-0 text-[10px] font-bold tabular-nums text-text-xmuted">{{ c.article_count }}</span>
            </button>
          </div>
        </div>

        <!-- Tags -->
        <div v-if="(tags ?? []).length > 0" class="overflow-hidden rounded-xl border border-border bg-card">
          <div class="border-b border-border-light px-4 py-2.5">
            <N8nHeading size="medium" tag="h3">Tags</N8nHeading>
          </div>
          <div class="flex flex-wrap gap-1.5 p-2.5">
            <button
              v-for="t in (tags ?? []).slice(0, 20)"
              :key="t.id"
              :class="cn(
                'text-[11px] px-2 py-1 rounded-full border font-medium transition-colors',
                tagFilter === t.name
                  ? 'bg-primary text-white border-primary'
                  : 'bg-bg border-border-light text-text-muted hover:border-primary hover:text-primary',
              )"
              @click="tagFilter = tagFilter === t.name ? '' : t.name; page = 1"
            >
              {{ t.name }}
            </button>
          </div>
        </div>
      </aside>

      <!-- Main -->
      <div class="min-w-0 flex-1">
        <!-- Search bar + Create button -->
        <div class="mb-5 flex flex-wrap items-center gap-2">
          <div class="relative min-w-0 max-w-sm flex-1">
            <N8nIcon icon="search" :size="14" class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-xmuted" />
            <input
              type="text"
              placeholder="Search articles..."
              :value="search"
              class="w-full rounded-sm border border-input-border bg-input-bg py-1.5 pl-8 pr-3 text-sm text-text-dark outline-none focus:border-primary"
              @input="onSearchInput"
            />
          </div>
          <span class="text-xs text-text-muted">
            {{ data?.total ?? 0 }} article{{ (data?.total ?? 0) !== 1 ? 's' : '' }}
          </span>
          <N8nButton
            v-if="isWriter"
            size="small"
            variant="brand"
            class="ml-auto"
            icon="plus"
            label="New Article"
            @click="showCreateModal = true"
          />
        </div>

        <!-- Mobile: category + tag filters -->
        <div class="mb-5 flex flex-wrap gap-2 lg:hidden">
          <CustomSelect
            :value="categoryFilter"
            :options="mobileCategoryOptions"
            @change="categoryFilter = $event; page = 1"
          />
          <CustomSelect
            :value="statusFilter"
            :options="mobileStatusOptions"
            @change="statusFilter = $event; page = 1"
          />
        </div>

        <!-- Article list -->
        <div v-if="isLoading" class="flex items-center gap-2 py-4 text-sm text-text-muted">
          <N8nSpinner /> Loading articles...
        </div>
        <div v-else-if="articles.length === 0" class="py-12 text-center">
          <N8nIcon icon="book-open" :size="32" class="mx-auto mb-2 text-text-xmuted" />
          <p class="text-sm text-text-muted">No articles found</p>
        </div>
        <div v-else class="space-y-4">
          <ArticleCard
            v-for="article in articles"
            :key="article.id"
            :article="article"
            @click="router.push(`/kb/${article.slug || article.id}`)"
          />
        </div>

        <!-- Pagination -->
        <div v-if="data && data.pages > 1" class="mt-5 flex items-center justify-center gap-2">
          <N8nButton
            size="small"
            variant="outline"
            label="Prev"
            :disabled="page <= 1"
            @click="page--"
          />
          <span class="text-xs text-text-muted">Page {{ page }} of {{ data.pages }}</span>
          <N8nButton
            size="small"
            variant="outline"
            label="Next"
            :disabled="page >= data.pages"
            @click="page++"
          />
        </div>
      </div>
    </div>

    <!-- Create article modal -->
    <ArticleFormModal
      v-if="showCreateModal"
      :categories="categories ?? []"
      :initial="null"
      @close="showCreateModal = false"
      @saved="handleArticleSaved"
    />
  </div>
</template>