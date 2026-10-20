import { create } from 'zustand'
import { Button } from './ui'

interface ConfirmState {
  open: boolean
  message: string
  danger: boolean
  okLabel: string
  resolve: ((ok: boolean) => void) | null
  show: (message: string, opts?: { danger?: boolean; okLabel?: string }) => Promise<boolean>
  close: (result: boolean) => void
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  message: '',
  danger: false,
  okLabel: 'Confirm',
  resolve: null,

  show: (message, opts) => {
    return new Promise<boolean>((resolve) => {
      set({
        open: true,
        message,
        danger: opts?.danger ?? false,
        okLabel: opts?.okLabel ?? 'Confirm',
        resolve,
      })
    })
  },

  close: (result) => {
    const { resolve } = get()
    resolve?.(result)
    set({ open: false, resolve: null })
  },
}))

/** Use this instead of native confirm(): `const ok = await appConfirm('Delete?', { danger: true })` */
export const appConfirm = (message: string, opts?: { danger?: boolean; okLabel?: string }) =>
  useConfirmStore.getState().show(message, opts)

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
