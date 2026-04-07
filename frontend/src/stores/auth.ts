import { create } from 'zustand'
import { api } from '@/api/client'
import type { User, LoginResponse } from '@/api/types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  requires2fa: boolean
  pendingEmail: string | null
  pendingPassword: string | null

  checkAuth: () => Promise<void>
  login: (email: string, password: string) => Promise<LoginResponse>
  verify2fa: (totpToken: string) => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  requires2fa: false,
  pendingEmail: null,
  pendingPassword: null,

  checkAuth: async () => {
    try {
      const data = await api.get<{ user: User }>('/api/auth/me')
      set({ user: data.user, isAuthenticated: true, isLoading: false })
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },

  login: async (email: string, password: string) => {
    const data = await api.post<LoginResponse>('/api/auth/login', { email, password })
    if (data.requires_2fa) {
      set({ requires2fa: true, pendingEmail: email, pendingPassword: password })
      return data
    }
    if (data.user) {
      set({ user: data.user, isAuthenticated: true, requires2fa: false, pendingEmail: null, pendingPassword: null })
    }
    return data
  },

  verify2fa: async (totpToken: string) => {
    const { pendingEmail, pendingPassword } = get()
    const data = await api.post<LoginResponse>('/api/auth/login', {
      email: pendingEmail,
      password: pendingPassword,
      totp_token: totpToken,
    })
    if (data.user) {
      set({ user: data.user, isAuthenticated: true, requires2fa: false, pendingEmail: null, pendingPassword: null })
    }
  },

  logout: async () => {
    try {
      await api.post('/api/auth/logout')
    } catch {
      // ignore
    }
    set({ user: null, isAuthenticated: false, requires2fa: false, pendingEmail: null, pendingPassword: null })
  },
}))
