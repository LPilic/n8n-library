import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

export function Badge({
  children,
  variant = 'default',
  className,
}: {
  children: ReactNode
  variant?: BadgeVariant
  className?: string
}) {
  return (
    <span className={cn('n8n-badge', variant !== 'default' && `n8n-badge-${variant}`, className)}>
      {children}
    </span>
  )
}
