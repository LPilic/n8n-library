<script setup lang="ts">
import { formatCredType } from './parts'

defineProps<{
  type: string
}>()
</script>

<template>
  <span class="inline-block whitespace-nowrap rounded bg-primary-light px-1.5 py-0.5 text-[11px] font-medium text-primary">
    {{ formatCredType(type) }}
  </span>
</template>