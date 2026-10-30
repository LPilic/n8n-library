<script setup lang="ts">
// Ported from TicketMetaCard in tickets.tsx — small labeled metadata card.
defineProps<{
  label: string
}>()
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-border bg-card">
    <div class="border-b border-border-light bg-bg px-3 py-1.5">
      <span class="text-[12px] font-medium text-text-muted">{{ label }}</span>
    </div>
    <div class="px-3 py-2">
      <slot />
    </div>
  </div>
</template>