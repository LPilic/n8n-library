<script setup lang="ts">
// ─── EditPromptModal (ported from EditPromptModal in prompts.tsx) ─────────────
import { ref } from 'vue'
import { N8nButton, N8nDialog, N8nInput, N8nOption, N8nSelect } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import type { Prompt, PromptStatus } from './shared'

const props = defineProps<{
  prompt: Prompt
  allCategories: string[]
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const toast = useToast()

const name = ref(props.prompt.name)
const content = ref(props.prompt.content ?? '')
const category = ref(props.prompt.category ?? '')
const status = ref<PromptStatus>(props.prompt.status)
const variables = ref((props.prompt.variables ?? []).join(', '))
const tags = ref((props.prompt.tags ?? []).join(', '))
const changeNote = ref('')
const saving = ref(false)

async function save() {
  saving.value = true
  try {
    const vars = variables.value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    const tagArr = tags.value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    await api.put(`/api/prompts/${props.prompt.id}`, {
      name: name.value,
      content: content.value,
      category: category.value,
      status: status.value,
      variables: vars,
      tags: tagArr,
      change_note: changeNote.value,
    })
    emit('saved')
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    saving.value = false
  }
}

const catlistId = `edit-categories-${props.prompt.id}`

function onOpenChange(open: boolean) {
  if (!open) emit('close')
}
</script>

<template>
  <N8nDialog :open="true" size="large" header="Edit Prompt" show-close-button @update:open="onOpenChange">
    <div class="flex flex-col gap-3 p-4">
      <div class="flex gap-2">
        <div class="flex-1">
          <label class="mb-1 block text-xs font-medium text-text-muted">Name *</label>
          <N8nInput v-model="name" type="text" class="w-full" />
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
        <!-- Plain input: needs the native `list` attribute for the category datalist -->
        <input
          v-model="category"
          type="text"
          :list="catlistId"
          class="w-full rounded-sm border border-input-border bg-input-bg px-3 py-1.5 text-sm text-text-dark outline-none focus:border-input-focus"
          placeholder="e.g. Support"
        />
        <datalist v-if="allCategories.length > 0" :id="catlistId">
          <option v-for="c in allCategories" :key="c" :value="c" />
        </datalist>
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-text-muted">
          Variables <span class="font-normal text-text-xmuted">(comma-separated)</span>
        </label>
        <N8nInput
          v-model="variables"
          type="text"
          placeholder="customer_name, product_id"
          class="w-full"
        />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-text-muted">
          Tags <span class="font-normal text-text-xmuted">(comma-separated)</span>
        </label>
        <N8nInput v-model="tags" type="text" placeholder="support, v2" class="w-full" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-text-muted">Content</label>
        <textarea
          v-model="content"
          rows="10"
          class="w-full resize-y rounded-sm border border-input-border bg-input-bg px-3 py-2 font-mono text-sm text-text-dark outline-none focus:border-input-focus"
        />
      </div>
      <div>
        <label class="mb-1 block text-xs font-medium text-text-muted">
          Change Note <span class="font-normal text-text-xmuted">(optional)</span>
        </label>
        <N8nInput
          v-model="changeNote"
          type="text"
          placeholder="Describe what changed..."
          class="w-full"
        />
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-2 pt-2">
        <N8nButton variant="outline" size="small" label="Cancel" @click="emit('close')" />
        <N8nButton
          variant="brand"
          size="small"
          :loading="saving"
          :disabled="!name.trim() || saving"
          :label="saving ? 'Saving...' : 'Save Changes'"
          @click="save"
        />
      </div>
    </div>
  </N8nDialog>
</template>