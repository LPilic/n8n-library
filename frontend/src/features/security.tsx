import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { ShieldCheck, ShieldAlert, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'

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

function severityBadge(severity: RiskItem['severity']): string {
  switch (severity) {
    case 'high': return 'bg-danger-light text-danger'
    case 'medium': return 'bg-warning-light text-warning'
    case 'low': return 'bg-success-light text-success'
  }
}

function categorySummary(items: RiskItem[]): { high: number; medium: number; low: number } {
  return items.reduce(
    (acc, item) => { acc[item.severity]++; return acc },
    { high: 0, medium: 0, low: 0 },
  )
}

// ─── SecurityPage ─────────────────────────────────────────────────────────────

export function SecurityPage() {
  const { error: showError, success: showSuccess } = useToast()
  const [report, setReport] = useState<AuditReport | null>(null)
  const [collapsed, setCollapsed] = useState<Set<AuditCategory>>(new Set())

  const auditMut = useMutation({
    mutationFn: () => api.post<AuditReport>('/api/security/audit', {}),
    onSuccess: (data) => {
      setReport(data)
      showSuccess('Audit complete')
    },
    onError: (err) => showError(err instanceof ApiError ? err.message : 'Audit failed'),
  })

  const toggleCollapse = (cat: AuditCategory) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })

  const totalHigh = report
    ? CATEGORY_ORDER.reduce((sum, cat) => sum + (categorySummary(report[cat] ?? []).high), 0)
    : 0

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1">
          <h2 className="text-base font-semibold text-text-dark">Security Audit</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Scan your n8n instance for credential exposure, risky nodes, and configuration issues.
          </p>
        </div>
        <button
          onClick={() => auditMut.mutate()}
          disabled={auditMut.isPending}
          className="flex items-center gap-1.5 text-sm px-4 py-2 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50"
        >
          {auditMut.isPending
            ? <><Loader2 size={14} className="animate-spin" /> Running...</>
            : <><ShieldCheck size={14} /> Run Audit</>}
        </button>
      </div>

      {/* Summary banner */}
      {report && (
        <div className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-md border mb-4',
          totalHigh > 0
            ? 'bg-danger-light border-danger/30 text-danger'
            : 'bg-success-light border-success/30 text-success',
        )}>
          {totalHigh > 0
            ? <ShieldAlert size={16} />
            : <ShieldCheck size={16} />}
          <span className="text-sm font-medium">
            {totalHigh > 0
              ? `${totalHigh} high-severity issue${totalHigh !== 1 ? 's' : ''} found`
              : 'No high-severity issues found'}
          </span>
        </div>
      )}

      {/* Categories */}
      {report && (
        <div className="space-y-2">
          {CATEGORY_ORDER.map((cat) => {
            const items = report[cat] ?? []
            const summary = categorySummary(items)
            const isOpen = !collapsed.has(cat)
            return (
              <div key={cat} className="bg-card border border-border rounded-md overflow-hidden">
                <button
                  onClick={() => toggleCollapse(cat)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-card-hover transition-colors"
                >
                  {isOpen ? <ChevronDown size={14} className="text-text-muted shrink-0" /> : <ChevronRight size={14} className="text-text-muted shrink-0" />}
                  <span className="text-sm font-medium text-text-dark flex-1 text-left">
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {summary.high > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger-light text-danger font-medium">
                        {summary.high} high
                      </span>
                    )}
                    {summary.medium > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning-light text-warning font-medium">
                        {summary.medium} med
                      </span>
                    )}
                    {summary.low > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-success-light text-success font-medium">
                        {summary.low} low
                      </span>
                    )}
                    {items.length === 0 && (
                      <span className="text-[10px] text-text-xmuted">No issues</span>
                    )}
                  </div>
                </button>

                {isOpen && items.length > 0 && (
                  <div className="border-t border-border-light divide-y divide-border-light">
                    {items.map((item, i) => (
                      <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded capitalize shrink-0 mt-0.5',
                          severityBadge(item.severity),
                        )}>
                          {item.severity}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-dark">{item.message}</p>
                          {item.details && (
                            <p className="text-xs text-text-muted mt-0.5">{item.details}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {isOpen && items.length === 0 && (
                  <div className="border-t border-border-light px-4 py-3 text-xs text-text-muted">
                    No issues detected in this category.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {!report && !auditMut.isPending && (
        <div className="text-center py-16">
          <ShieldCheck size={32} className="text-text-xmuted mx-auto mb-3" />
          <p className="text-sm text-text-muted">Click "Run Audit" to scan your instance</p>
        </div>
      )}
    </div>
  )
}
