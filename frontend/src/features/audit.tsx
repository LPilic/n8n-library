import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { esc, timeAgo } from '@/lib/utils'
import { Search } from 'lucide-react'
import CustomSelect from '@/components/CustomSelect'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: number
  created_at: string
  user?: string
  action: string
  entity_type: string
  entity_id?: string | number
  details?: string
}

interface AuditLogResponse {
  entries: AuditEntry[]
  total: number
}

const ENTITY_TYPES = [
  'workflow', 'credential', 'user', 'tag', 'variable', 'setting', 'api_key',
]

const ACTIONS = [
  'create', 'update', 'delete', 'login', 'logout', 'execute', 'import', 'export',
]

// ─── AuditPage ────────────────────────────────────────────────────────────────

export function AuditPage() {
  const [page, setPage] = useState(1)
  const [entityType, setEntityType] = useState('')
  const [action, setAction] = useState('')
  const [search, setSearch] = useState('')

  const limit = 50

  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', page, entityType, action, search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (entityType) params.set('entity_type', entityType)
      if (action) params.set('action', action)
      if (search) params.set('search', search)
      return api.get<AuditLogResponse>(`/api/audit-log?${params}`)
    },
  })

  const entries = data?.entries ?? []
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / limit))

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-0 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-xmuted" />
          <input
            type="text"
            placeholder="Search log..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-8 pr-3 py-1.5 border border-input-border rounded-sm bg-input-bg text-sm text-text-dark focus:outline-none focus:border-input-focus"
          />
        </div>
        <CustomSelect
          value={entityType}
          onChange={(v) => { setEntityType(v); setPage(1) }}
          options={[
            { value: '', label: 'All Entity Types' },
            ...ENTITY_TYPES.map((t) => ({ value: t, label: t })),
          ]}
          size="sm"
        />
        <CustomSelect
          value={action}
          onChange={(v) => { setAction(v); setPage(1) }}
          options={[
            { value: '', label: 'All Actions' },
            ...ACTIONS.map((a) => ({ value: a, label: a })),
          ]}
          size="sm"
        />
        <span className="text-xs text-text-muted ml-auto hidden sm:inline">{total} entries</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-text-muted text-sm">Loading audit log...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-text-muted text-sm">No log entries found</div>
      ) : (
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-light bg-bg">
                  <th className="text-left px-3 py-2 font-semibold text-text-muted uppercase whitespace-nowrap">Time</th>
                  <th className="text-left px-3 py-2 font-semibold text-text-muted uppercase">User</th>
                  <th className="text-left px-3 py-2 font-semibold text-text-muted uppercase">Action</th>
                  <th className="text-left px-3 py-2 font-semibold text-text-muted uppercase whitespace-nowrap">Entity Type</th>
                  <th className="text-left px-3 py-2 font-semibold text-text-muted uppercase whitespace-nowrap">Entity ID</th>
                  <th className="text-left px-3 py-2 font-semibold text-text-muted uppercase">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-card-hover transition-colors">
                    <td className="px-3 py-2 text-text-xmuted whitespace-nowrap">
                      {timeAgo(entry.created_at)}
                    </td>
                    <td className="px-3 py-2 text-text-muted">
                      {entry.user ? esc(entry.user) : <span className="text-text-xmuted">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 rounded bg-primary-light text-primary capitalize">
                        {esc(entry.action)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-text-muted capitalize">
                      {esc(entry.entity_type)}
                    </td>
                    <td className="px-3 py-2 text-text-xmuted font-mono">
                      {entry.entity_id != null ? String(entry.entity_id) : '—'}
                    </td>
                    <td className="px-3 py-2 text-text-muted max-w-xs truncate">
                      {entry.details ? esc(entry.details) : <span className="text-text-xmuted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="text-xs px-3 py-1 border border-input-border rounded-sm bg-input-bg text-text-muted hover:bg-card-hover disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-xs text-text-muted">Page {page} of {pages}</span>
          <button
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
            className="text-xs px-3 py-1 border border-input-border rounded-sm bg-input-bg text-text-muted hover:bg-card-hover disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
