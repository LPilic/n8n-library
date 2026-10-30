<script setup lang="ts">
// ─── TicketsPage ──────────────────────────────────────────────────────────────
// Ported from src/features/tickets.tsx (TicketsPage + TicketCard + CreateTicketModal).

import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton, N8nHeading, N8nIcon } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'
import { cn } from '@/lib/utils'
import CustomSelect from '@/components/CustomSelect.vue'
import TicketCard from './ticket-parts/TicketCard.vue'
import CreateTicketModal from './ticket-parts/CreateTicketModal.vue'
import {
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  type TicketListResponse,
  type TicketStats,
} from './ticket-parts/ticket-types'

const router = useRouter()
const { error: showError, success: showSuccess } = useToast()
const queryClient = useQueryClient()

// Filters + pagination
const search = ref('')
const status = ref('')
const priority = ref('')
const page = ref(1)
const showCreate = ref(false)

const { data, isLoading } = useQuery({
  queryKey: ['tickets', page, search, status, priority],
  queryFn: () => {
    const params = new URLSearchParams({ page: String(page.value), limit: '20' })
    if (search.value) params.set('search', search.value)
    if (status.value) params.set('status', status.value)
    if (priority.value) params.set('priority', priority.value)
    return api.get<TicketListResponse>(`/api/tickets?${params}`)
  },
})

const { data: stats } = useQuery({
  queryKey: ['ticket-stats'],
  queryFn: () => api.get<TicketStats>('/api/tickets/stats'),
})

const tickets = computed(() => data.value?.tickets ?? [])

const statusFilterOptions = computed(() => [
  { value: '', label: 'All Statuses' },
  ...STATUS_OPTIONS.map((s) => ({ value: s, label: s.replace('_', ' ') })),
])
const priorityFilterOptions = [
  { value: '', label: 'All Priorities' },
  ...PRIORITY_OPTIONS.map((p) => ({ value: p, label: p })),
]

function onSearch(e: Event) {
  search.value = (e.target as HTMLInputElement).value
  page.value = 1
}

function setStatusFilter(v: string) {
  status.value = v
  page.value = 1
}

function setPriorityFilter(v: string) {
  priority.value = v
  page.value = 1
}

function toggleStatusFilter(itemStatus: string) {
  status.value = status.value === itemStatus ? '' : itemStatus
  page.value = 1
}

function togglePriorityFilter(itemPriority: string) {
  priority.value = priority.value === itemPriority ? '' : itemPriority
  page.value = 1
}

const avgResolveLabel = computed(() => {
  const v = stats.value?.avgResolutionHours
  return v && Number(v) > 0 ? `${Number(v).toFixed(0)}h` : '—'
})

const priorityDotClass = (itemPriority: string) =>
  cn(
    itemPriority === 'critical' && 'bg-danger',
    itemPriority === 'high' && 'bg-warning',
    itemPriority === 'medium' && 'bg-[#3b82f6]',
    itemPriority === 'low' && 'bg-text-xmuted',
  )

function onCreated() {
  showCreate.value = false
  queryClient.invalidateQueries({ queryKey: ['tickets'] })
  queryClient.invalidateQueries({ queryKey: ['ticket-stats'] })
}

async function onDelete(id: number) {
  const ok = await appConfirm('Delete this ticket?', { danger: true, okLabel: 'Delete' })
  if (!ok) return
  try {
    await api.delete(`/api/tickets/${id}`)
    showSuccess('Ticket deleted')
    queryClient.invalidateQueries({ queryKey: ['tickets'] })
    queryClient.invalidateQueries({ queryKey: ['ticket-stats'] })
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Delete failed')
  }
}
</script>

