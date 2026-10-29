import { defineStore } from 'pinia'
import { api } from '@/api/client'

export interface Instance {
  id: number
  name: string
  is_default: boolean
  base_url?: string
  color?: string
}

export const useInstanceStore = defineStore('instance', {
  state: () => ({
    instances: [] as Instance[],
    activeId: null as number | null,
    loaded: false,
  }),
  actions: {
    async load() {
      try {
        const data = await api.get<Instance[]>('/api/instances')
        const instances = Array.isArray(data) ? data : []
        const savedId = localStorage.getItem('activeInstanceId')
        const saved = savedId ? instances.find((i) => i.id === Number(savedId)) : null
        const defaultInst = instances.find((i) => i.is_default)
        const activeId = saved?.id ?? defaultInst?.id ?? instances[0]?.id ?? null
        this.instances = instances
        this.activeId = activeId
        this.loaded = true
        if (activeId) localStorage.setItem('activeInstanceId', String(activeId))
      } catch {
        this.loaded = true
      }
    },
    setActive(id: number) {
      this.activeId = id
      localStorage.setItem('activeInstanceId', String(id))
    },
    /** Returns ?instance_id=X query string, or empty string if default */
    param(): string {
      return this.activeId ? `instance_id=${this.activeId}` : ''
    },
    /** Appends instance_id to a URL path */
    url(path: string): string {
      const p = this.param()
      if (!p) return path
      const sep = path.includes('?') ? '&' : '?'
      return `${path}${sep}${p}`
    },
  },
})