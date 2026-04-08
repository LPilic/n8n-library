import { useState, useMemo } from 'react'
import { icons, type LucideProps } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Search, X } from 'lucide-react'

const allIconNames = Object.keys(icons).sort()

interface Props {
  value: string
  onChange: (name: string) => void
}

export function IconPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return allIconNames.slice(0, 80) // show first 80 by default
    const q = search.toLowerCase()
    return allIconNames.filter((n) => n.toLowerCase().includes(q)).slice(0, 80)
  }, [search])

  const SelectedIcon = value ? (icons as Record<string, React.ComponentType<LucideProps>>)[value] : null

  return (
    <div>
      {/* Selected icon display + trigger */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={cn(
            'w-10 h-10 flex items-center justify-center border rounded-md transition-colors',
            value ? 'border-primary bg-primary-light' : 'border-border bg-bg',
          )}
        >
          {SelectedIcon ? <SelectedIcon size={22} className="text-primary" /> : <span className="text-text-xmuted text-xs">Pick</span>}
        </button>
        <div className="flex-1">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Icon name (e.g. Rocket, Shield)"
            className="w-full px-3 py-1.5 border border-input-border rounded-md bg-input-bg text-sm text-text-dark focus-ring"
          />
        </div>
        {value && (
          <button type="button" onClick={() => onChange('')} className="p-1 text-text-xmuted hover:text-text-dark">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Icon picker dropdown */}
      {open && (
        <div className="mt-2 border border-border rounded-lg bg-card shadow-lg p-3 max-h-[320px] flex flex-col">
          <div className="relative mb-2 shrink-0">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-xmuted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${allIconNames.length} icons...`}
              autoFocus
              className="w-full pl-7 pr-3 py-1.5 border border-input-border rounded-md bg-input-bg text-sm text-text-dark focus-ring"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-8 gap-1">
              {filtered.map((name) => {
                const Icon = (icons as Record<string, React.ComponentType<LucideProps>>)[name]
                if (!Icon) return null
                return (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    onClick={() => { onChange(name); setOpen(false); setSearch('') }}
                    className={cn(
                      'w-9 h-9 flex items-center justify-center rounded-md border transition-colors',
                      value === name
                        ? 'border-primary bg-primary-light text-primary'
                        : 'border-transparent text-text-muted hover:border-border hover:bg-bg hover:text-text-dark',
                    )}
                  >
                    <Icon size={18} />
                  </button>
                )
              })}
            </div>
            {filtered.length === 0 && (
              <p className="text-center text-text-xmuted text-xs py-4">No icons matching "{search}"</p>
            )}
            {!search && (
              <p className="text-center text-text-xmuted text-[10px] mt-2">Type to search all {allIconNames.length} icons</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Render a Lucide icon by name */
export function LucideIcon({ name, size = 18, className }: { name?: string; size?: number; className?: string }) {
  if (!name) return <span className="text-text-xmuted">—</span>
  const Icon = (icons as Record<string, React.ComponentType<LucideProps>>)[name]
  if (!Icon) return <span className="text-xs text-text-xmuted">{name}</span>
  return <Icon size={size} className={className ?? 'text-text-muted'} />
}
