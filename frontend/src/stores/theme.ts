import { defineStore } from 'pinia'

type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeState {
  mode: ThemeMode
}

function resolve(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
    : mode
}

/** The n8n design system toggles dark mode with `data-theme` on <html>. */
export function applyTheme(mode: ThemeMode) {
  const resolved = resolve(mode)
  document.documentElement.setAttribute('data-theme', resolved)
  window.dispatchEvent(new CustomEvent('themechange', { detail: resolved }))
}

export const useThemeStore = defineStore('theme', {
  state: (): ThemeState => ({
    mode: (localStorage.getItem('themeMode') as ThemeMode) || 'light',
  }),
  getters: {
    // Explicit attribute — the design system's tokens listen on [data-theme].
    isDark: (state) => resolve(state.mode) === 'dark',
  },
  actions: {
    setMode(mode: ThemeMode) {
      this.mode = mode
      localStorage.setItem('themeMode', mode)
      applyTheme(mode)
    },
    init() {
      applyTheme(this.mode)
      window
        .matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', () => {
          if (this.mode === 'system') applyTheme('system')
        })
    },
  },
})