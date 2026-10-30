<script setup lang="ts">
/* -------------------------------------------------------------------------- */
/*  ApprovalsBuilderPage — port of src/features/approvals.tsx                  */
/*  ApprovalsBuilderPage (template CRUD). The full-page HitlFormBuilder embed   */
/*  replaces the React full-screen overlay: same contract (templateId + save /  */
/*  cancel).                                                                    */
/* -------------------------------------------------------------------------- */

import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nBadge, N8nButton, N8nIcon, N8nTimeAgo } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { appConfirm } from '@/stores/confirm'
import { useToast } from '@/stores/toast'
import HitlFormBuilder from '@/features/hitl-form-builder.vue'

// --- Types (mirror the React file) --------------------------------------------

interface SchemaComponent {
  type: string
  id?: string
  field?: string
  label?: string
  text?: string
  level?: number
  height?: number
  options?: Array<{ label: string; value: string }>
  children?: SchemaComponent[]
  title?: string
  thresholds?: Array<{ value: number; color: string; label: string }>
  src?: string
  alt?: string
  placeholder?: string
  required?: boolean
  format?: string
  name?: string
  props?: Record<string, unknown>
}

interface HitlTemplate {
  id: number
  name: string
  description?: string
  slug: string
  is_active: boolean
  request_count: number
  pending_count: number
  created_at: string
  updated_at: string
  schema?: SchemaComponent[]
}

/* -------------------------------------------------------------------------- */

const router = useRouter()
const toast = useToast()
const queryClient = useQueryClient()

// Full-page builder modal state: 'create' for a new template, or the template being edited
const modal = ref<null | 'create' | HitlTemplate>(null)
const isCreate = computed(() => modal.value === 'create')
const editingTemplateId = computed(() =>
  modal.value && modal.value !== 'create' ? modal.value.id : undefined,
)

const { data: templatesData, isLoading } = useQuery({
  queryKey: ['hitl-templates'],
  queryFn: () =>
    api.get<{ templates: HitlTemplate[] }>('/api/hitl/templates').then((r) => r.templates),
})

const templates = computed<HitlTemplate[]>(() => templatesData.value ?? [])

