<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  N8nBadge,
  N8nButton,
  N8nDialog,
  N8nIcon,
  N8nInput,
  N8nOption,
  N8nSelect,
} from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'
import { appConfirm } from '@/stores/confirm'
import { useInstanceStore } from '@/stores/instance'
import { timeAgo } from '@/lib/utils'
import type { BadgeVariant } from '@n8n/design-system'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserItem {
  id: number
  username: string
  email: string
  role: string
  created_at: string
  n8n_user_id?: string | null
  n8n_instance_id?: number | null
  instance_name?: string | null
}

// ─── UsersPage ────────────────────────────────────────────────────────────────

const toast = useToast()
const queryClient = useQueryClient()
const auth = useAuthStore()
const instanceStore = useInstanceStore()

const currentUser = computed(() => auth.user)
const currentId = computed(() =>
  currentUser.value ? (currentUser.value as unknown as { id: number }).id : null,
)
const instances = computed(() => instanceStore.instances)

const syncInstanceId = ref<number | null>(instanceStore.instances[0]?.id ?? null)
const syncInstanceIdStr = computed({
  get: () => String(syncInstanceId.value ?? ''),
  set: (v: string) => { syncInstanceId.value = Number(v) },
})

/** null | 'create' | the user being edited */
const modal = ref<'create' | UserItem | null>(null)
const editing = computed<UserItem | null>(() =>
  modal.value && modal.value !== 'create' ? (modal.value as UserItem) : null,
)

// Shared form state, re-initialized every time the modal opens
const username = ref('')
const email = ref('')
const password = ref('')
const role = ref('viewer')
const showPw = ref(false)

const { data, isLoading } = useQuery({
  queryKey: ['users'],
  queryFn: async () => {
    const r = await api.get<{ users: UserItem[] }>('/api/users')
    return r.users ?? []
  },
})

const users = computed(() => data.value ?? [])

function openModal(item: 'create' | UserItem) {
  const initial = item === 'create' ? null : item
  modal.value = item
  username.value = initial?.username ?? ''
  email.value = initial?.email ?? ''
  password.value = ''
  role.value = initial?.role ?? 'viewer'
  showPw.value = false
}

function closeModal() {
  modal.value = null
}

function onModalOpenChange(open: boolean) {
  if (!open) closeModal()
}

