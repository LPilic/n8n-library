<script setup lang="ts">
// ─── PromptDetailPage (ported from prompts.tsx) ───────────────────────────────
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nHeading, N8nIcon, N8nOption, N8nSelect } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'
import { cn, timeAgo } from '@/lib/utils'
import EditPromptModal from './prompt-parts/EditPromptModal.vue'
import AIImproveModal from './prompt-parts/AIImproveModal.vue'
import DiffPane from './prompt-parts/DiffPane.vue'
import { PROMPT_STATUSES, statusBadge, wordDiff } from './prompt-parts/shared'
import type { Prompt, PromptDiff, PromptStatus, PromptVersion } from './prompt-parts/shared'

const route = useRoute()
const router = useRouter()
const { success: showSuccess, error: showError } = useToast()
const queryClient = useQueryClient()

const diffFrom = ref<number | null>(null)
const diffTo = ref<number | null>(null)
const copied = ref(false)
const showEdit = ref(false)
const showAI = ref(false)

// Route params are string | string[] — the slug can also be a numeric id, keep it raw
const slug = computed(() => String(route.params.slug ?? ''))

// Renders a variable name as `{{name}}` in plain text (avoids moustache-like
// sequences inside template expressions)
function varDisplay(name: string): string {
  return '{{' + name + '}}'
}

const { data: prompt, isLoading } = useQuery({
  queryKey: ['prompt-detail', () => route.params.slug],
  queryFn: () => api.get<Prompt>(`/api/prompts/${slug.value}`),
  enabled: computed(() => !!slug.value),
})

const promptId = computed(() => prompt.value?.id ?? null)

const { data: versions } = useQuery({
  queryKey: ['prompt-versions', () => promptId.value],
  queryFn: async () => {
    const r = await api.get<{ versions?: PromptVersion[] } | PromptVersion[]>(
      `/api/prompts/${promptId.value}/versions`,
    )
    return Array.isArray(r) ? r : r.versions ?? []
  },
  enabled: computed(() => promptId.value !== null),
})

const { data: diff } = useQuery({
  queryKey: ['prompt-diff', () => promptId.value, () => diffFrom.value, () => diffTo.value],
  queryFn: () =>
    api.get<PromptDiff>(`/api/prompts/${promptId.value}/diff?from=${diffFrom.value}&to=${diffTo.value}`),
  enabled: computed(
    () => promptId.value !== null && diffFrom.value !== null && diffTo.value !== null,
  ),
})

// ─── Handlers ─────────────────────────────────────────────────────────────────

const statusPending = ref(false)

async function setStatus(status: PromptStatus) {
  statusPending.value = true
  try {
    await api.patch(`/api/prompts/${promptId.value}/status`, { status })
    showSuccess('Status updated')
    queryClient.invalidateQueries({ queryKey: ['prompt-detail', slug.value] })
    queryClient.invalidateQueries({ queryKey: ['prompts'] })
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Update failed')
  } finally {
    statusPending.value = false
  }
}

async function deletePrompt() {
  if (!(await appConfirm('Delete this prompt?', { danger: true, okLabel: 'Delete' }))) return
  try {
    await api.delete(`/api/prompts/${promptId.value}`)
    showSuccess('Prompt deleted')
    router.push('/prompts')
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Delete failed')
  }
}

const revertPending = ref(false)

async function revert(version: number) {
  if (!(await appConfirm(`Restore to v${version}?`, { okLabel: 'Restore' }))) return
  revertPending.value = true
  try {
    await api.post(`/api/prompts/${promptId.value}/revert/${version}`, {})
    showSuccess('Version restored')
    invalidatePrompt()
  } catch (err) {
    showError(err instanceof ApiError ? err.message : 'Restore failed')
  } finally {
    revertPending.value = false
  }
}

function copyContent() {
  if (!prompt.value?.content) return
  navigator.clipboard.writeText(prompt.value.content).then(() => {
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  })
}

function invalidatePrompt() {
  queryClient.invalidateQueries({ queryKey: ['prompt-detail', slug.value] })
  queryClient.invalidateQueries({ queryKey: ['prompt-versions', promptId.value] })
  queryClient.invalidateQueries({ queryKey: ['prompts'] })
}

function onSaved() {
  showEdit.value = false
  invalidatePrompt()
}

function onAccepted() {
  showAI.value = false
  invalidatePrompt()
}

// ─── Derived data ─────────────────────────────────────────────────────────────

const varList = computed(() => prompt.value?.variables ?? [])

// Derive categories from version list for datalist in edit modal
const editCategories = computed(() => (prompt.value?.category ? [prompt.value.category] : []))

// Compute diff tokens if diff data available
const diffTokens = computed(() =>
  diff.value != null ? wordDiff(diff.value.from.content, diff.value.to.content) : null,
)

function onDiffFromChange(v: unknown) {
  const s = String(v ?? '')
  diffFrom.value = s ? Number(s) : null
}

function onDiffToChange(v: unknown) {
  const s = String(v ?? '')
  diffTo.value = s ? Number(s) : null
}

