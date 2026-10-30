<script setup lang="ts">
// ─── McpServerTab ─────────────────────────────────────────────────────────────
import { computed, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nSwitch } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import SettingsCard from './settings-card.vue'

const MCP_TOOLS = [
  'search_templates',
  'get_template',
  'list_tickets',
  'get_ticket',
  'create_ticket',
  'search_kb_articles',
  'get_kb_article',
  'get_stats',
  'list_users',
]

const toast = useToast()
const qc = useQueryClient()

const { data: serverData, isLoading: serverLoading } = useQuery({
  queryKey: ['settings-mcp-server'],
  queryFn: () => api.get<{ enabled: boolean }>('/api/settings/mcp-server'),
})

const { data: toolsData, isLoading: toolsLoading } = useQuery({
  queryKey: ['settings-mcp-tools'],
  queryFn: () => api.get<{ tools: { name: string; enabled: boolean }[] }>('/api/settings/mcp-server-tools'),
})

const enabled = computed(() => serverData.value?.enabled ?? false)
const toolMap = computed<Record<string, boolean>>(() =>
  Object.fromEntries((toolsData.value?.tools ?? []).map((t) => [t.name, t.enabled])),
)

function isToolEnabled(tool: string): boolean {
  return toolMap.value[tool] ?? true
}

const savingServer = ref(false)
async function toggleServer(next: boolean) {
  savingServer.value = true
  try {
    await api.put('/api/settings/mcp-server', { enabled: next })
    toast.success('MCP server setting saved')
    await qc.invalidateQueries({ queryKey: ['settings-mcp-server'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    savingServer.value = false
  }
}

const savingTool = ref(false)
async function toggleTool(tool: string, next: boolean) {
  savingTool.value = true
  try {
    await api.put('/api/settings/mcp-server-tools', { tool, enabled: next })
    toast.success('Tool setting saved')
    await qc.invalidateQueries({ queryKey: ['settings-mcp-tools'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    savingTool.value = false
  }
}
</script>

<template>
  <SettingsCard icon="cpu" title="MCP Server" description="Expose n8n Library as an MCP server">
    <div class="flex flex-col gap-5 ">
      <!-- Enable toggle -->
      <div class="flex items-center justify-between rounded-xl border border-border bg-bg p-4">
        <div>
          <p class="text-sm font-semibold text-text-dark">MCP Server</p>
          <p class="mt-0.5 text-xs text-text-muted">
            {{ enabled ? 'Enabled — accepting MCP connections' : 'Disabled' }}
          </p>
        </div>
        <N8nSwitch
          :model-value="enabled"
          size="large"
          :disabled="serverLoading || savingServer"
          @update:model-value="toggleServer"
        />
      </div>

      <!-- Description -->
      <p class="text-xs text-text-muted">
        Expose n8n Library as an MCP server at <code class="font-mono text-text-dark">/mcp</code> — connect from Claude
        Desktop, Cursor, or other MCP clients using an API key.
      </p>

      <!-- Endpoint URLs -->
      <div class="flex flex-col gap-2 ">
        <p class="text-[13px] font-medium text-text-dark">Endpoint URLs</p>
        <div class="flex flex-col gap-1.5 ">
          <div>
            <p class="mb-0.5 text-[11px] text-text-xmuted">HTTP (SSE / streamable-http)</p>
            <code class="block rounded-sm border border-border bg-bg px-2 py-1.5 font-mono text-xs text-text-dark">
              POST /mcp  Authorization: Bearer n8nlib_xxx
            </code>
          </div>
          <div>
            <p class="mb-0.5 text-[11px] text-text-xmuted">stdio</p>
            <code class="block rounded-sm border border-border bg-bg px-2 py-1.5 font-mono text-xs text-text-dark">
              node mcp-stdio.js  or  npm run mcp
            </code>
          </div>
        </div>
      </div>

      <!-- Per-tool toggles -->
      <div class="flex flex-col gap-2 ">
        <p class="text-[13px] font-medium text-text-dark">Tools</p>
        <p v-if="toolsLoading" class="text-xs text-text-muted">Loading tools...</p>
        <div v-else class="divide-y divide-border-light rounded-xl border border-border">
          <div v-for="tool in MCP_TOOLS" :key="tool" class="flex items-center justify-between px-3 py-2">
            <span class="font-mono text-sm text-text-dark">{{ tool }}</span>
            <N8nSwitch
              size="small"
              :model-value="isToolEnabled(tool)"
              :disabled="savingTool"
              @update:model-value="(v: boolean) => toggleTool(tool, v)"
            />
          </div>
        </div>
      </div>
    </div>
  </SettingsCard>
</template>