<script setup lang="ts">
// ─── VersionHistoryModal (shared by KbArticlePage) ────────────────────────────

import { ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { N8nButton, N8nDialog } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'
import { timeAgo } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface KbVersion {
  id: number
  version_number: number
  author_username?: string
  created_at: string
  title?: string
}

const props = defineProps<{
  articleId: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'restored'): void
}>()

const { error: showError, success: showSuccess } = useToast()
const restoringId = ref<number | null>(null)

const { data: versions, isLoading } = useQuery({
  queryKey: ['kb-versions', () => props.articleId],
  queryFn: () => api.get<KbVersion[]>(`/api/kb/articles/${props.articleId}/versions`),
})

async function handleRestore(versionId: number) {
  const ok = await appConfirm('Restore this version? The current content will be replaced.', {
    okLabel: 'Restore',
  })
  if (!ok) return
  restoringId.value = versionId
  try {
    await api.post(`/api/kb/articles/${props.articleId}/restore/${versionId}`, {})
    showSuccess('Version restored')
    emit('restored')
    emit('close')
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Restore failed')
  } finally {
    restoringId.value = null
  }
}

function onUpdateOpen(open: boolean) {
  if (!open) emit('close')
}
</script>

<template>
  <N8nDialog
    :open="true"
    size="large"
    header="Version History"
    show-close-button
    @update:open="onUpdateOpen"
  >
    <!-- Body -->
    <div class="max-h-[60vh] overflow-y-auto">
      <p v-if="isLoading" class="text-sm text-text-muted">Loading versions…</p>
      <p v-else-if="!versions || versions.length === 0" class="text-sm text-text-muted">
        No version history found.
      </p>
      <div v-else class="flex flex-col gap-2 ">
        <div
          v-for="v in versions"
          :key="v.id"
          class="flex items-center justify-between gap-3 border-b border-border-light py-2 last:border-0"
        >
          <div class="min-w-0 flex-1">
            <span class="text-xs font-medium text-text-dark">
              v{{ v.version_number }}<template v-if="v.title"> — {{ v.title }}</template>
            </span>
            <div class="mt-0.5 text-[11px] text-text-xmuted">
              <span v-if="v.author_username" class="mr-2">by {{ v.author_username }}</span>
              <span>{{ timeAgo(v.created_at) }}</span>
            </div>
          </div>
          <N8nButton
            size="small"
            variant="outline"
            class="shrink-0"
            :disabled="restoringId === v.id"
            :loading="restoringId === v.id"
            :label="restoringId === v.id ? 'Restoring…' : 'Restore'"
            @click="handleRestore(v.id)"
          />
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="mt-4 flex justify-end">
      <N8nButton variant="outline" label="Close" @click="emit('close')" />
    </div>
  </N8nDialog>
</template>