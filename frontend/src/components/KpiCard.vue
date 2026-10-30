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
  info: 'bg-info-light text-text-muted',
}

function onClick() {
  emit('click')
  if (props.link) router.push(props.link)
}
</script>

<template>
  <div
    class="card-hover-effect flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-card p-5"
    @click="onClick"
  >
    <div class="min-w-0 flex-1">
      <div class="truncate text-[12px] font-medium text-text-muted">{{ sublabel }}</div>
      <div class="mt-1 truncate text-[20px] leading-tight font-semibold text-text-dark">{{ label }}</div>
    </div>
    <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" :class="colorMap[color ?? ''] ?? 'bg-bg-light text-text-muted'">
      <N8nIcon :icon="icon" :size="18" />
    </div>
  </div>
</template>