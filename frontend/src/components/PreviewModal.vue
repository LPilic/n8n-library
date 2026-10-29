<script setup lang="ts">
import { N8nButton, N8nDialog } from '@n8n/design-system'
import N8nDemoPreview from '@/components/N8nDemoPreview.vue'

defineProps<{
  title: string
  workflowData: { nodes: unknown[]; connections: unknown }
}>()

const emit = defineEmits<{ (e: 'close'): void }>()
</script>

<template>
  <N8nDialog :open="true" size="full" :header="title" @update:open="emit('close')">
    <div class="flex h-full flex-col">
      <div class="relative min-h-0 flex-1 overflow-hidden">
        <N8nDemoPreview :workflow="workflowData" />
      </div>
      <div class="flex justify-end border-t border-border px-4 py-2">
        <N8nButton label="Close" variant="ghost" size="small" @click="emit('close')" />
      </div>
    </div>
  </N8nDialog>
</template>