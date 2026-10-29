<script setup lang="ts">
// CredentialsPage — admin credential management UI over the n8n credentials
// API, with a "Credentials" tab and a "Credential Store" tab.
// Ported from the CredentialsPage export in features/credentials.tsx.
import { ref } from 'vue'
import { N8nIcon } from '@n8n/design-system'
import { cn } from '@/lib/utils'
import CredentialsView from './credential-parts/CredentialsView.vue'
import CredentialStoreTab from './credential-store.vue'

const tab = ref<'credentials' | 'store'>('credentials')
</script>

<template>
  <div>
    <!-- Tab bar -->
    <div class="mb-5 flex gap-1 border-b border-border">
      <button
        :class="
          cn(
            '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors',
            tab === 'credentials' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-dark',
          )
        "
        @click="tab = 'credentials'"
      >
        <N8nIcon icon="key-round" :size="13" />
        Credentials
      </button>
      <button
        :class="
          cn(
            '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors',
            tab === 'store' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-dark',
          )
        "
        @click="tab = 'store'"
      >
        <N8nIcon icon="package-open" :size="13" />
        Credential Store
      </button>
    </div>

    <CredentialsView v-if="tab === 'credentials'" />
    <CredentialStoreTab v-else />
  </div>
</template>