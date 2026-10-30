<script setup lang="ts">
import { N8nButton } from '@n8n/design-system'
import NodeFlow from '@/components/NodeFlow.vue'
import { cn, timeAgo } from '@/lib/utils'

interface N8nNode {
  type?: string
  name?: string
  displayName?: string
  group?: string
  position?: number[]
  iconData?: { type?: string; fileBuffer?: string; icon?: string }
  icon?: string
}

interface N8nWorkflowLight {
  id: string
  name: string
  active: boolean
  nodeCount: number
  nodePreview: N8nNode[]
  updatedAt?: string
  tagIds: string[]
  tagNames: string[]
  ownerId?: string
  ownerName?: string
}

const props = withDefaults(
  defineProps<{
    workflow: N8nWorkflowLight
    aiEnabled: boolean
    renaming: boolean
    docsGenerating: boolean
  }>(),
  { docsGenerating: false },
)

const emit = defineEmits<{
  (e: 'preview'): void
  (e: 'import'): void
  (e: 'rename'): void
  (e: 'docs'): void
}>()
</script>

<template>
  <div class="card-hover-effect flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
    <div class="mb-3">
      <NodeFlow :nodes="workflow.nodePreview" :max-show="12" previewable @preview="emit('preview')" />
    </div>
    <div class="mb-1.5 flex items-start justify-between">
      <h3 class="mr-2 line-clamp-1 flex-1 text-[14px] font-semibold leading-tight text-text-dark">
        {{ workflow.name }}
      </h3>
      <span
        class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
        :class="cn(
          workflow.active ? 'bg-success-light text-success' : 'border border-border-light bg-bg text-text-muted',
        )"
      >
        {{ workflow.active ? '\u25CF Active' : '\u25CB Inactive' }}
      </span>
    </div>
    <div class="mb-1.5 text-[12px] text-text-muted">
      {{ workflow.nodeCount }} node{{ workflow.nodeCount !== 1 ? 's' : '' }}
      <template v-if="workflow.updatedAt"> &middot; Updated {{ timeAgo(workflow.updatedAt) }}</template>
    </div>
    <div v-if="workflow.tagNames.length > 0" class="mb-2 flex flex-wrap gap-1">
      <span
        v-for="tag in workflow.tagNames.slice(0, 3)"
        :key="tag"
        class="rounded border border-border-light bg-bg px-1.5 py-0.5 text-[11px] text-text-muted"
      >
        {{ tag }}
      </span>
      <span v-if="workflow.tagNames.length > 3" class="text-[11px] text-text-xmuted">
        +{{ workflow.tagNames.length - 3 }}
      </span>
    </div>
    <div class="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border-light pt-3">
      <N8nButton variant="success" size="small" label="Import to Library" @click="emit('import')" />
      <template v-if="aiEnabled">
        <N8nButton
          variant="outline"
          size="small"
          icon="sparkles"
          :label="props.renaming ? 'Renaming...' : 'Rename'"
          :disabled="props.renaming"
          :loading="props.renaming"
          @click="emit('rename')"
        />
        <N8nButton
          variant="outline"
          size="small"
          icon="file-text"
          :label="props.docsGenerating ? 'Generating...' : 'Docs'"
          :disabled="props.docsGenerating"
          :loading="props.docsGenerating"
          @click="emit('docs')"
        />
      </template>
    </div>
  </div>
</template>