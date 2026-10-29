<script setup lang="ts">
import { N8nSelect, N8nOption } from '@n8n/design-system'

export interface SelectOption {
  value: string
  label: string
}

defineProps<{
  value: string
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'change', value: string): void
}>()

function onUpdate(v: unknown) {
  emit('change', String(v))
}
</script>

<template>
  <!-- Thin wrapper over the design-system select -->
  <N8nSelect
    :model-value="value"
    :placeholder="placeholder"
    :disabled="disabled"
    :filterable="false"
    class="w-full"
    @update:model-value="onUpdate"
  >
    <N8nOption v-for="o in options" :key="o.value" :value="o.value" :label="o.label">
      <span style="font-size: 13px">{{ o.label }}</span>
    </N8nOption>
  </N8nSelect>
</template>