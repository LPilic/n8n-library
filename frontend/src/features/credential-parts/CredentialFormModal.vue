<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { N8nButton, N8nDialog, N8nIcon, N8nInput } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { camelToLabel, formatCredType, isSensitiveField } from './parts'
import type { Credential, CredSchema, CredType, SchemaProperty } from './parts'
import SensitiveInput from './SensitiveInput.vue'

const props = defineProps<{
  initial: Credential | null
  credTypes: CredType[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const toast = useToast()

const step = ref<'pick-type' | 'fill-form'>(props.initial ? 'fill-form' : 'pick-type')
const typeSearch = ref('')
const selectedType = ref(props.initial?.type ?? '')
const name = ref(props.initial?.name ?? '')
const fields = ref<Record<string, string>>({})

const { data: schema } = useQuery({
  queryKey: ['cred-schema', () => selectedType.value],
  queryFn: () => api.get<CredSchema>(`/api/credentials/schema/${selectedType.value}`),
  enabled: computed(() => !!selectedType.value && step.value === 'fill-form'),
})

const properties = computed<Record<string, SchemaProperty>>(() => schema.value?.properties ?? {})
const fieldNames = computed(() => Object.keys(properties.value))

const saving = ref(false)

const filteredTypes = computed(() =>
  props.credTypes.filter(
    (t) =>
      !typeSearch.value ||
      t.displayName.toLowerCase().includes(typeSearch.value.toLowerCase()) ||
      t.name.toLowerCase().includes(typeSearch.value.toLowerCase()),
  ),
)

const title = computed(() =>
  props.initial
    ? 'Edit Credential'
    : step.value === 'pick-type'
      ? 'Select Credential Type'
      : `New ${formatCredType(selectedType.value)}`,
)

function setField(fieldName: string, value: string) {
  fields.value = { ...fields.value, [fieldName]: value }
}

function pickType(typeName: string) {
  selectedType.value = typeName
  step.value = 'fill-form'
}

async function save() {
  saving.value = true
  try {
    if (props.initial) {
      await api.patch(`/api/credentials/${props.initial.id}`, {
        name: name.value,
        data: fields.value,
      })
    } else {
      await api.post('/api/credentials', {
        name: name.value,
        type: selectedType.value,
        data: fields.value,
      })
    }
    toast.success(props.initial ? 'Credential updated' : 'Credential created')
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
    :header="title"
    show-close-button
    @update:open="onOpenChange"
  >
    <!-- Step 1: Pick type -->
    <div v-if="step === 'pick-type'" class="flex max-h-[80vh] flex-col">
      <div class="px-4 pb-2 pt-3">
        <div class="relative">
          <N8nIcon icon="search" :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-xmuted" />
          <input
            type="text"
            v-model="typeSearch"
            placeholder="Search types..."
            autofocus
            class="w-full rounded-sm border border-input-border bg-input-bg py-1.5 pl-8 pr-3 text-sm text-text-dark focus:border-input-focus focus:outline-none"
          />
        </div>
      </div>
      <div class="flex-1 overflow-y-auto px-2 pb-3">
        <p v-if="filteredTypes.length === 0" class="py-6 text-center text-xs text-text-xmuted">
          No types found
        </p>
        <template v-else>
          <button
            v-for="t in filteredTypes"
            :key="t.name"
            class="flex w-full items-center justify-between rounded-sm px-3 py-2 text-left transition-colors hover:bg-card-hover"
            @click="pickType(t.name)"
          >
            <span class="text-sm text-text-dark">{{ t.displayName }}</span>
            <N8nIcon icon="chevron-right" :size="13" class="shrink-0 text-text-xmuted" />
          </button>
        </template>
      </div>
    </div>

    <!-- Step 2: Fill form -->
    <div v-else class="flex max-h-[80vh] flex-col">
      <div class="flex-1 overflow-y-auto p-4">
        <div>
          <label class="mb-1 block text-xs font-medium text-text-muted">Name *</label>
          <N8nInput
            v-model="name"
            type="text"
            :placeholder="`My ${formatCredType(selectedType)}`"
            autofocus
          />
        </div>

        <div v-for="fieldName in fieldNames" :key="fieldName">
          <label class="mb-1 block text-xs font-medium text-text-muted">
            {{ properties[fieldName].displayName || camelToLabel(fieldName) }}
            <span v-if="properties[fieldName].required" class="ml-0.5 text-danger">*</span>
          </label>
          <SensitiveInput
            v-if="isSensitiveField(fieldName)"
            :name="fieldName"
            :model-value="fields[fieldName] ?? ''"
            @update:model-value="(v: string) => setField(fieldName, v)"
          />
          <N8nInput
            v-else
            type="text"
            :model-value="fields[fieldName] ?? ''"
            :placeholder="properties[fieldName].description || properties[fieldName].displayName || camelToLabel(fieldName)"
            @update:model-value="(v: string) => setField(fieldName, v)"
          />
          <p v-if="properties[fieldName].description" class="mt-0.5 text-[10px] text-text-xmuted">
            {{ properties[fieldName].description }}
          </p>
        </div>

        <p v-if="fieldNames.length === 0 && selectedType" class="py-4 text-center text-xs text-text-xmuted">
          No configurable fields for this type
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3">
        <N8nButton v-if="!initial" variant="outline" size="small" label="Back" @click="step = 'pick-type'" />
        <div class="flex-1" />
        <N8nButton variant="outline" size="small" label="Cancel" @click="emit('close')" />
        <N8nButton
          variant="brand"
          size="small"
          :disabled="!name.trim() || saving"
          :loading="saving"
          :label="saving ? 'Saving...' : initial ? 'Save Changes' : 'Create Credential'"
          @click="save"
        />
      </div>
    </div>
  </N8nDialog>
</template>