<script setup lang="ts">
// ─── CategoriesTab + CategoryModal ────────────────────────────────────────────
import { computed, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { N8nButton, N8nDialog, N8nIcon, N8nInput } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { appConfirm } from '@/stores/confirm'
import { sanitizeHtml } from '@/lib/sanitize'
import IconPicker from '@/components/IconPicker.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import LucideIcon from '@/components/LucideIcon.vue'
import SettingsCard from './settings-card.vue'
import SettingsTable from './settings-table.vue'
import FieldRow from './field-row.vue'
import ActionBtns from './action-btns.vue'

type CategoryType = 'workflow' | 'service_desk' | 'kb'

const CATEGORY_TYPES: CategoryType[] = ['workflow', 'service_desk', 'kb']

interface RichCategory {
  id: number
  name: string
  icon?: string
  description?: string
  slug?: string
  sort_order?: number
}

const CATEGORY_TYPE_CONFIG: Record<
  CategoryType,
  { label: string; listEndpoint: string; baseEndpoint: string; hasSlug: boolean; hasSortOrder: boolean }
> = {
  workflow: {
    label: 'Workflow',
    listEndpoint: '/api/categories',
    baseEndpoint: '/api/categories',
    hasSlug: false,
    hasSortOrder: false,
  },
  service_desk: {
    label: 'Service Desk',
    listEndpoint: '/api/ticket-categories',
    baseEndpoint: '/api/ticket-categories',
    hasSlug: false,
    hasSortOrder: false,
  },
  kb: {
    label: 'Knowledge Base',
    listEndpoint: '/api/kb/categories',
    baseEndpoint: '/api/kb/categories',
    hasSlug: true,
    hasSortOrder: true,
  },
}

const toast = useToast()
const qc = useQueryClient()

const activeType = ref<CategoryType>('workflow')
const modal = ref<null | 'create' | RichCategory>(null)

const cfg = computed(() => CATEGORY_TYPE_CONFIG[activeType.value])

const { data, isLoading } = useQuery({
  queryKey: ['settings-categories', () => activeType.value],
  queryFn: async ({ queryKey }) => {
    const type = queryKey[1] as CategoryType
    const r = await api.get<{ categories: RichCategory[] } | RichCategory[]>(CATEGORY_TYPE_CONFIG[type].listEndpoint)
    return Array.isArray(r) ? r : (r.categories ?? [])
  },
})
const categories = computed(() => data.value ?? [])

async function handleDelete(c: RichCategory) {
  const ok = await appConfirm(`Delete category "${c.name}"?`, { danger: true, okLabel: 'Delete' })
  if (!ok) return
  try {
    await api.delete(`${CATEGORY_TYPE_CONFIG[activeType.value].baseEndpoint}/${c.id}`)
    toast.success('Category deleted')
    await qc.invalidateQueries({ queryKey: ['settings-categories', activeType.value] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Delete failed')
  }
}

// ─── CategoryModal ────────────────────────────────────────────────────────────

const editingCategory = ref<RichCategory | null>(null)
const editingType = ref<CategoryType>('workflow')
const name = ref('')
const icon = ref('')
const description = ref('')
const slug = ref('')
const sortOrder = ref('')
const slugTouched = ref(false)
const saving = ref(false)

const modalCfg = computed(() => CATEGORY_TYPE_CONFIG[editingType.value])

function openModal(mod: null | 'create' | RichCategory, type: CategoryType) {
  modal.value = mod
  const initial = !mod || mod === 'create' ? null : mod
  editingCategory.value = initial
  editingType.value = type
  name.value = initial?.name ?? ''
  icon.value = initial?.icon ?? ''
  description.value = initial?.description ?? ''
  slug.value = initial?.slug ?? ''
  sortOrder.value = initial?.sort_order?.toString() ?? ''
  slugTouched.value = !!initial?.slug
}

// Auto-generate slug from name when slug hasn't been manually edited
function handleNameChange(v: string) {
  name.value = v
  if (!slugTouched.value && modalCfg.value.hasSlug) {
    slug.value = v
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }
}

function handleSlugChange(v: string) {
  slugTouched.value = true
  slug.value = v
}

async function saveCategory() {
  const initial = editingCategory.value
  const mCfg = CATEGORY_TYPE_CONFIG[editingType.value]
  saving.value = true
  try {
    const body: Record<string, string | number> = { name: name.value, icon: icon.value, description: description.value }
    if (mCfg.hasSlug) body.slug = slug.value
    if (mCfg.hasSortOrder && sortOrder.value !== '') body.sort_order = parseInt(sortOrder.value, 10)
    if (initial) await api.put(`${mCfg.baseEndpoint}/${initial.id}`, body)
    else await api.post(mCfg.baseEndpoint, body)
    toast.success(initial ? 'Category updated' : 'Category created')
    openModal(null, editingType.value)
    await qc.invalidateQueries({ queryKey: ['settings-categories', activeType.value] })
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <SettingsCard icon="cpu" title="Categories" description="Organize templates, tickets, and articles">
    <template #action>
      <N8nButton variant="brand" size="small" @click="openModal('create', activeType)">
        <span class="flex items-center gap-1.5"><N8nIcon icon="plus" :size="12" />New Category</span>
      </N8nButton>
    </template>

    <!-- Type switcher -->
    <div class="mb-4 flex w-fit gap-1 rounded-sm border border-border bg-bg p-1">
      <button
        v-for="t in CATEGORY_TYPES"
        :key="t"
        type="button"
        class="rounded-sm px-3 py-1.5 text-xs font-medium transition-colors"
        :class="activeType === t ? 'bg-primary text-white' : 'text-text-muted hover:bg-card-hover hover:text-text-dark'"
        @click="activeType = t"
      >
        {{ CATEGORY_TYPE_CONFIG[t].label }}
      </button>
    </div>

    <p v-if="isLoading" class="text-sm text-text-muted">Loading categories...</p>
    <p v-else-if="categories.length === 0" class="py-12 text-center text-sm text-text-muted">No categories defined</p>
    <SettingsTable v-else>
      <thead>
        <tr class="border-b border-border bg-bg-light">
          <th class="px-4 py-2 text-left text-[12px] font-medium text-text-muted">Icon</th>
          <th class="px-4 py-2 text-left text-[12px] font-medium text-text-muted">Name</th>
          <th class="px-4 py-2 text-left text-[12px] font-medium text-text-muted">Description</th>
          <th v-if="cfg.hasSlug" class="px-4 py-2 text-left text-[12px] font-medium text-text-muted">Slug</th>
          <th class="text-[12px] w-20 px-4 py-2" />
        </tr>
      </thead>
      <tbody class="divide-y divide-border-light">
        <tr v-for="c in categories" :key="c.id" class="transition-colors hover:bg-card-hover">
          <td class="w-10 px-4 py-2.5 text-[13px]"><LucideIcon :name="c.icon" /></td>
          <td class="px-4 py-2.5 font-medium text-text-dark text-[13px]">{{ c.name }}</td>
          <td class="max-w-[250px] px-4 py-2.5 text-xs text-text-muted">
            <div
              v-if="c.description"
              class="line-clamp-2 [&_strong]:font-semibold [&_a]:text-primary"
              v-html="sanitizeHtml(c.description ?? '')"
            />
            <span v-else class="text-text-xmuted">—</span>
          </td>
          <td v-if="cfg.hasSlug" class="px-4 py-2.5 font-mono text-xs text-text-muted">
            <span v-if="c.slug === undefined || c.slug === null" class="text-text-xmuted">—</span>
            <template v-else>{{ c.slug }}</template>
          </td>
          <td class="text-[13px] px-4 py-2.5">
            <ActionBtns @edit="openModal(c, activeType)" @delete="handleDelete(c)" />
          </td>
        </tr>
      </tbody>
    </SettingsTable>

    <N8nDialog
      :open="modal !== null"
      :header="editingCategory ? 'Edit Category' : `New ${modalCfg.label} Category`"
      size="medium"
      show-close-button
      @update:open="(v: boolean) => { if (!v) openModal(null, editingType) }"
    >
      <div class="flex flex-col gap-3 ">
        <FieldRow label="Name *">
          <N8nInput :model-value="name" placeholder="e.g. Automation" @update:model-value="handleNameChange" />
        </FieldRow>
        <div>
          <label class="mb-1 block text-xs font-medium text-text-muted">Icon</label>
          <IconPicker :value="icon" @change="icon = $event" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-text-muted">Description</label>
          <RichTextEditor :content="description" placeholder="Category description..." @change="description = $event" />
        </div>
        <FieldRow v-if="modalCfg.hasSlug" label="Slug">
          <N8nInput :model-value="slug" placeholder="auto-generated-from-name" @update:model-value="handleSlugChange" />
        </FieldRow>
        <FieldRow v-if="modalCfg.hasSortOrder" label="Sort Order">
          <N8nInput v-model="sortOrder" type="number" placeholder="0" />
        </FieldRow>
        <div class="flex justify-end gap-2 pt-2">
          <N8nButton variant="outline" size="small" label="Cancel" @click="openModal(null, editingType)" />
          <N8nButton
            variant="brand"
            size="small"
            :loading="saving"
            :disabled="!name.trim()"
            :label="saving ? 'Saving...' : editingCategory ? 'Save Changes' : 'Create Category'"
            @click="saveCategory"
          />
        </div>
      </div>
    </N8nDialog>
  </SettingsCard>
</template>