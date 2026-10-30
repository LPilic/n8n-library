<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { N8nIcon } from '@n8n/design-system'
import { api } from '@/api/client'
import { useSse } from '@/composables/useSse'
import { timeAgo } from '@/lib/utils'
import type { Notification } from '@/api/types'

const router = useRouter()
const open = ref(false)
const notifications = ref<Notification[]>([])
const unreadCount = ref(0)
const container = ref<HTMLElement | null>(null)

onMounted(() => {
  api
    .get<{ notifications: Notification[]; unreadCount: number }>('/api/notifications')
    .then((data) => {
      notifications.value = data.notifications.slice(0, 20)
      unreadCount.value = data.unreadCount
    })
    .catch(() => {})
})

useSse('/api/notifications/stream', {
  onMessage: (event, data) => {
    if (event === 'notification') {
      const notif = data as Notification
      notifications.value = [notif, ...notifications.value].slice(0, 20)
      unreadCount.value = unreadCount.value + 1
    }
    if (event === 'read-all') {
      notifications.value = notifications.value.map((n) => ({ ...n, is_read: true }))
      unreadCount.value = 0
    }
  },
})

const NOTIF_ICONS: Record<string, string> = {
  assignment: 'user-round-plus',
  status_change: 'refresh-cw',
  comment: 'message-square',
  new_ticket: 'ticket',
  alert: 'triangle-alert',
}

async function markAllRead() {
  try {
    await api.put('/api/notifications/read-all')
    notifications.value = notifications.value.map((n) => ({ ...n, is_read: true }))
    unreadCount.value = 0
  } catch {
    /* ignore */
  }
}

function clickNotif(notif: Notification) {
  if (!notif.is_read) {
    api.put(`/api/notifications/${notif.id}/read`).catch(() => {})
    notifications.value = notifications.value.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
    unreadCount.value = Math.max(0, unreadCount.value - 1)
  }
  open.value = false
  if (notif.link) router.push(notif.link)
}

// Outside click handling replaced by a simple document listener
let handler: ((e: MouseEvent) => void) | null = null
onMounted(() => {
  handler = (e: MouseEvent) => {
    if (container.value && !container.value.contains(e.target as Node)) open.value = false
  }
  document.addEventListener('mousedown', handler)
})
onBeforeUnmount(() => {
  if (handler) document.removeEventListener('mousedown', handler)
})
</script>

<template>
  <div ref="container" class="relative">
    <button
      class="relative cursor-pointer rounded-xs p-1.5 text-text-muted transition-colors duration-150 hover:bg-bg hover:text-text-dark"
      title="Notifications"
      @click="open = !open"
    >
      <N8nIcon icon="bell" :size="18" />
      <span
        v-if="unreadCount > 0"
        class="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[11px] font-bold text-white"
      >
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </button>

    <div
      v-if="open"
      class="dropdown-enter absolute bottom-full left-0 z-50 mb-1 max-h-96 w-80 overflow-hidden rounded-md border border-border bg-card shadow-popover"
    >
      <div class="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span class="text-[13px] font-semibold text-text-dark">Notifications</span>
        <button
          v-if="unreadCount > 0"
          class="cursor-pointer text-[12px] font-medium text-primary hover:text-primary-hover"
          @click="markAllRead"
        >
          Mark all read
        </button>
      </div>
      <div class="max-h-72 overflow-y-auto">
        <div v-if="notifications.length === 0" class="px-4 py-8 text-center text-[13px] text-text-muted">
          No notifications
        </div>
        <div
          v-for="n in notifications"
          :key="n.id"
          class="flex cursor-pointer gap-2.5 border-b border-border-light px-4 py-2.5 transition-colors duration-100 hover:bg-bg"
          :class="!n.is_read ? 'bg-primary-light/20' : ''"
          @click="clickNotif(n)"
        >
          <N8nIcon :icon="NOTIF_ICONS[n.type] ?? 'bell'" :size="14" class="mt-0.5 shrink-0 text-text-xmuted" />
          <div class="min-w-0">
            <div class="truncate text-[12px] font-medium text-text-dark">{{ n.title }}</div>
            <div class="mt-0.5 line-clamp-2 text-[12px] text-text-muted">{{ n.message }}</div>
            <div class="mt-1 text-[11px] text-text-xmuted">{{ timeAgo(n.created_at) }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>