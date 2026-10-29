import { defineStore } from 'pinia'
import { api } from '@/api/client'
import type { User, LoginResponse } from '@/api/types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  requires2fa: boolean
  pendingEmail: string | null
  pendingPassword: string | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    requires2fa: false,
    pendingEmail: null,
    pendingPassword: null,
  }),
  actions: {
    async checkAuth() {
      try {
        const data = await api.get<{ user: User }>('/api/auth/me')
        this.user = data.user
        this.isAuthenticated = true
      } catch {
        this.user = null
        this.isAuthenticated = false
      } finally {
        this.isLoading = false
      }
    },
    async login(email: string, password: string) {
      const data = await api.post<LoginResponse>('/api/auth/login', { email, password })
      if (data.requires_2fa) {
        this.requires2fa = true
        this.pendingEmail = email
        this.pendingPassword = password
        return data
      }
      if (data.user) {
        this.user = data.user
        this.isAuthenticated = true
        this.requires2fa = false
        this.pendingEmail = null
        this.pendingPassword = null
      }
      return data
    },
    async verify2fa(totpToken: string) {
      const data = await api.post<LoginResponse>('/api/auth/login', {
        email: this.pendingEmail,
        password: this.pendingPassword,
        totp_token: totpToken,
      })
      if (data.user) {
        this.user = data.user
        this.isAuthenticated = true
        this.requires2fa = false
        this.pendingEmail = null
        this.pendingPassword = null
      }
    },
    async logout() {
      try {
        await api.post('/api/auth/logout')
      } catch {
        // ignore
      }
      this.user = null
      this.isAuthenticated = false
      this.requires2fa = false
      this.pendingEmail = null
      this.pendingPassword = null
    },
  },
})