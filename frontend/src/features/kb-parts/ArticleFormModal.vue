<script setup lang="ts">
// ─── ArticleFormModal (shared by KbPage + KbArticlePage) ──────────────────────

import { computed, ref } from 'vue'
import { N8nButton, N8nDialog, N8nInput } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { markdownToHtml } from '@/lib/markdown'
import CustomSelect from '@/components/CustomSelect.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'

// ─── Types ────────────────────────────────────────────────────────────────────

interface KbArticle {
  id: number
  title: string
  slug: string
  status: string
  category_id?: number
  body?: string
  content?: string
  tags?: Array<{ id: number; name: string; slug?: string } | string>
}

interface KbCategory {
  id: number
  name: string
  slug?: string
  article_count: number
}

const props = defineProps<{
  categories: KbCategory[]
  initial?: KbArticle | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const { error: showError, success: showSuccess } = useToast()
const isEdit = computed(() => !!props.initial)

const title = ref(props.initial?.title ?? '')
const categoryId = ref<string>(
  props.initial?.category_id != null ? String(props.initial.category_id) : '',
)
const status = ref<string>(props.initial?.status ?? 'draft')
const content = ref((() => {
  if (!props.initial) return ''
  const raw = props.initial.body ?? props.initial.content ?? ''
  // Convert markdown to HTML if the content doesn't look like HTML
  return raw && !raw.trim().startsWith('<') ? markdownToHtml(raw) : raw
})())
const tags = ref(
  (props.initial?.tags ?? [])
    .map((t) => (typeof t === 'string' ? t : t.name))
    .join(', '),
)
const saving = ref(false)

async function handleSave() {
  if (!title.value.trim()) {
    showError('Title is required')
    return
  }
  saving.value = true
  try {
    const payload = {
      title: title.value.trim(),
      status: status.value,
      body: content.value,
      tags: tags.value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      ...(categoryId.value ? { category_id: Number(categoryId.value) } : {}),
    }
    if (isEdit.value && props.initial) {
      await api.put(`/api/kb/articles/${props.initial.id}`, payload)
      showSuccess('Article updated')
    } else {
      await api.post('/api/kb/articles', payload)
      showSuccess('Article created')
    }
    emit('saved')
    emit('close')
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    saving.value = false
  }
}

function onUpdateOpen(open: boolean) {
  if (!open) emit('close')
}
</script>

<template>
  <N8nDialog
    :open="true"
    size="xlarge"
    :header="isEdit ? 'Edit Article' : 'New Article'"
    show-close-button
    @update:open="onUpdateOpen"
  >
    <!-- Body -->
    <div class="max-h-[60vh] space-y-4 overflow-y-auto">
      <!-- Title -->
      <div>
        <label class="mb-1 block text-xs font-medium text-text-muted">Title</label>
        <N8nInput
          v-model="title"
          type="text"
          size="small"
          placeholder="Article title"
        />
      </div>

      <!-- Category + Status row -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="mb-1 block text-xs font-medium text-text-muted">Category</label>
          <CustomSelect
            :value="categoryId"
            :options="[
              { value: '', label: 'No category' },
              ...props.categories.map((c) => ({ value: String(c.id), label: c.name })),
            ]"
            @change="categoryId = $event"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-text-muted">Status</label>
          <CustomSelect
            :value="status"
            :options="[
              { value: 'draft', label: 'Draft' },
              { value: 'published', label: 'Published' },
              { value: 'archived', label: 'Archived' },
            ]"
            @change="status = $event"
          />
        </div>
      </div>

      <!-- Content -->
      <div>
        <label class="mb-1 block text-xs font-medium text-text-muted">Content</label>
        <RichTextEditor
          :content="content"
          placeholder="Write your article content..."
          @change="content = $event"
        />
      </div>

      <!-- Tags -->
      <div>
        <label class="mb-1 block text-xs font-medium text-text-muted">
          Tags <span class="font-normal text-text-xmuted">(comma-separated)</span>
        </label>
        <N8nInput
          v-model="tags"
          type="text"
          size="small"
          placeholder="e.g. automation, n8n, api"
        />
      </div>
    </div>

    <!-- Footer -->
    <div class="mt-4 flex items-center justify-end gap-2">
      <N8nButton variant="outline" label="Cancel" @click="emit('close')" />
      <N8nButton
        variant="brand"
        :loading="saving"
        :label="saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Article'"
        @click="handleSave"
      />
    </div>
  </N8nDialog>
</template>