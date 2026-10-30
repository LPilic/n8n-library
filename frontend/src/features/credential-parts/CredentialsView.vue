<script setup lang="ts">
// Credentials tab — admin credential management over the n8n credentials API.
// (the "credentials" tab of the former CredentialsPage in features/credentials.tsx)
import { computed, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton, N8nIcon, N8nTimeAgo } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { appConfirm } from '@/stores/confirm'
import { useToast } from '@/stores/toast'
import CustomSelect from '@/components/CustomSelect.vue'
import { getCredOwner } from './parts'
import type { AuditEntry, Credential, CredType, Project } from './parts'
import TypeBadge from './TypeBadge.vue'
import CredentialsSidebar from './CredentialsSidebar.vue'
import CredentialDetailModal from './CredentialDetailModal.vue'
import CredentialFormModal from './CredentialFormModal.vue'
import TransferModal from './TransferModal.vue'

const toast = useToast()
const queryClient = useQueryClient()

const search = ref('')
const typeFilter = ref('')
const ownerFilter = ref('')
const detailCred = ref<Credential | null>(null)
const showCreate = ref(false)
const editTarget = ref<Credential | null>(null)
const transferCred = ref<Credential | null>(null)

const { data: credsResp, isLoading } = useQuery({
  queryKey: ['credentials'],
  queryFn: () => api.get<{ data: Credential[] }>('/api/credentials'),
})

const { data: credTypesData } = useQuery({
  queryKey: ['cred-types'],
  queryFn: () => api.get<CredType[]>('/api/credentials/types'),
})
const credTypes = computed(() => credTypesData.value ?? [])

const { data: projectsResp } = useQuery({
  queryKey: ['cred-projects'],
  queryFn: () => api.get<{ data: Project[] }>('/api/credentials/projects'),
})
const projects = computed(() => projectsResp.value?.data ?? [])

const { data: auditData } = useQuery({
  queryKey: ['cred-audit'],
  queryFn: () => api.get<AuditEntry[]>('/api/credentials/audit'),
})

const credentials = computed(() => credsResp.value?.data ?? [])

const owners = computed(() => {
  const names = new Set<string>()
  credentials.value.forEach((c) => {
    const o = getCredOwner(c)
    if (o) names.add(o)
  })
  return Array.from(names).sort()
})

const filtered = computed(() =>
  credentials.value.filter((c) => {
    if (search.value && !c.name.toLowerCase().includes(search.value.toLowerCase())) return false
    if (typeFilter.value && c.type !== typeFilter.value) return false
    if (ownerFilter.value && getCredOwner(c) !== ownerFilter.value) return false
    return true
  }),
)

const typeOptions = computed(() => [
  { value: '', label: 'All Types' },
  ...credTypes.value.map((t) => ({ value: t.name, label: t.displayName })),
])

const ownerOptions = computed(() => [
  { value: '', label: 'All Owners' },
  ...owners.value.map((o) => ({ value: o, label: o })),
])

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ['credentials'] })
}

