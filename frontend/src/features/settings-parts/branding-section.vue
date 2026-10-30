<script setup lang="ts">
// ─── BrandingTab (+ ColorField, live preview) ─────────────────────────────────
import { computed, ref, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { N8nButton, N8nIcon, N8nInput } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { useThemeStore } from '@/stores/theme'
import { useBrandingStore } from '@/stores/branding'
import SettingsCard from './settings-card.vue'
import FieldRow from './field-row.vue'
import ColorField from './color-field.vue'

interface BrandingForm {
  brand_name: string
  brand_logo: string
  brand_theme: 'light' | 'dark' | 'system'
  brand_primary: string
  brand_primary_hover: string
  brand_bg: string
  brand_sidebar: string
  brand_card: string
  brand_text: string
  brand_text_dark: string
}

const BRANDING_DEFAULTS: BrandingForm = {
  brand_name: '',
  brand_logo: '',
  brand_theme: 'system',
  brand_primary: '#ff6d5a',
  brand_primary_hover: '#e0523f',
  brand_bg: '#f5f5f5',
  brand_sidebar: '#ffffff',
  brand_card: '#ffffff',
  brand_text: '#525356',
  brand_text_dark: '#1f2229',
}

const DARK_COLORS: Partial<BrandingForm> = {
  brand_bg: '#161618',
  brand_sidebar: '#131315',
  brand_card: '#1e1e21',
  brand_text: '#c0c0c8',
  brand_text_dark: '#e8e8ee',
}

const LIGHT_COLORS: Partial<BrandingForm> = {
  brand_bg: '#f5f5f5',
  brand_sidebar: '#ffffff',
  brand_card: '#ffffff',
  brand_text: '#525356',
  brand_text_dark: '#1f2229',
}

const toast = useToast()
const themeStore = useThemeStore()
const brandingStore = useBrandingStore()

const logoInputRef = ref<HTMLInputElement | null>(null)
const form = ref<BrandingForm>({ ...BRANDING_DEFAULTS })
const loaded = ref(false)

const { data } = useQuery({
  queryKey: ['settings-branding'],
  queryFn: async () => {
    const r = await api.get<Record<string, string>>('/api/settings/branding')
    return r
  },
})

// Populate the form once the settings come back
watch(
  data,
  (r) => {
    if (!r) return
    form.value = {
      brand_name: r.brand_name ?? '',
      brand_logo: r.brand_logo ?? '',
      brand_theme: (r.brand_theme as BrandingForm['brand_theme']) ?? 'system',
      brand_primary: r.brand_primary ?? BRANDING_DEFAULTS.brand_primary,
      brand_primary_hover: r.brand_primary_hover ?? BRANDING_DEFAULTS.brand_primary_hover,
      brand_bg: r.brand_bg ?? BRANDING_DEFAULTS.brand_bg,
      brand_sidebar: r.brand_sidebar ?? BRANDING_DEFAULTS.brand_sidebar,
      brand_card: r.brand_card ?? BRANDING_DEFAULTS.brand_card,
      brand_text: r.brand_text ?? BRANDING_DEFAULTS.brand_text,
      brand_text_dark: r.brand_text_dark ?? BRANDING_DEFAULTS.brand_text_dark,
    }
    loaded.value = true
  },
  { immediate: true },
)

function setField<K extends keyof BrandingForm>(key: K, value: BrandingForm[K]) {
  form.value = { ...form.value, [key]: value }
}

// Theme radio also switches the app's theme mode, like the React version
function onThemeChange(t: BrandingForm['brand_theme']) {
  themeStore.setMode(t)
  const resolved = t === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t
  const colors = resolved === 'dark' ? DARK_COLORS : LIGHT_COLORS
  form.value = { ...form.value, brand_theme: t, ...colors }
}

function handleLogoUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => setField('brand_logo', reader.result as string)
  reader.readAsDataURL(file)
}

function handleReset() {
  form.value = { ...BRANDING_DEFAULTS }
}

const saving = ref(false)
async function saveBranding() {
  saving.value = true
  try {
    await api.put('/api/settings/branding', form.value)
    toast.success('Branding saved')
    // Re-apply the new colors to the running app immediately
    await brandingStore.loadBranding()
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    saving.value = false
  }
}

const THEME_OPTIONS = ['light', 'dark', 'system'] as const

const showLogoUrlInput = computed(() => !form.value.brand_logo.startsWith('data:'))
</script>

