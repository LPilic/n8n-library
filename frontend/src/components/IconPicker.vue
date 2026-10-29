<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { icons as LUCIDE_ICONS } from 'lucide-vue-next'
import { N8nIcon, N8nInput } from '@n8n/design-system'

// Full lucide component name list (PascalCase, as stored by the backend)
const allIconNames = Object.keys(LUCIDE_ICONS).sort()

const props = defineProps<{
  /** PascalCase lucide icon name, e.g. 'Rocket' (as stored by the backend) */
  value: string
}>()
const emit = defineEmits<{ (e: 'change', name: string): void }>()

const open = ref(false)
const search = ref('')

const filtered = computed(() => {
  if (!search.value) return allIconNames.slice(0, 80) // show first 80 by default
  const q = search.value.toLowerCase()
  return allIconNames.filter((n) => n.toLowerCase().includes(q)).slice(0, 80)
})

const selectedIconComponent = computed(() => {
  const map = LUCIDE_ICONS as unknown as Record<string, never>
  return props.value ? (map[props.value] ?? null) : null
})

function pick(name: string) {
  emit('change', name)
  open.value = false
  search.value = ''
}

watch(open, (o) => {
  if (o) search.value = ''
})
</script>

<template>
  <div>
    <!-- Selected icon display + trigger -->
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border transition-colors"
        :class="value ? 'border-primary bg-primary-light' : 'border-border bg-bg'"
        @click="open = !open"
      >
        <component :is="selectedIconComponent" v-if="selectedIconComponent" :size="22" class="text-primary" />
        <span v-else class="text-xs text-text-xmuted">Pick</span>
      </button>
      <div class="flex-1">
        <input
          type="text"
          :value="value"
          placeholder="Icon name (e.g. Rocket, Shield)"
          class="w-full rounded-md border border-input-border bg-input-bg px-3 py-2 text-[13px] text-text-dark outline-none transition-colors focus:border-primary"
          @input="emit('change', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <button
        v-if="value"
        type="button"
        class="cursor-pointer p-1 text-text-xmuted transition-colors hover:text-text-dark"
        @click="emit('change', '')"
      >
        <N8nIcon icon="x" :size="14" />
      </button>
    </div>

    <!-- Icon picker dropdown -->
    <div
      v-if="open"
      class="dropdown-enter mt-2 flex max-h-[320px] flex-col rounded-md border border-border bg-card p-3 shadow-popover"
    >
      <div class="relative mb-2 shrink-0">
        <N8nIcon icon="search" :size="14" class="absolute top-1/2 left-2 -translate-y-1/2 text-text-xmuted" />
        <input
          v-model="search"
          type="text"
          :placeholder="`Search ${allIconNames.length} icons...`"
          class="w-full rounded-md border border-input-border bg-input-bg py-1.5 text-[13px] text-text-dark outline-none focus:border-primary"
          style="padding-left: 30px"
        />
      </div>
      <div class="flex-1 overflow-y-auto">
        <div class="grid grid-cols-8 gap-1">
          <button
            v-for="name in filtered"
            :key="name"
            type="button"
            :title="name"
            class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border transition-colors"
            :class="
              value === name
                ? 'border-primary bg-primary-light text-primary'
                : 'border-transparent text-text-muted hover:border-border hover:bg-bg hover:text-text-dark'
            "
            @click="pick(name)"
          >
            <component :is="(LUCIDE_ICONS as unknown as Record<string, never>)[name]" :size="18" />
          </button>
        </div>
        <p v-if="filtered.length === 0" class="py-4 text-center text-xs text-text-xmuted">
          No icons matching "{{ search }}"
        </p>
        <p v-if="!search" class="mt-2 text-center text-[10px] text-text-xmuted">
          Type to search all {{ allIconNames.length }} icons
        </p>
      </div>
    </div>
  </div>
</template>