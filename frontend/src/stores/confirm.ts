import { defineStore } from 'pinia'

export interface ConfirmOptions {
  danger?: boolean
  okLabel?: string
}

export const useConfirmStore = defineStore('confirm', {
  state: () => ({
    open: false,
    message: '',
    danger: false,
    okLabel: 'Confirm',
    resolve: null as ((ok: boolean) => void) | null,
  }),
  actions: {
    show(message: string, opts?: ConfirmOptions) {
      return new Promise<boolean>((resolve) => {
        this.open = true
        this.message = message
        this.danger = opts?.danger ?? false
        this.okLabel = opts?.okLabel ?? 'Confirm'
        this.resolve = resolve
      })
    },
    close(result: boolean) {
      this.resolve?.(result)
      this.open = false
      this.resolve = null
    },
  },
})

/** Replacement for native confirm(): `const ok = await appConfirm('Delete?', { danger: true })` */
export const appConfirm = (message: string, opts?: ConfirmOptions) =>
  useConfirmStore().show(message, opts)