import { useState, type FormEvent } from 'react'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/hooks/useToast'
import { api, ApiError } from '@/api/client'

type View = 'login' | '2fa' | 'forgot' | 'reset'

export function LoginPage() {
  const { login, verify2fa, requires2fa } = useAuthStore()
  const { error: showError, success: showSuccess } = useToast()

  const [view, setView] = useState<View>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // Check URL for reset token on mount
  useState(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) {
      setResetToken(token)
      setView('reset')
    }
  })

  const currentView = requires2fa ? '2fa' : view

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function handle2fa(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await verify2fa(totpCode)
    } catch (err) {
      showError(err instanceof ApiError ? err.message : '2FA verification failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/api/auth/forgot-password', { email })
      showSuccess('If that email exists, a reset link has been sent.')
      setView('login')
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/api/auth/reset-password', { token: resetToken, password: newPassword })
      showSuccess('Password reset successfully. Please sign in.')
      setView('login')
      window.history.replaceState({}, '', '/')
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full px-3 py-2 border border-input-border rounded-sm bg-input-bg text-text-dark text-sm focus:outline-none focus:border-input-focus'

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg">
      <div className="w-full max-w-sm bg-card border border-border rounded-lg p-8 shadow-lg">
        <h1 className="text-xl font-semibold text-text-dark text-center mb-6">
          n8n Library
        </h1>

        {currentView === '2fa' && (
          <form onSubmit={handle2fa}>
            <p className="text-sm text-text-muted mb-4 text-center">
              Enter your 2FA code to continue
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              className={`${inputClass} mb-4`}
              autoFocus
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-primary text-white rounded-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </form>
        )}

        {currentView === 'login' && (
          <form onSubmit={handleLogin}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${inputClass} mb-3`}
              autoFocus
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} mb-4`}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-primary text-white rounded-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={() => setView('forgot')}
              className="w-full mt-3 text-sm text-text-muted hover:text-primary"
            >
              Forgot password?
            </button>
          </form>
        )}

        {currentView === 'forgot' && (
          <form onSubmit={handleForgot}>
            <p className="text-sm text-text-muted mb-4 text-center">
              Enter your email to receive a reset link
            </p>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${inputClass} mb-4`}
              autoFocus
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-primary text-white rounded-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
            <button
              type="button"
              onClick={() => setView('login')}
              className="w-full mt-3 text-sm text-text-muted hover:text-primary"
            >
              Back to sign in
            </button>
          </form>
        )}

        {currentView === 'reset' && (
          <form onSubmit={handleReset}>
            <p className="text-sm text-text-muted mb-4 text-center">
              Enter your new password
            </p>
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={`${inputClass} mb-4`}
              autoFocus
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-primary text-white rounded-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? 'Resetting...' : 'Reset password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
