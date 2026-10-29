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
  <!-- Explicit heights: Dialog sizes itself to content; flex-1 chains collapse to 0 -->
  <N8nDialog :open="true" size="2xlarge" :header="title" @update:open="emit('close')">
    <div style="height: min(78vh, 760px); margin-top: 12px">
      <div class="relative h-full w-full overflow-hidden rounded-lg border border-border bg-bg-light">
        <N8nDemoPreview :workflow="workflowData" />
      </div>
    </div>
    <div class="mt-3 flex justify-end">
      <N8nButton label="Close" variant="outline" size="small" @click="emit('close')" />
    </div>
  </N8nDialog>
</template>