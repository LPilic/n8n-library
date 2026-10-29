<script setup lang="ts">
import { computed } from 'vue'
import { icons as LUCIDE_ICONS } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    /** PascalCase lucide icon name (as stored by the backend) */
    name?: string
    size?: number
  }>(),
  { name: '', size: 18 },
)

const component = computed(() => {
  const map = LUCIDE_ICONS as unknown as Record<string, never>
  return props.name ? (map[props.name] ?? null) : null
})
</script>

<template>
  <span v-if="!component" class="text-xs text-text-xmuted">{{ name || '—' }}</span>
  <component
    :is="component"
    v-else
    :size="size"
    class="text-text-muted"
  />
</template>