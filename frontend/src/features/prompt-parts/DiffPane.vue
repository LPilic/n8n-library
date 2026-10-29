<script setup lang="ts">
// ─── DiffPane (ported from DiffPane in prompts.tsx) ───────────────────────────
import type { DiffToken } from './shared'

defineProps<{ tokens: DiffToken[] }>()
</script>

<template>
  <div class="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed"><template v-for="(t, i) in tokens" :key="i"><mark v-if="t.type === 'added'" class="rounded bg-success-light px-0.5 text-success">{{ t.text }}</mark><mark v-else-if="t.type === 'removed'" class="rounded bg-danger-light px-0.5 text-danger line-through">{{ t.text }}</mark><span v-else>{{ t.text }}</span></template></div>
</template>