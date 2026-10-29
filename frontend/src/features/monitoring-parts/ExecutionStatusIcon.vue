<script setup lang="ts">
// Ported from StatusIcon in monitoring.tsx:
// CheckCircle / XCircle / Loader2(spin) / Clock / Zap → design-system icons.
import { computed } from 'vue'
import { N8nIcon } from '@n8n/design-system'

const props = defineProps<{ status: string }>()

const STATUS_META: Record<string, { icon: string; cls: string; spin?: boolean }> = {
  success: { icon: 'circle-check', cls: 'text-success' },
  error: { icon: 'circle-x', cls: 'text-danger' },
  running: { icon: 'loader-circle', cls: 'text-primary', spin: true },
  waiting: { icon: 'clock', cls: 'text-warning' },
}

const meta = computed(
  () => STATUS_META[props.status] ?? { icon: 'zap', cls: 'text-text-muted' },
)
</script>

<template>
  <N8nIcon
    :icon="meta.icon"
    :size="16"
    class="shrink-0"
    :class="[meta.cls, meta.spin ? 'animate-spin' : '']"
  />
</template>