import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="n8n-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cn('n8n-modal', className)} role="dialog" aria-modal="true">
        {title !== undefined && (
          <div className="n8n-modal-header">
            <div className="n8n-card-title">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm p-1 text-text-muted transition-colors hover:bg-bg hover:text-text-dark"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="n8n-modal-body">{children}</div>
        {footer && <div className="n8n-modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
