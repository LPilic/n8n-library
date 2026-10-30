<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, defineAsyncComponent, watch } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { N8nIcon } from '@n8n/design-system'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { useBrandingStore } from '@/stores/branding'
import { useInstanceStore } from '@/stores/instance'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import NotificationDropdown from '@/components/NotificationDropdown.vue'
import InstanceSelector from '@/components/InstanceSelector.vue'

const AiChatPanel = defineAsyncComponent(() => import('@/features/ai-chat.vue'))

interface NavItem {
  path: string
  label: string
  icon: string
  minRole?: 'editor' | 'admin'
  section?: string
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: 'layout-dashboard', section: 'main' },
  { path: '/library', label: 'Library', icon: 'library', section: 'main' },
  { path: '/n8n', label: 'n8n Workflows', icon: 'zap', section: 'main' },
  { path: '/monitoring', label: 'Monitoring', icon: 'activity', minRole: 'editor', section: 'operations' },
  { path: '/tracing', label: 'Tracing', icon: 'waypoints', minRole: 'editor', section: 'operations' },
  { path: '/observability', label: 'Observability', icon: 'chart-bar-big', minRole: 'admin', section: 'operations' },
  { path: '/credential-store', label: 'Credential Store', icon: 'package', minRole: 'editor', section: 'operations' },
  { path: '/tickets', label: 'Service Desk', icon: 'ticket', section: 'content' },
  { path: '/kb', label: 'Knowledge Base', icon: 'book-open', section: 'content' },
  { path: '/prompts', label: 'Prompts', icon: 'message-square-text', section: 'content' },
  { path: '/approvals', label: 'Approvals', icon: 'circle-check', minRole: 'editor', section: 'content' },
  { path: '/ai', label: 'AI Config', icon: 'sparkles', minRole: 'admin', section: 'admin' },
  { path: '/credentials', label: 'Credentials', icon: 'key-round', minRole: 'admin', section: 'admin' },
  { path: '/alerts', label: 'Alerts', icon: 'bell-ring', minRole: 'admin', section: 'admin' },
  { path: '/variables', label: 'Variables', icon: 'wrench', minRole: 'editor', section: 'admin' },
  { path: '/tags', label: 'Tags', icon: 'tags', minRole: 'editor', section: 'admin' },
  { path: '/security', label: 'Security', icon: 'shield', minRole: 'admin', section: 'admin' },
  { path: '/users', label: 'Users', icon: 'users', minRole: 'admin', section: 'admin' },
  { path: '/audit', label: 'Audit Log', icon: 'clipboard-list', minRole: 'admin', section: 'admin' },
  { path: '/settings', label: 'Settings', icon: 'settings', minRole: 'admin', section: 'admin' },
]

const SECTIONS: Record<string, string> = {
  main: '',
  operations: 'Operations',
  content: 'Content',
  admin: 'Administration',
}

const MOBILE_NAV = [
  { path: '/', label: 'Home', icon: 'layout-dashboard' },
  { path: '/tickets', label: 'Tickets', icon: 'ticket' },
  { path: '/monitoring', label: 'Monitor', icon: 'activity' },
  { path: '/kb', label: 'KB', icon: 'book-open' },
]

const ROLE_LEVEL: Record<string, number> = { viewer: 0, editor: 1, admin: 2 }

const auth = useAuthStore()
const router = useRouter()
const theme = useThemeStore()
const brandingStore = useBrandingStore()
const instanceStore = useInstanceStore()

const isMac = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac')

const sidebarOpen = ref(true)
const mobileMoreOpen = ref(false)
const cmdOpen = ref(false)
const aiChatOpen = ref(false)

const user = computed(() => auth.user)
const role = computed(() => auth.user?.role ?? 'viewer')
const brandName = computed(() => brandingStore.branding?.brand_name || 'n8n Library')

const visibleItems = computed(() =>
  NAV_ITEMS.filter(
    (item) => !item.minRole || (ROLE_LEVEL[role.value] ?? 0) >= (ROLE_LEVEL[item.minRole] ?? 0),
  ),
)

// Grouped display list with section headers
const sidebarDisplay = computed(() => {
  const out: Array<{ type: 'section'; label: string } | { type: 'item'; item: NavItem }> = []
  let last = ''
  for (const item of visibleItems.value) {
    if (item.section && item.section !== last && SECTIONS[item.section]) {
      out.push({ type: 'section', label: SECTIONS[item.section!] })
      last = item.section
    }
    out.push({ type: 'item', item })
  }
  return out
})

