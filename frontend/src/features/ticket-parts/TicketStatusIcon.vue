<script setup lang="ts">
import { computed } from 'vue'
import { N8nIcon } from '@n8n/design-system'

// Ported from StatusIcon in tickets.tsx: AlertCircle / Loader2(spin) / CheckCircle / XCircle / Clock
const props = defineProps<{ status: string }>()

const STATUS_META: Record<string, { icon: string; cls: string; spin?: boolean }> = {
  open: { icon: 'circle-alert', cls: 'text-primary' },
  in_progress: { icon: 'loader-circle', cls: 'text-warning', spin: true },
  resolved: { icon: 'circle-check', cls: 'text-success' },
  closed: { icon: 'circle-x', cls: 'text-text-muted' },
}

const meta = computed(
  () => STATUS_META[props.status] ?? { icon: 'clock', cls: 'text-text-muted', spin: false },
)
</script>

<template>
  <N8nIcon
    :icon="meta.icon"
    :size="14"
    class="shrink-0"
    :class="[meta.cls, meta.spin ? 'animate-spin' : '']"
  />
</template>