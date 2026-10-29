import { defineStore } from 'pinia'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: number
  message: string
  type: ToastType
}

let nextId = 0

export const useToastStore = defineStore('toast', {
  state: () => ({
    toasts: [] as Toast[],
  }),
  actions: {
    add(message: string, type: ToastType = 'info') {
      const id = ++nextId
      this.toasts = [...this.toasts, { id, message, type }]
      setTimeout(() => this.remove(id), 4000)
    },
    remove(id: number) {
      this.toasts = this.toasts.filter((t) => t.id !== id)
    },
  },
})

export function useToast() {
  const store = useToastStore()
  return {
    toast: (msg: string) => store.add(msg, 'info'),
    success: (msg: string) => store.add(msg, 'success'),
    error: (msg: string) => store.add(msg, 'error'),
    warning: (msg: string) => store.add(msg, 'warning'),
    info: (msg: string) => store.add(msg, 'info'),
  }
}