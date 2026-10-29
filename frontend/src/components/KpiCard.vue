<script setup lang="ts">
import { useRouter } from 'vue-router'
import { N8nIcon } from '@n8n/design-system'

const props = defineProps<{
  icon: string
  label: string
  sublabel: string
  color?: 'primary' | 'success' | 'danger' | 'warning' | 'info'
  /** Navigate to this path on click */
  link?: string
}>()

const emit = defineEmits<{ (e: 'click'): void }>()
const router = useRouter()

const colorMap: Record<string, string> = {
  primary: 'bg-primary-light text-primary',
  success: 'bg-success-light text-success',
  danger: 'bg-danger-light text-danger',
  warning: 'bg-warning-light text-warning',
  info: 'bg-info-light text-info',
}

function onClick() {
  emit('click')
  if (props.link) router.push(props.link)
}
</script>

<template>
  <div class="card-hover-effect flex cursor-pointer flex-col items-start justify-between gap-3 rounded-lg border border-border bg-card p-4" @click="onClick">
    <div class="min-w-0">
      <div class="truncate text-[11px] font-semibold text-text-muted tracking-[0.04em] uppercase">{{ sublabel }}</div>
      <div class="mt-1 text-[20px] leading-tight font-semibold text-text-dark">{{ label }}</div>
    </div>
    <div class="shrink-0 rounded-xs p-1.5" :class="colorMap[color ?? ''] ?? 'bg-bg text-text-muted'">
      <N8nIcon :icon="icon" :size="20" />
    </div>
  </div>
</template>