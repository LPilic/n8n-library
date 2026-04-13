import { create } from 'zustand'
import { api } from '@/api/client'

export interface Instance {
  id: number
  name: string
  is_default: boolean
  base_url?: string
  color?: string
}

interface InstanceState {
  instances: Instance[]
  activeId: number | null
  loaded: boolean
  load: () => Promise<void>
  setActive: (id: number) => void
  /** Returns ?instance_id=X query string, or empty string if default */
  param: () => string
  /** Appends instance_id to a URL path */
  url: (path: string) => string
}

export const useInstanceStore = create<InstanceState>((set, get) => ({
  instances: [],
  activeId: null,
  loaded: false,

  load: async () => {
    try {
      const data = await api.get<Instance[]>('/api/instances')
      const instances = Array.isArray(data) ? data : []
      // Restore previous selection from localStorage, then fall back to default
      const savedId = localStorage.getItem('activeInstanceId')
      const saved = savedId ? instances.find((i) => i.id === Number(savedId)) : null
      const defaultInst = instances.find((i) => i.is_default)
      const activeId = saved?.id ?? defaultInst?.id ?? instances[0]?.id ?? null
      set({ instances, activeId, loaded: true })
      if (activeId) localStorage.setItem('activeInstanceId', String(activeId))
    } catch {
      set({ loaded: true })
    }
  },

  setActive: (id) => {
    set({ activeId: id })
    localStorage.setItem('activeInstanceId', String(id))
  },

  param: () => {
    const { activeId } = get()
    return activeId ? `instance_id=${activeId}` : ''
  },

  url: (path) => {
    const p = get().param()
    if (!p) return path
    const sep = path.includes('?') ? '&' : '?'
    return `${path}${sep}${p}`
  },
}))
