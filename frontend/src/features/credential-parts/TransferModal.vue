<script setup lang="ts">
import { computed, ref } from 'vue'
import { N8nButton, N8nDialog } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import CustomSelect from '@/components/CustomSelect.vue'
import type { Credential, Project } from './parts'

const props = defineProps<{
  cred: Credential
  projects: Project[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'done'): void
}>()

const toast = useToast()

const projectId = ref('')
const transferring = ref(false)

const projectOptions = computed(() => [
  { value: '', label: 'Select project...' },
  ...props.projects.map((p) => ({ value: p.id, label: p.name })),
])

async function transfer() {
  transferring.value = true
  try {
    await api.put(`/api/credentials/${props.cred.id}/transfer`, { projectId: projectId.value })
    toast.success('Credential transferred')
    emit('done')
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Transfer failed')
  } finally {
    transferring.value = false
  }
}

function onOpenChange(open: boolean) {
  if (!open) emit('close')
}
</script>

<template>
  <N8nDialog
    :open="true"
    size="small"
    header="Transfer Credential"
    show-close-button
    @update:open="onOpenChange"
  >
    <div class="flex flex-col gap-3  p-4">
      <p class="text-xs text-text-muted">
        Transfer <span class="font-medium text-text-dark">{{ cred.name }}</span> to a project:
      </p>
      <CustomSelect
        :value="projectId"
        :options="projectOptions"
        class="w-full"
        @change="projectId = $event"
      />
    </div>
    <div class="flex justify-end gap-2 border-t border-border px-4 py-3">
      <N8nButton variant="outline" size="small" label="Cancel" @click="emit('close')" />
      <N8nButton
        variant="brand"
        size="small"
        :disabled="!projectId || transferring"
        :loading="transferring"
        :label="transferring ? 'Transferring...' : 'Transfer'"
        @click="transfer"
      />
    </div>
  </N8nDialog>
</template>