<template>
  <p v-if="!loaded" class="text-sm text-text-muted">Loading branding settings...</p>

  <SettingsCard v-else icon="palette" title="Layout / Design" description="Customize colors and logo">
    <div class="flex items-start gap-8">
      <!-- Left: form -->
      <div class="max-w-sm min-w-0 flex-1 space-y-4">
        <!-- Logo -->
        <FieldRow label="Logo">
          <div class="space-y-2">
            <div
              class="flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border-2 border-dashed border-input-border bg-bg py-5 transition-colors hover:border-primary"
              @click="logoInputRef?.click()"
            >
              <img v-if="form.brand_logo" :src="form.brand_logo" alt="Logo preview" class="h-10 object-contain" />
              <template v-else>
                <N8nIcon icon="upload" :size="18" class="text-text-xmuted" />
                <span class="text-xs text-text-muted">Click to upload PNG / JPG / SVG</span>
              </template>
            </div>
            <input
              ref="logoInputRef"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              class="hidden"
              @change="handleLogoUpload"
            />
            <input
              type="text"
              :value="showLogoUrlInput ? form.brand_logo : ''"
              placeholder="Or paste a logo URL..."
              class="w-full rounded-sm border border-input-border bg-input-bg px-3 py-1.5 text-sm text-text-dark outline-none"
              @input="setField('brand_logo', ($event.target as HTMLInputElement).value)"
            />
          </div>
        </FieldRow>

        <!-- App Name -->
        <FieldRow label="App Name">
          <N8nInput :model-value="form.brand_name" placeholder="n8n Library" @update:model-value="setField('brand_name', $event)" />
        </FieldRow>

        <!-- Theme -->
        <FieldRow label="Theme">
          <div class="flex gap-3">
            <label
              v-for="t in THEME_OPTIONS"
              :key="t"
              class="flex cursor-pointer items-center gap-1.5 text-sm capitalize text-text-dark"
            >
              <input v-model="form.brand_theme" type="radio" name="brand_theme" :value="t" class="accent-primary" @change="onThemeChange(t)" />
              {{ t.charAt(0).toUpperCase() + t.slice(1) }}
            </label>
          </div>
        </FieldRow>

        <!-- Colors -->
        <div class="space-y-3 pt-1">
          <p class="text-[13px] font-medium text-text-muted">Colors</p>
          <ColorField label="Primary" :value="form.brand_primary" @change="setField('brand_primary', $event)" />
          <ColorField label="Primary Hover" :value="form.brand_primary_hover" @change="setField('brand_primary_hover', $event)" />
          <ColorField label="Background" :value="form.brand_bg" @change="setField('brand_bg', $event)" />
          <ColorField label="Sidebar" :value="form.brand_sidebar" @change="setField('brand_sidebar', $event)" />
          <ColorField label="Card" :value="form.brand_card" @change="setField('brand_card', $event)" />
          <ColorField label="Text" :value="form.brand_text" @change="setField('brand_text', $event)" />
          <ColorField label="Text Dark" :value="form.brand_text_dark" @change="setField('brand_text_dark', $event)" />
        </div>

        <!-- Actions -->
        <div class="flex gap-2 pt-2">
          <N8nButton
            variant="brand"
            size="small"
            :loading="saving"
            :disabled="saving"
            :label="saving ? 'Saving...' : 'Save Branding'"
            @click="saveBranding"
          />
          <N8nButton variant="outline" size="small" label="Reset to Defaults" @click="handleReset" />
        </div>
      </div>

      <!-- Right: live preview -->
      <div class="shrink-0">
        <p class="mb-3 text-[13px] font-medium text-text-muted">Live Preview</p>
        <div
          class="select-none overflow-hidden rounded-md border text-[11px]"
          :style="{ background: form.brand_bg, borderColor: '#e2e4e7', width: '340px' }"
        >
          <!-- Header bar -->
          <div
            class="flex items-center gap-2 px-3 py-2"
            :style="{ background: form.brand_sidebar, borderBottom: '1px solid #e2e4e7' }"
          >
            <img v-if="form.brand_logo" :src="form.brand_logo" alt="logo" class="h-5 w-5 rounded object-contain" />
            <div
              v-else
              class="flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold text-white"
              :style="{ background: form.brand_primary }"
            >
              N
            </div>
            <span class="flex-1 font-semibold" :style="{ color: form.brand_text_dark }">
              {{ form.brand_name || 'n8n Library' }}
            </span>
            <span
              class="rounded px-2 py-0.5 font-semibold text-white"
              :style="{ background: form.brand_primary, fontSize: '10px' }"
            >
              Button
            </span>
          </div>
          <!-- Cards -->
          <div class="space-y-2 p-3">
            <div
              class="flex items-center justify-between rounded p-2.5"
              :style="{ background: form.brand_card, border: '1px solid #e2e4e7' }"
            >
              <div>
                <div class="font-medium" :style="{ color: form.brand_text_dark }">Sample Workflow</div>
                <div :style="{ color: form.brand_text }">Automation pipeline</div>
              </div>
              <div class="flex gap-1">
                <span class="rounded px-1.5 py-0.5 font-semibold text-white" :style="{ background: '#22c55e', fontSize: '10px' }">
                  Active
                </span>
                <span class="rounded px-1.5 py-0.5 font-semibold" :style="{ background: '#dcfce7', color: '#16a34a', fontSize: '10px' }">
                  Success
                </span>
              </div>
            </div>
            <div
              class="flex items-center justify-between rounded p-2.5"
              :style="{ background: form.brand_card, border: '1px solid #e2e4e7' }"
            >
              <div>
                <div class="font-medium" :style="{ color: form.brand_text_dark }">Another Item</div>
                <div :style="{ color: form.brand_text }">Service desk ticket</div>
              </div>
              <span class="rounded px-1.5 py-0.5 font-semibold" :style="{ background: '#fee2e2', color: '#dc2626', fontSize: '10px' }">
                Error
              </span>
            </div>
            <div class="flex gap-2 pt-1">
              <div class="h-1.5 flex-1 rounded-full" :style="{ background: form.brand_primary, opacity: 0.25 }" />
              <div class="h-1.5 rounded-full" :style="{ background: form.brand_primary_hover, opacity: 0.35, width: '60px' }" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </SettingsCard>
</template>