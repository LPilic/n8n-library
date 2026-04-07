import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { SearchResult } from '@/api/types'
import { Search, LayoutDashboard, Library, Zap, Activity, BarChart3, Ticket, BookOpen, MessageSquareText, Settings, type LucideProps } from 'lucide-react'
import { type ComponentType } from 'react'

interface PanelItem {
  name: string
  path: string
  icon: ComponentType<LucideProps>
}

const PANELS: PanelItem[] = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Template Library', path: '/library', icon: Library },
  { name: 'n8n Workflows', path: '/n8n', icon: Zap },
  { name: 'Monitoring', path: '/monitoring', icon: Activity },
  { name: 'Observability', path: '/observability', icon: BarChart3 },
  { name: 'Service Desk', path: '/tickets', icon: Ticket },
  { name: 'Knowledge Base', path: '/kb', icon: BookOpen },
  { name: 'Prompts', path: '/prompts', icon: MessageSquareText },
  { name: 'Settings', path: '/settings', icon: Settings },
]

interface ResultItem {
  label: string
  path: string
  type?: string
  icon?: ComponentType<LucideProps>
}

interface Props {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ResultItem[]>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (open) {
      setQuery('')
      // Show all panels immediately when opened
      setResults(PANELS.map((p) => ({ label: p.name, path: p.path, type: 'navigate', icon: p.icon })))
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const search = useCallback(async (q: string) => {
    const lq = q.toLowerCase()
    const panelMatches: ResultItem[] = PANELS
      .filter((p) => p.name.toLowerCase().includes(lq))
      .map((p) => ({ label: p.name, path: p.path, type: 'navigate', icon: p.icon }))

    let apiResults: ResultItem[] = []
    if (q.length >= 2) {
      try {
        const data = await api.get<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`)
        apiResults = data.results.map((r) => ({
          label: r.title,
          path: r.link,
          type: r.type,
        }))
      } catch { /* ignore */ }
    }

    setResults([...panelMatches.slice(0, 5), ...apiResults.slice(0, 10)])
    setSelected(0)
  }, [])

  function onInput(value: string) {
    setQuery(value)
    clearTimeout(timerRef.current)
    if (value.length === 0) {
      setResults(PANELS.map((p) => ({ label: p.name, path: p.path, type: 'navigate', icon: p.icon })))
      return
    }
    timerRef.current = setTimeout(() => search(value), 200)
  }

  function execute(path: string) {
    onClose()
    navigate(path)
  }

  const allResults = results
  let lastType = ''

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, allResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' && allResults[selected]) {
      execute(allResults[selected].path)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center" style={{ paddingTop: 'min(20vh, 160px)' }} onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 modal-overlay" />
      <div
        className="relative bg-card border border-border rounded-lg w-[560px] max-w-[94vw] max-h-[440px] overflow-hidden dropdown-enter"
        style={{ boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
          <Search size={16} className="text-text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search pages, tickets, articles..."
            value={query}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={onKeyDown}
            className="flex-1 bg-transparent text-[14px] text-text-dark outline-none placeholder:text-text-xmuted"
          />
          <kbd className="text-[11px] text-text-xmuted bg-bg px-1.5 py-0.5 rounded-sm border border-border-light">
            Esc
          </kbd>
        </div>

        {allResults.length > 0 && (
          <ul className="max-h-[360px] overflow-y-auto py-1">
            {allResults.map((r, i) => {
              const showSection = r.type && r.type !== lastType
              if (r.type) lastType = r.type
              return (
                <li key={`${r.path}-${i}`}>
                  {showSection && (
                    <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-xmuted">
                      {r.type === 'navigate' ? 'Navigate' : r.type === 'template' ? 'Templates' : r.type === 'ticket' ? 'Tickets' : r.type === 'article' ? 'Knowledge Base' : r.type}
                    </div>
                  )}
                  <div
                    className={`px-4 py-2 text-[13px] cursor-pointer flex items-center gap-2.5 transition-colors duration-75 ${
                      i === selected ? 'bg-primary-light text-primary' : 'text-text-base hover:bg-bg'
                    }`}
                    onClick={() => execute(r.path)}
                    onMouseEnter={() => setSelected(i)}
                  >
                    {r.icon && <r.icon size={16} className="shrink-0 opacity-60" />}
                    <span className="truncate flex-1">{r.label}</span>
                    {r.type && r.type !== 'navigate' && (
                      <span className="text-[11px] text-text-xmuted capitalize">{r.type}</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
