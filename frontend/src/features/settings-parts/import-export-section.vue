<script setup lang="ts">
// ─── ImportExportTab ──────────────────────────────────────────────────────────
import { ref } from 'vue'
import { N8nButton, N8nHeading, N8nIcon } from '@n8n/design-system'
import { api } from '@/api/client'
import { useToast } from '@/stores/toast'
import SettingsCard from './settings-card.vue'

const toast = useToast()

const fileRef = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const exporting = ref(false)

async function handleExport() {
  exporting.value = true
  try {
    const res = await fetch('/api/settings/export')
    if (!res.ok) throw new Error('Export failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `n8n-library-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Export downloaded')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Export failed')
  } finally {
    exporting.value = false
  }
}

async function handleImport() {
  const file = fileRef.value?.files?.[0]
  if (!file) return
  importing.value = true
  try {
    const text = await file.text()
    await api.post('/api/settings/import', JSON.parse(text))
    toast.success('Import successful — settings applied')
    if (fileRef.value) fileRef.value.value = ''
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Import failed')
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <SettingsCard icon="upload" title="Export / Import" description="Backup and restore settings, categories, and alerts">
    <div class="space-y-6">
      <div class="space-y-2">
        <N8nHeading size="medium" tag="h3">Export</N8nHeading>
        <p class="text-[13px] text-text-muted">
          Download a JSON snapshot of all settings, categories, instances, and configuration.
        </p>
        <N8nButton variant="brand" size="small" :loading="exporting" :disabled="exporting" @click="handleExport">
          <span class="flex items-center gap-1.5">
            <N8nIcon icon="download" :size="12" />
            {{ exporting ? 'Exporting...' : 'Download Export' }}
          </span>
        </N8nButton>
      </div>

      <div class="space-y-2 border-t border-border-light pt-4">
        <N8nHeading size="medium" tag="h3">Import</N8nHeading>
        <p class="text-[13px] text-text-muted">
          Upload a previously exported JSON file to restore settings. Existing data may be overwritten.
        </p>
        <div class="flex items-center gap-2">
          <input
            ref="fileRef"
            type="file"
            accept="application/json,.json"
            class="text-xs text-text-muted file:mr-2 file:rounded-sm file:border file:border-input-border file:bg-bg file:px-3 file:py-1 file:text-xs file:text-text-dark file:cursor-pointer hover:file:bg-card-hover"
          />
          <N8nButton variant="outline" size="small" :loading="importing" :disabled="importing" class="shrink-0" @click="handleImport">
            <span class="flex items-center gap-1.5">
              <N8nIcon icon="upload" :size="12" />
              {{ importing ? 'Importing...' : 'Upload' }}
            </span>
          </N8nButton>
        </div>
      </div>
    </div>
  </SettingsCard>
</template>