<template>
  <div class="flex gap-6">
    <!-- KPI Sidebar -->
    <aside class="hidden w-64 shrink-0 space-y-4 lg:block">
      <template v-if="stats">
        <!-- Overview KPI cards -->
        <div class="grid grid-cols-2 gap-4">
          <div class="rounded-xl border border-border bg-card p-4 text-center">
            <div class="text-[20px] font-semibold text-primary">{{ stats.unassigned }}</div>
            <div class="mt-0.5 text-[12px] font-medium text-text-muted">Unassigned</div>
          </div>
          <div class="rounded-xl border border-border bg-card p-4 text-center">
            <div class="text-[20px] font-semibold text-text-dark">{{ avgResolveLabel }}</div>
            <div class="mt-0.5 text-[12px] font-medium text-text-muted">Avg Resolve</div>
          </div>
        </div>

        <!-- By Status -->
        <div class="overflow-hidden rounded-xl border border-border bg-card">
          <div class="border-b border-border-light px-3 py-2">
            <N8nHeading size="medium" tag="h3">By Status</N8nHeading>
          </div>
          <div class="p-1">
            <button
              v-for="item in stats.byStatus ?? []"
              :key="item.status"
              :class="cn(
                'w-full flex items-center justify-between text-[12px] px-2.5 py-1.5 rounded-md transition-colors',
                status === item.status
                  ? 'bg-primary-light text-primary font-semibold'
                  : 'text-text-muted hover:bg-bg',
              )"
              @click="toggleStatusFilter(item.status)"
            >
              <span class="capitalize">{{ item.status.replace('_', ' ') }}</span>
              <span class="text-[11px] font-bold tabular-nums">{{ item.count }}</span>
            </button>
          </div>
        </div>

        <!-- By Priority -->
        <div class="overflow-hidden rounded-xl border border-border bg-card">
          <div class="border-b border-border-light px-3 py-2">
            <N8nHeading size="medium" tag="h3">By Priority</N8nHeading>
          </div>
          <div class="p-1">
            <button
              v-for="item in stats.byPriority ?? []"
              :key="item.priority"
              :class="cn(
                'w-full flex items-center justify-between text-[12px] px-2.5 py-1.5 rounded-md transition-colors',
                priority === item.priority
                  ? 'bg-primary-light text-primary font-semibold'
                  : 'text-text-muted hover:bg-bg',
              )"
              @click="togglePriorityFilter(item.priority)"
            >
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full" :class="priorityDotClass(item.priority)" />
                <span class="capitalize">{{ item.priority }}</span>
              </div>
              <span class="text-[11px] font-bold tabular-nums">{{ item.count }}</span>
            </button>
          </div>
        </div>
      </template>
    </aside>

    <!-- Main -->
    <div class="min-w-0 flex-1">
      <!-- Toolbar -->
      <div class="mb-5 flex flex-wrap items-center gap-2">
        <div class="relative min-w-0 max-w-xs flex-1">
          <N8nIcon icon="search" :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-xmuted" />
          <input
            type="text"
            placeholder="Search tickets..."
            :value="search"
            @input="onSearch"
            class="w-full rounded-sm border border-input-border bg-input-bg py-1.5 pl-8 pr-3 text-sm text-text-dark focus:border-input-focus focus:outline-none"
          />
        </div>
        <div class="w-44 shrink-0">
          <CustomSelect
            :value="status"
            :options="statusFilterOptions"
            @change="setStatusFilter"
          />
        </div>
        <div class="w-32 shrink-0">
          <CustomSelect
            :value="priority"
            :options="priorityFilterOptions"
            @change="setPriorityFilter"
          />
        </div>
        <span class="ml-auto hidden text-xs text-text-muted sm:inline">
          {{ data?.total ?? 0 }} ticket{{ (data?.total ?? 0) !== 1 ? 's' : '' }}
        </span>
        <N8nButton
          variant="brand"
          size="small"
          icon="plus"
          label="New Ticket"
          @click="showCreate = true"
        />
      </div>

      <!-- Create modal -->
      <CreateTicketModal
        v-if="showCreate"
        @close="showCreate = false"
        @created="onCreated"
      />

      <!-- Ticket list -->
      <div v-if="isLoading" class="text-sm text-text-muted">Loading tickets...</div>
      <div v-else-if="tickets.length === 0" class="py-12 text-center">
        <p class="text-text-muted">No tickets found</p>
      </div>
      <div v-else class="space-y-4">
        <TicketCard
          v-for="ticket in tickets"
          :key="ticket.id"
          :ticket="ticket"
          @click="router.push(`/tickets/${ticket.id}`)"
          @delete="onDelete(ticket.id)"
        />
      </div>

      <!-- Pagination -->
      <div v-if="data && data.pages > 1" class="mt-4 flex items-center justify-center gap-2">
        <button
          :disabled="page <= 1"
          class="rounded-sm border border-input-border bg-input-bg px-3 py-1 text-xs text-text-muted transition-colors hover:bg-card-hover disabled:opacity-40"
          @click="page = page - 1"
        >
          Prev
        </button>
        <span class="text-xs text-text-muted">Page {{ page }} of {{ data.pages }}</span>
        <button
          :disabled="page >= data.pages"
          class="rounded-sm border border-input-border bg-input-bg px-3 py-1 text-xs text-text-muted transition-colors hover:bg-card-hover disabled:opacity-40"
          @click="page = page + 1"
        >
          Next
        </button>
      </div>
    </div>
  </div>
</template>