<script setup lang="ts">
// ─── TicketDetailPage ─────────────────────────────────────────────────────────
// Ported from src/features/tickets.tsx (TicketDetailPage). Route: /tickets/:id —
// comments (rich text editor), internal notes, status/priority/assignee/category
// changes, linked executions, execution context and activity feed.

import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { useHighlight } from '@/composables/useHighlight'
import { timeAgo, cn } from '@/lib/utils'
import { markdownToHtml } from '@/lib/markdown'
import { sanitizeHtml } from '@/lib/sanitize'
import CustomSelect from '@/components/CustomSelect.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import TicketStatusIcon from './ticket-parts/TicketStatusIcon.vue'
import TicketMetaCard from './ticket-parts/TicketMetaCard.vue'
import {
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  type AssignableUser,
  type TicketCategory,
  type TicketDetail,
} from './ticket-parts/ticket-types'

const route = useRoute()
const router = useRouter()
const { error: showError, success: showSuccess } = useToast()
const queryClient = useQueryClient()

const id = computed(() => Number(route.params.id))
const highlightRef = useHighlight([id])

// Comment editor state
const comment = ref('')
const isInternal = ref(false)
const posting = ref(false)
// Bump to remount the editor with empty content after posting (the editor
// skips one external content sync after an internal update).
const commentEditorKey = ref(0)

const { data: ticket, isLoading } = useQuery({
  queryKey: ['ticket-detail', id],
  queryFn: () => api.get<TicketDetail>(`/api/tickets/${id.value}`),
  enabled: computed(() => !!id.value),
})

const { data: assignableUsers } = useQuery({
  queryKey: ['assignable-users'],
  queryFn: () => api.get<AssignableUser[]>('/api/tickets/assignable-users'),
})

const { data: categories } = useQuery({
  queryKey: ['ticket-categories'],
  queryFn: () => api.get<TicketCategory[]>('/api/ticket-categories'),
})

const comments = computed(() => ticket.value?.comments ?? [])
const descriptionHtml = computed(() => sanitizeHtml(markdownToHtml(ticket.value?.description || '')))

async function updateTicket(patch: Record<string, unknown>) {
  try {
    await api.put(`/api/tickets/${id.value}`, patch)
    showSuccess('Ticket updated')
    queryClient.invalidateQueries({ queryKey: ['ticket-detail', id.value] })
    queryClient.invalidateQueries({ queryKey: ['tickets'] })
    queryClient.invalidateQueries({ queryKey: ['ticket-stats'] })
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Update failed')
  }
}

// Current API reads `body` (and assigns via `assigned_to`); the React source
// posted `comment` / `assignee_id`. Send both keys so the request works with
// today's API while keeping the React wire keys.
async function postComment() {
  posting.value = true
  try {
    await api.post(`/api/tickets/${id.value}/comments`, {
      comment: comment.value,
      body: comment.value,
      is_internal: isInternal.value,
    })
    showSuccess('Comment added')
    comment.value = ''
    commentEditorKey.value++
    queryClient.invalidateQueries({ queryKey: ['ticket-detail', id.value] })
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Comment failed')
  } finally {
    posting.value = false
  }
}

const canPostComment = computed(() => comment.value.replace(/<[^>]*>/g, '').trim() !== '')

// Plain comments (legacy) stay as text; rich comments render as HTML.
// Both keep the React classes so pre-wrap plain text wraps the same way.
const looksLikeHtml = (s: string) => /<[a-z][\s\S]*>/i.test(s)

const statusOptions = STATUS_OPTIONS.map((s) => ({ value: s, label: s.replace('_', ' ') }))
const priorityOptions = PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))
const assigneeOptions = computed(() => [
  { value: '', label: 'Unassigned' },
  ...(assignableUsers.value ?? []).map((u) => ({ value: String(u.id), label: u.username })),
])
const categoryOptions = computed(() => [
  { value: '', label: 'None' },
  ...(categories.value ?? []).map((c) => ({ value: String(c.id), label: c.name })),
])

// Display name fallbacks: current API returns assignee_name/creator_name.
const assigneeName = computed(() => ticket.value?.assignee_id ?? ticket.value?.assigned_to ?? '')
const reporterName = computed(() => ticket.value?.reporter_username ?? ticket.value?.creator_name ?? '')
</script>