const diffFromOptions = computed(() =>
  (versions.value ?? []).map((ver) => ({ value: String(ver.version), label: `v${ver.version}` })),
)
const diffToOptions = computed(() =>
  (versions.value ?? []).map((ver) => ({ value: String(ver.version), label: `v${ver.version}` })),
)

function statusChipClass(current: PromptStatus, target: PromptStatus): string {
  return cn(
    'rounded-sm border px-2.5 py-1 text-xs capitalize transition-colors disabled:opacity-40',
    current === target
      ? cn(statusBadge(target), 'border-transparent')
      : 'border-input-border text-text-muted hover:bg-card-hover',
  )
}
</script>

<template>
  <div>
    <div v-if="isLoading" class="text-sm text-text-muted">Loading prompt...</div>
    <div v-else-if="prompt">
      <!-- Back -->
      <button
        class="mb-5 inline-block text-sm text-primary hover:text-primary-hover"
        @click="router.push('/prompts')"
      >
        &larr; Back to Prompts
      </button>

      <!-- Modals -->
      <EditPromptModal
        v-if="showEdit"
        :prompt="prompt"
        :all-categories="editCategories"
        @close="showEdit = false"
        @saved="onSaved"
      />
      <AIImproveModal
        v-if="showAI"
        :prompt="prompt"
        @close="showAI = false"
        @accepted="onAccepted"
      />

      <div class="flex flex-col gap-6 lg:flex-row">
        <!-- Main -->
        <div class="min-w-0 flex-1">
          <!-- Header -->
          <div class="rounded-xl border border-border bg-card p-5">
            <div class="mb-3 flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <N8nHeading size="xlarge" tag="h2">{{ prompt.name }}</N8nHeading>
                <p v-if="prompt.description" class="mt-0.5 text-sm text-text-muted">
                  {{ prompt.description }}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <span :class="cn('rounded px-2 py-0.5 text-xs capitalize', statusBadge(prompt.status))">
                  {{ prompt.status }}
                </span>
                <button
                  class="rounded-sm p-1.5 text-text-xmuted hover:text-primary"
                  title="Edit prompt"
                  @click="showEdit = true"
                >
                  <N8nIcon icon="pencil" :size="14" />
                </button>
                <button
                  class="rounded-sm p-1.5 text-text-xmuted hover:text-primary"
                  title="AI Improve"
                  @click="showAI = true"
                >
                  <N8nIcon icon="sparkles" :size="14" />
                </button>
                <button
                  class="rounded-sm p-1.5 text-text-xmuted hover:text-danger"
                  title="Delete"
                  @click="deletePrompt()"
                >
                  <N8nIcon icon="trash-2" :size="14" />
                </button>
              </div>
            </div>

            <div class="mb-4 flex flex-wrap items-center gap-3 text-xs text-text-xmuted">
              <span v-if="prompt.category" class="rounded bg-border-light px-1.5 py-0.5 text-text-muted">
                {{ prompt.category }}
              </span>
              <span v-if="prompt.version != null" class="flex items-center gap-0.5">
                <N8nIcon icon="history" :size="11" /> v{{ prompt.version }}
              </span>
              <span v-if="prompt.author_username">
                By <strong class="text-text-muted">{{ prompt.author_username }}</strong>
              </span>
              <span>Updated {{ timeAgo(prompt.updated_at) }}</span>
            </div>

            <!-- Status controls -->
            <div class="flex items-center gap-2">
              <span class="text-xs text-text-muted">Set status:</span>
              <button
                v-for="s in PROMPT_STATUSES"
                :key="s"
                :disabled="prompt.status === s || statusPending"
                :class="statusChipClass(prompt.status, s)"
                @click="setStatus(s)"
              >
                {{ s }}
              </button>
            </div>
          </div>

          <!-- Content -->
          <div class="overflow-hidden rounded-xl border border-border bg-card">
            <div class="flex items-center justify-between border-b border-border-light bg-bg px-4 py-2.5">
              <N8nHeading size="medium" tag="h3">Prompt Content</N8nHeading>
              <button
                class="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-text-muted hover:bg-card-hover hover:text-text-dark"
                @click="copyContent"
              >
                <N8nIcon v-if="copied" icon="check" :size="12" class="text-success" />
                <N8nIcon v-else icon="copy" :size="12" />
                {{ copied ? 'Copied!' : 'Copy' }}
              </button>
            </div>
            <pre v-if="prompt.content" class="whitespace-pre-wrap break-words p-4 font-mono text-sm leading-relaxed text-text-dark">{{ prompt.content }}</pre>
            <div v-else class="px-4 py-6 text-center text-sm text-text-muted">No content</div>
          </div>

          <!-- Diff viewer -->
          <div v-if="versions && versions.length >= 2" class="overflow-hidden rounded-xl border border-border bg-card">
            <div class="flex flex-wrap items-center gap-3 border-b border-border-light bg-bg px-4 py-2.5">
              <N8nHeading size="medium" tag="h3" class="flex items-center gap-1">
                <N8nIcon icon="git-compare" :size="12" /> Version Diff
              </N8nHeading>
              <div class="ml-auto flex items-center gap-2">
                <N8nSelect
                  :model-value="diffFrom === null ? '' : String(diffFrom)"
                  :filterable="false"
                  size="small"
                  class="w-32"
                  @update:model-value="onDiffFromChange"
                >
                  <N8nOption value="" label="From version...">From version...</N8nOption>
                  <N8nOption v-for="o in diffFromOptions" :key="o.value" :value="o.value" :label="o.label">{{ o.label }}</N8nOption>
                </N8nSelect>
                <span class="text-xs text-text-xmuted">&rarr;</span>
                <N8nSelect
                  :model-value="diffTo === null ? '' : String(diffTo)"
                  :filterable="false"
                  size="small"
                  class="w-32"
                  @update:model-value="onDiffToChange"
                >
                  <N8nOption value="" label="To version...">To version...</N8nOption>
                  <N8nOption v-for="o in diffToOptions" :key="o.value" :value="o.value" :label="o.label">{{ o.label }}</N8nOption>
                </N8nSelect>
              </div>
            </div>
            <div v-if="diff && diffTokens" class="grid grid-cols-2 divide-x divide-border-light">
              <div class="p-4">
                <div class="mb-2 text-[12px] font-medium text-text-muted">
                  v{{ diff.from.version }}<span v-if="diff.from.created_at" class="ml-1 font-normal">({{ timeAgo(diff.from.created_at) }})</span>
                </div>
                <DiffPane :tokens="diffTokens.left" />
              </div>
              <div class="p-4">
                <div class="mb-2 text-[12px] font-medium text-text-muted">
                  v{{ diff.to.version }}<span v-if="diff.to.created_at" class="ml-1 font-normal">({{ timeAgo(diff.to.created_at) }})</span>
                </div>
                <DiffPane :tokens="diffTokens.right" />
              </div>
            </div>
            <div v-else-if="diffFrom !== null && diffTo !== null" class="px-4 py-4 text-center text-sm text-text-muted">
              Loading diff...
            </div>
            <div v-else class="px-4 py-4 text-center text-sm text-text-muted">
              Select two versions above to compare
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <aside class="flex flex-col gap-4 w-full shrink-0 lg:w-56">
          <!-- Variables -->
          <div v-if="varList.length > 0" class="overflow-hidden rounded-xl border border-border bg-card">
            <div class="border-b border-border-light bg-bg px-3 py-2.5">
              <N8nHeading size="medium" tag="h3" class="flex items-center gap-1">
                <N8nIcon icon="variable" :size="10" /> Variables ({{ varList.length }})
              </N8nHeading>
            </div>
            <div class="flex flex-col gap-1  px-3 py-2">
              <div
                v-for="v in varList"
                :key="v"
                class="truncate rounded bg-primary-light px-2 py-0.5 font-mono text-xs text-primary"
              >
                {{ varDisplay(v) }}
              </div>
            </div>
          </div>

          <!-- Version history -->
          <div v-if="versions && versions.length > 0" class="overflow-hidden rounded-xl border border-border bg-card">
            <div class="border-b border-border-light bg-bg px-3 py-2.5">
              <N8nHeading size="medium" tag="h3" class="flex items-center gap-1">
                <N8nIcon icon="history" :size="10" /> Version History
              </N8nHeading>
            </div>
            <div class="divide-y divide-border-light">
              <div v-for="v in versions" :key="v.id" class="px-3 py-2">
                <div class="mb-0.5 flex items-center justify-between">
                  <span class="text-xs font-medium text-text-dark">v{{ v.version }}</span>
                  <div class="flex items-center gap-1">
                    <span class="text-[10px] text-text-xmuted">{{ timeAgo(v.created_at) }}</span>
                    <button
                      v-if="v.version !== prompt.version"
                      :disabled="revertPending"
                      :title="`Restore v${v.version}`"
                      class="rounded-sm p-0.5 text-text-xmuted hover:text-primary disabled:opacity-40"
                      @click="revert(v.version)"
                    >
                      <N8nIcon icon="rotate-ccw" :size="10" />
                    </button>
                  </div>
                </div>
                <div v-if="v.author_username" class="text-[10px] text-text-muted">
                  {{ v.author_username }}
                </div>
                <div v-if="v.change_note || v.message" class="truncate text-[10px] italic text-text-muted">
                  {{ v.change_note ?? v.message ?? '' }}
                </div>
                <div
                  v-if="(v.variables ?? []).length > 0"
                  class="mt-0.5 flex items-center gap-0.5 text-[10px] text-text-xmuted"
                >
                  <N8nIcon icon="variable" :size="8" />
                  {{ (v.variables ?? []).length }} var{{ (v.variables ?? []).length !== 1 ? 's' : '' }}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
    <div v-else class="text-sm text-danger">Prompt not found</div>
  </div>
</template>