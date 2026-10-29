<script setup lang="ts">
import { computed, ref } from 'vue'
import { N8nIcon } from '@n8n/design-system'
import { camelToLabel, inputVal } from './parts'

const props = defineProps<{
  /** Field key, used to derive the placeholder label */
  name?: string
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

// Secret masked by default; click the eye to reveal (same interaction as the React version)
const show = ref(false)

const computedPlaceholder = computed(() => props.placeholder ?? camelToLabel(props.name ?? ''))

function onInput(event: Event) {
  emit('update:modelValue', inputVal(event))
}
</script>

<template>
  <div class="relative">
    <input
      :type="show ? 'text' : 'password'"
      :value="modelValue"
      :placeholder="computedPlaceholder"
      class="w-full rounded-sm border border-input-border bg-input-bg px-3 py-1.5 pr-8 text-sm text-text-dark focus:border-input-focus focus:outline-none"
      @input="onInput"
    />
    <button
      type="button"
      class="absolute right-2 top-1/2 -translate-y-1/2 text-text-xmuted transition-colors hover:text-text-muted"
      @click="show = !show"
    >
      <N8nIcon :icon="show ? 'eye-off' : 'eye'" :size="13" />
    </button>
  </div>
</template>