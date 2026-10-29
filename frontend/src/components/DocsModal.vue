<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { N8nButton, N8nDialog, N8nSpinner } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { markdownToHtml } from '@/lib/markdown'
import { useHighlight } from '@/composables/useHighlight'
import { sanitizeHtml } from '@/lib/sanitize'

interface Props {
  workflowName: string
  nodes: unknown[]
  connections: unknown
}

const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'close'): void }>()

const router = useRouter()
const toast = useToast()
const loading = ref(true)
const html = ref('')
const error = ref('')
const saving = ref(false)
const savedArticleId = ref<number | null>(null)
const highlightContainer = useHighlight([html])

onMounted(() => {
  api
    .post<{ documentation: string }>('/api/ai/document-workflow', {
      workflowName: props.workflowName,
      nodes: props.nodes,
      connections: props.connections,
    })
    .then((res) => {
      html.value = markdownToHtml(res.documentation || '')
      loading.value = false
    })
    .catch((err: unknown) => {
      error.value = err instanceof ApiError ? err.message : 'Failed to generate documentation'
      loading.value = false
    })
})

async function saveToKb() {
  saving.value = true
  try {
    const res = await api.post<{ id: number }>('/api/kb/articles', {
      title: `${props.workflowName} — Documentation`,
      body: html.value,
      excerpt: `Auto-generated documentation for the ${props.workflowName} workflow.`,
      status: 'draft',
      tags: ['workflow-docs', 'auto-generated'],
    })
    savedArticleId.value = res.id
    toast.success('Saved as draft article in Knowledge Base')
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Failed to save to KB')
  } finally {
    saving.value = false
  }
}

function viewInKb() {
  const id = savedArticleId.value
  emit('close')
  if (id) router.push(`/kb/${id}`)
}
</script>

<template>
  <N8nDialog
    :open="true"
    size="2xlarge"
    :header="`Documentation: ${props.workflowName}`"
    @update:open="emit('close')"
  >
    <div class="flex max-h-[75vh] flex-col">
      <div class="flex-1 overflow-y-auto px-6 py-6">
        <div v-if="loading" class="flex flex-col items-center justify-center gap-3 py-16">
          <N8nSpinner />
          <p class="text-[13px] text-text-muted">Generating documentation...</p>
        </div>
        <div v-if="error" class="py-8 text-center text-[13px] text-danger">{{ error }}</div>
        <div
          v-show="html && !loading"
          ref="highlightContainer"
          class="text-[14px] leading-[1.7] text-text-dark [&_a]:text-primary [&_a:hover]:underline [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-[20px] [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:border-b [&_h2]:border-border-light [&_h2]:pb-1 [&_h2]:text-[17px] [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-[15px] [&_h3]:font-semibold [&_li]:mb-1 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_strong]:text-text-dark [&_table]:mb-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border-b [&_td]:border-border-light [&_td]:p-2 [&_td]:text-[13px] [&_th]:border-b [&_th]:border-border [&_th]:p-2 [&_th]:text-left [&_th]:text-[12px] [&_th]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5"
          v-html="sanitizeHtml(html)"
        />
      </div>
      <div class="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
        <N8nButton
          v-if="savedArticleId"
          label="View in KB"
          variant="brand"
          size="small"
          @click="viewInKb"
        />
        <N8nButton
          v-else-if="html && !loading"
          label="Save to Knowledge Base"
          variant="success"
          size="small"
          :loading="saving"
          @click="saveToKb"
        />
        <N8nButton label="Close" variant="ghost" size="small" @click="emit('close')" />
      </div>
    </div>
  </N8nDialog>
</template>