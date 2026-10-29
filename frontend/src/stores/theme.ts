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

/** The n8n design system toggles dark mode with `data-theme`. It must be set on
 *  BOTH <html> and <body>: html drives :root/[data-theme] token blocks and the
 *  Tailwind dark: variant; the body attribute prevents the design system's
 *  OS-fallback blocks (body:not([data-theme]) … under prefers-color-scheme)
 *  from applying their tokens to the whole page. */
export function applyTheme(mode: ThemeMode) {
  const resolved = resolve(mode)
  const html = document.documentElement
  const previous = html.getAttribute('data-theme')
  html.setAttribute('data-theme', resolved)
  if (document.body) document.body.setAttribute('data-theme', resolved)
  // Smooth cross-fade while switching (class removed after the transition)
  if (previous && previous !== resolved) {
    html.classList.add('theming')
    clearTimeout((applyTheme as { _t?: ReturnType<typeof setTimeout> })._t)
    ;(applyTheme as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(() => {
      html.classList.remove('theming')
    }, 350)
  }
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