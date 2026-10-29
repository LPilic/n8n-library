<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { N8nButton, N8nInput, N8nCard, N8nSelect, N8nOption, N8nText, N8nHeading } from '@n8n/design-system'
import { useAuthStore } from '@/stores/auth'
import { useBrandingStore } from '@/stores/branding'
import { useToast } from '@/stores/toast'
import { api, ApiError } from '@/api/client'
import CustomSelect from '@/components/CustomSelect.vue'

interface PublicInstance {
  id: number
  name: string
  color?: string
}

type View = 'login' | '2fa' | 'forgot' | 'reset' | 'n8n' | 'n8n-setup'

const auth = useAuthStore()
const brandingStore = useBrandingStore()
const toast = useToast()

const view = ref<View>('login')
const email = ref('')
const password = ref('')
const totpCode = ref('')
const resetToken = ref('')
const newPassword = ref('')
const loading = ref(false)
const n8nInstances = ref<PublicInstance[]>([])
const selectedInstance = ref<number | null>(null)
const n8nPassword = ref('')

onMounted(() => {
  brandingStore.loadBranding()
  api
    .get<PublicInstance[]>('/api/auth/instances')
    .then((data) => {
      if (Array.isArray(data) && data.length > 0) {
        n8nInstances.value = data
        selectedInstance.value = data[0].id
      }
    })
    .catch(() => {})

  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')
  if (token) {
    resetToken.value = token
    view.value = 'reset'
  }
})

// 2FA is driven by the auth store, like the React version
const currentView = computed(() => (auth.requires2fa ? '2fa' : view.value))

async function handleLogin() {
  loading.value = true
  try {
    await auth.login(email.value, password.value)
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Login failed')
  } finally {
    loading.value = false
  }
}

async function handle2fa() {
  loading.value = true
  try {
    await auth.verify2fa(totpCode.value)
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : '2FA verification failed')
  } finally {
    loading.value = false
  }
}

async function handleForgot() {
  loading.value = true
  try {
    await api.post('/api/auth/forgot-password', { email: email.value })
    toast.success('If that email exists, a reset link has been sent.')
    view.value = 'login'
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Failed to send reset email')
  } finally {
    loading.value = false
  }
}

async function handleReset() {
  loading.value = true
  try {
    await api.post('/api/auth/reset-password', { token: resetToken.value, password: newPassword.value })
    toast.success('Password reset successfully. Please sign in.')
    view.value = 'login'
    window.history.replaceState({}, '', '/')
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Failed to reset password')
  } finally {
    loading.value = false
  }
}

async function handleN8nLogin() {
  if (!selectedInstance.value || !email.value) return
  loading.value = true
  try {
    const data = await api.post<{
      user?: { id: number; username: string; email: string; role: string }
      needs_password_setup?: boolean
    }>('/api/auth/n8n-login', {
      email: email.value,
      password: n8nPassword.value || undefined,
      instance_id: selectedInstance.value,
    })
    if (data.needs_password_setup) {
      view.value = 'n8n-setup'
      return
    }
    if (data.user) {
      await auth.login(email.value, n8nPassword.value)
    }
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'n8n login failed')
  } finally {
    loading.value = false
  }
}

