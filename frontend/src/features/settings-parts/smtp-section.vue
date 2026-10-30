<script setup lang="ts">
// ─── SmtpTab ──────────────────────────────────────────────────────────────────
import { computed, ref, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { N8nButton, N8nInput } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'
import SettingsCard from './settings-card.vue'
import FieldRow from './field-row.vue'

interface SmtpSettings {
  host: string
  port: number
  user: string
  pass: string
  from_address: string
  app_url: string
}

const toast = useToast()
const auth = useAuthStore()
const currentUserEmail = computed(() => auth.user?.email ?? '')

const host = ref('')
const port = ref('587')
const user = ref('')
const pass = ref('')
const fromAddress = ref('')
const appUrl = ref('')
const loaded = ref(false)

const { data } = useQuery({
  queryKey: ['settings-smtp'],
  queryFn: async () => {
    const r = await api.get<SmtpSettings>('/api/settings/smtp')
    return r
  },
})

// Populate the form once the settings come back
watch(
  data,
  (r) => {
    if (!r) return
    host.value = r.host ?? ''
    port.value = String(r.port ?? 587)
    user.value = r.user ?? ''
    pass.value = r.pass ?? ''
    fromAddress.value = r.from_address ?? ''
    appUrl.value = r.app_url ?? ''
    loaded.value = true
  },
  { immediate: true },
)

const saving = ref(false)
async function saveSettings() {
  saving.value = true
  try {
    await api.put('/api/settings/smtp', {
      host: host.value,
      port: Number(port.value),
      user: user.value,
      pass: pass.value,
      from_address: fromAddress.value,
      app_url: appUrl.value,
    })
    toast.success('SMTP settings saved')
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    saving.value = false
  }
}

const testing = ref(false)
async function sendTestEmail() {
  testing.value = true
  try {
    await api.post('/api/settings/smtp/test', { to: currentUserEmail.value })
    toast.info(`Test email sent to ${currentUserEmail.value}`)
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Test failed')
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <p v-if="!loaded" class="text-sm text-text-muted">Loading SMTP settings...</p>

  <SettingsCard v-else icon="mail" title="Email (SMTP)" description="Configure email delivery for notifications">
    <div class="flex flex-col gap-3 ">
      <FieldRow label="Host"><N8nInput v-model="host" placeholder="smtp.example.com" /></FieldRow>
      <FieldRow label="Port"><N8nInput v-model="port" type="number" placeholder="587" /></FieldRow>
      <FieldRow label="Username"><N8nInput v-model="user" placeholder="smtp-user" /></FieldRow>
      <FieldRow label="Password"><N8nInput v-model="pass" type="password" placeholder="••••••••" /></FieldRow>
      <FieldRow label="From Address"><N8nInput v-model="fromAddress" type="email" placeholder="noreply@example.com" /></FieldRow>
      <FieldRow label="App URL"><N8nInput v-model="appUrl" placeholder="https://library.example.com" /></FieldRow>
      <div class="flex items-center gap-2 pt-2">
        <N8nButton
          variant="brand"
          size="small"
          :loading="saving"
          :disabled="saving"
          :label="saving ? 'Saving...' : 'Save'"
          @click="saveSettings"
        />
        <N8nButton
          variant="outline"
          size="small"
          :loading="testing"
          :disabled="testing"
          :label="testing ? 'Sending...' : 'Send Test Email'"
          @click="sendTestEmail"
        />
      </div>
    </div>
  </SettingsCard>
</template>