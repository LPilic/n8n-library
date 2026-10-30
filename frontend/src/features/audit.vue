<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { N8nBadge, N8nIcon, N8nInput, N8nOption, N8nPagination, N8nSelect } from '@n8n/design-system'
import { api } from '@/api/client'
import { timeAgo } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: number
  created_at: string
  user?: string
  action: string
  entity_type: string
  entity_id?: string | number
  details?: string
}

interface AuditLogResponse {
  entries: AuditEntry[]
  total: number
}

const ENTITY_TYPES = [
  'workflow', 'credential', 'user', 'tag', 'variable', 'setting', 'api_key',
]

const ACTIONS = [
  'create', 'update', 'delete', 'login', 'logout', 'execute', 'import', 'export',
]

// ─── AuditPage ────────────────────────────────────────────────────────────────

const page = ref(1)
const entityType = ref('')
const action = ref('')
const search = ref('')

const limit = 50

const { data, isLoading } = useQuery({
  // Refs in the query key make the query refetch on every filter/page change
  queryKey: ['audit-log', page, entityType, action, search],
  queryFn: () => {
    const params = new URLSearchParams({ page: String(page.value), limit: String(limit) })
    if (entityType.value) params.set('entity_type', entityType.value)
    if (action.value) params.set('action', action.value)
    if (search.value) params.set('search', search.value)
    return api.get<AuditLogResponse>(`/api/audit-log?${params}`)
  },
})

const entries = computed(() => data.value?.entries ?? [])
const total = computed(() => data.value?.total ?? 0)
const pages = computed(() => Math.max(1, Math.ceil(total.value / limit)))

const entityTypeOptions = [
  { value: '', label: 'All Entity Types' },
  ...ENTITY_TYPES.map((t) => ({ value: t, label: t })),
]

const actionOptions = [
  { value: '', label: 'All Actions' },
  ...ACTIONS.map((a) => ({ value: a, label: a })),
]

/** Semantic badge variants for the audit actions (friendly color-coding) */
function actionVariant(action: string): 'primary' | 'success' | 'danger' | 'warning' | 'subtle' {
  const a = action.toLowerCase()
  if (a.includes('delete') || a.includes('remove')) return 'danger'
  if (a.includes('create') || a.includes('import')) return 'success'
  if (a.includes('provision') || a.includes('login')) return 'primary'
  if (a.includes('status')) return 'warning'
  return 'subtle'
}
</script>

<template>
  <div>
    <!-- Filters -->
    <div class="mb-5 flex flex-wrap items-center gap-2">
      <N8nInput
        v-model="search"
        type="text"
        placeholder="Search log..."
        class="max-w-xs min-w-0 flex-1"
        @update:model-value="page = 1"
      >
        <template #prefix>
          <N8nIcon icon="search" :size="14" class="text-text-xmuted" />
        </template>
      </N8nInput>
      <N8nSelect
        v-model="entityType"
        :filterable="false"
        class="w-48"
        @update:model-value="page = 1"
      >
        <N8nOption v-for="t in entityTypeOptions" :key="t.value" :value="t.value" :label="t.label" />
      </N8nSelect>
      <N8nSelect
        v-model="action"
        :filterable="false"
        class="w-48"
        @update:model-value="page = 1"
      >
        <N8nOption v-for="a in actionOptions" :key="a.value" :value="a.value" :label="a.label" />
      </N8nSelect>
      <span class="ml-auto hidden text-xs text-text-muted sm:inline">{{ total }} entries</span>
    </div>

    <!-- Table -->
    <div v-if="isLoading" class="text-sm text-text-muted">Loading audit log...</div>
    <div v-else-if="entries.length === 0" class="py-12 text-center text-sm text-text-muted">
      No log entries found
    </div>
    <div v-else class="overflow-hidden rounded-xl border border-border bg-card">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border bg-bg-light">
              <th class="whitespace-nowrap px-3 py-2 text-left text-[12px] font-medium text-text-muted">Time</th>
              <th class="px-3 py-2 text-left text-[12px] font-medium text-text-muted">User</th>
              <th class="px-3 py-2 text-left text-[12px] font-medium text-text-muted">Action</th>
              <th class="whitespace-nowrap px-3 py-2 text-left text-[12px] font-medium text-text-muted">Entity Type</th>
              <th class="whitespace-nowrap px-3 py-2 text-left text-[12px] font-medium text-text-muted">Entity ID</th>
              <th class="px-3 py-2 text-left text-[12px] font-medium text-text-muted">Details</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-light">
            <tr v-for="entry in entries" :key="entry.id" class="transition-colors hover:bg-card-hover">
              <td class="whitespace-nowrap px-3 py-2.5 text-text-xmuted text-[13px]">
                {{ timeAgo(entry.created_at) }}
              </td>
              <td class="px-3 py-2.5 text-text-muted text-[13px]">
                <span v-if="entry.user">{{ entry.user }}</span>
                <span v-else class="text-text-xmuted">—</span>
              </td>
              <td class="px-3 py-2.5 text-[13px]">
                <N8nBadge :variant="actionVariant(entry.action) as 'primary'" size="xsmall" class="capitalize">
                  {{ entry.action }}
                </N8nBadge>
              </td>
              <td class="px-3 py-2.5 text-text-muted capitalize text-[13px]">
                {{ entry.entity_type }}
              </td>
              <td class="px-3 py-2.5 font-mono text-text-xmuted text-[13px]">
                {{ entry.entity_id != null ? String(entry.entity_id) : '—' }}
              </td>
              <td class="max-w-xs truncate px-3 py-2.5 text-text-muted text-[13px]">
                <span v-if="entry.details">{{ entry.details }}</span>
                <span v-else class="text-text-xmuted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="pages > 1" class="mt-4 flex items-center justify-center">
      <N8nPagination
        :total="total"
        :items-per-page="limit"
        size="small"
        v-model:page="page"
      />
    </div>
  </div>
</template>