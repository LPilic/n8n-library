import { Button } from './ui'
import { useConfirmStore } from '@/stores/confirm'

export function ConfirmDialog() {
  const { open, message, danger, okLabel, close } = useConfirmStore()

  if (!open) return null

  return (
    <div className="n8n-modal-overlay">
      <div className="n8n-modal dropdown-enter" style={{ maxWidth: 400 }}>
        <div className="p-5">
          <p className="mb-6 text-[13px] leading-relaxed text-text-dark">{message}</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button
              variant={danger ? 'danger' : 'primary'}
              size="sm"
              onClick={() => close(true)}
            >
              {okLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
