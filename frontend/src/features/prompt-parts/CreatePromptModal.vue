<script setup lang="ts">
// ─── CreatePromptModal (ported from CreatePromptModal in prompts.tsx) ─────────
import { ref } from 'vue'
import { N8nButton, N8nDialog, N8nInput, N8nOption, N8nSelect } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import type { PromptStatus } from './shared'

const emit = defineEmits<{
  close: []
  created: []
}>()

const toast = useToast()

const name = ref('')
const description = ref('')
const content = ref('')
const category = ref('')
const status = ref<PromptStatus>('draft')
const creating = ref(false)

const createMut = async () => {
  creating.value = true
  try {
    await api.post('/api/prompts', {
      name: name.value,
      description: description.value,
      content: content.value,
      category: category.value,
      status: status.value,
    })
    emit('created')
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Create failed')
  } finally {
    creating.value = false
  }
}

function onOpenChange(open: boolean) {
  if (!open) emit('close')
}

// Hint text with moustache syntax kept in script (literal {{...}} can't appear
// inside a template interpolation expression)
const VARIABLE_HINT = 'Use {{variable_name}} syntax for template variables'
</script>

<template>
  <N8nDialog :open="true" size="small" header="New Prompt" show-close-button @update:open="onOpenChange">
    <div class="flex flex-col gap-3 p-4">
      <div class="flex gap-2">
        <div class="flex-1">
          <label class="mb-1 block text-xs font-medium text-text-muted">Name *</label>
          <N8nInput
            v-model="name"
            type="text"
            placeholder="e.g. Customer Support Reply"
            class="w-full"
          />
        </div>
        <div class="w-32">
          <label class="mb-1 block text-xs font-medium text-text-muted">Status</label>
          <N8nSelect v-model="status" :filterable="false" size="medium">
            <N8nOption value="draft" label="Draft">Draft</N8nOption>
            <N8nOption value="published" label="Published">Published</N8nOption>
            <N8nOption value="archived" label="Archived">Archived</N8nOption>
          </N8nSelect>
        </div>
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-text-muted">Category</label>
        <N8nInput
          v-model="category"
          type="text"
          placeholder="e.g. Support, Marketing"
          class="w-full"
        />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-text-muted">Description</label>
        <N8nInput
          v-model="description"
          type="text"
          placeholder="Brief description..."
          class="w-full"
        />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-text-muted">Content</label>
        <textarea
          v-model="content"
          rows="6"
          class="w-full resize-y rounded-sm border border-input-border bg-input-bg px-3 py-2 font-mono text-sm text-text-dark outline-none focus:border-input-focus"
          placeholder="You are a helpful assistant. {{variable_name}} ..."
        />
        <p class="mt-0.5 text-[11px] text-text-xmuted">
          {{ VARIABLE_HINT }}
        </p>
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-2 pt-2">
        <N8nButton variant="outline" size="small" label="Cancel" @click="emit('close')" />
        <N8nButton
          variant="brand"
          size="small"
          :loading="creating"
          :disabled="!name.trim() || creating"
          :label="creating ? 'Creating...' : 'Create Prompt'"
          @click="createMut"
        />
      </div>
    </div>
  </N8nDialog>
</template>