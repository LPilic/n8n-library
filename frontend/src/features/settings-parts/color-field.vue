<script setup lang="ts">
import FieldRow from './field-row.vue'

defineProps<{
  label: string
  value: string
}>()

const emit = defineEmits<{
  (e: 'change', value: string): void
}>()

function onColorChange(e: Event) {
  emit('change', (e.target as HTMLInputElement).value)
}
</script>

<template>
  <FieldRow :label="label">
    <div class="flex items-center gap-2">
      <input
        type="color"
        :value="value"
        class="h-8 w-10 shrink-0 cursor-pointer rounded-sm border border-input-border bg-input-bg p-0.5"
        @input="onColorChange"
      />
      <input
        type="text"
        :value="value"
        maxlength="7"
        placeholder="#000000"
        class="flex-1 rounded-sm border border-input-border bg-input-bg px-3 py-1.5 font-mono text-sm text-text-dark outline-none"
        @input="onColorChange"
      />
    </div>
  </FieldRow>
</template>