<script setup lang="ts">
import { N8nIcon, N8nText } from '@n8n/design-system'
import { useToastStore, type ToastType } from '@/stores/toast'

const store = useToastStore()

const ICONS: Record<ToastType, string> = {
  success: 'check',
  error: 'circle-alert',
  warning: 'triangle-alert',
  info: 'info',
}

const COLORS: Record<ToastType, string> = {
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
}
</script>

<template>
  <Teleport to="body">
    <div
      class="toast-enter pointer-events-auto absolute right-6 bottom-6 z-[999] flex max-w-sm min-w-72 flex-col gap-2"
    >
      <div
        v-for="t in store.toasts"
        :key="t.id"
        class="pointer-events-auto flex items-start gap-2 rounded-lg border border-border bg-card p-3 text-text-dark shadow-popover"
      >
        <N8nIcon :icon="ICONS[t.type]" size="small" :class="COLORS[t.type]" class="mt-0.5 shrink-0" />
        <N8nText size="small" class="flex-1">{{ t.message }}</N8nText>
        <button
          class="shrink-0 cursor-pointer text-text-xmuted transition-colors hover:text-text-dark"
          @click="store.remove(t.id)"
        >
          <N8nIcon icon="x" size="xsmall" />
        </button>
      </div>
    </div>
  </Teleport>
</template>