async function deleteUser(u: UserItem) {
  const ok = await appConfirm(`Delete user "${u.username}"? This cannot be undone.`, { danger: true, okLabel: 'Delete' })
  if (!ok) return
  try {
    await api.delete(`/api/users/${u.id}`)
    toast.success('User deleted')
    queryClient.invalidateQueries({ queryKey: ['users'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Delete failed')
  }
}

const syncing = ref(false)

async function syncFromN8n() {
  if (!syncInstanceId.value || syncing.value) return
  syncing.value = true
  try {
    const d = await api.post<{ created: number; skipped: number; total: number }>('/api/users/sync-n8n', {
      instance_id: syncInstanceId.value,
    })
    toast.success(`Synced: ${d.created} new, ${d.skipped} existing (${d.total} total in n8n)`)
    queryClient.invalidateQueries({ queryKey: ['users'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Sync failed')
  } finally {
    syncing.value = false
  }
}

const saving = ref(false)

async function save() {
  const initial = editing.value
  if (!username.value.trim() || !email.value.trim() || (!initial && !password.value.trim()) || saving.value) return
  const body: Record<string, string> = {
    username: username.value,
    email: email.value,
    role: role.value,
  }
  if (password.value) body.password = password.value
  saving.value = true
  try {
    if (initial) await api.put(`/api/users/${initial.id}`, body)
    else await api.post('/api/users', { ...body, password: password.value })
    toast.success(initial ? 'User updated' : 'User created')
    closeModal()
    queryClient.invalidateQueries({ queryKey: ['users'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    saving.value = false
  }
}

const roleVariant = (r: string): BadgeVariant => (r === 'admin' ? 'danger' : r === 'editor' ? 'primary' : 'subtle')
</script>

<template>
  <div>
    <!-- Header -->
    <div class="mb-4 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <N8nIcon icon="users" :size="16" class="text-text-muted" />
        <span class="text-xs font-medium text-text-muted">
          {{ users.length }} user{{ users.length !== 1 ? 's' : '' }}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <template v-if="instances.length > 0">
          <N8nSelect
            v-if="instances.length > 1"
            v-model="syncInstanceIdStr"
            :filterable="false"
            class="w-56"
          >
            <N8nOption
              v-for="inst in instances"
              :key="inst.id"
              :value="String(inst.id)"
              :label="inst.name"
            />
          </N8nSelect>
          <N8nButton
            variant="outline"
            size="small"
            :label="syncing ? 'Syncing...' : 'Sync from n8n'"
            :disabled="!syncInstanceId"
            :loading="syncing"
            @click="syncFromN8n"
          />
        </template>
        <N8nButton icon="plus" label="Add User" variant="brand" size="small" @click="openModal('create')" />
      </div>
    </div>

    <!-- Table -->
    <div v-if="isLoading" class="py-8 text-center text-sm text-text-muted">Loading users...</div>
    <div v-else-if="users.length === 0" class="py-16 text-center">
      <N8nIcon icon="users" :size="28" class="mx-auto mb-2 text-text-xmuted" />
      <p class="text-sm text-text-muted">No users found</p>
    </div>
    <div v-else class="overflow-hidden rounded-md border border-border">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border bg-bg">
            <th class="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted">User</th>
            <th class="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted">Role</th>
            <th class="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted">Source</th>
            <th class="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted">Created</th>
            <th class="w-20 px-4 py-2" />
          </tr>
        </thead>
        <tbody class="divide-y divide-border-light">
          <tr v-for="u in users" :key="u.id" class="transition-colors hover:bg-card-hover">
            <td class="px-4 py-3">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
                  :class="u.role === 'admin' ? 'bg-danger' : u.role === 'editor' ? 'bg-primary' : 'bg-text-muted'"
                >
                  {{ u.username.charAt(0).toUpperCase() }}
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class="truncate font-medium text-text-dark">{{ u.username }}</span>
                    <N8nBadge v-if="currentId === u.id" variant="primary" size="xsmall">you</N8nBadge>
                  </div>
                  <div class="truncate text-xs text-text-muted">{{ u.email }}</div>
                </div>
              </div>
            </td>
            <td class="px-4 py-3">
              <N8nBadge :variant="roleVariant(u.role)" size="xsmall" class="uppercase">
                {{ u.role }}
              </N8nBadge>
            </td>
            <td class="px-4 py-3">
              <N8nBadge v-if="u.n8n_instance_id" variant="primary" size="xsmall" leading-icon="server">
                {{ u.instance_name || 'n8n' }}
              </N8nBadge>
              <N8nBadge v-else variant="subtle" size="xsmall">Local</N8nBadge>
            </td>
            <td class="px-4 py-3 text-xs text-text-muted">{{ timeAgo(u.created_at) }}</td>
            <td class="px-4 py-3">
              <div class="flex items-center justify-end gap-1">
                <button
                  title="Edit user"
                  class="rounded p-1 text-text-xmuted transition-colors hover:text-primary"
                  @click="openModal(u)"
                >
                  <N8nIcon icon="pencil" :size="13" />
                </button>
                <button
                  v-if="currentId !== u.id"
                  title="Delete user"
                  class="rounded p-1 text-text-xmuted transition-colors hover:text-danger"
                  @click="deleteUser(u)"
                >
                  <N8nIcon icon="trash-2" :size="13" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal -->
    <N8nDialog
      :open="modal !== null"
      size="medium"
      :header="editing ? 'Edit User' : 'New User'"
      show-close-button
      @update:open="onModalOpenChange"
    >
      <div class="space-y-4 p-5">
        <div>
          <label class="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">Username *</label>
          <N8nInput v-model="username" type="text" placeholder="john" />
        </div>
        <div>
          <label class="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">Email *</label>
          <N8nInput v-model="email" type="email" placeholder="john@example.com" />
        </div>
        <div>
          <label class="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">
            {{ editing ? 'New Password (leave blank to keep)' : 'Password *' }}
          </label>
          <N8nInput
            v-model="password"
            :type="showPw ? 'text' : 'password'"
            placeholder="••••••••"
          >
            <template #suffix>
              <button
                type="button"
                class="text-text-muted transition-colors hover:text-text-dark"
                @click="showPw = !showPw"
              >
                <N8nIcon :icon="showPw ? 'eye-off' : 'eye'" :size="14" />
              </button>
            </template>
          </N8nInput>
        </div>
        <div>
          <label class="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">Role</label>
          <N8nSelect v-model="role" :filterable="false" class="w-full">
            <N8nOption value="viewer" label="Viewer">Viewer</N8nOption>
            <N8nOption value="editor" label="Editor">Editor</N8nOption>
            <N8nOption value="admin" label="Admin">Admin</N8nOption>
          </N8nSelect>
        </div>
      </div>
      <!-- Footer buttons live inside the dialog default slot -->
      <div class="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        <N8nButton label="Cancel" variant="outline" size="small" @click="closeModal" />
        <N8nButton
          :label="editing ? 'Save Changes' : 'Create User'"
          variant="brand"
          size="small"
          :disabled="!username.trim() || !email.trim() || (!editing && !password.trim()) || saving"
          :loading="saving"
          @click="save"
        />
      </div>
    </N8nDialog>
  </div>
</template>