async function toggleTemplate(id: number) {
  try {
    await api.patch(`/api/hitl/templates/${id}/toggle`, {})
    queryClient.invalidateQueries({ queryKey: ['hitl-templates'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Toggle failed')
  }
}

async function deleteTemplate(id: number) {
  try {
    await api.delete(`/api/hitl/templates/${id}`)
    toast.success('Template deleted')
    queryClient.invalidateQueries({ queryKey: ['hitl-templates'] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Delete failed')
  }
}

async function handleDelete(tpl: HitlTemplate) {
  const ok = await appConfirm(`Delete template "${tpl.name}"?`, { danger: true, okLabel: 'Delete' })
  if (ok) deleteTemplate(tpl.id)
}

/* Full-page builder saved */
function handleSaved() {
  const wasCreate = isCreate.value
  modal.value = null
  queryClient.invalidateQueries({ queryKey: ['hitl-templates'] })
  toast.success(wasCreate ? 'Template created' : 'Template updated')
}
</script>

<template>
  <div>
    <!-- Toolbar -->
    <div class="mb-5 flex items-center justify-between">
      <N8nButton
        variant="outline"
        size="small"
        icon="arrow-left"
        label="Back to Approvals"
        @click="router.push('/approvals')"
      />
      <N8nButton
        variant="brand"
        size="small"
        icon="plus"
        label="New Template"
        @click="modal = 'create'"
      />
    </div>

    <!-- Template table -->
    <div v-if="isLoading" class="text-sm text-text-muted">Loading templates...</div>

    <div v-else-if="templates.length === 0" class="py-12 text-center text-sm text-text-muted">No templates yet</div>

    <div v-else class="overflow-hidden rounded-xl border border-border">
      <table class="w-full border-collapse text-left">
        <thead>
          <tr class="border-b border-border bg-bg-light">
            <th class="w-12 px-4 py-2.5 text-[12px] font-medium normal-case text-text-muted">Active</th>
            <th class="px-4 py-2.5 text-[12px] font-medium normal-case text-text-muted">Template</th>
            <th class="px-4 py-2.5 text-[12px] font-medium normal-case text-text-muted">Slug</th>
            <th class="px-4 py-2.5 text-center text-[12px] font-medium normal-case text-text-muted">Requests</th>
            <th class="px-4 py-2.5 text-[12px] font-medium normal-case text-text-muted">Status</th>
            <th class="px-4 py-2.5 text-[12px] font-medium normal-case text-text-muted">Updated</th>
            <th class="w-20 px-4 py-2.5 text-right text-[12px] font-medium normal-case text-text-muted">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-light">
          <tr v-for="tpl in templates" :key="tpl.id" class="transition-colors hover:bg-card-hover">
            <!-- Active toggle -->
            <td class="px-4 py-2.5">
              <button
                class="text-text-xmuted hover:text-primary"
                :title="tpl.is_active ? 'Deactivate' : 'Activate'"
                @click="toggleTemplate(tpl.id)"
              >
                <N8nIcon
                  :icon="tpl.is_active ? 'toggle-right' : 'toggle-left'"
                  :size="18"
                  :class="tpl.is_active ? 'text-success' : ''"
                />
              </button>
            </td>
            <!-- Template name + description -->
            <td class="px-4 py-2.5">
              <div class="text-sm font-medium text-text-dark">{{ tpl.name }}</div>
              <div v-if="tpl.description" class="max-w-xs truncate text-[11px] text-text-xmuted">{{ tpl.description }}</div>
            </td>
            <!-- Slug -->
            <td class="px-4 py-2.5">
              <span class="font-mono text-xs text-text-muted">{{ tpl.slug }}</span>
            </td>
            <!-- Requests count + pending badge -->
            <td class="px-4 py-2.5 text-center">
              <span class="text-xs text-text-dark">{{ tpl.request_count }}</span>
              <span
                v-if="tpl.pending_count > 0"
                class="ml-1.5 rounded-full bg-warning px-1.5 py-0.5 text-[11px] font-semibold text-white"
              >
                {{ tpl.pending_count }}
              </span>
            </td>
            <!-- Status badge -->
            <td class="px-4 py-2.5">
              <N8nBadge :variant="(tpl.is_active ? 'success' : 'subtle') as 'success'" size="xsmall">
                {{ tpl.is_active ? 'Active' : 'Inactive' }}
              </N8nBadge>
            </td>
            <!-- Updated -->
            <td class="px-4 py-2.5">
              <N8nTimeAgo :date="tpl.updated_at" class="text-xs text-text-xmuted" />
            </td>
            <!-- Actions -->
            <td class="px-4 py-2.5 text-right">
              <div class="flex items-center justify-end gap-1">
                <button class="rounded-sm p-1.5 text-text-xmuted hover:text-text-dark" title="Edit" @click="modal = tpl">
                  <N8nIcon icon="pencil" :size="13" />
                </button>
                <button class="rounded-sm p-1.5 text-text-xmuted hover:text-danger" title="Delete" @click="handleDelete(tpl)">
                  <N8nIcon icon="trash-2" :size="13" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <!-- Table footer -->
      <div class="border-t border-border bg-bg-light px-4 py-2.5">
        <span class="text-xs text-text-muted">
          {{ templates.length }} template{{ templates.length !== 1 ? 's' : '' }}
        </span>
      </div>
    </div>

    <!-- Full-page builder -->
    <div v-if="modal" class="fixed inset-0 z-[100] overflow-auto bg-bg">
      <HitlFormBuilder
        :template-id="editingTemplateId"
        @save="handleSaved"
        @cancel="modal = null"
      />
    </div>
  </div>
</template>