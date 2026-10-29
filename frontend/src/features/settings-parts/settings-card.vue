<script setup lang="ts">
import { N8nIcon } from '@n8n/design-system'

defineProps<{
  /** Lucide kebab-case icon name, rendered in a tinted square */
  icon: string
  title: string
  description?: string
}>()
</script>

<template>
  <!-- Card wrapper matching legacy settings section design -->
  <div class="mb-6 rounded-md border border-border bg-card p-6 shadow-card">
    <div class="mb-4 flex items-start justify-between">
      <div class="flex items-center gap-3">
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <N8nIcon :icon="icon" :size="20" />
        </div>
        <div>
          <h3 class="text-[15px] font-semibold text-text-dark">{{ title }}</h3>
          <p v-if="description" class="mt-0.5 text-xs text-text-muted">{{ description }}</p>
        </div>
      </div>
      <!-- Header action (e.g. "New User" button) -->
      <slot name="action" />
    </div>
    <slot />
  </div>
</template>