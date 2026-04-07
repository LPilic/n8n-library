import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { useSse } from '@/hooks/useSse'
import { timeAgo } from '@/lib/utils'
import type { Notification } from '@/api/types'
import { Bell } from 'lucide-react'

export function NotificationDropdown() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  // Load initial notifications
  useEffect(() => {
    api
      .get<{ notifications: Notification[]; unreadCount: number }>('/api/notifications')
      .then((data) => {
        setNotifications(data.notifications)
        setUnreadCount(data.unreadCount)
      })
      .catch(() => {})
  }, [])

  // SSE for real-time updates
  const handleSse = useCallback((event: string, data: unknown) => {
    if (event === 'notification') {
      const notif = data as Notification
      setNotifications((prev) => [notif, ...prev].slice(0, 50))
      setUnreadCount((c) => c + 1)
    }
    if (event === 'read-all') {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    }
  }, [])

  useSse('/api/notifications/stream', { onMessage: handleSse })

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function markAllRead() {
    try {
      await api.put('/api/notifications/read-all')
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch {
      // ignore
    }
  }

  function clickNotif(notif: Notification) {
    // Mark as read
    if (!notif.is_read) {
      api.put(`/api/notifications/${notif.id}/read`).catch(() => {})
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)),
      )
      setUnreadCount((c) => Math.max(0, c - 1))
    }
    setOpen(false)
    if (notif.link) navigate(notif.link)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative text-text-muted hover:text-text-dark px-2 py-1"
        title="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-danger text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-md shadow-lg w-80 max-h-96 overflow-hidden z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-sm font-medium text-text-dark">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-primary hover:text-primary-hover"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="overflow-y-auto max-h-72">
            {notifications.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-text-muted">
                No notifications
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => clickNotif(n)}
                  className={`px-3 py-2 cursor-pointer hover:bg-card-hover border-b border-border-light text-sm ${
                    !n.is_read ? 'bg-primary-light/30' : ''
                  }`}
                >
                  <div className="font-medium text-text-dark text-xs">{n.title}</div>
                  <div className="text-text-muted text-xs mt-0.5 line-clamp-2">{n.message}</div>
                  <div className="text-text-xmuted text-[11px] mt-1">{timeAgo(n.created_at)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