async function deleteCred(id: string) {
  try {
    await api.delete(`/api/credentials/${id}`)
    toast.success('Credential deleted')
    detailCred.value = null
    await queryClient.invalidateQueries({ queryKey: ['credentials'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Delete failed')
  }
}

function detailEdit() {
  editTarget.value = detailCred.value
  detailCred.value = null
}

function detailTransfer() {
  transferCred.value = detailCred.value
  detailCred.value = null
}

async function detailDelete() {
  const cred = detailCred.value
  if (!cred) return
  const ok = await appConfirm(`Delete credential "${cred.name}"?`, {
    danger: true,
    okLabel: 'Delete',
  })
  if (ok) deleteCred(cred.id)
}

function onCreateSaved() {
  showCreate.value = false
  invalidate()
}

function onEditSaved() {
  editTarget.value = null
  invalidate()
}

function onTransferDone() {
  transferCred.value = null
  invalidate()
}
</script>

<template>
  <div class="flex gap-6">
    <!-- Sidebar -->
    <CredentialsSidebar v-model:type-filter="typeFilter" :credentials="credentials" />

    <!-- Main -->
    <div class="min-w-0 flex-1">
      <!-- Toolbar -->
      <div class="mb-5 flex flex-wrap items-center gap-2">
        <div class="relative min-w-0 max-w-xs flex-1">
          <N8nIcon icon="search" :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-xmuted" />
          <input
            type="text"
            v-model="search"
            placeholder="Search credentials..."
            class="w-full rounded-sm border border-input-border bg-input-bg py-1.5 pl-8 pr-3 text-sm text-text-dark focus:border-input-focus focus:outline-none"
          />
        </div>
        <div class="w-44">
          <CustomSelect :value="typeFilter" :options="typeOptions" @change="typeFilter = $event" />
        </div>
        <div class="w-44">
          <CustomSelect :value="ownerFilter" :options="ownerOptions" @change="ownerFilter = $event" />
        </div>
        <N8nButton
          variant="brand"
          size="small"
          icon="plus"
          label="New Credential"
          class="ml-auto"
          @click="showCreate = true"
        />
      </div>

      <!-- Table -->
      <div v-if="isLoading" class="text-sm text-text-muted">Loading credentials...</div>
      <div v-else-if="filtered.length === 0" class="py-12 text-center">
        <N8nIcon icon="key-round" :size="28" class="mx-auto mb-2 text-text-xmuted" />
        <p class="text-sm text-text-muted">No credentials found</p>
      </div>
      <div v-else class="overflow-hidden rounded-xl border border-border bg-card">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-border bg-bg-light">
                <th class="px-4 py-2.5 text-left text-[12px] font-medium normal-case text-text-muted">Name</th>
                <th class="px-4 py-2.5 text-left text-[12px] font-medium normal-case text-text-muted">Type</th>
                <th class="px-4 py-2.5 text-left text-[12px] font-medium normal-case text-text-muted">Owner</th>
                <th class="whitespace-nowrap px-4 py-2.5 text-left text-[12px] font-medium normal-case text-text-muted">Created</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border-light">
              <tr
                v-for="cred in filtered"
                :key="cred.id"
                class="cursor-pointer transition-colors hover:bg-card-hover"
                @click="detailCred = cred"
              >
                <td class="px-4 py-2.5">
                  <span class="flex items-center gap-1.5">
                    <N8nIcon icon="key-round" :size="12" class="shrink-0 text-text-xmuted" />
                    <span class="font-medium text-text-dark underline decoration-border-strong underline-offset-2">{{ cred.name }}</span>
                  </span>
                </td>
                <td class="px-4 py-2.5">
                  <TypeBadge :type="cred.type" />
                </td>
                <td class="px-4 py-2.5 text-xs text-text-muted">
                  <span v-if="getCredOwner(cred)">{{ getCredOwner(cred) }}</span>
                  <span v-else class="text-text-xmuted">—</span>
                </td>
                <td class="whitespace-nowrap px-4 py-2.5 text-xs text-text-xmuted">
                  <N8nTimeAgo :date="cred.createdAt" class="text-xs text-text-xmuted" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Detail Modal -->
    <CredentialDetailModal
      v-if="detailCred"
      :cred="detailCred"
      :audit="auditData ?? []"
      @close="detailCred = null"
      @edit="detailEdit"
      @transfer="detailTransfer"
      @delete="detailDelete"
    />

    <!-- Create Modal -->
    <CredentialFormModal
      v-if="showCreate"
      :initial="null"
      :cred-types="credTypes"
      @close="showCreate = false"
      @saved="onCreateSaved"
    />

    <!-- Edit Modal -->
    <CredentialFormModal
      v-if="editTarget"
      :initial="editTarget"
      :cred-types="credTypes"
      @close="editTarget = null"
      @saved="onEditSaved"
    />

    <!-- Transfer Modal -->
    <TransferModal
      v-if="transferCred"
      :cred="transferCred"
      :projects="projects"
      @close="transferCred = null"
      @done="onTransferDone"
    />
  </div>
</template>