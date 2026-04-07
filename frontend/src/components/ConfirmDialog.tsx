import { create } from 'zustand'

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
    <div className="fixed inset-0 z-[150] flex items-center justify-center modal-overlay bg-black/30">
      <div className="bg-card border border-border rounded-lg shadow-lg p-7 w-full max-w-[400px] mx-4 dropdown-enter">
        <p className="text-[14px] text-text-dark mb-6 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => close(false)}
            className="px-4 py-2 text-[13px] font-semibold text-text-base bg-bg-light border border-border rounded-md hover:bg-bg transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={() => close(true)}
            className={`px-4 py-2 text-[13px] font-semibold text-white rounded-md transition-colors duration-150 ${
              danger
                ? 'bg-danger hover:bg-danger/90'
                : 'bg-primary hover:bg-primary-hover'
            }`}
          >
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
