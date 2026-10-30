<script setup lang="ts">
// ─── KbArticlePage (route /kb/:slug — the "slug" segment carries the article id) ──

import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nHeading, N8nIcon, N8nSpinner } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'
import { timeAgo, cn } from '@/lib/utils'
import { markdownToHtml } from '@/lib/markdown'
import { sanitizeHtml } from '@/lib/sanitize'
import { useHighlight } from '@/composables/useHighlight'
import ArticleFormModal from './kb-parts/ArticleFormModal.vue'
import VersionHistoryModal from './kb-parts/VersionHistoryModal.vue'

// ─── Types ────────────────────────────────────────────────────────────────────

interface KbArticle {
  id: number
  title: string
  slug: string
  excerpt?: string
  body?: string
  content?: string
  status: string
  category_id?: number
  category_name?: string
  author_name?: string
  tags?: Array<{ id: number; name: string; slug?: string } | string>
  view_count?: number
  pinned?: boolean
  is_pinned?: boolean
  featured?: boolean
  is_featured?: boolean
  author_username?: string
  created_at: string
  updated_at: string
  attachments?: Array<{ id: number; filename?: string; original_name?: string; url?: string; size?: number; size_bytes?: number; mime_type?: string }>
}

interface KbTagRef {
  id: number
  name: string
  slug?: string
}

