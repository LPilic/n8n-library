<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { formatCredType } from './parts'
import type { Credential } from './parts'

const props = defineProps<{
  credentials: Credential[]
  typeFilter: string
}>()

const emit = defineEmits<{
  (e: 'update:typeFilter', value: string): void
}>()

const typeCounts = computed(() => {
  const counts: Record<string, number> = {}
  props.credentials.forEach((c) => {
    counts[c.type] = (counts[c.type] ?? 0) + 1
  })
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
})

const uniqueTypes = computed(() => typeCounts.value.length)

function onTypeFilter(type: string) {
  emit('update:typeFilter', props.typeFilter === type ? '' : type)
}
</script>

<template>
  <aside class="w-48 shrink-0">
    <div class="space-y-4 rounded-md border border-border bg-card p-3">
      <div>
        <p class="mb-2 text-[10px] font-semibold uppercase text-text-xmuted">Overview</p>
        <div class="space-y-1.5">
          <div class="flex justify-between text-xs">
            <span class="text-text-muted">Total</span>
            <span class="font-semibold text-text-dark">{{ credentials.length }}</span>
          </div>
          <div class="flex justify-between text-xs">
            <span class="text-text-muted">Types</span>
            <span class="font-semibold text-text-dark">{{ uniqueTypes }}</span>
          </div>
        </div>
      </div>

      <div v-if="typeCounts.length > 0">
        <p class="mb-2 text-[10px] font-semibold uppercase text-text-xmuted">By Type</p>
        <div class="space-y-0.5">
          <button
            v-for="[type, count] in typeCounts"
            :key="type"
            :class="
              cn(
                'flex w-full items-center justify-between rounded-sm px-1.5 py-1 text-xs transition-colors',
                typeFilter === type ? 'bg-primary-light text-primary' : 'text-text-muted hover:bg-card-hover',
              )
            "
            @click="onTypeFilter(type)"
          >
            <span class="truncate text-left">{{ formatCredType(type) }}</span>
            <span class="ml-1 shrink-0 font-medium">{{ count }}</span>
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>