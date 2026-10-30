<script setup lang="ts">
// ─── EmailTemplatesTab ────────────────────────────────────────────────────────
import { computed, ref, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton, N8nInput, N8nOption, N8nSelect } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'
import SettingsCard from './settings-card.vue'
import FieldRow from './field-row.vue'

const EMAIL_TEMPLATE_KEYS = [
  'password_reset',
  'ticket_new',
  'ticket_status',
  'ticket_comment',
  'ticket_assignment',
  'daily_summary',
] as const

const EMAIL_VARIABLES = [
  '{{app_name}}',
  '{{primary_color}}',
  '{{primary_hover}}',
  '{{logo_url}}',
  '{{username}}',
  '{{reset_url}}',
]

interface EmailTemplate {
  label: string
  subject: string
  body: string
}

const toast = useToast()
const qc = useQueryClient()

const bodyRef = ref<HTMLTextAreaElement | null>(null)
const selectedKey = ref<string>(EMAIL_TEMPLATE_KEYS[0])
const subject = ref('')
const body = ref('')
const preview = ref<{ subject: string; html: string } | null>(null)

const { data: templates, isLoading } = useQuery({
  queryKey: ['settings-email-templates'],
  queryFn: async () => {
    const r = await api.get<{ templates: Record<string, EmailTemplate> }>('/api/settings/email-templates')
    return r.templates ?? {}
  },
})
const templatesData = computed(() => templates.value ?? {})
const currentTpl = computed(() => templatesData.value[selectedKey.value])

// Sync the form when the selected key changes (templates already loaded)
function syncForm() {
  subject.value = templatesData.value[selectedKey.value]?.subject ?? ''
  body.value = templatesData.value[selectedKey.value]?.body ?? ''
}

watch(selectedKey, () => {
  preview.value = null
  if (templates.value) syncForm()
})

// Populate on first load
const seeded = ref(false)
watch(templatesData, () => {
  if (!seeded.value && templatesData.value[selectedKey.value]) {
    syncForm()
    seeded.value = true
  }
})

const saving = ref(false)
async function saveTemplate() {
  saving.value = true
  try {
    await api.put('/api/settings/email-templates', {
      templates: { [selectedKey.value]: { subject: subject.value, body: body.value } },
    })
    toast.success('Template saved')
    await qc.invalidateQueries({ queryKey: ['settings-email-templates'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    saving.value = false
  }
}

const resetting = ref(false)
async function resetTemplate() {
  const ok = await appConfirm(`Reset "${currentTpl.value?.label ?? selectedKey.value}" to default?`, {
    danger: true,
    okLabel: 'Reset',
  })
  if (!ok) return
  resetting.value = true
  try {
    await api.post('/api/settings/email-templates/reset', { template_key: selectedKey.value })
    toast.success('Template reset to default')
    await qc.invalidateQueries({ queryKey: ['settings-email-templates'] })
    seeded.value = false
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Reset failed')
  } finally {
    resetting.value = false
  }
}

const previewing = ref(false)
async function refreshPreview() {
  previewing.value = true
  try {
    preview.value = await api.post<{ subject: string; html: string }>('/api/settings/email-templates/preview', {
      template_key: selectedKey.value,
      subject: subject.value,
      body: body.value,
    })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Preview failed')
  } finally {
    previewing.value = false
  }
}

function insertVariable(v: string) {
  const ta = bodyRef.value
  if (!ta) {
    body.value += v
    return
  }
  const start = ta.selectionStart ?? body.value.length
  const end = ta.selectionEnd ?? body.value.length
  const next = body.value.slice(0, start) + v + body.value.slice(end)
  body.value = next
  requestAnimationFrame(() => {
    ta.focus()
    ta.setSelectionRange(start + v.length, start + v.length)
  })
}

const keyOptions = computed(() =>
  EMAIL_TEMPLATE_KEYS.map((k) => ({
    value: k,
    label: templatesData.value[k]?.label ?? k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  })),
)
</script>

<template>
  <p v-if="isLoading" class="text-sm text-text-muted">Loading templates...</p>

  <SettingsCard v-else icon="mail" title="Email Templates" description="Customize email notification content">
    <div class="flex flex-col gap-6 lg:flex-row">
      <!-- Left: Editor -->
      <div class="flex flex-col gap-4 w-full min-w-0 lg:w-1/2">
        <FieldRow label="Template">
          <N8nSelect v-model="selectedKey" :filterable="false" size="medium">
            <N8nOption v-for="o in keyOptions" :key="o.value" :value="o.value" :label="o.label">
              {{ o.label }}
            </N8nOption>
          </N8nSelect>
        </FieldRow>
        <FieldRow label="Subject">
          <N8nInput v-model="subject" placeholder="Subject line…" />
        </FieldRow>
        <FieldRow label="Body (HTML with {{variables}})">
          <textarea
            ref="bodyRef"
            v-model="body"
            rows="12"
            class="min-h-[250px] w-full resize-y rounded-md border border-input-border bg-input-bg px-3 py-2 font-mono text-sm text-text-dark focus-ring"
            placeholder="<p>Hello {{username}},</p>"
          />
        </FieldRow>
        <div>
          <p class="mb-1.5 text-xs font-medium text-text-muted">
            Available Variables <span class="text-text-xmuted">(click to insert)</span>
          </p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="v in EMAIL_VARIABLES"
              :key="v"
              type="button"
              class="rounded-md border border-border bg-bg px-2 py-1 font-mono text-[11px] text-primary transition-colors hover:border-primary/30 hover:bg-primary-light"
              @click="insertVariable(v)"
            >
              {{ v }}
            </button>
          </div>
        </div>
        <div class="flex items-center gap-2 pt-1">
          <N8nButton
            variant="brand"
            size="small"
            :loading="saving"
            :disabled="!subject.trim()"
            :label="saving ? 'Saving...' : 'Save Template'"
            @click="saveTemplate"
          />
          <N8nButton
            variant="outline"
            size="small"
            :loading="previewing"
            :disabled="previewing"
            :label="previewing ? 'Generating…' : 'Refresh Preview'"
            @click="refreshPreview"
          />
          <button
            type="button"
            class="whitespace-nowrap rounded-md border border-danger/40 px-3 py-1.5 text-[12px] font-semibold text-danger hover:bg-danger/5 disabled:opacity-50"
            :disabled="resetting"
            @click="resetTemplate"
          >
            {{ resetting ? 'Resetting…' : 'Reset to Default' }}
          </button>
        </div>
      </div>

      <!-- Right: Always-visible preview -->
      <div class="w-full shrink-0 lg:w-1/2">
        <div class="sticky top-0">
          <p class="mb-2 text-[13px] font-medium text-text-muted">Preview</p>
          <div v-if="preview" class="overflow-hidden rounded-xl border border-border bg-white">
            <div class="truncate border-b border-border-light bg-bg px-3 py-1.5 text-[11px] text-text-muted">
              Subject: {{ preview.subject }}
            </div>
            <iframe
              :srcdoc="preview.html"
              title="Email preview"
              class="w-full border-0"
              style="height: 500px"
              sandbox="allow-same-origin"
            />
          </div>
          <div
            v-else
            class="flex items-center justify-center rounded-xl border border-border bg-bg text-sm italic text-text-xmuted"
            style="height: 300px"
          >
            Click "Refresh Preview" to see the email
          </div>
        </div>
      </div>
    </div>
  </SettingsCard>
</template>