<template>
  <div>
    <div v-if="isLoading" class="text-sm text-text-muted">Loading ticket...</div>
    <div v-else-if="!ticket" class="text-sm text-danger">Ticket not found</div>
    <div v-else>
      <button
        class="mb-4 inline-block cursor-pointer text-sm text-primary hover:text-primary-hover"
        @click="router.push('/tickets')"
      >
        &larr; Back to Tickets
      </button>

      <div class="flex flex-col gap-6 lg:flex-row">
        <!-- Main content -->
        <div class="min-w-0 flex-1 space-y-4">
          <!-- Header card -->
          <div class="rounded-md border border-border bg-card p-4">
            <div class="mb-3 flex items-start gap-2">
              <TicketStatusIcon :status="ticket.status" />
              <h2 class="text-base font-semibold leading-snug text-text-dark">{{ ticket.title }}</h2>
              <span class="ml-auto shrink-0 text-xs text-text-xmuted">#{{ ticket.id }}</span>
            </div>
            <div
              v-if="ticket.description"
              class="prose prose-sm max-w-none text-sm text-text-muted"
              ref="highlightRef"
              v-html="descriptionHtml"
            />
            <div class="mt-3 text-xs text-text-xmuted">
              Opened {{ timeAgo(ticket.created_at) }}
              <template v-if="reporterName"> by <strong>{{ reporterName }}</strong></template>
            </div>
          </div>

          <!-- Comments -->
          <div class="overflow-hidden rounded-md border border-border bg-card">
            <div class="border-b border-border-light bg-bg px-4 py-2">
              <h3 class="text-xs font-semibold uppercase text-text-muted">
                Comments ({{ comments.length }})
              </h3>
            </div>
            <div v-if="comments.length === 0" class="px-4 py-6 text-center text-sm text-text-muted">
              No comments yet
            </div>
            <div v-else class="divide-y divide-border-light">
              <div
                v-for="c in comments"
                :key="c.id"
                :class="cn('px-4 py-3', c.is_internal ? 'bg-warning-light/30' : '')"
              >
                <div class="mb-1 flex items-center gap-2">
                  <span class="text-xs font-medium text-text-dark">{{ c.author_username }}</span>
                  <span
                    v-if="c.is_internal"
                    class="rounded bg-warning-light px-1.5 py-0.5 text-[10px] text-warning"
                  >
                    Internal
                  </span>
                  <span class="ml-auto text-[10px] text-text-xmuted">{{ timeAgo(c.created_at) }}</span>
                </div>
                <!-- Plain comments (legacy) stay as text; rich comments render as HTML -->
                <p
                  v-if="looksLikeHtml(c.comment)"
                  class="text-sm text-text-muted whitespace-pre-wrap"
                  v-html="sanitizeHtml(c.comment)"
                />
                <p v-else class="whitespace-pre-wrap text-sm text-text-muted">{{ c.comment }}</p>
              </div>
            </div>

            <!-- Add comment form -->
            <div class="border-t border-border-light bg-bg px-4 py-3">
              <RichTextEditor
                :key="commentEditorKey"
                :content="comment"
                placeholder="Add a comment..."
                @change="comment = $event"
              />
              <div class="mt-2 flex items-center gap-3">
                <label class="flex cursor-pointer items-center gap-1.5 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    v-model="isInternal"
                    class="h-3 w-3"
                  />
                  Internal note
                </label>
                <N8nButton
                  variant="brand"
                  size="small"
                  icon="message-square"
                  :label="posting ? 'Posting...' : 'Post Comment'"
                  :loading="posting"
                  :disabled="!canPostComment || posting"
                  class="ml-auto"
                  @click="postComment"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar: metadata -->
        <aside class="w-full shrink-0 space-y-3 lg:w-72">
          <TicketMetaCard label="Status">
            <CustomSelect
              :value="ticket.status"
              :options="statusOptions"
              @change="updateTicket({ status: $event })"
            />
          </TicketMetaCard>

          <TicketMetaCard label="Priority">
            <CustomSelect
              :value="ticket.priority"
              :options="priorityOptions"
              @change="updateTicket({ priority: $event })"
            />
          </TicketMetaCard>

          <TicketMetaCard label="Assignee">
            <CustomSelect
              :value="assigneeName ? String(assigneeName) : ''"
              :options="assigneeOptions"
              @change="updateTicket({ assignee_id: $event ? Number($event) : null, assigned_to: $event ? Number($event) : null })"
            />
          </TicketMetaCard>

          <TicketMetaCard label="Category">
            <CustomSelect
              :value="String(ticket.category_id ?? '')"
              :options="categoryOptions"
              @change="updateTicket({ category_id: $event ? Number($event) : null })"
            />
          </TicketMetaCard>

          <!-- Linked Executions -->
          <div v-if="(ticket.executions ?? []).length > 0" class="overflow-hidden rounded-md border border-border bg-card">
            <div class="border-b border-border-light bg-bg px-3 py-2">
              <h3 class="text-[10px] font-semibold uppercase text-text-muted">Linked Executions</h3>
            </div>
            <div class="space-y-1.5 px-3 py-2">
              <div
                v-for="ex in ticket.executions ?? []"
                :key="ex.execution_id"
                class="flex items-center gap-2 text-xs"
              >
                <span
                  class="rounded px-1 py-0.5 text-[10px] font-semibold"
                  :class="ex.status === 'error' ? 'bg-danger-light text-danger' : 'bg-success-light text-success'"
                >
                  {{ ex.status }}
                </span>
                <button
                  class="cursor-pointer truncate text-primary hover:text-primary-hover"
                  @click="router.push(`/monitoring/${ex.execution_id}`)"
                >
                  {{ ex.workflow_name }} #{{ ex.execution_id }}
                </button>
              </div>
            </div>
          </div>

          <!-- Execution Context -->
          <div v-if="ticket.execution_data" class="overflow-hidden rounded-md border border-border bg-card">
            <div class="border-b border-border-light bg-bg px-3 py-2">
              <h3 class="text-[10px] font-semibold uppercase text-text-muted">Execution Context</h3>
            </div>
            <div class="space-y-1 px-3 py-2">
              <div v-if="ticket.execution_data.workflow_name" class="flex justify-between text-xs">
                <span class="text-text-muted">Workflow</span>
                <span class="font-medium text-text-dark">{{ ticket.execution_data.workflow_name }}</span>
              </div>
              <div v-if="ticket.execution_data.execution_id" class="flex justify-between text-xs">
                <span class="text-text-muted">Execution ID</span>
                <button
                  class="cursor-pointer font-medium text-primary hover:text-primary-hover"
                  @click="router.push(`/monitoring/${ticket.execution_data?.execution_id}`)"
                >
                  {{ ticket.execution_data.execution_id }}
                </button>
              </div>
              <div v-if="ticket.execution_data.execution_status" class="flex justify-between text-xs">
                <span class="text-text-muted">Status</span>
                <span
                  class="font-medium"
                  :class="ticket.execution_data.execution_status === 'error' ? 'text-danger' : 'text-success'"
                >
                  {{ ticket.execution_data.execution_status }}
                </span>
              </div>
              <div v-if="ticket.execution_data.started_at" class="flex justify-between text-xs">
                <span class="text-text-muted">Time</span>
                <span class="text-text-dark">{{ new Date(ticket.execution_data.started_at).toLocaleString() }}</span>
              </div>
              <div v-if="ticket.execution_data.failed_node" class="flex justify-between text-xs">
                <span class="text-text-muted">Failed Node</span>
                <span class="font-medium text-text-dark">{{ ticket.execution_data.failed_node }}</span>
              </div>
              <div v-if="ticket.execution_data.error_message" class="flex justify-between text-xs">
                <span class="text-text-muted">Error</span>
                <span
                  class="max-w-[150px] truncate text-text-dark"
                  :title="ticket.execution_data.error_message"
                >
                  {{ ticket.execution_data.error_message }}
                </span>
              </div>
            </div>
          </div>

          <!-- Activity -->
          <div v-if="(ticket.activity ?? []).length > 0" class="overflow-hidden rounded-md border border-border bg-card">
            <div class="border-b border-border-light bg-bg px-3 py-2">
              <h3 class="text-[10px] font-semibold uppercase text-text-muted">Activity</h3>
            </div>
            <div class="space-y-1.5 px-3 py-2">
              <div
                v-for="a in (ticket.activity ?? []).slice(0, 10)"
                :key="a.id"
                class="text-[11px] text-text-muted"
              >
                <span class="font-medium text-text-dark">{{ a.actor_username }}</span>
                {{ ' ' }}
                {{ a.action }}
                {{ ' ' }}
                <span class="text-text-xmuted">{{ timeAgo(a.created_at) }}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>