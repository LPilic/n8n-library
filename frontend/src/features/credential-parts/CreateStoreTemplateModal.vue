<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { N8nButton, N8nDialog, N8nInput } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { useInstanceStore } from '@/stores/instance'
import { camelToLabel, formatCredType, inputChecked, isSensitiveField } from './parts'
import type { CredSchema, UserFieldDefinition } from './parts'
import SensitiveInput from './SensitiveInput.vue'
import CustomSelect from '@/components/CustomSelect.vue'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const toast = useToast()

const instanceStore = useInstanceStore()
const instances = computed(() => instanceStore.instances)
const activeInstanceId = computed(() => instanceStore.activeId)

const step = ref<'pick-type' | 'configure'>('pick-type')
const typeSearch = ref('')
const selectedType = ref('')
const name = ref('')
const description = ref('')
const allowedRoles = ref<string[]>(['editor', 'viewer'])
const saving = ref(false)
const fieldValues = ref<Record<string, string>>({})
const userFields = ref<string[]>([])
const jsonFallback = ref('')
const instanceId = ref<number | null>(activeInstanceId.value)

const ROLE_OPTIONS = ['editor', 'viewer']

const { data: allTypesData } = useQuery({
  queryKey: ['cred-types'],
  queryFn: async () => {
    const r = await api.get<Array<{ name: string; displayName: string }>>('/api/credentials/types')
    return Array.isArray(r) ? r : []
  },
})
const allTypes = computed(() => allTypesData.value ?? [])

const { data: schema, isLoading: schemaLoading } = useQuery({
  queryKey: ['cred-schema', () => selectedType.value],
  queryFn: () => api.get<CredSchema>(`/api/credentials/schema/${encodeURIComponent(selectedType.value)}`),
  enabled: computed(() => !!selectedType.value),
})

interface SchemaField {
  key: string
  label: string
  type: string
  desc: string
  required: boolean
  sensitive: boolean
}

const schemaFields = computed<SchemaField[]>(() => {
  const s = schema.value
  if (!s?.properties) return []
  return Object.entries(s.properties)
    .filter(([k, p]) => p.type !== 'notice' && k !== 'oauthTokenData' && k !== 'notice')
    .map(([k, p]) => ({
      key: k,
      label: p.displayName || camelToLabel(k),
      type: p.type,
      desc: p.description || '',
      required: (s.required || []).includes(k),
      sensitive: isSensitiveField(k),
    }))
})

const filteredTypes = computed(() => {
  const types = allTypes.value
  return typeSearch.value
    ? types
        .filter(
          (t) =>
            t.displayName.toLowerCase().includes(typeSearch.value.toLowerCase()) ||
            t.name.toLowerCase().includes(typeSearch.value.toLowerCase()),
        )
        .slice(0, 50)
    : types.slice(0, 50)
})

function setFieldValue(key: string, val: string) {
  fieldValues.value = { ...fieldValues.value, [key]: val }
}

function setFieldBool(key: string, checked: boolean) {
  setFieldValue(key, checked ? 'true' : '')
}

function toggleUserField(key: string) {
  const enabling = !userFields.value.includes(key)
  if (enabling) {
    // A field is either admin-provided or user-provided, never both.
    setFieldValue(key, '')
    userFields.value = [...userFields.value, key]
  } else {
    userFields.value = userFields.value.filter((f) => f !== key)
  }
}

function pickType(t: { name: string; displayName: string }) {
  selectedType.value = t.name
  name.value = t.displayName + ' Template'
  step.value = 'configure'
}

function changeType() {
  step.value = 'pick-type'
  fieldValues.value = {}
  userFields.value = []
}

function setInstanceId(v: string) {
  instanceId.value = Number(v)
}

function toggleRole(role: string, checked: boolean) {
  allowedRoles.value = checked
    ? [...allowedRoles.value, role]
    : allowedRoles.value.filter((r) => r !== role)
}

