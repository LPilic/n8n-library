<script setup lang="ts">
// ─── ArticleCard (shared by KbPage) ───────────────────────────────────────────

import { N8nIcon } from '@n8n/design-system'
import { timeAgo } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

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

defineProps<{
  article: KbArticle
}>()

const emit = defineEmits<{
  (e: 'click'): void
}>()

function tagKey(tag: KbTagRef | string, i: number): string | number {
  return typeof tag === 'string' ? tag : tag.id ?? i
}

function tagName(tag: KbTagRef | string): string {
  return typeof tag === 'string' ? tag : tag.name
}
</script>

<template>
  <div
    class="group cursor-pointer rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"
    @click="emit('click')"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <div class="mb-1 flex items-center gap-2">
          <N8nIcon
            v-if="article.is_pinned ?? article.pinned"
            icon="pin"
            :size="12"
            class="shrink-0 text-warning"
          />
          <h3 class="truncate text-sm font-medium text-text-dark underline decoration-border-strong underline-offset-2 transition-colors group-hover:text-primary">
            {{ article.title }}
          </h3>
        </div>
        <p v-if="article.excerpt" class="mb-2.5 line-clamp-2 text-[13px] leading-relaxed text-text-muted">
          {{ article.excerpt }}
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <span
            v-if="article.category_name"
            class="rounded bg-primary-light px-1.5 py-0.5 text-[11px] text-primary"
          >
            {{ article.category_name }}
          </span>
          <span
            v-for="(tag, i) in (article.tags ?? []).slice(0, 3)"
            :key="tagKey(tag, i)"
            class="flex items-center gap-0.5 rounded bg-border-light px-1.5 py-0.5 text-[11px] text-text-muted"
          >
            <N8nIcon icon="tags" :size="9" />{{ tagName(tag) }}
          </span>
          <span class="ml-auto flex items-center gap-0.5 text-[11px] text-text-xmuted">
            <N8nIcon icon="eye" :size="11" /> {{ (article.view_count ?? 0).toLocaleString() }}
          </span>
          <span class="text-[11px] text-text-xmuted">{{ timeAgo(article.updated_at) }}</span>
        </div>
      </div>
      <N8nIcon
        icon="chevron-right"
        :size="14"
        class="mt-0.5 shrink-0 text-text-xmuted transition-colors group-hover:text-primary"
      />
    </div>
  </div>
</template>