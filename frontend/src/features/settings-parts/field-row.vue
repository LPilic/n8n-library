<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <div>
    <label class="mb-1 block text-xs font-medium text-text-muted">{{ label }}</label>
    <slot />
  </div>
</template>