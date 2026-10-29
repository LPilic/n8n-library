<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'

interface TemplateVersion {
  id: number
  name: string
  version_note?: string
  created_at: string
  edited_by_name?: string
}

const props = defineProps<{
  templateId: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'restored'): void
}>()

const toast = useToast()
const restoringId = ref<number | null>(null)

const { data, isLoading } = useQuery({
  queryKey: ['template-versions', () => props.templateId],
  queryFn: () => api.get<{ versions: TemplateVersion[] }>(`/api/templates/${props.templateId}/versions`),
})

const versions = computed(() => data.value?.versions ?? [])

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

async function handleRestore(versionId: number) {
  const ok = await appConfirm('Restore this version? The current template will be replaced.', { okLabel: 'Restore' })
  if (!ok) return
  restoringId.value = versionId
  try {
    await api.post(`/api/templates/${props.templateId}/versions/${versionId}/restore`, {})
    toast.success('Version restored')
    emit('restored')
    emit('close')
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Restore failed')
  } finally {
    restoringId.value = null
  }
}
</script>

<template>
  <div class="fixed inset-0 z-[120] flex items-center justify-center bg-black/30">
    <div class="mx-4 flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-border bg-card shadow-lg">
      <div class="flex items-center justify-between border-b border-border-light px-5 py-3">
        <h2 class="text-sm font-semibold text-text-dark">Version History</h2>
        <button class="text-lg text-text-xmuted transition-colors hover:text-text-muted" @click="emit('close')">
          &times;
        </button>
      </div>
      <div class="flex-1 overflow-y-auto px-5 py-4">
        <p v-if="isLoading" class="text-sm text-text-muted">Loading...</p>
        <p v-else-if="versions.length === 0" class="text-sm text-text-muted">No version history.</p>
        <div v-else class="space-y-2">
          <div
            v-for="v in versions"
            :key="v.id"
            class="flex items-center justify-between gap-3 border-b border-border-light py-2 last:border-0"
          >
            <div class="min-w-0 flex-1">
              <span class="block truncate text-xs font-medium text-text-dark">{{ v.name }}</span>
              <span v-if="v.version_note" class="block truncate text-[11px] text-text-muted">{{ v.version_note }}</span>
              <div class="mt-0.5 flex gap-2 text-[11px] text-text-xmuted">
                <span v-if="v.edited_by_name">by {{ v.edited_by_name }}</span>
                <span>{{ formatDate(v.created_at) }}</span>
              </div>
            </div>
            <button
              class="shrink-0 rounded-sm border border-input-border bg-input-bg px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
              :disabled="restoringId === v.id"
              @click="handleRestore(v.id)"
            >
              {{ restoringId === v.id ? 'Restoring...' : 'Restore' }}
            </button>
          </div>
        </div>
      </div>
      <div class="flex justify-end border-t border-border-light px-5 py-3">
        <button
          class="rounded-sm border border-input-border bg-input-bg px-4 py-1.5 text-sm text-text-muted transition-colors hover:bg-card-hover hover:text-text-dark"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>