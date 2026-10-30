<script setup lang="ts">
import { N8nBadge, N8nIcon } from '@n8n/design-system'
import { timeAgo } from '@/lib/utils'
import TicketStatusIcon from './TicketStatusIcon.vue'
import type { Ticket } from './ticket-types'

// Ported from TicketCard in tickets.tsx — one ticket row in the list.
defineProps<{
  ticket: Ticket
}>()

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'delete'): void
}>()

// Old pill color classes → N8nBadge variants (VUE-PATTERNS mapping).
type BadgeVariant =
  | 'filled' | 'primary' | 'secondary' | 'subtle' | 'outline'
  | 'ghost' | 'warning' | 'danger' | 'success' | 'info'

function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'open': return 'primary'
    case 'in_progress': return 'warning'
    case 'resolved': return 'success'
    default: return 'subtle'
  }
}

function priorityVariant(priority: string): BadgeVariant {
  switch (priority) {
    case 'critical': return 'danger'
    case 'high':
    case 'medium': return 'warning'
    default: return 'subtle'
  }
}
</script>

<template>
  <div
    class="cursor-pointer rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary"
    @click="emit('click')"
  >
    <div class="flex items-start gap-3">
      <TicketStatusIcon :status="ticket.status" />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="truncate text-[14px] font-medium text-text-dark underline decoration-border-strong underline-offset-2">{{ ticket.title }}</h3>
          <span class="shrink-0 text-[10px] text-text-xmuted">#{{ ticket.id }}</span>
        </div>
        <div class="mt-2.5 flex flex-wrap items-center gap-2.5">
          <N8nBadge :variant="statusVariant(ticket.status)" size="xsmall" class="capitalize">
            {{ ticket.status.replace('_', ' ') }}
          </N8nBadge>
          <N8nBadge :variant="priorityVariant(ticket.priority)" size="xsmall" class="capitalize">
            {{ ticket.priority }}
          </N8nBadge>
          <span
            v-if="ticket.category_name"
            class="rounded bg-border-light px-1.5 py-0.5 text-[10px] text-text-muted"
          >
            {{ ticket.category_name }}
          </span>
          <span v-if="ticket.assignee_username ?? ticket.assignee_name" class="text-[11px] text-text-muted">
            Assigned to <strong>{{ ticket.assignee_username ?? ticket.assignee_name }}</strong>
          </span>
          <span v-else class="text-[11px] text-text-xmuted">Unassigned</span>
          <span class="ml-auto text-[11px] text-text-xmuted">{{ timeAgo(ticket.created_at) }}</span>
          <span v-if="(ticket.comment_count ?? 0) > 0" class="flex items-center gap-0.5 text-[11px] text-text-muted">
            <N8nIcon icon="message-square" :size="11" />
            {{ ticket.comment_count }}
          </span>
        </div>
      </div>
      <button
        class="ml-1 shrink-0 cursor-pointer p-1 text-text-xmuted transition-colors hover:text-danger"
        title="Delete"
        @click.stop="emit('delete')"
      >
        <N8nIcon icon="trash-2" :size="13" />
      </button>
    </div>
  </div>
</template>