async function handleN8nSetup() {
  if (!selectedInstance.value || !email.value || !n8nPassword.value) return
  loading.value = true
  try {
    const data = await api.post<{ user?: { id: number; username: string; email: string; role: string } }>(
      '/api/auth/n8n-login',
      { email: email.value, password: n8nPassword.value, instance_id: selectedInstance.value },
    )
    if (data.user) {
      toast.success('Account created! Signing you in...')
      await auth.checkAuth()
    }
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Setup failed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-bg">
    <N8nCard class="w-full max-w-sm">
      <div class="flex flex-col items-center p-8 pt-8">
        <div class="mb-6 flex flex-col items-center">
          <img
            v-if="brandingStore.branding?.brand_logo"
            :src="brandingStore.branding.brand_logo"
            alt=""
            class="mb-3 h-12 max-w-[200px] object-contain"
          />
          <N8nHeading size="large" tag="h1" class="text-center">
            {{ brandingStore.branding?.brand_name || 'n8n Library' }}
          </N8nHeading>
        </div>

        <!-- 2FA -->
        <form v-if="currentView === '2fa'" @submit.prevent="handle2fa">
          <N8nText size="small" color="text-light" class="mb-4 block text-center">
            Enter your 2FA code to continue
          </N8nText>
          <N8nInput
            v-model="totpCode"
            type="text"
            placeholder="6-digit code"
            autocomplete="one-time-code"
            class="mb-4"
          />
          <N8nButton
            type="submit"
            variant="brand"
            :loading="loading"
            :label="loading ? 'Verifying...' : 'Verify'"
            class="w-full"
          />
        </form>

        <!-- Login -->
        <form v-if="currentView === 'login'" @submit.prevent="handleLogin">
          <N8nInput v-model="email" type="email" placeholder="Email" class="mb-3" data-test-id="email" />
          <N8nInput v-model="password" type="password" placeholder="Password" class="mb-4" data-test-id="password" />
          <N8nButton
            type="submit"
            variant="brand"
            :loading="loading"
            :label="loading ? 'Signing in...' : 'Sign in'"
            class="w-full"
            data-test-id="login-button"
          />
          <button
            type="button"
            class="mt-3 w-full cursor-pointer text-sm text-text-muted transition-colors hover:text-primary"
            @click="view = 'forgot'"
          >
            Forgot password?
          </button>
          <template v-if="n8nInstances.length > 0">
            <div class="my-4 flex items-center gap-2">
              <div class="h-px flex-1 bg-border" />
              <span class="text-[11px] text-text-xmuted uppercase">or</span>
              <div class="h-px flex-1 bg-border" />
            </div>
            <N8nButton
              type="button"
              variant="outline"
              label="Sign in with n8n account"
              class="w-full"
              @click="view = 'n8n'"
            />
          </template>
        </form>

        <!-- Forgot -->
        <form v-if="currentView === 'forgot'" @submit.prevent="handleForgot">
          <N8nText size="small" color="text-light" class="mb-4 block text-center">
            Enter your email to receive a reset link
          </N8nText>
          <N8nInput v-model="email" type="email" placeholder="Email" class="mb-4" />
          <N8nButton
            type="submit"
            variant="brand"
            :loading="loading"
            :label="loading ? 'Sending...' : 'Send reset link'"
            class="w-full"
          />
          <button
            type="button"
            class="mt-3 w-full cursor-pointer text-sm text-text-muted transition-colors hover:text-primary"
            @click="view = 'login'"
          >
            Back to sign in
          </button>
        </form>

        <!-- Reset -->
        <form v-if="currentView === 'reset'" @submit.prevent="handleReset">
          <N8nText size="small" color="text-light" class="mb-4 block text-center">Enter your new password</N8nText>
          <N8nInput v-model="newPassword" type="password" placeholder="New password" class="mb-4" />
          <N8nButton
            type="submit"
            variant="brand"
            :loading="loading"
            :label="loading ? 'Resetting...' : 'Reset password'"
            class="w-full"
          />
        </form>

        <!-- n8n login -->
        <form v-if="currentView === 'n8n'" @submit.prevent="handleN8nLogin">
          <N8nText size="small" color="text-light" class="mb-4 block text-center">
            Sign in with your n8n account
          </N8nText>
          <CustomSelect
            v-if="n8nInstances.length > 1"
            class="mb-3 w-full"
            :value="String(selectedInstance ?? '')"
            :options="n8nInstances.map((inst) => ({ value: String(inst.id), label: inst.name }))"
            @change="(v) => (selectedInstance = Number(v))"
          />
          <N8nInput v-model="email" type="email" placeholder="Your n8n email" class="mb-3" />
          <N8nInput v-model="n8nPassword" type="password" placeholder="Library password" class="mb-4" />
          <N8nButton
            type="submit"
            variant="brand"
            :disabled="loading || !email"
            :loading="loading"
            :label="loading ? 'Signing in...' : 'Sign in'"
            class="w-full"
          />
          <button
            type="button"
            class="mt-3 w-full cursor-pointer text-sm text-text-muted transition-colors hover:text-primary"
            @click="view = 'login'; n8nPassword = ''"
          >
            Back to local sign in
          </button>
        </form>

        <!-- n8n setup -->
        <form v-if="currentView === 'n8n-setup'" @submit.prevent="handleN8nSetup">
          <N8nText size="small" color="text-light" class="mb-4 block text-center">
            Welcome! Set a password for your library account.
          </N8nText>
          <N8nText size="xsmall" color="text-light" class="mb-3 block text-center">{{ email }}</N8nText>
          <N8nInput v-model="n8nPassword" type="password" placeholder="Choose a password" class="mb-4" />
          <N8nButton
            type="submit"
            variant="brand"
            :disabled="loading || !n8nPassword"
            :loading="loading"
            :label="loading ? 'Setting up...' : 'Set password & sign in'"
            class="w-full"
          />
          <button
            type="button"
            class="mt-3 w-full cursor-pointer text-sm text-text-muted transition-colors hover:text-primary"
            @click="view = 'n8n'; n8nPassword = ''"
          >
            Back
          </button>
        </form>
      </div>
    </N8nCard>
  </div>
</template>