async function handleSave() {
  if (!name.value.trim() || !selectedType.value) return toast.error('Name and type are required')
  if (instances.value.length > 0 && !instanceId.value) return toast.error('Select a target instance')

  const userFieldKeys = userFields.value
  let sharedData: Record<string, unknown> = {}
  if (schemaFields.value.length > 0) {
    const missingRequired = schemaFields.value.filter(
      (f) => f.required && !userFieldKeys.includes(f.key) && !fieldValues.value[f.key],
    )
    if (missingRequired.length > 0) {
      return toast.error(
        `Missing required shared field(s): ${missingRequired.map((f) => f.label).join(', ')}`,
      )
    }
    for (const f of schemaFields.value) {
      if (!userFieldKeys.includes(f.key) && fieldValues.value[f.key]) {
        sharedData[f.key] = fieldValues.value[f.key]
      }
    }
  } else if (jsonFallback.value.trim()) {
    try {
      sharedData = JSON.parse(jsonFallback.value)
    } catch {
      return toast.error('Invalid JSON in shared data')
    }
  }

  if (Object.keys(sharedData).length === 0 && userFieldKeys.length === 0) {
    return toast.error('At least one shared data field, or one user field, is required')
  }

  const definitions = schemaFields.value
    .filter((f) => userFieldKeys.includes(f.key))
    .map(
      (f): UserFieldDefinition => ({
        key: f.key,
        label: f.label,
        type: (['string', 'number', 'integer', 'boolean'].includes(f.type)
          ? f.type
          : 'string') as UserFieldDefinition['type'],
        required: true,
        sensitive: f.sensitive,
        description: f.desc,
      }),
    )

  saving.value = true
  try {
    await api.post('/api/credential-store', {
      name: name.value.trim(),
      description: description.value,
      credential_type: selectedType.value,
      shared_data: sharedData,
      user_fields: userFieldKeys,
      user_field_definitions: definitions,
      allowed_roles: allowedRoles.value,
      instance_id: instanceId.value,
    })
    emit('saved')
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Save failed')
  } finally {
    saving.value = false
  }
}

function onOpenChange(open: boolean) {
  if (!open) emit('close')
}
</script>

