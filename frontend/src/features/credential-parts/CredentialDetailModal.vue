<script setup lang="ts">
import { computed } from 'vue'
import { N8nButton, N8nDialog, N8nIcon, N8nTimeAgo } from '@n8n/design-system'
import { getCredOwner, shortName } from './parts'
import type { AuditEntry, Credential } from './parts'
import TypeBadge from './TypeBadge.vue'

const props = defineProps<{
  cred: Credential
  audit: AuditEntry[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'edit'): void
  (e: 'transfer'): void
  (e: 'delete'): void
}>()

const credAudit = computed(() =>
  props.audit
    .filter((a) => a.n8n_credential_id === props.cred.id || a.credential_name === props.cred.name)
    .slice(0, 10),
)

function onOpenChange(open: boolean) {
  if (!open) emit('close')
}
</script>

<template>
  <N8nDialog
    :open="true"
    size="medium"
    :header="cred.name"
    show-close-button
    @update:open="onOpenChange"
  >
    <div class="flex max-h-[80vh] flex-col">
      <div class="flex-1 overflow-y-auto p-4">
        <div>
          <TypeBadge :type="cred.type" />
        </div>

        <!-- Meta -->
        <div class="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p class="mb-0.5 text-text-xmuted">ID</p>
            <p class="truncate font-mono text-text-muted">{{ cred.id }}</p>
          </div>
          <div>
            <p class="mb-0.5 text-text-xmuted">Owner</p>
            <p v-if="getCredOwner(cred)" class="text-text-dark">{{ getCredOwner(cred) }}</p>
            <p v-else class="text-text-xmuted">—</p>
          </div>
          <div>
            <p class="mb-0.5 text-text-xmuted">Created</p>
            <N8nTimeAgo :date="cred.createdAt" class="text-text-muted" />
          </div>
          <div>
            <p class="mb-0.5 text-text-xmuted">Updated</p>
            <N8nTimeAgo :date="cred.updatedAt" class="text-text-muted" />
          </div>
        </div>

        <!-- Shared with -->
        <div v-if="cred.shared && cred.shared.length > 0">
          <p class="mb-2 text-[11px] font-semibold uppercase text-text-xmuted">Shared With</p>
          <div class="flex flex-col gap-1 ">
            <div
              v-for="(s, i) in cred.shared"
              :key="i"
              class="flex items-center justify-between rounded-sm bg-bg px-2 py-1 text-xs"
            >
              <span class="flex items-center gap-1.5 text-text-dark">
                <N8nIcon icon="user" :size="11" class="text-text-xmuted" />
                {{ shortName(s.name) }}
              </span>
              <span class="capitalize text-text-xmuted">{{ s.role?.replace('credential:', '') }}</span>
            </div>
          </div>
        </div>

        <!-- Audit trail -->
        <div v-if="credAudit.length > 0">
          <p class="mb-2 text-[11px] font-semibold uppercase text-text-xmuted">Recent Activity</p>
          <div class="flex flex-col gap-1 ">
            <div v-for="(a, i) in credAudit" :key="i" class="flex items-start gap-2 text-xs text-text-muted">
              <N8nIcon icon="clock" :size="11" class="mt-0.5 shrink-0 text-text-xmuted" />
              <span class="flex-1">
                <span class="capitalize text-text-dark">{{ a.action }}</span>
                <template v-if="a.username"> by <span class="text-primary">{{ a.username }}</span></template>
                <template v-if="a.detail"> — {{ a.detail }}</template>
              </span>
              <span class="shrink-0 whitespace-nowrap text-text-xmuted"><N8nTimeAgo :date="a.created_at" class="text-text-xmuted" /></span>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer actions -->
      <div class="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3">
        <N8nButton variant="outline" size="small" icon="pencil" label="Edit" @click="emit('edit')" />
        <N8nButton variant="outline" size="small" icon="arrow-left-right" label="Transfer" @click="emit('transfer')" />
        <div class="flex-1" />
        <button
          class="flex items-center gap-1 rounded-sm border border-danger/30 px-3 py-1.5 text-xs text-danger transition-colors hover:bg-danger-light"
          @click="emit('delete')"
        >
          <N8nIcon icon="trash-2" :size="12" /> Delete
        </button>
        <N8nButton variant="outline" size="small" label="Close" @click="emit('close')" />
      </div>
    </div>
  </N8nDialog>
</template>