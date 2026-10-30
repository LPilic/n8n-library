<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { N8nIcon, N8nCard, N8nHeading, N8nText, N8nBadge, N8nSpinner } from '@n8n/design-system'
import KpiCard from '@/components/KpiCard.vue'
import { api } from '@/api/client'
import type { DashboardData } from '@/api/types'
import { useAuthStore } from '@/stores/auth'
import { useInstanceStore } from '@/stores/instance'
import { timeAgo } from '@/lib/utils'

const auth = useAuthStore()
const router = useRouter()
const instanceStore = useInstanceStore()

const isWriter = computed(() => auth.user?.role === 'admin' || auth.user?.role === 'editor')

const { data, isLoading, error } = useQuery({
  queryKey: ['dashboard', () => instanceStore.activeId],
  queryFn: () => api.get<DashboardData>(instanceStore.url('/api/dashboard')),
})

const greeting = computed(() => {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
})

const priorityVariant = (p?: string) =>
  p === 'critical' ? 'danger' : p === 'high' || p === 'medium' ? 'warning' : 'subtle'

const statusVariant = (s?: string) =>
  s === 'open' ? 'primary' : s === 'in_progress' ? 'warning' : s === 'resolved' ? 'success' : 'subtle'

const STATUS_ORDER = ['open', 'in_progress', 'waiting', 'resolved', 'closed']
const STATUS_COLORS: Record<string, string> = {
  open: 'bg-primary',
  in_progress: 'bg-warning',
  waiting: 'bg-text-muted',
  resolved: 'bg-success',
  closed: 'bg-text-xmuted',
}

const statusRows = computed(() => {
  const statuses = data.value?.tickets.byStatus ?? {}
  const max = Math.max(...Object.values(statuses), 1)
  return STATUS_ORDER.map((s) => ({ key: s, count: statuses[s] || 0, max }))
    .filter((r) => r.count > 0)
})

const healthLabel = computed(() => {
  const h = data.value?.n8nHealth
  return h?.status === 'healthy' ? 'Healthy' : h?.status === 'unhealthy' ? 'Unhealthy' : 'Unreachable'
})
const healthColor = computed<'success' | 'warning' | 'danger'>(() => {
  const h = data.value?.n8nHealth
  return h?.status === 'healthy' ? 'success' : h?.status === 'unhealthy' ? 'warning' : 'danger'
})

const failedRecent = computed(() => {
  const recent = (data.value?.executions?.recent ?? []) as Array<Record<string, string | number>>
  return recent.filter((e) => e.status === 'error').slice(0, 5)
})

const recentExecs = computed(
  () => ((data.value?.executions?.recent ?? []) as Array<Record<string, string | number>>).slice(0, 6),
)
</script>