<template>
  <N8nDialog
    :open="true"
    size="medium"
    header="New Credential Template"
    show-close-button
    @update:open="onOpenChange"
  >
    <div class="flex max-h-[80vh] flex-col">
      <div class="flex-1 overflow-y-auto px-5 py-4">
        <!-- Step 1: pick type -->
        <template v-if="step === 'pick-type'">
          <div>
            <label class="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">
              Search Credential Type
            </label>
            <N8nInput v-model="typeSearch" type="text" placeholder="Search types..." :autofocus="true" />
          </div>
          <div class="text-center text-[11px] text-text-xmuted">
            Showing first {{ filteredTypes.length }} of {{ allTypes.length }}. Type to search...
          </div>
          <div class="max-h-[300px] divide-y divide-border-light overflow-y-auto rounded-md border border-border">
            <button
              v-for="t in filteredTypes"
              :key="t.name"
              class="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-bg"
              @click="pickType(t)"
            >
              <span class="text-sm text-text-dark">{{ t.displayName }}</span>
              <span class="font-mono text-[11px] text-text-xmuted">{{ t.name }}</span>
            </button>
          </div>
        </template>

        <!-- Step 2: configure -->
        <template v-else>
          <div>
            <label class="block text-[12px] font-semibold uppercase tracking-wide text-text-muted">
              Type: <span class="text-primary">{{ formatCredType(selectedType) }}</span>
            </label>
            <button class="text-[11px] text-primary transition-colors hover:text-primary-hover" @click="changeType">
              Change type
            </button>
          </div>
          <div>
            <label class="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">Name *</label>
            <N8nInput v-model="name" type="text" />
          </div>
          <div>
            <label class="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">Description</label>
            <textarea
              v-model="description"
              rows="2"
              placeholder="Optional description"
              class="w-full resize-none rounded-md border border-input-border bg-input-bg px-3 py-2 text-sm text-text-dark focus:border-input-focus focus:outline-none"
            />
          </div>

          <!-- Schema fields -->
          <div>
            <label class="mb-2 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">
              Credential Fields
            </label>
            <div v-if="schemaLoading" class="py-2 text-sm text-text-muted">Loading schema...</div>
            <div v-else-if="schemaFields.length > 0" class="flex flex-col gap-3 ">
              <div v-for="f in schemaFields" :key="f.key" class="rounded-md border border-border bg-bg/50 p-3">
                <div class="mb-1 flex items-center justify-between">
                  <label class="text-[13px] font-medium text-text-dark">
                    {{ camelToLabel(f.key) }}
                    <span v-if="f.required" class="ml-0.5 text-danger">*</span>
                  </label>
                  <label class="flex cursor-pointer items-center gap-1 text-[11px] text-text-muted">
                    <input
                      type="checkbox"
                      class="accent-primary"
                      :checked="userFields.includes(f.key)"
                      @change="toggleUserField(f.key)"
                    />
                    User field
                  </label>
                </div>
                <label v-if="f.type === 'boolean'" class="flex items-center gap-2 text-sm text-text-dark">
                  <input
                    type="checkbox"
                    class="accent-primary"
                    :checked="fieldValues[f.key] === 'true'"
                    @change="setFieldBool(f.key, inputChecked($event))"
                  />
                  {{ camelToLabel(f.key) }}
                </label>
                <SensitiveInput
                  v-else-if="isSensitiveField(f.key)"
                  :model-value="fieldValues[f.key] ?? ''"
                  :placeholder="f.desc || f.type || 'string'"
                  @update:model-value="(v: string) => setFieldValue(f.key, v)"
                />
                <N8nInput
                  v-else
                  type="text"
                  :model-value="fieldValues[f.key] ?? ''"
                  :placeholder="f.desc || f.type || 'string'"
                  @update:model-value="(v: string) => setFieldValue(f.key, v)"
                />
              </div>
            </div>
            <div v-else>
              <div class="mb-2 text-[13px] text-text-muted">Could not load schema. Enter shared data as JSON.</div>
              <textarea
                v-model="jsonFallback"
                rows="4"
                placeholder='{"clientId": "...", "clientSecret": "..."}'
                class="w-full resize-none rounded-md border border-input-border bg-input-bg px-3 py-2 font-mono text-sm text-text-dark focus:border-input-focus focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label class="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">
              Target Instance *
            </label>
            <CustomSelect
              :value="String(instanceId ?? '')"
              :options="instances.map((inst) => ({ value: String(inst.id), label: inst.name }))"
              class="w-full"
              @change="setInstanceId"
            />
            <p class="mt-1 text-[11px] text-text-xmuted">
              Credentials from this template will be provisioned to this instance
            </p>
          </div>

          <div>
            <label class="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-text-muted">Allowed Roles</label>
            <div class="flex gap-3">
              <label v-for="r in ROLE_OPTIONS" :key="r" class="flex cursor-pointer items-center gap-1.5 text-sm capitalize text-text-dark">
                <input
                  type="checkbox"
                  class="accent-primary"
                  :checked="allowedRoles.includes(r)"
                  @change="toggleRole(r, inputChecked($event))"
                />
                {{ r }}
              </label>
            </div>
          </div>
        </template>
      </div>

      <div class="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
        <N8nButton variant="outline" size="small" label="Cancel" @click="emit('close')" />
        <N8nButton
          v-if="step === 'configure'"
          variant="brand"
          size="small"
          :disabled="saving || !name.trim()"
          :loading="saving"
          :label="saving ? 'Saving...' : 'Save Template'"
          @click="handleSave"
        />
      </div>
    </div>
  </N8nDialog>
</template>