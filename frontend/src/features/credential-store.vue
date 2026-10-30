<script setup lang="ts">
// Credential Store tab — encrypted credential store: templates with shared
// secrets + user fields, provisioning flow, audit. Ported from the
// CredentialStoreTab export in features/credentials.tsx; also used as the
// "Credential Store" tab inside credentials.vue and served at /credential-store.
import { computed, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton, N8nHeading, N8nIcon, N8nTimeAgo } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { appConfirm } from '@/stores/confirm'
import { useToast } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'
import type { AuditEntry, StoreTemplate } from './credential-parts/parts'
import TypeBadge from './credential-parts/TypeBadge.vue'
import ProvisionModal from './credential-parts/ProvisionModal.vue'
import CreateStoreTemplateModal from './credential-parts/CreateStoreTemplateModal.vue'

const toast = useToast()
const queryClient = useQueryClient()
const auth = useAuthStore()

const isAdmin = computed(() => auth.user?.role === 'admin')

const provisionTarget = ref<StoreTemplate | null>(null)
const showCreateModal = ref(false)

const { data: templatesData, isLoading } = useQuery({
  queryKey: ['cred-store'],
  queryFn: () => api.get<StoreTemplate[]>('/api/credential-store'),
})
const templates = computed(() => templatesData.value ?? [])

const { data: auditData } = useQuery({
  queryKey: ['cred-audit'],
  queryFn: () => api.get<AuditEntry[]>('/api/credentials/audit'),
})
const recentActivity = computed(() => (auditData.value ?? []).slice(0, 10))

async function deleteTemplate(id: string) {
  try {
    await api.delete(`/api/credential-store/${id}`)
    toast.success('Template deleted')
    await queryClient.invalidateQueries({ queryKey: ['cred-store'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Delete failed')
  }
}

async function confirmDelete(tpl: StoreTemplate) {
  const ok = await appConfirm(`Delete template "${tpl.name}"? This cannot be undone.`, {
    danger: true,
    okLabel: 'Delete',
  })
  if (ok) deleteTemplate(tpl.id)
}

function onProvisionDone() {
  provisionTarget.value = null
  queryClient.invalidateQueries({ queryKey: ['credentials'] })
}

function onTemplateSaved() {
  showCreateModal.value = false
  queryClient.invalidateQueries({ queryKey: ['cred-store'] })
  toast.success('Template created')
}
</script>

<template>
  <div>
    <!-- Template grid -->
    <div class="mb-6">
      <div class="mb-3 flex items-center justify-between">
        <N8nHeading size="medium" tag="h3">Available Templates</N8nHeading>
        <N8nButton
          v-if="isAdmin"
          variant="brand"
          size="small"
          icon="plus"
          label="New Template"
          @click="showCreateModal = true"
        />
      </div>
      <div v-if="isLoading" class="text-sm text-text-muted">Loading templates...</div>
      <div v-else-if="templates.length === 0" class="py-10 text-center">
        <N8nIcon icon="package-open" :size="28" class="mx-auto mb-2 text-text-xmuted" />
        <p class="text-sm text-text-muted">No credential templates available</p>
      </div>
      <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="tpl in templates"
          :key="tpl.id"
          class="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-text-dark">{{ tpl.name }}</p>
              <div class="mt-0.5 flex flex-wrap items-center gap-1.5">
                <TypeBadge :type="tpl.type || tpl.credential_type || ''" />
                <span
                  v-if="tpl.instance_name"
                  class="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                >
                  {{ tpl.instance_name }}
                </span>
              </div>
            </div>
            <div v-if="isAdmin" class="flex shrink-0 gap-1">
              <button
                class="rounded-sm p-1 text-text-xmuted transition-colors hover:text-danger"
                title="Delete template"
                @click="confirmDelete(tpl)"
              >
                <N8nIcon icon="trash-2" :size="12" />
              </button>
            </div>
          </div>

          <p v-if="tpl.description" class="line-clamp-2 text-xs text-text-muted">{{ tpl.description }}</p>

          <div class="mt-auto flex items-center justify-between gap-2 pt-1">
            <div class="flex flex-wrap gap-1">
              <span
                v-for="role in tpl.allowed_roles"
                :key="role"
                class="rounded border border-border bg-bg px-1 py-0.5 text-[10px] text-text-xmuted"
              >
                {{ role }}
              </span>
            </div>
            <N8nButton
              variant="brand"
              size="small"
              icon="plus"
              label="Use"
              class="shrink-0"
              @click="provisionTarget = tpl"
            />
          </div>

          <p v-if="tpl.creator || tpl.creator_name" class="flex items-center gap-1 text-[10px] text-text-xmuted">
            <N8nIcon icon="user" :size="10" /> {{ tpl.creator || tpl.creator_name }}
          </p>
        </div>
      </div>
    </div>

    <!-- Recent activity -->
    <div v-if="recentActivity.length > 0">
      <N8nHeading size="medium" tag="h3" class="mb-3">Recent Activity</N8nHeading>
      <div class="overflow-hidden rounded-xl border border-border bg-card">
        <div class="divide-y divide-border-light">
          <div v-for="(a, i) in recentActivity" :key="i" class="flex items-start gap-3 px-4 py-2.5">
            <N8nIcon icon="shield" :size="13" class="mt-0.5 shrink-0 text-text-xmuted" />
            <div class="min-w-0 flex-1">
              <p class="text-xs text-text-dark">
                <span class="font-medium capitalize">{{ a.action }}</span>
                <span class="text-text-muted"> — {{ a.credential_name }}</span>
              </p>
              <p v-if="a.detail" class="text-[10px] text-text-xmuted">{{ a.detail }}</p>
            </div>
            <div class="shrink-0 text-right">
              <p class="whitespace-nowrap text-[10px] text-text-xmuted"><N8nTimeAgo :date="a.created_at" class="text-[10px] text-text-xmuted" /></p>
              <p v-if="a.username" class="text-[10px] text-text-xmuted">{{ a.username }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Provision Modal -->
    <ProvisionModal
      v-if="provisionTarget"
      :template="provisionTarget"
      @close="provisionTarget = null"
      @done="onProvisionDone"
    />

    <!-- Create Store Template Modal -->
    <CreateStoreTemplateModal v-if="showCreateModal" @close="showCreateModal = false" @saved="onTemplateSaved" />
  </div>
</template>