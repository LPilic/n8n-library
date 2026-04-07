import { useState, useEffect, type ComponentType } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { ErrorBoundary } from './ErrorBoundary'
import { useThemeStore } from '@/stores/theme'
import { useBrandingStore } from '@/stores/branding'
import { cn } from '@/lib/utils'
import { CommandPalette } from './CommandPalette'
import { AiChatPanel } from '@/features/ai-chat'
import { NotificationDropdown } from './NotificationDropdown'
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
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Monitor,
  LogOut,
  Search,
  MoreHorizontal,
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
  { path: '/observability', label: 'Observability', icon: BarChart3, minRole: 'editor', section: 'operations' },
  { path: '/tickets', label: 'Service Desk', icon: Ticket, section: 'content' },
  { path: '/kb', label: 'Knowledge Base', icon: BookOpen, section: 'content' },
  { path: '/prompts', label: 'Prompts', icon: MessageSquareText, section: 'content' },
  { path: '/approvals', label: 'Approvals', icon: CheckCircle, minRole: 'editor', section: 'content' },
  { path: '/credentials', label: 'Credentials', icon: KeyRound, minRole: 'admin', section: 'admin' },
  { path: '/alerts', label: 'Alerts', icon: BellRing, minRole: 'admin', section: 'admin' },
  { path: '/variables', label: 'Variables', icon: Wrench, minRole: 'editor', section: 'admin' },
  { path: '/tags', label: 'Tags', icon: Tag, minRole: 'editor', section: 'admin' },
  { path: '/security', label: 'Security', icon: Shield, minRole: 'admin', section: 'admin' },
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
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [aiChatOpen, setAiChatOpen] = useState(false)

  const role = user?.role ?? 'viewer'
  const visibleItems = NAV_ITEMS.filter((item) => hasAccess(role, item.minRole))

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

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return
    const handler = () => setUserMenuOpen(false)
    setTimeout(() => document.addEventListener('click', handler), 0)
    return () => document.removeEventListener('click', handler)
  }, [userMenuOpen])

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
        <nav className="flex-1 overflow-y-auto sidebar-scroll py-2 px-2">
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
                </NavLink>
              </div>
            )
          })}
        </nav>
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

          {/* Notifications */}
          <NotificationDropdown />

          {/* User menu */}
          <div className="relative ml-1">
            <button
              onClick={(e) => { e.stopPropagation(); setUserMenuOpen(!userMenuOpen) }}
              className="flex items-center gap-2 px-2 py-1.5 text-[13px] text-text-dark hover:bg-bg rounded-md transition-colors duration-150"
            >
              <span className="font-medium">{user?.username}</span>
              <span className="text-[11px] text-text-muted capitalize">({role})</span>
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[160px] z-50 dropdown-enter">
                <button
                  onClick={() => { setUserMenuOpen(false); navigate('/settings') }}
                  className="flex items-center gap-2.5 w-full text-left px-3 py-2 text-[13px] text-text-base hover:bg-bg transition-colors duration-100"
                >
                  <Settings size={15} />
                  Settings
                </button>
                <button
                  onClick={() => { setUserMenuOpen(false); logout() }}
                  className="flex items-center gap-2.5 w-full text-left px-3 py-2 text-[13px] text-danger hover:bg-bg transition-colors duration-100"
                >
                  <LogOut size={15} />
                  Logout
                </button>
              </div>
            )}
          </div>
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
