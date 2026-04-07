import { create } from 'zustand'

type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

function applyTheme(mode: ThemeMode) {
  const resolved =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode
  document.documentElement.setAttribute('data-theme', resolved)
}

export const useThemeStore = create<ThemeState>((set) => {
  const saved = (localStorage.getItem('themeMode') as ThemeMode) || 'light'
  // Apply on store creation
  applyTheme(saved)

  // Listen for system changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const current = useThemeStore.getState().mode
    if (current === 'system') applyTheme('system')
  })

  return {
    mode: saved,
    setMode: (mode) => {
      localStorage.setItem('themeMode', mode)
      applyTheme(mode)
      set({ mode })
    },
  }
})
