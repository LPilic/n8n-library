import { defineStore } from 'pinia'
import { api } from '@/api/client'
import type { BrandingSettings } from '@/api/types'

export interface BrandingState {
  branding: BrandingSettings | null
  loaded: boolean
}

/**
 * Branding overrides map onto the n8n design-system tokens. `brand_primary`
 * drives the brand accent (`--background--brand`), the other fields re-tint the
 * light-mode page surfaces. In dark mode the overrides are removed so the
 * design system's dark values win.
 */
export const useBrandingStore = defineStore('branding', {
  state: (): BrandingState => ({
    branding: null,
    loaded: false,
  }),
  actions: {
    async loadBranding() {
      try {
        this.branding = await api.get<BrandingSettings>('/api/settings/branding')
      } catch {
        this.branding = null
      } finally {
        this.loaded = true
      }
      this.applyBrandingCss()
    },

    applyBrandingCss() {
      const root = document.documentElement
      const b = this.branding
      // Clear previous inline overrides first
      const dsProps = [
        '--background--brand',
        '--background--brand--hover',
        '--background--brand--active',
        '--color--background',
        '--color--foreground',
        '--color--text',
        '--color--text--shade-1',
      ]
      const appProps = [
        '--color-primary', '--color-primary-hover', '--color-primary-active',
        '--color-primary-light', '--color-primary-light-hover', '--color-primary-alpha',
        '--color-input-focus',
        '--color-bg', '--color-sidebar', '--color-card',
        '--color-text-base', '--color-text-dark', '--color-text-muted', '--color-text-xmuted',
      ]
      dsProps.forEach((p) => root.style.removeProperty(p))
      appProps.forEach((p) => root.style.removeProperty(p))
      if (!b) return

      if (b.brand_primary) {
        root.style.setProperty('--background--brand', b.brand_primary)
        root.style.setProperty('--background--brand--hover', shade(b.brand_primary, -8))
        root.style.setProperty('--background--brand--active', shade(b.brand_primary, -16))
        root.style.setProperty('--color-primary', b.brand_primary)
        root.style.setProperty('--color-primary-hover', shade(b.brand_primary, -8))
        root.style.setProperty('--color-primary-active', shade(b.brand_primary, -16))
        root.style.setProperty('--color-input-focus', b.brand_primary)
      }
      // Surface + text re-tint (light-mode look; dark mode overrides removed above)
      if (b.brand_bg) root.style.setProperty('--color-bg', b.brand_bg)
      if (b.brand_sidebar) root.style.setProperty('--color-sidebar', b.brand_sidebar)
      if (b.brand_card) root.style.setProperty('--color-card', b.brand_card)
      if (b.brand_text) root.style.setProperty('--color-text-base', b.brand_text)
      if (b.brand_text_dark) root.style.setProperty('--color-text-dark', b.brand_text_dark)
    },
  },
})

// No legacy props to clean beyond the DS-token props above — old deployments
// may have applied them; they are removed on first load in any case.

/** Shift a hex color's lightness by percent (n8n-style hover/active shading). */
function shade(hex: string, percent: number): string {
  const m = /^#?([a-f\d]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const num = parseInt(m[1], 16)
  let r = (num >> 16) & 0xff
  let g = (num >> 8) & 0xff
  let b = num & 0xff
  if (percent >= 0) {
    r += (255 - r) * (percent / 100)
    g += (255 - g) * (percent / 100)
    b += (255 - b) * (percent / 100)
  } else {
    const p = 1 + percent / 100
    r *= p
    g *= p
    b *= p
  }
  const toHex = (c: number) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}