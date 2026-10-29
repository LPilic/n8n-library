<script setup lang="ts">
import { ref, onErrorCaptured, computed } from 'vue'
import { N8nButton } from '@n8n/design-system'

const hasError = ref(false)
const message = ref('')

onErrorCaptured((err) => {
  hasError.value = true
  message.value = err instanceof Error ? err.message : String(err)
  return false
})

function reset() {
  hasError.value = false
  message.value = ''
}

const showFallback = computed(() => hasError.value)
</script>

<template>
  <div v-if="showFallback" class="flex h-full items-center justify-center p-8">
    <div class="text-center">
      <h2 class="mb-2 text-lg font-semibold text-danger">Something went wrong</h2>
      <p class="mb-4 text-sm text-text-muted">{{ message }}</p>
      <N8nButton label="Try again" variant="brand" size="small" @click="reset" />
    </div>
  </div>
  <slot v-else />
</template>