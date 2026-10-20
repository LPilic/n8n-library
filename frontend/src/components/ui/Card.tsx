import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Card({
  children,
  className,
  hover = false,
}: {
  children: ReactNode
  className?: string
  hover?: boolean
}) {
  return <div className={cn('n8n-card', hover && 'n8n-card-hover', className)}>{children}</div>
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('n8n-card-header', className)}>
      <div className="min-w-0">
        <div className="n8n-card-title truncate">{title}</div>
        {description && <div className="n8n-hint mt-0.5">{description}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function CardContent({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('p-4', className)}>{children}</div>
}

export function CardFooter({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-end gap-2 border-t border-border px-4 py-3', className)}>
      {children}
    </div>
  )
}