// Sidebar badges — open tickets + pending approvals
const { data: ticketData } = useQuery({
  queryKey: ['open-ticket-count'],
  queryFn: () => api.get<{ total: number }>('/api/tickets?status=open&limit=1'),
  refetchInterval: 60_000,
})
const { data: approvalData } = useQuery({
  queryKey: ['pending-approval-count'],
  queryFn: () => api.get<{ count: number }>('/api/hitl/pending-count'),
  refetchInterval: 60_000,
})
const navBadges = computed<Record<string, number>>(() => {
  const badges: Record<string, number> = {}
  if (ticketData.value?.total) badges['/tickets'] = ticketData.value.total
  if (approvalData.value?.count) badges['/approvals'] = approvalData.value.count
  return badges
})

let cmdHandler: ((e: KeyboardEvent) => void) | null = null
onMounted(() => {
  cmdHandler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      cmdOpen.value = !cmdOpen.value
    }
  }
  window.addEventListener('keydown', cmdHandler)
})
onBeforeUnmount(() => {
  if (cmdHandler) window.removeEventListener('keydown', cmdHandler)
})

async function logout() {
  await auth.logout()
  router.push('/')
}

// Close mobile menu on navigation
watch(
  () => router.currentRoute.value.fullPath,
  () => {
    mobileMoreOpen.value = false
  },
)
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-bg">
    <!-- Sidebar -->
    <aside
      class="desktop-sidebar flex shrink-0 flex-col border-r border-border bg-sidebar transition-all duration-200"
      :style="{ width: sidebarOpen ? '240px' : '64px' }"
    >
      <div class="flex h-[52px] items-center border-b border-border px-3">
        <div v-if="sidebarOpen" class="flex min-w-0 items-center gap-2">
          <img
            v-if="brandingStore.branding?.brand_logo"
            :src="brandingStore.branding.brand_logo"
            alt=""
            class="h-7 max-w-[140px] shrink-0 object-contain"
          />
          <span class="truncate text-sm font-bold text-text-dark tracking-tight">{{ brandName }}</span>
        </div>
        <button
          class="ml-auto cursor-pointer rounded-xs p-1 text-text-muted transition-colors duration-150 hover:bg-bg hover:text-text-dark"
          :title="sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'"
          @click="sidebarOpen = !sidebarOpen"
        >
          <N8nIcon :icon="sidebarOpen ? 'panel-left-close' : 'panel-left-open'" :size="16" />
        </button>
      </div>

      <nav class="sidebar-scroll flex flex-1 flex-col overflow-y-auto px-2 py-2">
        <template v-for="(entry, i) in sidebarDisplay" :key="entry.type === 'item' ? entry.item.path : `s${i}`">
          <div v-if="entry.type === 'section' && sidebarOpen" class="px-2.5 pt-4 pb-1 text-[11px] font-semibold tracking-[0.08em] text-text-xmuted uppercase">
            {{ entry.label }}
          </div>
          <RouterLink
            v-else-if="entry.type === 'item'"
            :to="entry.item.path"
            custom
            v-slot="{ href, navigate, isActive }"
          >
            <div
              class="mb-0.5 flex items-center gap-2.5 rounded-xs px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150 cursor-pointer"
              :class="[
                sidebarOpen ? '' : 'justify-center px-0',
                isActive
                  ? 'bg-bg-light text-text-dark'
                  : 'text-text-base hover:bg-bg-light hover:text-text-dark',
              ]"
              :title="!sidebarOpen ? entry.item.label : undefined"
              @click="navigate($event)"
            >
              <N8nIcon :icon="entry.item.icon" :size="18" class="shrink-0" />
              <span v-if="sidebarOpen" class="truncate">{{ entry.item.label }}</span>
              <span
                v-if="sidebarOpen && (navBadges[entry.item.path] ?? 0) > 0"
                class="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-white"
              >
                {{ navBadges[entry.item.path] }}
              </span>
            </div>
          </RouterLink>
        </template>

        <div v-if="sidebarOpen" class="mt-auto border-t border-border-light pt-3">
          <button
            class="flex w-full cursor-pointer items-center gap-2.5 rounded-xs px-2.5 py-1.5 text-[13px] font-medium text-text-base transition-colors duration-150 hover:bg-bg hover:text-text-dark"
            @click="aiChatOpen = !aiChatOpen"
          >
            <N8nIcon icon="message-square-text" :size="18" class="shrink-0" />
            AI Chat
          </button>
        </div>
      </nav>

      <div v-if="sidebarOpen" class="shrink-0 border-t border-border px-3 py-3">
        <div class="flex items-center gap-2">
          <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {{ (user?.username || 'U').charAt(0).toUpperCase() }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="truncate text-[13px] font-medium text-text-dark">{{ user?.username }}</div>
            <div class="text-[11px] text-text-xmuted">{{ role }}</div>
          </div>
          <NotificationDropdown />
          <button
            class="cursor-pointer p-1 text-text-xmuted transition-colors hover:text-danger"
            title="Logout"
            @click="logout"
          >
            <N8nIcon icon="log-out" :size="15" />
          </button>
        </div>
      </div>
    </aside>

    <!-- Main content -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <header class="flex h-[52px] shrink-0 items-center border-b border-border bg-card px-4">
        <button
          class="flex cursor-pointer items-center gap-2 text-[13px] text-text-muted hover:text-text-dark"
          @click="cmdOpen = true"
        >
          <N8nIcon icon="search" :size="16" />
          <span class="hidden sm:inline">Search...</span>
          <kbd class="ml-1 hidden rounded-xs border border-border-light bg-bg px-1.5 py-0.5 text-[11px] text-text-xmuted sm:inline">
            {{ isMac ? '⌘K' : 'Ctrl+K' }}
          </kbd>
        </button>

        <div class="flex-1" />

        <InstanceSelector />

        <button
          class="cursor-pointer rounded-md p-1.5 text-text-muted transition-colors duration-150 hover:text-text-dark"
          :title="`Theme: ${theme.mode}`"
          @click="theme.setMode(theme.mode === 'light' ? 'dark' : theme.mode === 'dark' ? 'system' : 'light')"
        >
          <N8nIcon :icon="theme.mode === 'dark' ? 'moon' : theme.mode === 'system' ? 'monitor' : 'sun'" :size="18" />
        </button>

        <NotificationDropdown />

        <span class="ml-2 hidden text-[13px] font-medium text-text-dark sm:inline">{{ user?.username }}</span>
      </header>

      <main class="main-content flex-1 overflow-y-auto">
        <div class="mx-auto w-full max-w-[1120px] px-4 py-5 md:px-6 md:py-6 lg:py-8 lg:pb-10">
          <ErrorBoundary>
            <RouterView />
          </ErrorBoundary>
        </div>
      </main>
    </div>

    <!-- Mobile bottom nav -->
    <div class="mobile-nav-bar safe-area-pb fixed right-0 bottom-0 left-0 z-40 flex items-center justify-around border-t border-border bg-card px-1 py-1">
      <RouterLink
        v-for="item in MOBILE_NAV"
        :key="item.path"
        custom
        v-slot="{ href, navigate, isActive }"
        :to="item.path"
      >
        <div
          class="flex cursor-pointer flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors"
          :class="isActive ? 'text-primary' : 'text-text-muted'"
          @click="navigate($event)"
        >
          <N8nIcon :icon="item.icon" :size="20" />
          {{ item.label }}
        </div>
      </RouterLink>
      <button
        class="flex cursor-pointer flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-[11px] font-semibold text-text-muted"
        @click="mobileMoreOpen = !mobileMoreOpen"
      >
        <N8nIcon icon="ellipsis" :size="20" />
        More
      </button>
      <Teleport to="body">
        <template v-if="mobileMoreOpen">
          <div class="fixed inset-0 z-40" @click="mobileMoreOpen = false" />
          <div class="dropdown-enter fixed right-2 bottom-[64px] z-50 min-w-[180px] rounded-lg border border-border bg-card py-2 shadow-lg">
            <RouterLink
              v-for="item in visibleItems.filter((i) => !MOBILE_NAV.some((m) => m.path === i.path))"
              :key="item.path"
              custom
              v-slot="{ href, navigate, isActive }"
              :to="item.path"
            >
              <div
                class="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] transition-colors"
                :class="isActive ? 'text-primary' : 'text-text-muted'"
                @click="mobileMoreOpen = false; navigate($event)"
              >
                <N8nIcon :icon="item.icon" :size="16" />
                {{ item.label }}
              </div>
            </RouterLink>
          </div>
        </template>
      </Teleport>
    </div>

    <CommandPalette :open="cmdOpen" @close="cmdOpen = false" />
    <Suspense>
      <AiChatPanel v-if="aiChatOpen" :open="aiChatOpen" @toggle="aiChatOpen = !aiChatOpen" />
    </Suspense>
  </div>
</template>