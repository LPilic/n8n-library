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