<template>
  <div v-if="isLoading" class="flex items-center gap-2 py-8 text-text-muted">
    <N8nSpinner /> Loading dashboard...
  </div>
  <div v-else-if="error || !data" class="py-8 text-danger">Failed to load dashboard</div>
  <div v-else>
    <!-- Greeting -->
    <div class="mb-6">
      <N8nHeading size="xlarge" tag="h2">{{ greeting }}, {{ data.user.username }}</N8nHeading>
      <N8nText size="small" color="text-light">Here's what's happening across your n8n environment</N8nText>
    </div>

    <!-- KPI row -->
    <div class="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-5">
      <KpiCard
        v-if="isWriter && data.n8nHealth"
        icon="activity"
        :label="healthLabel"
        :sublabel="`n8n Instance${data.n8nHealth.latencyMs ? ` · ${data.n8nHealth.latencyMs}ms` : ''}`"
        :color="healthColor"
        link="/monitoring"
      />

      <KpiCard icon="ticket" :label="String(data.tickets.openCount)" sublabel="Open Tickets" color="primary" link="/tickets" />
      <KpiCard icon="book-open" :label="String(data.kb.totalPublished)" sublabel="Published Articles" color="info" link="/kb" />
      <KpiCard icon="layout-template" :label="String(data.templates.total)" sublabel="Templates" color="warning" link="/library" />
      <KpiCard
        v-if="isWriter && data.executions"
        icon="circle-check"
        :label="`${data.executions.successRate}%`"
        sublabel="Success Rate"
        :color="data.executions.successRate >= 80 ? 'success' : data.executions.successRate >= 50 ? 'warning' : 'danger'"
        link="/monitoring"
      />
    </div>

    <!-- Two-column layout -->
    <div class="grid gap-6 lg:grid-cols-2">
      <!-- Left column -->
      <div class="flex flex-col gap-4">
        <N8nCard v-if="data.tickets.myTickets.length > 0">
          <template #header>
            <div class="flex w-full items-center justify-between px-1">
              <N8nHeading size="medium" tag="h3">My Tickets</N8nHeading>
              <button class="cursor-pointer text-xs font-medium text-primary hover:text-primary-hover" @click="router.push('/tickets')">View All</button>
            </div>
          </template>
          <div class="divide-y divide-border-light">
            <div
              v-for="t in data.tickets.myTickets as Array<Record<string, string | number>>"
              :key="t.id"
              class="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-[13px] transition-colors hover:bg-card-hover"
              @click="router.push(`/tickets/${t.id}`)"
            >
              <N8nBadge :variant="(priorityVariant(t.priority as string) as 'primary')" size="small">
                {{ t.priority }}
              </N8nBadge>
              <span class="flex-1 truncate text-[13px] text-text-dark underline decoration-border-strong underline-offset-2">{{ t.title }}</span>
              <N8nBadge :variant="(statusVariant(t.status as string) as 'primary')" size="small">
                {{ (t.status as string).replace('_', ' ') }}
              </N8nBadge>
            </div>
          </div>
        </N8nCard>

        <N8nCard v-if="failedRecent.length > 0" class="border-danger/40">
          <template #header>
            <div class="flex w-full items-center justify-between px-1">
              <N8nHeading size="medium" tag="h3">Recent Failures</N8nHeading>
              <button class="cursor-pointer text-xs font-medium text-primary hover:text-primary-hover" @click="router.push('/monitoring')">View All</button>
            </div>
          </template>
          <div class="divide-y divide-border-light">
            <div
              v-for="e in failedRecent"
              :key="e.id"
              class="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-[13px] transition-colors hover:bg-card-hover"
              @click="router.push(`/monitoring/${e.id}`)"
            >
              <N8nIcon icon="circle-x" :size="14" class="shrink-0 text-danger" />
              <span class="flex-1 truncate text-[13px] text-text-dark underline decoration-border-strong underline-offset-2">
                {{ (e.workflowName as string) || `Workflow #${e.workflowId}` }}
              </span>
              <span class="text-xs text-text-xmuted">{{ timeAgo((e.stoppedAt || e.startedAt) as string) }}</span>
            </div>
          </div>
        </N8nCard>

        <N8nCard v-if="Object.keys(data.tickets.byStatus).length > 0">
          <template #header>
            <N8nHeading size="medium" tag="h3" class="px-1">Tickets by Status</N8nHeading>
          </template>
          <div class="flex flex-col gap-2 px-4 py-3">
            <div v-for="row in statusRows" :key="row.key" class="flex items-center gap-2 text-xs">
              <span class="w-20 text-text-muted capitalize">{{ row.key.replace('_', ' ') }}</span>
              <div class="h-2 flex-1 overflow-hidden rounded-full bg-border-light">
                <div class="h-full rounded-full" :class="STATUS_COLORS[row.key]" :style="{ width: `${Math.max((row.count / row.max) * 100, 8)}%` }" />
              </div>
              <span class="w-6 text-right font-medium text-text-dark">{{ row.count }}</span>
            </div>
          </div>
        </N8nCard>
      </div>

      <!-- Right column -->
      <div class="flex flex-col gap-4">
        <N8nCard v-if="isWriter && data.executions && data.executions.recent.length > 0">
          <template #header>
            <div class="flex w-full items-center justify-between px-1">
              <N8nHeading size="medium" tag="h3">Recent Executions</N8nHeading>
              <button class="cursor-pointer text-xs font-medium text-primary hover:text-primary-hover" @click="router.push('/monitoring')">View All</button>
            </div>
          </template>
          <div class="divide-y divide-border-light">
            <div
              v-for="e in recentExecs"
              :key="e.id"
              class="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-[13px] transition-colors hover:bg-card-hover"
              @click="router.push(`/monitoring/${e.id}`)"
            >
              <N8nIcon
                :icon="e.status === 'success' ? 'circle-check' : e.status === 'error' ? 'circle-x' : 'clock'"
                :size="14"
                :class="e.status === 'success' ? 'text-success' : e.status === 'error' ? 'text-danger' : 'text-warning'"
                class="shrink-0"
              />
              <span class="flex-1 truncate text-[13px] text-text-dark underline decoration-border-strong underline-offset-2">
                {{ (e.workflowName as string) || `Workflow #${e.workflowId}` }}
              </span>
              <span class="text-xs text-text-xmuted">{{ timeAgo((e.stoppedAt || e.startedAt) as string) }}</span>
            </div>
          </div>
        </N8nCard>

        <N8nCard v-if="data.kb.popular.length > 0">
          <template #header>
            <div class="flex w-full items-center justify-between px-1">
              <N8nHeading size="medium" tag="h3">Popular Articles</N8nHeading>
              <button class="cursor-pointer text-xs font-medium text-primary hover:text-primary-hover" @click="router.push('/kb')">View All</button>
            </div>
          </template>
          <div class="divide-y divide-border-light">
            <div
              v-for="a in data.kb.popular as Array<Record<string, string | number>>"
              :key="a.id"
              class="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-[13px] transition-colors hover:bg-card-hover"
              @click="router.push(`/kb/${a.id}`)"
            >
              <N8nIcon icon="file-text" :size="14" class="shrink-0 text-text-muted" />
              <span class="flex-1 truncate text-[13px] text-text-dark underline decoration-border-strong underline-offset-2">{{ a.title }}</span>
              <span class="text-xs text-text-xmuted">{{ a.view_count }} views</span>
            </div>
          </div>
        </N8nCard>

        <N8nCard v-if="data.tickets.recentTickets.length > 0">
          <template #header>
            <div class="flex w-full items-center justify-between px-1">
              <N8nHeading size="medium" tag="h3">Recent Tickets</N8nHeading>
              <button class="cursor-pointer text-xs font-medium text-primary hover:text-primary-hover" @click="router.push('/tickets')">View All</button>
            </div>
          </template>
          <div class="divide-y divide-border-light">
            <div
              v-for="t in data.tickets.recentTickets as Array<Record<string, string | number>>"
              :key="t.id"
              class="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-[13px] transition-colors hover:bg-card-hover"
              @click="router.push(`/tickets/${t.id}`)"
            >
              <N8nBadge :variant="(priorityVariant(t.priority as string) as 'primary')" size="small">{{ t.priority }}</N8nBadge>
              <span class="flex-1 truncate text-[13px] text-text-dark underline decoration-border-strong underline-offset-2">{{ t.title }}</span>
              <span class="text-xs text-text-xmuted">{{ timeAgo(t.created_at as string) }}</span>
            </div>
          </div>
        </N8nCard>
      </div>
    </div>
  </div>
</template>