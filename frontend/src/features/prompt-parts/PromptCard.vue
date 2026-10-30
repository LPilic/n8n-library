<script setup lang="ts">
// ─── PromptCard (ported from PromptCard in prompts.tsx) ───────────────────────
import { computed } from 'vue'
import { N8nIcon } from '@n8n/design-system'
import { cn, timeAgo } from '@/lib/utils'
import { statusBadge } from './shared'
import type { Prompt } from './shared'

const props = defineProps<{
  prompt: Prompt
}>()

const emit = defineEmits<{
  open: []
  delete: []
}>()

const varCount = computed(() => props.prompt.variables?.length ?? 0)
</script>

<template>
  <div
    class="group cursor-pointer rounded-xl border border-border bg-card p-4 transition-colors hover:border-border-focus"
    @click="emit('open')"
  >
    <div class="mb-2 flex items-start justify-between gap-2">
      <h3 class="truncate text-sm font-medium text-text-dark transition-colors group-hover:text-primary">
        {{ prompt.name }}
      </h3>
      <div class="flex shrink-0 items-center gap-1">
        <span :class="cn('rounded px-1.5 py-0.5 text-[10px] capitalize', statusBadge(prompt.status))">
          {{ prompt.status }}
        </span>
        <button
          class="rounded-sm p-1 text-text-xmuted hover:text-danger"
          title="Delete"
          @click.stop="emit('delete')"
        >
          <N8nIcon icon="trash-2" :size="12" />
        </button>
      </div>
    </div>

    <p v-if="prompt.description" class="mb-2 line-clamp-2 text-xs text-text-muted">
      {{ prompt.description }}
    </p>

    <div class="flex flex-wrap items-center gap-2">
      <span v-if="prompt.category" class="rounded bg-border-light px-1.5 py-0.5 text-[10px] text-text-muted">
        {{ prompt.category }}
      </span>
      <span v-if="varCount > 0" class="flex items-center gap-0.5 text-[10px] text-text-muted">
        <N8nIcon icon="variable" :size="10" /> {{ varCount }} var{{ varCount !== 1 ? 's' : '' }}
      </span>
      <span v-if="prompt.version != null" class="flex items-center gap-0.5 text-[10px] text-text-xmuted">
        <N8nIcon icon="history" :size="10" /> v{{ prompt.version }}
      </span>
      <span
        v-if="prompt.created_by_name"
        class="max-w-[80px] truncate text-[10px] text-text-xmuted"
        :title="prompt.created_by_name"
      >
        {{ prompt.created_by_name }}
      </span>
      <span class="ml-auto text-[10px] text-text-xmuted">{{ timeAgo(prompt.updated_at) }}</span>
    </div>
  </div>
</template>