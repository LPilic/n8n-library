import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { DashboardData } from '@/api/types'
import { useAuthStore } from '@/stores/auth'
import { useInstanceStore } from '@/stores/instance'
import { esc, timeAgo } from '@/lib/utils'
// useState removed — instance selection is now global
import {
  Activity,
  Ticket as TicketIcon,
  BookOpen,
  LayoutGrid,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
} from 'lucide-react'

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const isWriter = user?.role === 'admin' || user?.role === 'editor'
  const activeInstanceId = useInstanceStore((s) => s.activeId)
  const iUrl = useInstanceStore((s) => s.url)

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', activeInstanceId],
    queryFn: () => api.get<DashboardData>(iUrl('/api/dashboard')),
  })

  if (isLoading) return <div className="text-text-muted">Loading dashboard...</div>
  if (error || !data) return <div className="text-danger">Failed to load dashboard</div>

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div>
      {/* Greeting */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-text-dark">
          {greeting}, {esc(data.user.username)}
        </h2>
        <p className="text-sm text-text-muted">Here's what's happening across your n8n environment</p>
      </div>

      {/* Instance is now selected globally via the topbar InstanceSelector */}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-6">
        {isWriter && data.n8nHealth && (
          <KpiCard
            icon={<Activity size={20} />}
            label={data.n8nHealth.status === 'healthy' ? 'Healthy' : data.n8nHealth.status === 'unhealthy' ? 'Unhealthy' : 'Unreachable'}
            sublabel={`n8n Instance${data.n8nHealth.latencyMs ? ` \u00B7 ${data.n8nHealth.latencyMs}ms` : ''}`}
            color={data.n8nHealth.status === 'healthy' ? 'success' : data.n8nHealth.status === 'unhealthy' ? 'warning' : 'danger'}
            onClick={() => navigate('/monitoring')}
          />
        )}
        <KpiCard
          icon={<TicketIcon size={20} />}
          label={String(data.tickets.openCount)}
          sublabel="Open Tickets"
          color="primary"
          onClick={() => navigate('/tickets')}
        />
        <KpiCard
          icon={<BookOpen size={20} />}
          label={String(data.kb.totalPublished)}
          sublabel="Published Articles"
          color="info"
          onClick={() => navigate('/kb')}
        />
        <KpiCard
          icon={<LayoutGrid size={20} />}
          label={String(data.templates.total)}
          sublabel="Templates"
          color="warning"
          onClick={() => navigate('/library')}
        />
        {isWriter && data.executions && (
          <KpiCard
            icon={<CheckCircle size={20} />}
            label={`${data.executions.successRate}%`}
            sublabel={`Success Rate (last ${data.executions.total})`}
            color={data.executions.successRate >= 80 ? 'success' : data.executions.successRate >= 50 ? 'warning' : 'danger'}
            onClick={() => navigate('/monitoring')}
          />
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          {/* My tickets */}
          {data.tickets.myTickets.length > 0 && (
            <DashCard title="My Tickets" action={() => navigate('/tickets')}>
              {(data.tickets.myTickets as Array<Record<string, string | number>>).map((t) => (
                <DashItem key={t.id} onClick={() => navigate(`/tickets/${t.id}`)}>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${priorityClass(t.priority as string)}`}>
                    {t.priority as string}
                  </span>
                  <span className="flex-1 truncate text-text-dark">{esc(t.title as string)}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusClass(t.status as string)}`}>
                    {(t.status as string).replace('_', ' ')}
                  </span>
                </DashItem>
              ))}
            </DashCard>
          )}

          {/* Recent failures */}
          {isWriter && data.executions?.recent && (() => {
            const failed = (data.executions.recent as Array<Record<string, string | number>>).filter(
              (e) => e.status === 'error',
            )
            if (failed.length === 0) return null
            return (
              <DashCard title="Recent Failures" action={() => navigate('/monitoring')} danger>
                {failed.slice(0, 5).map((e) => (
                  <DashItem key={e.id} onClick={() => navigate(`/monitoring/${e.id}`)}>
                    <XCircle size={14} className="text-danger shrink-0" />
                    <span className="flex-1 truncate text-text-dark">
                      {esc((e.workflowName as string) || `Workflow #${e.workflowId}`)}
                    </span>
                    <span className="text-text-xmuted text-xs">
                      {timeAgo((e.stoppedAt || e.startedAt) as string)}
                    </span>
                  </DashItem>
                ))}
              </DashCard>
            )
          })()}

          {/* Tickets by status */}
          {Object.keys(data.tickets.byStatus).length > 0 && (
            <DashCard title="Tickets by Status">
              <StatusBars statuses={data.tickets.byStatus} />
            </DashCard>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Recent executions */}
          {isWriter && data.executions && data.executions.recent.length > 0 && (
            <DashCard title="Recent Executions" action={() => navigate('/monitoring')}>
              {(data.executions.recent as Array<Record<string, string | number>>).slice(0, 6).map((e) => (
                <DashItem key={e.id} onClick={() => navigate(`/monitoring/${e.id}`)}>
                  {e.status === 'success' ? (
                    <CheckCircle size={14} className="text-success shrink-0" />
                  ) : e.status === 'error' ? (
                    <XCircle size={14} className="text-danger shrink-0" />
                  ) : (
                    <Clock size={14} className="text-warning shrink-0" />
                  )}
                  <span className="flex-1 truncate text-text-dark">
                    {esc((e.workflowName as string) || `Workflow #${e.workflowId}`)}
                  </span>
                  <span className="text-text-xmuted text-xs">
                    {timeAgo((e.stoppedAt || e.startedAt) as string)}
                  </span>
                </DashItem>
              ))}
            </DashCard>
          )}

          {/* Popular KB articles */}
          {data.kb.popular.length > 0 && (
            <DashCard title="Popular Articles" action={() => navigate('/kb')}>
              {(data.kb.popular as Array<Record<string, string | number>>).map((a) => (
                <DashItem key={a.id} onClick={() => navigate(`/kb/${a.id}`)}>
                  <FileText size={14} className="text-text-muted shrink-0" />
                  <span className="flex-1 truncate text-text-dark">{esc(a.title as string)}</span>
                  <span className="text-text-xmuted text-xs">{a.view_count} views</span>
                </DashItem>
              ))}
            </DashCard>
          )}

          {/* Recent tickets */}
          {data.tickets.recentTickets.length > 0 && (
            <DashCard title="Recent Tickets" action={() => navigate('/tickets')}>
              {(data.tickets.recentTickets as Array<Record<string, string | number>>).map((t) => (
                <DashItem key={t.id} onClick={() => navigate(`/tickets/${t.id}`)}>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${priorityClass(t.priority as string)}`}>
                    {t.priority as string}
                  </span>
                  <span className="flex-1 truncate text-text-dark">{esc(t.title as string)}</span>
                  <span className="text-text-xmuted text-xs">{timeAgo(t.created_at as string)}</span>
                </DashItem>
              ))}
            </DashCard>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Sub-components ---

function KpiCard({
  icon,
  label,
  sublabel,
  color,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  sublabel: string
  color: string
  onClick?: () => void
}) {
  const colorMap: Record<string, string> = {
    primary: 'bg-primary-light text-primary',
    success: 'bg-success-light text-success',
    danger: 'bg-danger-light text-danger',
    warning: 'bg-[#fef3c7] text-[#d97706]',
    info: 'bg-[#e0f2fe] text-[#0284c7]',
  }
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 p-3 bg-card border border-border rounded-md cursor-pointer hover:bg-card-hover transition-colors"
    >
      <div className={`p-2 rounded-md ${colorMap[color] || ''}`}>{icon}</div>
      <div>
        <div className="text-lg font-semibold text-text-dark">{label}</div>
        <div className="text-xs text-text-muted">{sublabel}</div>
      </div>
    </div>
  )
}

function DashCard({
  title,
  children,
  action,
  danger,
}: {
  title: string
  children: React.ReactNode
  action?: () => void
  danger?: boolean
}) {
  return (
    <div className={`bg-card border rounded-md ${danger ? 'border-danger/30' : 'border-border'}`}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <h3 className="text-sm font-semibold text-text-dark">{title}</h3>
        {action && (
          <button onClick={action} className="text-xs text-primary hover:text-primary-hover">
            View All
          </button>
        )}
      </div>
      <div className="divide-y divide-border-light">{children}</div>
    </div>
  )
}

function DashItem({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 text-sm cursor-pointer hover:bg-card-hover"
    >
      {children}
    </div>
  )
}

function StatusBars({ statuses }: { statuses: Record<string, number> }) {
  const order = ['open', 'in_progress', 'waiting', 'resolved', 'closed']
  const colors: Record<string, string> = {
    open: 'bg-primary',
    in_progress: 'bg-warning',
    waiting: 'bg-text-muted',
    resolved: 'bg-success',
    closed: 'bg-text-xmuted',
  }
  const max = Math.max(...Object.values(statuses), 1)
  return (
    <div className="px-4 py-3 flex flex-col gap-2">
      {order.map((s) => {
        const count = statuses[s] || 0
        if (count === 0) return null
        const pct = Math.max((count / max) * 100, 8)
        return (
          <div key={s} className="flex items-center gap-2 text-xs">
            <span className="w-20 text-text-muted capitalize">{s.replace('_', ' ')}</span>
            <div className="flex-1 h-2 bg-border-light rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${colors[s] || 'bg-text-muted'}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-6 text-right text-text-dark font-medium">{count}</span>
          </div>
        )
      })}
    </div>
  )
}

function priorityClass(p: string): string {
  const m: Record<string, string> = {
    critical: 'bg-danger-light text-danger',
    high: 'bg-[#fff3e0] text-[#e65100]',
    medium: 'bg-[#fef3c7] text-[#92400e]',
    low: 'bg-border-light text-text-muted',
  }
  return m[p] || 'bg-border-light text-text-muted'
}

function statusClass(s: string): string {
  const m: Record<string, string> = {
    open: 'bg-primary-light text-primary',
    in_progress: 'bg-[#fef3c7] text-[#92400e]',
    waiting: 'bg-border-light text-text-muted',
    resolved: 'bg-success-light text-success',
    closed: 'bg-border-light text-text-xmuted',
  }
  return m[s] || 'bg-border-light text-text-muted'
}
