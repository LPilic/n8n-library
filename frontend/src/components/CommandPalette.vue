<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { N8nIcon } from '@n8n/design-system'
import { api } from '@/api/client'
import type { SearchResult } from '@/api/types'

interface PanelItem {
  name: string
  path: string
  icon: string
}

const PANELS: PanelItem[] = [
  { name: 'Dashboard', path: '/', icon: 'layout-dashboard' },
  { name: 'Template Library', path: '/library', icon: 'library' },
  { name: 'n8n Workflows', path: '/n8n', icon: 'zap' },
  { name: 'Monitoring', path: '/monitoring', icon: 'activity' },
  { name: 'Observability', path: '/observability', icon: 'chart-bar-big' },
  { name: 'Service Desk', path: '/tickets', icon: 'ticket' },
  { name: 'Knowledge Base', path: '/kb', icon: 'book-open' },
  { name: 'Prompts', path: '/prompts', icon: 'message-square-text' },
  { name: 'Settings', path: '/settings', icon: 'settings' },
]

interface ResultItem {
  label: string
  path: string
  type?: string
  icon?: string
}

interface DisplayItem extends ResultItem {
  section?: string
}

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const router = useRouter()
const query = ref('')
const results = ref<ResultItem[]>([])
const selected = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

function panelsAsResults(): ResultItem[] {
  return PANELS.map((p) => ({ label: p.name, path: p.path, type: 'navigate', icon: p.icon }))
}

function openInitial() {
  query.value = ''
  results.value = panelsAsResults()
  selected.value = 0
  setTimeout(() => inputRef.value?.focus(), 50)
}

async function search(q: string) {
  const lq = q.toLowerCase()
  const panelMatches: ResultItem[] = PANELS.filter((p) => p.name.toLowerCase().includes(lq)).map(
    (p) => ({ label: p.name, path: p.path, type: 'navigate', icon: p.icon }),
  )

  let apiResults: ResultItem[] = []
  if (q.length >= 2) {
    try {
      const data = await api.get<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`)
      apiResults = data.results.map((r) => ({ label: r.title, path: r.link, type: r.type }))
    } catch {
      /* ignore */
    }
  }

  results.value = [...panelMatches.slice(0, 5), ...apiResults.slice(0, 10)]
  selected.value = 0
}

function onInput(value: string) {
  query.value = value
  clearTimeout(timer)
  if (value.length === 0) {
    results.value = panelsAsResults()
    return
  }
  timer = setTimeout(() => search(value), 200)
}

function execute(path: string) {
  emit('close')
  router.push(path)
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selected.value = Math.min(selected.value + 1, results.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selected.value = Math.max(selected.value - 1, 0)
  } else if (e.key === 'Enter' && results.value[selected.value]) {
    execute(results.value[selected.value].path)
  } else if (e.key === 'Escape') {
    emit('close')
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) openInitial()
  },
  { immediate: true },
)

onBeforeUnmount(() => clearTimeout(timer))

/** Results with section labels attached where a new type group begins */
const displayItems = computed<DisplayItem[]>(() => {
  const out: DisplayItem[] = []
  let last = ''
  for (const r of results.value) {
    const section =
      r.type && r.type !== last
        ? r.type === 'navigate'
          ? 'Navigate'
          : r.type === 'template'
            ? 'Templates'
            : r.type === 'ticket'
              ? 'Tickets'
              : r.type === 'article'
                ? 'Knowledge Base'
                : (r.type.charAt(0).toUpperCase() + r.type.slice(1))
        : undefined
    last = r.type ?? last
    out.push({ ...r, section })
  }
  return out
})
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[100] flex items-start justify-center"
    style="padding-top: min(20vh, 160px)"
    @click="emit('close')"
  >
    <div class="fixed inset-0 bg-black/40" style="backdrop-filter: blur(2px)" />
    <div
      class="dropdown-enter relative max-h-[440px] w-[560px] max-w-[94vw] overflow-hidden rounded-lg border border-border bg-card"
      style="box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2)"
      @click.stop
    >
      <div class="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <N8nIcon icon="search" :size="16" class="shrink-0 text-text-muted" />
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          placeholder="Search pages, tickets, articles..."
          class="flex-1 bg-transparent text-[14px] text-text-dark outline-none placeholder:text-text-xmuted"
          @input="onInput(($event.target as HTMLInputElement).value)"
          @keydown="onKeyDown"
        />
        <kbd class="rounded-xs border border-border-light bg-bg px-1.5 py-0.5 text-[11px] text-text-xmuted">Esc</kbd>
      </div>

      <ul v-if="results.length > 0" class="max-h-[360px] overflow-y-auto py-1">
        <li v-for="(r, i) in displayItems" :key="`${r.path}-${i}`">
          <div
            v-if="r.section"
            class="px-4 pt-2 pb-1 text-[10px] font-semibold tracking-[0.06em] text-text-xmuted uppercase"
          >
            {{ r.section }}
          </div>
          <div
            class="flex cursor-pointer items-center gap-2.5 px-4 py-2 text-[13px] transition-colors duration-75"
            :class="i === selected ? 'bg-primary-light text-primary' : 'text-text-base hover:bg-bg'"
            @click="execute(r.path)"
            @mouseenter="selected = i"
          >
            <N8nIcon v-if="r.icon" :icon="r.icon" :size="16" class="shrink-0 opacity-60" />
            <span class="flex-1 truncate">{{ r.label }}</span>
            <span v-if="r.type && r.type !== 'navigate'" class="text-[11px] text-text-xmuted capitalize">{{ r.type }}</span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>