<script setup lang="ts">
import { N8nHeading, N8nIcon } from '@n8n/design-system'

defineProps<{
  /** Lucide kebab-case icon name, rendered in a tinted square */
  icon: string
  title: string
  description?: string
}>()
</script>

<template>
  <!-- Card wrapper matching legacy settings section design -->
  <div class="mb-6 rounded-xl border border-border bg-card p-6 shadow-card">
    <div class="mb-4 flex items-start justify-between">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <N8nIcon :icon="icon" :size="18" />
        </div>
        <div>
          <N8nHeading size="medium" tag="h3">{{ title }}</N8nHeading>
          <p v-if="description" class="mt-0.5 text-[13px] text-text-muted">{{ description }}</p>
        </div>
      </div>
      <!-- Header action (e.g. "New User" button) -->
      <slot name="action" />
    </div>
    <slot />
  </div>
</template>