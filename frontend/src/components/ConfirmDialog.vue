<script setup lang="ts">
import { N8nAlertDialog } from '@n8n/design-system'
import { useConfirmStore } from '@/stores/confirm'

const store = useConfirmStore()
</script>

<template>
  <N8nAlertDialog
    :open="store.open"
    title="Are you sure?"
    :description="store.message"
    :action-label="store.okLabel"
    :action-variant="store.danger ? 'destructive' : 'solid'"
    cancel-label="Cancel"
    size="small"
    @update:open="(v: boolean) => !v && store.close(false)"
    @action="store.close(true)"
    @cancel="store.close(false)"
  />
</template>