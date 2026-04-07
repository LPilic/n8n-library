import { useState, useEffect, type ComponentType } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { useBrandingStore } from '@/stores/branding'
import { cn } from '@/lib/utils'
import { CommandPalette } from './CommandPalette'
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
  type LucideProps,
} from 'lucide-react'

interface NavItem {
  path: string
  label: string
  icon: ComponentType<LucideProps>
  minRole?: 'editor' | 'admin'
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/library', label: 'Library', icon: Library },
  { path: '/n8n', label: 'n8n Workflows', icon: Zap },
  { path: '/monitoring', label: 'Monitoring', icon: Activity, minRole: 'editor' },
  { path: '/observability', label: 'Observability', icon: BarChart3, minRole: 'editor' },
  { path: '/tickets', label: 'Service Desk', icon: Ticket },
  { path: '/kb', label: 'Knowledge Base', icon: BookOpen },
  { path: '/prompts', label: 'Prompts', icon: MessageSquareText },
  { path: '/approvals', label: 'Approvals', icon: CheckCircle, minRole: 'editor' },
  { path: '/credentials', label: 'Credentials', icon: KeyRound, minRole: 'admin' },
  { path: '/alerts', label: 'Alerts', icon: BellRing, minRole: 'admin' },
  { path: '/variables', label: 'Variables', icon: Wrench, minRole: 'editor' },
  { path: '/tags', label: 'Tags', icon: Tag, minRole: 'editor' },
  { path: '/security', label: 'Security', icon: Shield, minRole: 'admin' },
  { path: '/audit', label: 'Audit Log', icon: ClipboardList, minRole: 'admin' },
  { path: '/settings', label: 'Settings', icon: Settings, minRole: 'admin' },
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
  const [cmdOpen, setCmdOpen] = useState(false)

  const role = user?.role ?? 'viewer'

  // Load branding on mount
  useEffect(() => {
    loadBranding()
  }, [loadBranding])

  // Cmd+K keyboard shortcut
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

  const brandName = branding?.brand_name || 'n8n Library'

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col bg-sidebar border-r border-border transition-all duration-200 shrink-0',
          sidebarOpen ? 'w-56' : 'w-14',
        )}
      >
        {/* Logo area */}
        <div className="flex items-center h-14 px-3 border-b border-border">
          {sidebarOpen && (
            <div className="flex items-center gap-2 min-w-0">
              {branding?.brand_logo && (
                <img src={branding.brand_logo} alt="" className="h-6 w-6 object-contain shrink-0" />
              )}
              <span className="font-semibold text-text-dark text-sm truncate">
                {brandName}
              </span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto text-text-muted hover:text-text-dark p-1"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_ITEMS.filter((item) => hasAccess(role, item.minRole)).map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 mx-2 px-2 py-1.5 rounded-sm text-sm transition-colors',
                  isActive
                    ? 'bg-primary-light text-primary font-medium'
                    : 'text-text-muted hover:bg-card-hover hover:text-text-dark',
                )
              }
            >
              <item.icon size={16} className="shrink-0" />
              {sidebarOpen && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center h-14 px-4 bg-bg-light border-b border-border shrink-0">
          {/* Search trigger */}
          <button
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-2 text-text-muted hover:text-text-dark text-sm"
          >
            <Search size={16} />
            <span className="hidden sm:inline">Search...</span>
            <kbd className="hidden sm:inline text-xs text-text-xmuted bg-bg px-1.5 py-0.5 rounded border border-border-light ml-1">
              Ctrl+K
            </kbd>
          </button>

          <div className="flex-1" />

          {/* Theme toggle */}
          <button
            onClick={() =>
              setMode(mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light')
            }
            className="text-text-muted hover:text-text-dark px-2 py-1"
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
          <div className="relative ml-2">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 px-2 py-1 text-sm text-text-dark hover:bg-card-hover rounded-sm"
            >
              <span>{user?.username}</span>
              <span className="text-xs text-text-muted capitalize">({role})</span>
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-md shadow-lg py-1 min-w-[140px] z-50">
                <button
                  onClick={() => {
                    setUserMenuOpen(false)
                    navigate('/settings')
                  }}
                  className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-text-base hover:bg-card-hover"
                >
                  <Settings size={14} />
                  Settings
                </button>
                <button
                  onClick={() => {
                    setUserMenuOpen(false)
                    logout()
                  }}
                  className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-danger hover:bg-card-hover"
                >
                  <LogOut size={14} />
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>

      {/* Command palette overlay */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  )
}
