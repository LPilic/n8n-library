<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps<{
  /** Workflow JSON ({ nodes, connections }) */
  workflow: { nodes: unknown[]; connections: unknown }
  minLength?: string
  minHeight?: string
}>()

const containerRef = ref<HTMLElement | null>(null)

function mountDemo() {
  const container = containerRef.value
  if (!container) return
  container.innerHTML = ''
  const demo = document.createElement('n8n-demo')
  demo.setAttribute('workflow', JSON.stringify(props.workflow))
  demo.setAttribute('frame', 'true')
  demo.style.cssText = `display:block;width:100%;height:100%;--n8n-workflow-min-height:${props.minHeight ?? '80vh'};--n8n-iframe-border-radius:0;--n8n-frame-background-color:#f5f5f5;`
  container.appendChild(demo)

  const style = document.createElement('style')
  style.textContent =
    'n8n-demo iframe { width:100%!important; height:100%!important; min-height:0!important; border:none!important; }'
  container.appendChild(style)
}

onMounted(mountDemo)
watch(() => props.workflow, mountDemo, { deep: true })
onBeforeUnmount(() => {
  if (containerRef.value) containerRef.value.innerHTML = ''
})
</script>

<template>
  <div ref="containerRef" class="absolute inset-0 h-full w-full" />
</template>