interface KbCategory {
  id: number
  name: string
  slug?: string
  article_count: number
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const queryClient = useQueryClient()
const { error: showError, success: showSuccess } = useToast()

const isAdmin = computed(() => auth.user?.role === 'admin')
const isWriter = computed(() => auth.user?.role === 'admin' || auth.user?.role === 'editor')

// The `slug` URL segment actually carries the article id (same as the React page)
const articleId = computed(() => String(route.params.slug ?? ''))

// Delay highlight until article body is rendered
const { data: article, isLoading } = useQuery({
  queryKey: ['kb-article', () => route.params.slug],
  queryFn: () => api.get<KbArticle>(`/api/kb/articles/${articleId.value}`),
  enabled: computed(() => !!articleId.value),
})

const bodyDep = computed(() => article.value?.body)
const highlightRef = useHighlight([bodyDep])

const showEditModal = ref(false)
const showVersionModal = ref(false)

const { data: categories } = useQuery({
  queryKey: ['kb-categories'],
  queryFn: () => api.get<KbCategory[]>('/api/kb/categories'),
})

const articleBodyHtml = computed(() =>
  sanitizeHtml(markdownToHtml(article.value?.body || article.value?.content || '')),
)

const isPinned = computed(() => article.value?.is_pinned ?? article.value?.pinned)
const isFeatured = computed(() => article.value?.is_featured ?? article.value?.featured)

// ─── Mutations (plain api calls + refetch, per vue-query conventions) ─────────

const pinPending = ref(false)
async function handlePin() {
  if (!article.value) return
  pinPending.value = true
  try {
    await api.patch(`/api/kb/articles/${article.value.id}/pin`)
    queryClient.invalidateQueries({ queryKey: ['kb-article'] })
    queryClient.invalidateQueries({ queryKey: ['kb-articles'] })
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Update failed')
  } finally {
    pinPending.value = false
  }
}

const featurePending = ref(false)
async function handleFeature() {
  if (!article.value) return
  featurePending.value = true
  try {
    await api.patch(`/api/kb/articles/${article.value.id}/feature`, {})
    queryClient.invalidateQueries({ queryKey: ['kb-article'] })
    queryClient.invalidateQueries({ queryKey: ['kb-articles'] })
    showSuccess(article.value?.featured ? 'Removed from featured' : 'Marked as featured')
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Update failed')
  } finally {
    featurePending.value = false
  }
}

const deletePending = ref(false)
async function deleteArticle() {
  if (!article.value) return
  deletePending.value = true
  try {
    await api.delete(`/api/kb/articles/${article.value.id}`)
    showSuccess('Article deleted')
    queryClient.invalidateQueries({ queryKey: ['kb-articles'] })
    router.push('/kb')
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Delete failed')
  } finally {
    deletePending.value = false
  }
}

async function handleDelete() {
  const ok = await appConfirm('Delete this article? This action cannot be undone.', {
    danger: true,
    okLabel: 'Delete',
  })
  if (ok) await deleteArticle()
}

const feedbackPending = ref(false)
const feedbackSuccess = ref(false)
async function sendFeedback(helpful: boolean) {
  if (!article.value) return
  feedbackPending.value = true
  try {
    await api.post(`/api/kb/articles/${article.value.id}/feedback`, { helpful })
    showSuccess('Feedback submitted — thank you!')
    feedbackSuccess.value = true
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Feedback failed')
  } finally {
    feedbackPending.value = false
  }
}

function handleArticleSaved() {
  queryClient.invalidateQueries({ queryKey: ['kb-article'] })
  queryClient.invalidateQueries({ queryKey: ['kb-articles'] })
}

// ─── Render helpers ───────────────────────────────────────────────────────────

function tagKey(tag: KbTagRef | string, i: number): string | number {
  return typeof tag === 'string' ? tag : tag.id ?? i
}

function tagName(tag: KbTagRef | string): string {
  return typeof tag === 'string' ? tag : tag.name
}

function formatAttachmentSize(bytesOrUndefined: number | undefined): string {
  const bytes = bytesOrUndefined ?? 0
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`
}

function attachmentName(att: NonNullable<KbArticle['attachments']>[number]): string {
  return att.original_name || att.filename || 'file'
}

function attachmentHref(att: NonNullable<KbArticle['attachments']>[number]): string {
  return att.url || `/uploads/kb/${att.filename || att.original_name}`
}
</script>

<template>
  <div v-if="isLoading" class="flex items-center gap-2 py-8 text-sm text-text-muted">
    <N8nSpinner /> Loading article...
  </div>
  <div v-else-if="!article" class="py-8 text-sm text-danger">Article not found</div>
  <div v-else class="max-w-3xl">
    <!-- Back button -->
    <button
      class="mb-5 inline-block text-sm text-primary transition-colors hover:text-primary-hover"
      @click="router.push('/kb')"
    >
      &larr; Back to Knowledge Base
    </button>

    <!-- Article header -->
    <div class="mb-6 rounded-xl border border-border bg-card p-5">
      <div class="mb-3 flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="mb-1 flex flex-wrap items-center gap-2">
            <span
              v-if="article.category_name"
              class="rounded bg-primary-light px-1.5 py-0.5 text-[11px] text-primary"
            >
              {{ article.category_name }}
            </span>
            <span
              :class="cn(
                'rounded px-1.5 py-0.5 text-[11px] capitalize',
                article.status === 'published' ? 'bg-success-light text-success' : 'bg-border-light text-text-muted',
              )"
            >
              {{ article.status }}
            </span>
          </div>
          <N8nHeading size="xlarge" tag="h2" class="leading-snug">{{ article.title }}</N8nHeading>
        </div>

        <!-- Action buttons -->
        <div class="flex shrink-0 items-center gap-1">
          <!-- Pin -->
          <button
            :class="cn(
              'rounded-sm p-1.5 transition-colors',
              isPinned
                ? 'text-warning bg-warning-light hover:bg-warning-light'
                : 'text-text-xmuted hover:text-warning hover:bg-warning-light',
            )"
            :disabled="pinPending"
            :title="isPinned ? 'Unpin article' : 'Pin article'"
            @click="handlePin"
          >
            <N8nIcon icon="pin" :size="16" />
          </button>

          <!-- Feature toggle (writer/admin) -->
          <button
            v-if="isWriter"
            :class="cn(
              'rounded-sm p-1.5 transition-colors',
              isFeatured
                ? 'text-warning bg-warning-light'
                : 'text-text-xmuted hover:text-warning hover:bg-warning-light',
            )"
            :disabled="featurePending"
            :title="isFeatured ? 'Remove from featured' : 'Mark as featured'"
            @click="handleFeature"
          >
            <N8nIcon icon="star" :size="16" />
          </button>

          <!-- Edit (writer/admin) -->
          <button
            v-if="isWriter"
            class="rounded-sm p-1.5 text-text-xmuted transition-colors hover:bg-primary-light hover:text-primary"
            title="Edit article"
            @click="showEditModal = true"
          >
            <N8nIcon icon="pencil" :size="16" />
          </button>

          <!-- Version history (writer/admin) -->
          <button
            v-if="isWriter"
            class="rounded-sm p-1.5 text-text-xmuted transition-colors hover:bg-card-hover hover:text-text-dark"
            title="Version history"
            @click="showVersionModal = true"
          >
            <N8nIcon icon="history" :size="16" />
          </button>

          <!-- Delete (admin only) -->
          <button
            v-if="isAdmin"
            class="rounded-sm p-1.5 text-text-xmuted transition-colors hover:bg-danger-light hover:text-danger disabled:opacity-50"
            :disabled="deletePending"
            title="Delete article"
            @click="handleDelete"
          >
            <N8nIcon icon="trash-2" :size="16" />
          </button>
        </div>
      </div>

      <div class="mb-4 flex flex-wrap items-center gap-3 text-xs text-text-xmuted">
        <span v-if="article.author_name || article.author_username">
          By <strong class="text-text-muted">{{ article.author_name || article.author_username }}</strong>
        </span>
        <span>Updated {{ timeAgo(article.updated_at) }}</span>
        <span class="flex items-center gap-0.5">
          <N8nIcon icon="eye" :size="11" /> {{ (article.view_count ?? 0).toLocaleString() }} views
        </span>
      </div>

      <!-- Tags -->
      <div v-if="(article.tags ?? []).length > 0" class="mb-4 flex flex-wrap gap-1">
        <span
          v-for="(tag, i) in article.tags ?? []"
          :key="tagKey(tag, i)"
          class="flex items-center gap-0.5 rounded bg-border-light px-1.5 py-0.5 text-[11px] text-text-muted"
        >
          <N8nIcon icon="tags" :size="8" />{{ tagName(tag) }}
        </span>
      </div>

      <!-- Article content -->
      <div
        v-if="article.body || article.content"
        ref="highlightRef"
        :key="article.updated_at"
        class="max-w-none text-[14px] leading-relaxed text-text-dark [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:pb-1 [&_h2]:border-b [&_h2]:border-border-light [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mb-1 [&_h4]:mt-3 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-3 [&_li]:mb-1 [&_strong]:font-semibold [&_a]:text-primary [&_a:hover]:underline [&_blockquote]:border-l-3 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-text-muted [&_blockquote]:mb-3 [&_hr]:border-border-light [&_hr]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:mb-3 [&_th]:text-left [&_th]:p-2 [&_th]:border-b [&_th]:border-border [&_th]:text-xs [&_th]:font-semibold [&_td]:p-2 [&_td]:border-b [&_td]:border-border-light [&_td]:text-sm [&_img]:max-w-full [&_img]:rounded-md"
        v-html="articleBodyHtml"
      />
      <p v-else class="text-sm italic text-text-muted">No content available.</p>

      <!-- Attachments -->
      <div v-if="(article.attachments ?? []).length > 0" class="mt-5 border-t border-border-light pt-4">
        <N8nHeading size="medium" tag="h3" class="mb-2">Attachments</N8nHeading>
        <div class="flex flex-col gap-1 ">
          <a
            v-for="att in article.attachments ?? []"
            :key="att.id"
            :href="attachmentHref(att)"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-2 text-xs text-primary transition-colors hover:text-primary-hover"
          >
            <span class="truncate">{{ attachmentName(att) }}</span>
            <span v-if="(att.size_bytes ?? att.size ?? 0) > 0" class="shrink-0 text-text-xmuted">
              ({{ formatAttachmentSize(att.size_bytes ?? att.size) }})
            </span>
          </a>
        </div>
      </div>
    </div>

    <!-- Feedback -->
    <div class="rounded-xl border border-border bg-card p-5">
      <p class="mb-3 text-sm font-medium text-text-dark">Was this article helpful?</p>
      <div class="flex items-center gap-2">
        <button
          class="flex items-center gap-1.5 rounded-sm border border-input-border px-3 py-1.5 text-xs text-success transition-colors hover:border-success hover:bg-success-light disabled:opacity-50"
          :disabled="feedbackPending"
          @click="sendFeedback(true)"
        >
          <N8nIcon icon="thumbs-up" :size="13" /> Yes, helpful
        </button>
        <button
          class="flex items-center gap-1.5 rounded-sm border border-input-border px-3 py-1.5 text-xs text-danger transition-colors hover:border-danger hover:bg-danger-light disabled:opacity-50"
          :disabled="feedbackPending"
          @click="sendFeedback(false)"
        >
          <N8nIcon icon="thumbs-down" :size="13" /> Not helpful
        </button>
        <span v-if="feedbackSuccess" class="ml-2 text-xs text-text-muted">Thanks for your feedback!</span>
      </div>
    </div>

    <!-- Edit modal -->
    <ArticleFormModal
      v-if="showEditModal"
      :categories="categories ?? []"
      :initial="article"
      @close="showEditModal = false"
      @saved="handleArticleSaved"
    />

    <!-- Version history modal -->
    <VersionHistoryModal
      v-if="showVersionModal"
      :article-id="article.id"
      @close="showVersionModal = false"
      @restored="handleArticleSaved"
    />
  </div>
</template>