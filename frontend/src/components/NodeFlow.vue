<script lang="ts">
export interface NodeData {
  type?: string
  name?: string
  displayName?: string
  group?: string
  position?: number[]
  iconData?: { type?: string; fileBuffer?: string; icon?: string }
  icon?: string
}

const TRIGGER_KW = ['trigger', 'webhook', 'cron', 'schedule', 'start', 'event', 'formtrigger', 'chattrigger']

export function isTrigger(node: NodeData): boolean {
  const g = (node.group || '').toLowerCase()
  if (g.includes('trigger')) return true
  const s = ((node.type || '') + (node.name || '')).toLowerCase()
  return TRIGGER_KW.some((k) => s.includes(k))
}

export function getNodeLabel(node: NodeData): string {
  const raw = node.displayName || node.name || node.type?.split('.').pop() || '?'
  return raw.length > 16 ? raw.slice(0, 14) + '\u2026' : raw
}
</script>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { loadNodeIcons, getNodeIconSrc, getNodeFaIcon } from '@/lib/node-icons'
import { cn } from '@/lib/utils'

// Map FA icon names to Unicode characters for rendering without Font Awesome
const FA_UNICODE: Record<string, string> = {
  clock: '\u{1F551}', filter: '\u{1F50D}', pen: '\u270F', cog: '\u2699', table: '\u{1F4CA}',
  code: '\u{1F4BB}', envelope: '\u2709', database: '\u{1F4BE}', bolt: '\u26A1',
  globe: '\u{1F310}', file: '\u{1F4C4}', play: '\u25B6', pause: '\u23F8',
  'exchange-alt': '\u21C4', compress: '\u{1F500}', robot: '\u{1F916}',
  comment: '\u{1F4AC}', key: '\u{1F511}', users: '\u{1F465}', calendar: '\u{1F4C5}',
}

interface NodeDisplay {
  node: NodeData
  imgSrc: string | null
  ch: string
  trigger: boolean
}

const props = withDefaults(
  defineProps<{
    nodes: NodeData[]
    maxShow?: number
    compact?: boolean
    /** Show the hover "Preview" affordance */
    previewable?: boolean
  }>(),
  { maxShow: 12, compact: false, previewable: false },
)
const emit = defineEmits<{ (e: 'preview'): void }>()

const iconsReady = ref(false)
onMounted(async () => {
  await loadNodeIcons()
  iconsReady.value = true
})

function toDisplay(node: NodeData): NodeDisplay {
  // Read the flag so `sorted` re-runs once the icon cache finishes loading
  void iconsReady.value
  const trigger = isTrigger(node)
  const nodeType = node.type || node.name || ''
  const imgSrc =
    node.iconData?.type === 'file' && node.iconData.fileBuffer?.startsWith('data:image')
      ? node.iconData.fileBuffer
      : getNodeIconSrc(nodeType)

  let ch = '\u2699'
  if (node.iconData?.type === 'icon' && node.iconData.icon && node.iconData.icon !== 'question') {
    ch = FA_UNICODE[node.iconData.icon] || ch
  } else if (imgSrc) {
    // image wins below
  } else {
    const faIcon = getNodeFaIcon(nodeType)
    if (faIcon) ch = FA_UNICODE[faIcon] || ch
    else if (node.icon?.startsWith('fa:')) ch = FA_UNICODE[node.icon.replace('fa:', '')] || ch
  }
  return { node, imgSrc, ch, trigger }
}

const sorted = computed<NodeDisplay[]>(() =>
  [...props.nodes].sort((a, b) => {
    const at = isTrigger(a) ? 0 : 1
    const bt = isTrigger(b) ? 0 : 1
    if (at !== bt) return at - bt
    return (a.position?.[0] ?? 0) - (b.position?.[0] ?? 0)
  }).map(toDisplay),
)
const show = computed(() => sorted.value.slice(0, props.maxShow))
const remaining = computed(() => props.nodes.length - props.maxShow)
</script>

<template>
  <div
    v-if="props.nodes.length === 0"
    class="flex items-center justify-center text-xs text-text-xmuted"
    :class="!compact ? 'h-[208px] rounded-md border border-border-light bg-bg' : ''"
  >
    No nodes
  </div>
  <div
    v-else
    :class="cn(
      'group relative flex flex-wrap items-start gap-1.5',
      !compact && 'h-[208px] cursor-pointer overflow-hidden rounded-md border border-border-light bg-bg p-2.5 transition-colors duration-150 hover:border-primary',
      compact && 'gap-1',
    )"
    @click="previewable && emit('preview')"
  >
    <div v-for="(d, i) in show" :key="i" class="flex items-center gap-1.5">
      <span
        :class="cn(
          'inline-flex shrink-0 items-center gap-[5px] rounded-[14px] border py-1 pr-2.5 pl-[6px] text-[11px] font-medium whitespace-nowrap',
          d.trigger
            ? 'border-[#ffc8c0] bg-[#fff3f1] text-[#c63a28] dark:border-[#5c3028] dark:bg-[#2e1f1c] dark:text-[#ff8a7a]'
            : 'border-border bg-bg-light text-text-dark',
        )"
      >
        <span
          class="flex h-[22px] w-[22px] shrink-0 items-center justify-center overflow-hidden rounded-md border"
          :class="d.trigger ? 'border-primary bg-primary' : 'border-border-light bg-bg'"
        >
          <img v-if="d.imgSrc" :src="d.imgSrc" alt="" class="h-4 w-4 object-contain" />
          <span v-else class="text-[11px]" :class="d.trigger ? 'text-white' : 'text-text-dark'">{{ d.ch }}</span>
        </span>
        {{ getNodeLabel(d.node) }}
      </span>
      <span v-if="previewable && i < show.length - 1 && !compact" class="shrink-0 text-[11px] text-text-xmuted">&rarr;</span>
    </div>
    <span v-if="remaining > 0" class="shrink-0 px-2 py-1 text-[11px] text-text-muted">+{{ remaining }} more</span>
    <span
      v-if="previewable && !compact"
      class="pointer-events-none absolute right-2 bottom-2 z-[2] rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100"
    >
      Preview
    </span>
  </div>
</template>