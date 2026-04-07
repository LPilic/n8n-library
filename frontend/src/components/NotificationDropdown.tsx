import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { useSse } from '@/hooks/useSse'
import { timeAgo } from '@/lib/utils'
import type { Notification } from '@/api/types'
import { Bell, UserPlus, RefreshCw, MessageSquare, Ticket, AlertTriangle } from 'lucide-react'

const NOTIF_ICONS: Record<string, typeof Bell> = {
  assignment: UserPlus,
  status_change: RefreshCw,
  comment: MessageSquare,
  new_ticket: Ticket,
  alert: AlertTriangle,
}

export function NotificationDropdown() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api
      .get<{ notifications: Notification[]; unreadCount: number }>('/api/notifications')
      .then((data) => {
        setNotifications(data.notifications.slice(0, 20))
        setUnreadCount(data.unreadCount)
      })
      .catch(() => {})
  }, [])

  const handleSse = useCallback((event: string, data: unknown) => {
    if (event === 'notification') {
      const notif = data as Notification
      setNotifications((prev) => [notif, ...prev].slice(0, 20))
      setUnreadCount((c) => c + 1)
    }
    if (event === 'read-all') {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    }
  }, [])

  useSse('/api/notifications/stream', { onMessage: handleSse })

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function markAllRead() {
    try {
      await api.put('/api/notifications/read-all')
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch { /* ignore */ }
  }

  function clickNotif(notif: Notification) {
    if (!notif.is_read) {
      api.put(`/api/notifications/${notif.id}/read`).catch(() => {})
      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)))
      setUnreadCount((c) => Math.max(0, c - 1))
    }
    setOpen(false)
    if (notif.link) navigate(notif.link)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative text-text-muted hover:text-text-dark p-1.5 rounded-md transition-colors duration-150"
        title="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-primary text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg w-80 max-h-96 overflow-hidden z-50 dropdown-enter">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <span className="text-[13px] font-semibold text-text-dark">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[12px] text-primary hover:text-primary-hover font-medium">
                Mark all read
              </button>
            )}
          </div>
          <div className="overflow-y-auto max-h-72">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-text-muted">No notifications</div>
            ) : (
              notifications.map((n) => {
                const Icon = NOTIF_ICONS[n.type] || Bell
                return (
                  <div
                    key={n.id}
                    onClick={() => clickNotif(n)}
                    className={`px-4 py-2.5 cursor-pointer hover:bg-bg border-b border-border-light flex gap-2.5 transition-colors duration-100 ${
                      !n.is_read ? 'bg-primary-light/20' : ''
                    }`}
                  >
                    <Icon size={14} className="text-text-xmuted shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="font-medium text-text-dark text-[12px] truncate">{n.title}</div>
                      <div className="text-text-muted text-[12px] mt-0.5 line-clamp-2">{n.message}</div>
                      <div className="text-text-xmuted text-[11px] mt-1">{timeAgo(n.created_at)}</div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
