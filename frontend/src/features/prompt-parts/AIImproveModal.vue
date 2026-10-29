<script setup lang="ts">
// ─── AIImproveModal (ported from AIImproveModal in prompts.tsx) ───────────────
import { computed, ref } from 'vue'
import { N8nButton, N8nDialog } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { wordDiff } from './shared'
import DiffPane from './DiffPane.vue'
import type { Prompt } from './shared'

const props = defineProps<{
  prompt: Prompt
}>()

const emit = defineEmits<{
  close: []
  accepted: []
}>()

const toast = useToast()

const instruction = ref('')
const improved = ref<string | null>(null)
const improving = ref(false)
const accepting = ref(false)

async function improve() {
  improving.value = true
  try {
    const data = await api.post<{ content: string }>('/api/ai/improve', {
      promptId: props.prompt.id,
      content: props.prompt.content ?? '',
      instruction: instruction.value,
    })
    improved.value = data.content
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'AI improve failed')
  } finally {
    improving.value = false
  }
}

async function accept() {
  if (improved.value == null) return
  accepting.value = true
  try {
    await api.put(`/api/prompts/${props.prompt.id}`, {
      name: props.prompt.name,
      content: improved.value,
      category: props.prompt.category,
      status: props.prompt.status,
      variables: props.prompt.variables,
      tags: props.prompt.tags,
      change_note: 'AI-improved content',
    })
    toast.success('Improved content saved')
    emit('accepted')
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    accepting.value = false
  }
}

const diff = computed(() =>
  improved.value != null ? wordDiff(props.prompt.content ?? '', improved.value) : null,
)

function onOpenChange(open: boolean) {
  if (!open) emit('close')
}
</script>

<template>
  <N8nDialog :open="true" size="xlarge" header="AI Improve" show-close-button @update:open="onOpenChange">
    <div class="flex flex-col gap-3 p-4">
      <!-- Original content -->
      <div v-if="improved === null">
        <div class="mb-1 text-xs font-medium text-text-muted">Current content</div>
        <pre class="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-sm border border-border-light bg-bg p-3 font-mono text-xs leading-relaxed text-text-muted">{{ prompt.content || '(empty)' }}</pre>
      </div>

      <!-- Side-by-side after improvement -->
      <div v-if="diff !== null" class="grid grid-cols-2 divide-x divide-border-light overflow-hidden rounded-sm border border-border-light">
        <div class="p-3">
          <div class="mb-2 text-[10px] font-semibold uppercase text-text-muted">Original</div>
          <DiffPane :tokens="diff.left" />
        </div>
        <div class="p-3">
          <div class="mb-2 text-[10px] font-semibold uppercase text-success">Improved</div>
          <DiffPane :tokens="diff.right" />
        </div>
      </div>

      <!-- Instruction -->
      <div>
        <label class="mb-1 block text-xs font-medium text-text-muted">
          How should this prompt be improved?
        </label>
        <textarea
          v-model="instruction"
          rows="3"
          class="w-full resize-y rounded-sm border border-input-border bg-input-bg px-3 py-2 text-sm text-text-dark outline-none focus:border-input-focus"
          placeholder="e.g. Make it more concise, add clearer instructions for formatting, improve tone..."
        />
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-2 pt-2">
        <N8nButton variant="outline" size="small" label="Cancel" @click="emit('close')" />
        <N8nButton
          v-if="improved !== null"
          variant="success"
          size="small"
          :loading="accepting"
          :label="accepting ? 'Saving...' : 'Accept & Save'"
          @click="accept"
        />
        <N8nButton
          variant="brand"
          size="small"
          icon="sparkles"
          :loading="improving"
          :disabled="!instruction.trim() || improving"
          :label="improving ? 'Improving...' : improved !== null ? 'Re-improve' : 'Improve'"
          @click="improve"
        />
      </div>
    </div>
  </N8nDialog>
</template>