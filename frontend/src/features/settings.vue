<script setup lang="ts">
// ─── SettingsPage ─────────────────────────────────────────────────────────────
// Top-level wrapper: sidebar nav + active section. The active section is read
// from the `settings/:section*` route param (defaults to 'users'), matching the
// React version's tab state. Unknown sections render the ComingSoon placeholder.
import { computed, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { N8nIcon } from '@n8n/design-system'

import UsersSection from '@/features/settings-parts/users-section.vue'
import InstancesSection from '@/features/settings-parts/instances-section.vue'
import SmtpSection from '@/features/settings-parts/smtp-section.vue'
import EmailTemplatesSection from '@/features/settings-parts/email-templates-section.vue'
import CategoriesSection from '@/features/settings-parts/categories-section.vue'
import ApiKeysSection from '@/features/settings-parts/api-keys-section.vue'
import WebhooksSection from '@/features/settings-parts/webhooks-section.vue'
import McpSection from '@/features/settings-parts/mcp-section.vue'
import TwoFaSection from '@/features/settings-parts/twofa-section.vue'
import BrandingSection from '@/features/settings-parts/branding-section.vue'
import ImportExportSection from '@/features/settings-parts/import-export-section.vue'

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'users', label: 'Users', icon: 'users' },
  { id: 'instances', label: 'Instances', icon: 'server' },
  { id: 'smtp', label: 'SMTP', icon: 'mail' },
  { id: 'email_templates', label: 'Email Templates', icon: 'file-text' },
  { id: 'categories', label: 'Categories', icon: 'folder-open' },
  { id: 'api_keys', label: 'API Keys', icon: 'key' },
  { id: 'webhooks', label: 'Webhooks', icon: 'webhook' },
  { id: 'ai', label: 'AI', icon: 'bot' },
  { id: 'mcp', label: 'MCP', icon: 'cpu' },
  { id: '2fa', label: '2FA', icon: 'shield-check' },
  { id: 'branding', label: 'Branding', icon: 'palette' },
  { id: 'import_export', label: 'Import / Export', icon: 'upload' },
]

const route = useRoute()
const router = useRouter()

// `settings/:section*` yields a string|null|undefined when single-segment or an
// array when repeatable — normalize to the first sub-segment (URLs use dashes;
// tab ids use underscores).
const activeSection = computed(() => {
  const raw = route.params.section as string | string[] | undefined
  const first = Array.isArray(raw) ? raw[0] : raw
  const norm = typeof first === 'string' && first !== '' ? first.replace(/-/g, '_') : 'users'
  return norm
})

// ─── ActiveTabContent ─────────────────────────────────────────────────────────

const SECTION_COMPONENTS: Record<string, Component> = {
  users: UsersSection,
  instances: InstancesSection,
  smtp: SmtpSection,
  email_templates: EmailTemplatesSection,
  categories: CategoriesSection,
  api_keys: ApiKeysSection,
  webhooks: WebhooksSection,
  mcp: McpSection,
  '2fa': TwoFaSection,
  branding: BrandingSection,
  import_export: ImportExportSection,
}

const sectionComponent = computed(() => SECTION_COMPONENTS[activeSection.value] ?? null)

function selectTab(tabId: string) {
  // Pretty URLs: tab ids use underscores internally, dashes in the URL
  router.push(`/settings/${tabId.replace(/_/g, '-')}`)
}
</script>

<template>
  <div class="flex min-h-[400px] gap-6">
    <!-- Sidebar -->
    <nav class="hidden w-52 shrink-0 sm:block">
      <div class="sticky top-6 rounded-lg border border-border bg-card p-2">
        <ul class="flex flex-col gap-0.5 ">
          <li v-for="tab in TABS" :key="tab.id">
            <button
              type="button"
              class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-all duration-150"
              :class="activeSection === tab.id ? 'bg-bg-light font-medium text-text-dark' : 'text-text-muted hover:bg-bg-light hover:text-text-dark'"
              @click="selectTab(tab.id)"
            >
              <N8nIcon
                :icon="tab.icon"
                :size="14"
                class="shrink-0"
                :class="activeSection === tab.id ? 'text-primary' : 'text-text-xmuted'"
              />
              {{ tab.label }}
            </button>
          </li>
        </ul>
      </div>
    </nav>

    <!-- Content -->
    <div class="min-w-0 flex-1">
      <!-- AI moved to its own page -->
      <div v-if="activeSection === 'ai'" class="flex flex-col items-start gap-3 py-4">
        <p class="text-sm text-text-muted">AI configuration has moved to its own page.</p>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary-hover"
          @click="router.push('/ai')"
        >
          <N8nIcon icon="external-link" :size="12" />
          Go to AI Config
        </button>
      </div>

      <component :is="sectionComponent" v-else-if="sectionComponent" :key="activeSection" />

      <!-- Coming soon -->
      <div
        v-else
        class="flex w-full flex-col items-center justify-center rounded-md border border-dashed border-border py-16"
      >
        <p class="text-sm font-medium text-text-muted">Coming soon</p>
        <p class="mt-1 text-xs text-text-xmuted">{{ activeSection }} settings will appear here.</p>
      </div>
    </div>
  </div>
</template>