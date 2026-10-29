<script setup lang="ts">
// ─── TwoFaTab ─────────────────────────────────────────────────────────────────
import { computed, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton, N8nIcon, N8nInput } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import SettingsCard from './settings-card.vue'
import FieldRow from './field-row.vue'

const toast = useToast()
const qc = useQueryClient()

const code = ref('')
const qrData = ref<{ secret: string; qr: string } | null>(null)
const showDisable = ref(false)
const disableCode = ref('')

const { data: status, isLoading } = useQuery({
  queryKey: ['settings-2fa'],
  queryFn: () => api.get<{ enabled: boolean }>('/api/auth/2fa/status'),
})
const enabled = computed(() => status.value?.enabled ?? false)

const settingUp = ref(false)
async function startSetup() {
  settingUp.value = true
  try {
    qrData.value = await api.post<{ secret: string; qr: string }>('/api/auth/2fa/setup')
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Setup failed')
  } finally {
    settingUp.value = false
  }
}

const verifying = ref(false)
async function verifyCode() {
  verifying.value = true
  try {
    await api.post('/api/auth/2fa/verify', { token: code.value })
    toast.success('2FA enabled')
    qrData.value = null
    code.value = ''
    await qc.invalidateQueries({ queryKey: ['settings-2fa'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Invalid code')
  } finally {
    verifying.value = false
  }
}

const disabling = ref(false)
async function disable2fa() {
  disabling.value = true
  try {
    await api.post('/api/auth/2fa/disable', { token: disableCode.value })
    toast.success('2FA disabled')
    showDisable.value = false
    disableCode.value = ''
    await qc.invalidateQueries({ queryKey: ['settings-2fa'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Disable failed')
  } finally {
    disabling.value = false
  }
}

function cancelVerify() {
  qrData.value = null
  code.value = ''
}

function cancelDisable() {
  showDisable.value = false
  disableCode.value = ''
}
</script>

<template>
  <p v-if="isLoading" class="text-sm text-text-muted">Loading 2FA status...</p>

  <SettingsCard v-else icon="lock" title="Two-Factor Authentication" description="Add an extra layer of security with TOTP">
    <div class="space-y-4">
      <div
        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
        :class="enabled ? 'bg-success/10 text-success' : 'border border-border bg-bg text-text-muted'"
      >
        <N8nIcon icon="shield-check" :size="15" />
        {{ enabled ? '2FA is enabled' : '2FA is disabled' }}
      </div>

      <!-- Setup: show QR -->
      <div v-if="!enabled && qrData" class="space-y-3">
        <p class="text-xs text-text-muted">Scan this QR code with your authenticator app, then enter the 6-digit code below.</p>
        <img :src="qrData.qr" alt="2FA QR code" class="h-40 w-40 rounded-md border border-border" />
        <p class="break-all font-mono text-xs text-text-xmuted">Secret: {{ qrData.secret }}</p>
        <FieldRow label="Verification Code">
          <N8nInput v-model="code" placeholder="123456" />
        </FieldRow>
        <div class="flex gap-2">
          <N8nButton
            variant="brand"
            size="small"
            :loading="verifying"
            :disabled="verifying || code.length < 6"
            :label="verifying ? 'Verifying...' : 'Verify & Enable'"
            @click="verifyCode"
          />
          <N8nButton variant="outline" size="small" label="Cancel" @click="cancelVerify" />
        </div>
      </div>

      <!-- Setup trigger -->
      <div v-else-if="!enabled">
        <N8nButton
          variant="brand"
          size="small"
          :loading="settingUp"
          :disabled="settingUp"
          :label="settingUp ? 'Generating...' : 'Set Up 2FA'"
          @click="startSetup"
        />
      </div>

      <!-- Disable trigger -->
      <button
        v-if="enabled && !showDisable"
        type="button"
        class="rounded-sm border border-danger/40 px-3 py-1.5 text-xs text-danger hover:bg-danger/5"
        @click="showDisable = true"
      >
        Disable 2FA
      </button>

      <!-- Disable flow -->
      <div v-if="enabled && showDisable" class="space-y-3 rounded-md border border-border bg-bg p-3">
        <p class="text-xs text-text-muted">Enter your current 2FA code to disable.</p>
        <FieldRow label="Code">
          <N8nInput v-model="disableCode" placeholder="123456" />
        </FieldRow>
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-sm bg-danger px-3 py-1.5 text-xs text-white hover:bg-danger/90 disabled:opacity-50"
            :disabled="disabling || disableCode.length < 6"
            @click="disable2fa"
          >
            {{ disabling ? 'Disabling...' : 'Confirm Disable' }}
          </button>
          <N8nButton variant="outline" size="small" label="Cancel" @click="cancelDisable" />
        </div>
      </div>
    </div>
  </SettingsCard>
</template>