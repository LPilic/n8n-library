import { useState, useEffect, type ComponentType } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { ErrorBoundary } from './ErrorBoundary'
import { useThemeStore } from '@/stores/theme'
import { useBrandingStore } from '@/stores/branding'
import { cn } from '@/lib/utils'
import { CommandPalette } from './CommandPalette'
import { AiChatPanel } from '@/features/ai-chat'
import { NotificationDropdown } from './NotificationDropdown'
import { InstanceSelector } from './InstanceSelector'
import {
  LayoutDashboard,
  Library,
  Zap,
  Activity,
  BarChart3,
  Ticket,
  BookOpen,
  MessageSquareText,
  CheckCircle,
  KeyRound,
  BellRing,
  Wrench,
  Tag,
  Shield,
  ClipboardList,
  Sparkles,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Monitor,
  LogOut,
  Search,
  MoreHorizontal,
  Users as UsersIcon,
  Package,
  type LucideProps,
} from 'lucide-react'

interface NavItem {
  path: string
  label: string
  icon: ComponentType<LucideProps>
  minRole?: 'editor' | 'admin'
  section?: string
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, section: 'main' },
  { path: '/library', label: 'Library', icon: Library, section: 'main' },
  { path: '/n8n', label: 'n8n Workflows', icon: Zap, section: 'main' },
  { path: '/monitoring', label: 'Monitoring', icon: Activity, minRole: 'editor', section: 'operations' },
  { path: '/observability', label: 'Observability', icon: BarChart3, minRole: 'admin', section: 'operations' },
  { path: '/credential-store', label: 'Credential Store', icon: Package, minRole: 'editor', section: 'operations' },
  { path: '/tickets', label: 'Service Desk', icon: Ticket, section: 'content' },
  { path: '/kb', label: 'Knowledge Base', icon: BookOpen, section: 'content' },
  { path: '/prompts', label: 'Prompts', icon: MessageSquareText, section: 'content' },
  { path: '/approvals', label: 'Approvals', icon: CheckCircle, minRole: 'editor', section: 'content' },
  { path: '/ai', label: 'AI Config', icon: Sparkles, minRole: 'admin', section: 'admin' },
  { path: '/credentials', label: 'Credentials', icon: KeyRound, minRole: 'admin', section: 'admin' },
  { path: '/alerts', label: 'Alerts', icon: BellRing, minRole: 'admin', section: 'admin' },
  { path: '/variables', label: 'Variables', icon: Wrench, minRole: 'editor', section: 'admin' },
  { path: '/tags', label: 'Tags', icon: Tag, minRole: 'editor', section: 'admin' },
  { path: '/security', label: 'Security', icon: Shield, minRole: 'admin', section: 'admin' },
  { path: '/users', label: 'Users', icon: UsersIcon, minRole: 'admin', section: 'admin' },
  { path: '/audit', label: 'Audit Log', icon: ClipboardList, minRole: 'admin', section: 'admin' },
  { path: '/settings', label: 'Settings', icon: Settings, minRole: 'admin', section: 'admin' },
]

const SECTIONS: Record<string, string> = {
  main: '',
  operations: 'Operations',
  content: 'Content',
  admin: 'Administration',
}

// Mobile bottom nav — first 4 items + More
const MOBILE_NAV = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { path: '/tickets', label: 'Tickets', icon: Ticket },
  { path: '/monitoring', label: 'Monitor', icon: Activity },
  { path: '/kb', label: 'KB', icon: BookOpen },
]

const ROLE_LEVEL: Record<string, number> = { viewer: 0, editor: 1, admin: 2 }

function hasAccess(userRole: string, minRole?: string): boolean {
  if (!minRole) return true
  return (ROLE_LEVEL[userRole] ?? 0) >= (ROLE_LEVEL[minRole] ?? 0)
}

