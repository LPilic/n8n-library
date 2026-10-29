<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { N8nIcon } from '@n8n/design-system'
import { cn } from '@/lib/utils'

const props = defineProps<{
  tags: { id: string; name: string }[]
  selected: string[]
}>()

const emit = defineEmits<{
  (e: 'change', ids: string[]): void
}>()

const open = ref(false)
const rootRef = ref<HTMLDivElement | null>(null)

function onDocumentMousedown(e: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) open.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMousedown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMousedown)
})

function toggle(id: string) {
  emit('change', props.selected.includes(id) ? props.selected.filter((x) => x !== id) : [...props.selected, id])
}
</script>

<template>
  <div ref="rootRef" class="relative">
    <button
      class="flex items-center gap-1.5 rounded-md border px-2.5 py-[5px] text-[12px] font-semibold"
      :class="cn(
        props.selected.length > 0
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-input-border bg-input-bg text-text-dark hover:bg-card-hover',
      )"
      @click="open = !open"
    >
      <N8nIcon icon="tags" :size="12" />
      Tags{{ props.selected.length > 0 ? ` (${props.selected.length})` : '' }}
      <N8nIcon icon="chevron-down" :size="10" />
    </button>
    <div
      v-if="open"
      class="dropdown-enter absolute top-full left-0 z-50 mt-1 max-h-60 w-56 overflow-y-auto rounded-md border border-border bg-bg-light py-1 shadow-lg"
    >
      <label
        v-for="t in tags"
        :key="t.id"
        class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-text-dark hover:bg-card-hover"
      >
        <input
          type="checkbox"
          :checked="props.selected.includes(t.id)"
          class="rounded border-border"
          @change="toggle(t.id)"
        />
        {{ t.name }}
      </label>
    </div>
  </div>
</template>