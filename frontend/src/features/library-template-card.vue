<script setup lang="ts">
import { computed } from 'vue'
import { N8nButton } from '@n8n/design-system'
import NodeFlow from '@/components/NodeFlow.vue'
import { sanitizeHtml } from '@/lib/sanitize'

interface TemplateNode {
  type?: string
  name?: string
  displayName?: string
  group?: string
  position?: number[]
  iconData?: { type?: string; fileBuffer?: string; icon?: string }
  icon?: string
}

interface Template {
  id: number
  name: string
  description?: string
  nodes?: TemplateNode[]
  categories?: Array<{ id: number; name: string }>
  createdAt?: string
}

const props = defineProps<{
  template: Template
  isWriter: boolean
  isAdmin: boolean
  aiEnabled: boolean
}>()

const emit = defineEmits<{
  (e: 'delete'): void
  (e: 'edit'): void
  (e: 'history'): void
  (e: 'preview'): void
  (e: 'docs'): void
}>()

const nodes = computed(() => props.template.nodes ?? [])

const descriptionHtml = computed(() =>
  sanitizeHtml(props.template.description || '<span class="text-text-xmuted">No description</span>'),
)
</script>

<template>
  <div class="card-hover-effect flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
    <!-- Node flow preview — clickable to open full n8n-demo preview -->
    <div class="mb-3">
      <NodeFlow :nodes="nodes" :max-show="12" previewable @preview="emit('preview')" />
    </div>

    <div class="mb-1.5 flex min-h-[20px] items-start justify-between">
      <h3 class="mr-2 line-clamp-1 flex-1 text-[14px] font-semibold leading-tight text-text-dark">
        {{ template.name }}
      </h3>
      <span class="shrink-0 rounded-full border border-border-light bg-bg px-2 py-0.5 text-[11px] text-text-muted">
        #{{ template.id }}
      </span>
    </div>

    <div
      class="mb-2.5 h-10 overflow-hidden text-[13px] leading-5 text-text-muted line-clamp-2 [&_a]:text-primary [&_code]:bg-bg [&_code]:px-1 [&_code]:text-xs [&_code]:rounded [&_strong]:text-text-dark"
      v-html="descriptionHtml"
    />

    <div class="mb-2.5 flex min-h-[22px] flex-wrap gap-1.5">
      <span
        v-for="c in template.categories ?? []"
        :key="c.id"
        class="rounded-full border border-border-light bg-bg px-2 py-0.5 text-[11px] font-medium text-text-muted"
      >
        {{ c.name }}
      </span>
    </div>

    <div v-if="isWriter || isAdmin" class="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border-light pt-3">
      <template v-if="isWriter">
        <N8nButton variant="outline" size="small" label="Edit" @click="emit('edit')" />
        <N8nButton variant="outline" size="small" icon="history" label="History" @click="emit('history')" />
        <N8nButton
          v-if="aiEnabled"
          variant="outline"
          size="small"
          icon="sparkles"
          label="Docs"
          @click="emit('docs')"
        />
      </template>
      <N8nButton
        v-if="isAdmin"
        variant="destructive"
        size="small"
        label="Delete"
        class="ml-auto"
        @click="emit('delete')"
      />
    </div>
  </div>
</template>