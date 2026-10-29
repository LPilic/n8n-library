<script setup lang="ts">
// ─── UsersTab + UserModal ─────────────────────────────────────────────────────
import { computed, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton, N8nDialog, N8nIcon, N8nInput, N8nOption, N8nSelect } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'
import { useAuthStore } from '@/stores/auth'
import { timeAgo } from '@/lib/utils'
import SettingsCard from './settings-card.vue'
import SettingsTable from './settings-table.vue'
import FieldRow from './field-row.vue'
import ActionBtns from './action-btns.vue'

interface UserItem {
  id: number
  username: string
  email: string
  role: string
  created_at: string
}

const toast = useToast()
const qc = useQueryClient()
const auth = useAuthStore()

// 'create' opens the fresh-user modal; a UserItem opens the edit modal
const modal = ref<null | 'create' | UserItem>(null)

const { data, isLoading } = useQuery({
  queryKey: ['settings-users'],
  queryFn: async () => {
    const r = await api.get<{ users: UserItem[] }>('/api/users')
    return r.users ?? []
  },
})
const users = computed(() => data.value ?? [])

async function handleDelete(u: UserItem) {
  const ok = await appConfirm(`Delete user "${u.username}"? This cannot be undone.`, { danger: true, okLabel: 'Delete' })
  if (!ok) return
  try {
    await api.delete(`/api/users/${u.id}`)
    toast.success('User deleted')
    await qc.invalidateQueries({ queryKey: ['settings-users'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Delete failed')
  }
}

const roleColors: Record<string, string> = {
  admin: 'bg-danger/10 text-danger',
  editor: 'bg-primary-light text-primary',
  viewer: 'bg-bg text-text-muted',
}

// ─── UserModal ────────────────────────────────────────────────────────────────

const editingUser = ref<UserItem | null>(null)
const username = ref('')
const email = ref('')
const password = ref('')
const role = ref('viewer')
const saving = ref(false)

function openModal(mod: null | 'create' | UserItem) {
  modal.value = mod
  const initial = !mod || mod === 'create' ? null : mod
  editingUser.value = initial
  username.value = initial?.username ?? ''
  email.value = initial?.email ?? ''
  password.value = ''
  role.value = initial?.role ?? 'viewer'
}

async function saveUser() {
  const initial = editingUser.value
  saving.value = true
  try {
    const body: Record<string, string> = { username: username.value, email: email.value, role: role.value }
    if (password.value) body.password = password.value
    if (initial) await api.put(`/api/users/${initial.id}`, body)
    else await api.post('/api/users', { ...body, password: password.value })
    toast.success(initial ? 'User updated' : 'User created')
    openModal(null)
    await qc.invalidateQueries({ queryKey: ['settings-users'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <SettingsCard icon="users" title="User Management" description="Manage user accounts and roles">
    <template #action>
      <N8nButton variant="brand" size="small" @click="openModal('create')">
        <span class="flex items-center gap-1.5"><N8nIcon icon="plus" :size="12" />New User</span>
      </N8nButton>
    </template>

    <p v-if="isLoading" class="text-sm text-text-muted">Loading users...</p>
    <p v-else-if="users.length === 0" class="py-12 text-center text-sm text-text-muted">No users found</p>
    <SettingsTable v-else>
      <thead>
        <tr class="border-b border-border-light bg-bg">
          <th class="px-4 py-2 text-left text-xs font-semibold text-text-muted uppercase">Username</th>
          <th class="px-4 py-2 text-left text-xs font-semibold text-text-muted uppercase">Email</th>
          <th class="px-4 py-2 text-left text-xs font-semibold text-text-muted uppercase">Role</th>
          <th class="px-4 py-2 text-left text-xs font-semibold text-text-muted uppercase">Created</th>
          <th class="w-20 px-4 py-2" />
        </tr>
      </thead>
      <tbody class="divide-y divide-border-light">
        <tr v-for="u in users" :key="u.id" class="transition-colors hover:bg-card-hover">
          <td class="px-4 py-2.5 font-medium text-text-dark">
            {{ u.username }}
            <span
              v-if="auth.user?.id === u.id"
              class="ml-1.5 rounded bg-primary-light px-1.5 py-0.5 text-[10px] font-semibold text-primary"
            >you</span>
          </td>
          <td class="px-4 py-2.5 text-xs text-text-muted">{{ u.email }}</td>
          <td class="px-4 py-2.5">
            <span
              class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
              :class="roleColors[u.role] ?? 'bg-bg text-text-muted'"
            >{{ u.role }}</span>
          </td>
          <td class="px-4 py-2.5 text-xs text-text-muted">{{ timeAgo(u.created_at) }}</td>
          <td class="px-4 py-2.5">
            <ActionBtns @edit="openModal(u)" @delete="handleDelete(u)" />
          </td>
        </tr>
      </tbody>
    </SettingsTable>

    <N8nDialog
      :open="modal !== null"
      :header="editingUser ? 'Edit User' : 'New User'"
      size="small"
      show-close-button
      @update:open="(v: boolean) => { if (!v) openModal(null) }"
    >
      <div class="space-y-3">
        <FieldRow label="Username *">
          <N8nInput v-model="username" placeholder="john" />
        </FieldRow>
        <FieldRow label="Email *">
          <N8nInput v-model="email" type="email" placeholder="john@example.com" />
        </FieldRow>
        <FieldRow :label="editingUser ? 'New Password (leave blank to keep)' : 'Password *'">
          <N8nInput v-model="password" type="password" placeholder="••••••••" />
        </FieldRow>
        <FieldRow label="Role">
          <N8nSelect v-model="role" :filterable="false" size="medium">
            <N8nOption value="viewer" label="Viewer" />
            <N8nOption value="editor" label="Editor" />
            <N8nOption value="admin" label="Admin" />
          </N8nSelect>
        </FieldRow>
        <div class="flex justify-end gap-2 pt-2">
          <N8nButton variant="outline" size="small" label="Cancel" @click="openModal(null)" />
          <N8nButton
            variant="brand"
            size="small"
            :loading="saving"
            :disabled="!username.trim() || !email.trim() || (!editingUser && !password.trim())"
            :label="saving ? 'Saving...' : editingUser ? 'Save Changes' : 'Create User'"
            @click="saveUser"
          />
        </div>
      </div>
    </N8nDialog>
  </SettingsCard>
</template>