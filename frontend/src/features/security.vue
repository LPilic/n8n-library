<script setup lang="ts">
import { computed, ref } from 'vue'
import { N8nBadge, N8nButton, N8nHeading, N8nIcon } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import type { BadgeVariant } from '@n8n/design-system'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RiskItem {
  severity: 'high' | 'medium' | 'low'
  message: string
  details?: string
}

type AuditCategory = 'credentials' | 'nodes' | 'community_nodes' | 'custom_nodes' | 'settings' | 'versions'

type AuditReport = Record<AuditCategory, RiskItem[]>

const CATEGORY_LABELS: Record<AuditCategory, string> = {
  credentials: 'Credentials',
  nodes: 'Nodes',
  community_nodes: 'Community Nodes',
  custom_nodes: 'Custom Nodes',
  settings: 'Settings',
  versions: 'Versions',
}

const CATEGORY_ORDER: AuditCategory[] = [
  'credentials', 'nodes', 'community_nodes', 'custom_nodes', 'settings', 'versions',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityVariant(severity: RiskItem['severity']): BadgeVariant {
  switch (severity) {
    case 'high': return 'danger'
    case 'medium': return 'warning'
    case 'low': return 'success'
  }
}

function categorySummary(items: RiskItem[]): { high: number; medium: number; low: number } {
  return items.reduce(
    (acc, item) => { acc[item.severity]++; return acc },
    { high: 0, medium: 0, low: 0 },
  )
}

// ─── SecurityPage ─────────────────────────────────────────────────────────────

const toast = useToast()
const report = ref<AuditReport | null>(null)
const collapsed = ref<Set<AuditCategory>>(new Set())
const auditLoading = ref(false)

async function runAudit() {
  auditLoading.value = true
  try {
    const d = await api.post<AuditReport>('/api/security/audit', {})
    report.value = d
    toast.success('Audit complete')
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Audit failed')
  } finally {
    auditLoading.value = false
  }
}

const itemsOf = (cat: AuditCategory) => report.value?.[cat] ?? []

const isCollapsed = (cat: AuditCategory) => collapsed.value.has(cat)

function toggleCollapse(cat: AuditCategory) {
  const next = new Set(collapsed.value)
  if (next.has(cat)) next.delete(cat)
  else next.add(cat)
  collapsed.value = next
}

const totalHigh = computed(() =>
  report.value
    ? CATEGORY_ORDER.reduce((sum, cat) => sum + categorySummary(report.value![cat] ?? []).high, 0)
    : 0,
)
</script>

<template>
  <div class="max-w-3xl">
    <!-- Header -->
    <div class="mb-6 flex items-center gap-3">
      <div class="flex-1">
        <N8nHeading size="xlarge" tag="h2">Security Audit</N8nHeading>
        <p class="mt-0.5 text-[13px] text-text-muted">
          Scan your n8n instance for credential exposure, risky nodes, and configuration issues.
        </p>
      </div>
      <N8nButton variant="brand" :loading="auditLoading" :disabled="auditLoading" @click="runAudit">
        <N8nIcon v-if="!auditLoading" icon="shield-check" :size="14" />
        {{ auditLoading ? 'Running...' : 'Run Audit' }}
      </N8nButton>
    </div>

    <!-- Summary banner -->
    <div
      v-if="report"
      class="mb-4 flex items-center gap-3 rounded-xl border px-4 py-3"
      :class="totalHigh > 0 ? 'border-danger/30 bg-danger-light text-danger' : 'border-success/30 bg-success-light text-success'"
    >
      <N8nIcon :icon="totalHigh > 0 ? 'shield-alert' : 'shield-check'" :size="16" />
      <span class="text-sm font-medium">
        {{ totalHigh > 0 ? `${totalHigh} high-severity issue${totalHigh !== 1 ? 's' : ''} found` : 'No high-severity issues found' }}
      </span>
    </div>

    <!-- Categories -->
    <div v-if="report" class="flex flex-col gap-4 ">
      <div
        v-for="cat in CATEGORY_ORDER"
        :key="cat"
        class="overflow-hidden rounded-xl border border-border bg-card"
      >
        <button
          class="flex w-full items-center gap-2 px-4 py-2.5 transition-colors hover:bg-card-hover"
          @click="toggleCollapse(cat)"
        >
          <N8nIcon
            :icon="!isCollapsed(cat) ? 'chevron-down' : 'chevron-right'"
            :size="14"
            class="shrink-0 text-text-muted"
          />
          <span class="flex-1 text-left text-sm font-medium text-text-dark">
            {{ CATEGORY_LABELS[cat] }}
          </span>
          <div class="flex items-center gap-1.5">
            <N8nBadge
              v-if="categorySummary(itemsOf(cat)).high > 0"
              variant="danger"
              size="xsmall"
            >
              {{ categorySummary(itemsOf(cat)).high }} high
            </N8nBadge>
            <N8nBadge
              v-if="categorySummary(itemsOf(cat)).medium > 0"
              variant="warning"
              size="xsmall"
            >
              {{ categorySummary(itemsOf(cat)).medium }} med
            </N8nBadge>
            <N8nBadge
              v-if="categorySummary(itemsOf(cat)).low > 0"
              variant="success"
              size="xsmall"
            >
              {{ categorySummary(itemsOf(cat)).low }} low
            </N8nBadge>
            <span v-if="itemsOf(cat).length === 0" class="text-[10px] text-text-xmuted">No issues</span>
          </div>
        </button>

        <div
          v-if="!isCollapsed(cat) && itemsOf(cat).length > 0"
          class="divide-y divide-border-light border-t border-border-light"
        >
          <div v-for="(item, i) in itemsOf(cat)" :key="i" class="flex items-start gap-3 px-4 py-2.5">
            <N8nBadge :variant="severityVariant(item.severity)" size="xsmall" class="mt-0.5 shrink-0 capitalize">
              {{ item.severity }}
            </N8nBadge>
            <div class="min-w-0 flex-1">
              <p class="text-sm text-text-dark">{{ item.message }}</p>
              <p v-if="item.details" class="mt-0.5 text-xs text-text-muted">{{ item.details }}</p>
            </div>
          </div>
        </div>

        <div
          v-if="!isCollapsed(cat) && itemsOf(cat).length === 0"
          class="border-t border-border-light px-4 py-3 text-xs text-text-muted"
        >
          No issues detected in this category.
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!report && !auditLoading" class="py-16 text-center">
      <N8nIcon icon="shield-check" :size="32" class="mx-auto mb-3 text-text-xmuted" />
      <p class="text-sm text-text-muted">Click "Run Audit" to scan your instance</p>
    </div>
  </div>
</template>