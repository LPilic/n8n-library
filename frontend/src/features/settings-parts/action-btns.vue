<script setup lang="ts">
import { N8nIcon } from '@n8n/design-system'

defineEmits<{
  (e: 'edit'): void
  (e: 'delete'): void
}>()
</script>

<template>
  <div class="flex items-center justify-end gap-1">
    <button
      type="button"
      class="rounded-sm p-1.5 text-text-xmuted transition-colors hover:text-text-dark"
      title="Edit"
      @click="$emit('edit')"
    >
      <N8nIcon icon="pencil" :size="13" />
    </button>
    <button
      type="button"
      class="rounded-sm p-1.5 text-text-xmuted transition-colors hover:text-danger"
      title="Delete"
      @click="$emit('delete')"
    >
      <N8nIcon icon="trash-2" :size="13" />
    </button>
  </div>
</template>