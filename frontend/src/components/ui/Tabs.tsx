import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface TabItem<T extends string> {
  value: T
  label: ReactNode
  count?: number
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T
  onChange: (value: T) => void
  items: TabItem<T>[]
  className?: string
}) {
  return (
    <div className={cn('n8n-tabs', className)} role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={cn('n8n-tab', value === item.value && 'n8n-tab-active')}
        >
          {item.label}
          {typeof item.count === 'number' && (
            <span className="text-[10px] font-semibold opacity-70">{item.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}
