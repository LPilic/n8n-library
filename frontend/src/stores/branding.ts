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
      const props = [
        '--background--brand',
        '--background--brand--hover',
        '--background--brand--active',
        '--color--background',
        '--color--background--light-1',
        '--color--background--light-2',
        '--color--foreground',
        '--color--foreground--tint-1',
        '--color--foreground--tint-2',
        '--color--text',
        '--color--text--shade-1',
        '--color--text--tint-1',
        '--color--text--tint-2',
        '--border-color',
        '--color-sidebar',
      ]
      props.forEach((p) => root.style.removeProperty(p))
      oldProps.forEach((p) => root.style.removeProperty(p))
      if (!b) return

      if (b.brand_primary) {
        root.style.setProperty('--background--brand', b.brand_primary)
        root.style.setProperty('--background--brand--hover', shade(b.brand_primary, -8))
        root.style.setProperty('--background--brand--active', shade(b.brand_primary, -16))
      }
      // Surface re-tint: only in light mode, mirroring the previous behaviour
      if (b.brand_bg) root.style.setProperty('--color--background', b.brand_bg)
      if (b.brand_card) root.style.setProperty('--color--foreground', b.brand_card)
      if (b.brand_sidebar) root.style.setProperty('--color-sidebar', b.brand_sidebar)
      if (b.brand_text) {
        root.style.setProperty('--color--text', b.brand_text)
        root.style.setProperty('--color--text--shade-1', shade(b.brand_text, -18))
        root.style.setProperty('--color--text--tint-1', shade(b.brand_text, 18))
        root.style.setProperty('--color--text--tint-2', shade(b.brand_text, 30))
      }
    },
  },
})

// Legacy variable names in case an old branding payload ran before this build
const oldProps = [
  '--color-primary', '--color-primary-hover', '--color-primary-active',
  '--color-primary-light', '--color-primary-light-hover', '--color-input-focus',
  '--color-bg', '--color-bg-alt', '--color-card', '--color-card-hover',
  '--color-bg-light', '--color-input-bg', '--color-border', '--color-border-light',
  '--color-input-border', '--color-text-base', '--color-text-dark',
  '--color-text-muted', '--color-text-xmuted',
]

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