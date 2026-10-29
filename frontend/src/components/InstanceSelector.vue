<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { N8nIcon, N8nSelect, N8nOption } from '@n8n/design-system'
import { useInstanceStore } from '@/stores/instance'

const store = useInstanceStore()

onMounted(() => {
  if (!store.loaded) store.load()
})

const show = computed(() => store.loaded && store.instances.length > 1)
const active = computed(() => store.instances.find((i) => i.id === store.activeId))
</script>

<template>
  <div v-if="show" class="mr-2 flex items-center gap-1.5">
    <N8nIcon icon="server" :size="14" class="shrink-0 text-text-xmuted" />
    <N8nSelect
      :model-value="store.activeId ?? ''"
      size="small"
      :filterable="false"
      class="w-[170px]"
      @update:model-value="(v) => store.setActive(Number(v))"
    >
      <N8nOption
        v-for="inst in store.instances"
        :key="inst.id"
        :value="inst.id"
        :label="`${inst.name}${inst.is_default ? ' (default)' : ''}`"
      />
    </N8nSelect>
    <span
      v-if="active?.color"
      class="h-2 w-2 shrink-0 rounded-full"
      :style="{ background: active.color }"
    />
  </div>
</template>