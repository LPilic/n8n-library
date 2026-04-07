import { create } from 'zustand'
import { api } from '@/api/client'
import type { BrandingSettings } from '@/api/types'

interface BrandingState {
  branding: BrandingSettings | null
  loaded: boolean
  loadBranding: () => Promise<void>
}

export const useBrandingStore = create<BrandingState>((set) => ({
  branding: null,
  loaded: false,

  loadBranding: async () => {
    try {
      const data = await api.get<BrandingSettings>('/api/settings/branding')
      set({ branding: data, loaded: true })

      // Apply custom primary color as CSS variable override
      if (data.brand_primary) {
        document.documentElement.style.setProperty('--color-primary', data.brand_primary)
      }
    } catch {
      set({ loaded: true })
    }
  },
}))