export function AppLayout() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { mode, setMode } = useThemeStore()
  const { branding, loadBranding } = useBrandingStore()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // userMenuOpen removed — user info is now in sidebar footer
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [aiChatOpen, setAiChatOpen] = useState(false)

  const role = user?.role ?? 'viewer'
  const visibleItems = NAV_ITEMS.filter((item) => hasAccess(role, item.minRole))

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
  const navBadges: Record<string, number> = {}
  if (ticketData?.total) navBadges['/tickets'] = ticketData.total
  if (approvalData?.count) navBadges['/approvals'] = approvalData.count

  useEffect(() => { loadBranding() }, [loadBranding])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // User menu moved to sidebar footer

  const brandName = branding?.brand_name || 'n8n Library'

  // Group nav items by section
  let lastSection = ''

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Sidebar — hidden on mobile via CSS */}
      <aside
        className={cn(
          'desktop-sidebar flex flex-col bg-sidebar border-r border-border transition-all duration-200 shrink-0',
          sidebarOpen ? 'w-[230px]' : 'w-[60px]',
        )}
      >
        {/* Logo area — 57px to match legacy */}
        <div className="flex items-center h-[57px] px-4 border-b border-border">
          {sidebarOpen && (
            <div className="flex items-center gap-2 min-w-0">
              {branding?.brand_logo && (
                <img src={branding.brand_logo} alt="" className="h-7 max-w-[140px] object-contain shrink-0" />
              )}
              <span className="font-bold text-text-dark text-sm tracking-tight truncate">
                {brandName}
              </span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto text-text-muted hover:text-text-dark p-1 rounded-md transition-colors duration-150"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto sidebar-scroll py-2 px-2 flex flex-col">
          {visibleItems.map((item) => {
            const showSection = sidebarOpen && item.section && item.section !== lastSection && SECTIONS[item.section]
            if (item.section) lastSection = item.section
            return (
              <div key={item.path}>
                {showSection && (
                  <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-xmuted px-3 pt-4 pb-1">
                    {SECTIONS[item.section!]}
                  </div>
                )}
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  title={!sidebarOpen ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium mb-0.5 transition-all duration-150',
                      sidebarOpen ? '' : 'justify-center px-0',
                      isActive
                        ? 'bg-primary-light text-primary'
                        : 'text-text-muted hover:bg-bg hover:text-text-dark',
                    )
                  }
                >
                  <item.icon size={18} className="shrink-0" />
                  {sidebarOpen && <span className="truncate">{item.label}</span>}
                  {sidebarOpen && navBadges[item.path] > 0 && (
                    <span className="ml-auto bg-primary text-white text-[10px] font-bold min-w-[20px] h-5 flex items-center justify-center rounded-full px-1.5">
                      {navBadges[item.path]}
                    </span>
                  )}
                </NavLink>
              </div>
            )
          })}

          {/* AI Chat — pinned at bottom of nav */}
          {sidebarOpen && (
            <div className="mt-auto pt-3 border-t border-border-light">
              <button
                onClick={() => setAiChatOpen(true)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium text-text-muted hover:bg-bg hover:text-text-dark transition-all duration-150 w-full"
              >
                <MessageSquareText size={18} className="shrink-0" />
                AI Chat
              </button>
            </div>
          )}
        </nav>

        {/* User footer — matches legacy sidebar bottom */}
        {sidebarOpen && (
          <div className="px-3 py-3 border-t border-border shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                {(user?.username || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-text-dark truncate">{user?.username}</div>
                <div className="text-[10px] text-text-xmuted">{role}</div>
              </div>
              <NotificationDropdown />
              <button onClick={logout} className="text-text-xmuted hover:text-danger p-1 transition-colors" title="Logout">
                <LogOut size={15} />
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center h-[57px] px-4 bg-bg-light border-b border-border shrink-0">
          {/* Mobile menu button */}
          <button
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-2 text-text-muted hover:text-text-dark text-[13px]"
          >
            <Search size={16} />
            <span className="hidden sm:inline">Search...</span>
            <kbd className="hidden sm:inline text-[11px] text-text-xmuted bg-bg px-1.5 py-0.5 rounded-sm border border-border-light ml-1">
              {navigator.platform.includes('Mac') ? '\u2318K' : 'Ctrl+K'}
            </kbd>
          </button>

          <div className="flex-1" />

          {/* Instance selector */}
          <InstanceSelector />

          {/* Theme toggle */}
          <button
            onClick={() =>
              setMode(mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light')
            }
            className="text-text-muted hover:text-text-dark p-1.5 rounded-md transition-colors duration-150"
            title={`Theme: ${mode}`}
          >
            {mode === 'dark' ? (
              <Moon size={18} />
            ) : mode === 'system' ? (
              <Monitor size={18} />
            ) : (
              <Sun size={18} />
            )}
          </button>

          {/* Notifications (also in sidebar, keep here for quick access) */}
          <NotificationDropdown />

          {/* User name */}
          <span className="text-[13px] text-text-dark font-medium ml-2 hidden sm:inline">{user?.username}</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 main-content">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile bottom nav bar */}
      <div className="mobile-nav-bar fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40 flex justify-around items-center px-1 py-1 safe-area-pb">
        {MOBILE_NAV.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md text-[10px] font-semibold transition-colors',
                isActive ? 'text-primary' : 'text-text-muted',
              )
            }
          >
            <item.icon size={20} />
            {item.label}
          </NavLink>
        ))}
        <button
          onClick={() => setMobileMoreOpen(!mobileMoreOpen)}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md text-[10px] font-semibold text-text-muted"
        >
          <MoreHorizontal size={20} />
          More
        </button>
        {/* Mobile more popup */}
        {mobileMoreOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMobileMoreOpen(false)} />
            <div className="absolute bottom-full right-2 mb-2 bg-card border border-border rounded-lg shadow-lg py-2 min-w-[180px] z-50 dropdown-enter">
              {visibleItems
                .filter((item) => !MOBILE_NAV.some((m) => m.path === item.path))
                .map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMoreOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors',
                        isActive ? 'text-primary bg-primary-light' : 'text-text-muted hover:bg-bg',
                      )
                    }
                  >
                    <item.icon size={16} />
                    {item.label}
                  </NavLink>
                ))}
            </div>
          </>
        )}
      </div>

      {/* Command palette overlay */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <AiChatPanel open={aiChatOpen} onToggle={() => setAiChatOpen((o) => !o)} />
    </div>
  )
}
