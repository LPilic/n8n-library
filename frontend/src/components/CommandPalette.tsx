import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { SearchResult } from '@/api/types'
import { Search } from 'lucide-react'

const PANELS = [
  { name: 'Dashboard', path: '/' },
  { name: 'Template Library', path: '/library' },
  { name: 'n8n Workflows', path: '/n8n' },
  { name: 'Monitoring', path: '/monitoring' },
  { name: 'Observability', path: '/observability' },
  { name: 'Service Desk', path: '/tickets' },
  { name: 'Knowledge Base', path: '/kb' },
  { name: 'Prompts', path: '/prompts' },
  { name: 'Approvals', path: '/approvals' },
  { name: 'Credentials', path: '/credentials' },
  { name: 'Settings', path: '/settings' },
  { name: 'Alerts', path: '/alerts' },
  { name: 'Variables', path: '/variables' },
  { name: 'Tags', path: '/tags' },
  { name: 'Security', path: '/security' },
  { name: 'Audit Log', path: '/audit' },
]

interface Props {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ label: string; path: string; type?: string }>>([])
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const search = useCallback(async (q: string) => {
    const lq = q.toLowerCase()
    // Local panel matches
    const panelMatches = PANELS.filter((p) => p.name.toLowerCase().includes(lq)).map((p) => ({
      label: p.name,
      path: p.path,
      type: 'page',
    }))

    // API search for content
    let apiResults: Array<{ label: string; path: string; type?: string }> = []
    if (q.length >= 2) {
      try {
        const data = await api.get<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`)
        apiResults = data.results.map((r) => ({
          label: r.title,
          path: r.link,
          type: r.type,
        }))
      } catch {
        // ignore
      }
    }

    setResults([...panelMatches.slice(0, 5), ...apiResults.slice(0, 10)])
    setSelected(0)
  }, [])

  function onInput(value: string) {
    setQuery(value)
    clearTimeout(timerRef.current)
    if (value.length === 0) {
      setResults([])
      return
    }
    timerRef.current = setTimeout(() => search(value), 200)
  }

  function execute(path: string) {
    onClose()
    navigate(path)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' && results[selected]) {
      execute(results[selected].path)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={onClose}>
      <div className="fixed inset-0 bg-black/30" />
      <div
        className="relative bg-card border border-border rounded-lg shadow-lg w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search size={16} className="text-text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search pages, tickets, articles..."
            value={query}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={onKeyDown}
            className="flex-1 bg-transparent text-sm text-text-dark outline-none placeholder:text-text-xmuted"
          />
          <kbd className="text-xs text-text-xmuted bg-bg px-1.5 py-0.5 rounded border border-border-light">
            Esc
          </kbd>
        </div>

        {results.length > 0 && (
          <ul className="max-h-64 overflow-y-auto py-1">
            {results.map((r, i) => (
              <li
                key={`${r.path}-${i}`}
                className={`px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2 ${
                  i === selected ? 'bg-primary-light text-primary' : 'text-text-base hover:bg-card-hover'
                }`}
                onClick={() => execute(r.path)}
                onMouseEnter={() => setSelected(i)}
              >
                <span className="truncate flex-1">{r.label}</span>
                {r.type && (
                  <span className="text-xs text-text-xmuted capitalize">{r.type}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
