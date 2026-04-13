import { create } from 'zustand'
import { api } from '@/api/client'
import type { BrandingSettings } from '@/api/types'

interface BrandingState {
  branding: BrandingSettings | null
  loaded: boolean
  loadBranding: () => Promise<void>
}

function applyBrandingCss(data: BrandingSettings) {
  const r = document.documentElement.style
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'

  // Primary/accent colors always apply (both themes)
  if (data.brand_primary) {
    r.setProperty('--color-primary', data.brand_primary)
    if (isDark) {
      r.setProperty('--color-primary-light', data.brand_primary + '22')
      r.setProperty('--color-primary-light-hover', data.brand_primary + '33')
    } else {
      r.setProperty('--color-primary-light', data.brand_primary + '18')
      r.setProperty('--color-primary-light-hover', data.brand_primary + '28')
    }
    r.setProperty('--color-input-focus', data.brand_primary)
  }
  if (data.brand_primary_hover) r.setProperty('--color-primary-hover', data.brand_primary_hover)

  // Background/surface/text colors only apply in light mode
  if (!isDark) {
    if (data.brand_bg) {
      r.setProperty('--color-bg', data.brand_bg)
      r.setProperty('--color-bg-alt', data.brand_bg)
    }
    if (data.brand_sidebar) r.setProperty('--color-sidebar', data.brand_sidebar)
    if (data.brand_card) {
      r.setProperty('--color-card', data.brand_card)
      r.setProperty('--color-card-hover', data.brand_card)
      r.setProperty('--color-bg-light', data.brand_card)
      r.setProperty('--color-input-bg', data.brand_card)
      const textColor = data.brand_text || '#525356'
      r.setProperty('--color-border', `color-mix(in srgb, ${data.brand_card} 60%, ${textColor} 15%)`)
      r.setProperty('--color-border-light', `color-mix(in srgb, ${data.brand_card} 75%, ${textColor} 8%)`)
      r.setProperty('--color-input-border', `color-mix(in srgb, ${data.brand_card} 60%, ${textColor} 15%)`)
    }
    if (data.brand_text) {
      r.setProperty('--color-text', data.brand_text)
      r.setProperty('--color-text-muted', `color-mix(in srgb, ${data.brand_text} 65%, transparent)`)
      r.setProperty('--color-text-xmuted', `color-mix(in srgb, ${data.brand_text} 40%, transparent)`)
    }
    if (data.brand_text_dark) r.setProperty('--color-text-dark', data.brand_text_dark)
  } else {
    // Clear inline overrides so dark CSS takes effect
    const props = [
      '--color-bg', '--color-bg-alt', '--color-bg-light', '--color-sidebar',
      '--color-card', '--color-card-hover', '--color-input-bg',
      '--color-text', '--color-text-dark', '--color-text-muted', '--color-text-xmuted',
      '--color-border', '--color-border-light', '--color-input-border',
    ]
    props.forEach((p) => r.removeProperty(p))
  }
}

export const useBrandingStore = create<BrandingState>((set) => ({
  branding: null,
  loaded: false,

  loadBranding: async () => {
    try {
      const data = await api.get<BrandingSettings>('/api/settings/branding')
      set({ branding: data, loaded: true })
      applyBrandingCss(data)
    } catch {
      set({ loaded: true })
    }
  },
}))
