import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react'
import { useToastStore, type ToastType } from '@/hooks/useToast'

const typeStyles: Record<ToastType, { icon: typeof Info; color: string; border: string }> = {
  success: { icon: CheckCircle2, color: 'text-success', border: 'border-l-success' },
  error: { icon: XCircle, color: 'text-danger', border: 'border-l-danger' },
  warning: { icon: AlertTriangle, color: 'text-warning', border: 'border-l-warning' },
  info: { icon: Info, color: 'text-info', border: 'border-l-info' },
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const remove = useToastStore((s) => s.remove)

  if (toasts.length === 0) return null

  return (
    <div className="fixed right-4 top-4 z-[200] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => {
        const { icon: Icon, color, border } = typeStyles[t.type]
        return (
          <div
            key={t.id}
            className={`toast-enter flex cursor-pointer items-start gap-2.5 rounded-lg border border-l-4 border-border bg-card px-4 py-3 text-[13px] text-text-dark shadow-[var(--shadow-popover)] ${border}`}
            onClick={() => remove(t.id)}
            role="status"
          >
            <Icon size={16} className={`mt-0.5 shrink-0 ${color}`} />
            <span className="leading-snug">{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}
