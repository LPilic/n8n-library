<script setup lang="ts">
import { computed, ref } from 'vue'
import { N8nButton, N8nDialog, N8nInput } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { camelToLabel, inputChecked, inputVal, isSensitiveField } from './parts'
import type { StoreTemplate, UserFieldDefinition } from './parts'
import TypeBadge from './TypeBadge.vue'
import SensitiveInput from './SensitiveInput.vue'

const props = defineProps<{
  template: StoreTemplate
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'done'): void
}>()

const toast = useToast()

const name = ref(`My ${props.template.name}`)
const userData = ref<Record<string, string | boolean>>({})

const definitions = computed<UserFieldDefinition[]>(() => {
  if (props.template.user_field_definitions?.length) return props.template.user_field_definitions
  return (props.template.user_fields || []).map((key) => ({
    key,
    label: camelToLabel(key),
    type: 'string' as const,
    required: true,
    sensitive: isSensitiveField(key),
    description: '',
  }))
})

const missingRequired = computed(() =>
  definitions.value.filter((def) => {
    if (!def.required) return false
    const value = userData.value[def.key]
    return value === undefined || value === ''
  }),
)

const provisioning = ref(false)

function strVal(v: string | boolean | undefined): string {
  return typeof v === 'string' ? v : ''
}

function setUserString(key: string, value: string) {
  userData.value = { ...userData.value, [key]: value }
}

function setUserBool(key: string, value: boolean) {
  userData.value = { ...userData.value, [key]: value }
}

async function provision() {
  provisioning.value = true
  try {
    await api.post(`/api/credential-store/${props.template.id}/provision`, {
      name: name.value,
      data: userData.value,
    })
    toast.success('Credential provisioned')
    emit('done')
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'Provision failed')
  } finally {
    provisioning.value = false
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
    :header="`Provision: ${props.template.name}`"
    show-close-button
    @update:open="onOpenChange"
  >
    <div class="flex max-h-[75vh] flex-col">
      <div class="flex-1 overflow-y-auto p-4">
        <div>
          <TypeBadge :type="template.type || template.credential_type || ''" />
        </div>
        <div>
          <label class="mb-1 block text-xs font-medium text-text-muted">Credential Name *</label>
          <N8nInput v-model="name" type="text" />
        </div>

        <p v-if="definitions.length === 0" class="rounded-sm border border-border-light bg-bg px-3 py-2 text-[12px] text-text-muted">
          All required fields for this credential are provided by the administrator.
        </p>
        <template v-else>
          <div v-for="def in definitions" :key="def.key">
            <label class="mb-1 block text-xs font-medium text-text-muted">
              {{ def.label }}
              <span v-if="def.required" class="ml-0.5 text-danger">*</span>
            </label>
            <label v-if="def.type === 'boolean'" class="flex cursor-pointer items-center gap-2 text-sm text-text-dark">
              <input
                type="checkbox"
                class="accent-primary"
                :checked="userData[def.key] === true"
                @change="setUserBool(def.key, inputChecked($event))"
              />
              {{ def.label }}
            </label>
            <SensitiveInput
              v-else-if="def.sensitive"
              :name="def.key"
              :model-value="strVal(userData[def.key])"
              @update:model-value="(v: string) => setUserString(def.key, v)"
            />
            <input
              v-else
              :type="def.type === 'number' || def.type === 'integer' ? 'number' : 'text'"
              :value="strVal(userData[def.key])"
              :placeholder="def.description || def.label"
              class="w-full rounded-sm border border-input-border bg-input-bg px-3 py-1.5 text-sm text-text-dark focus:border-input-focus focus:outline-none"
              @input="setUserString(def.key, inputVal($event))"
            />
            <p v-if="def.description" class="mt-1 text-[11px] text-text-xmuted">{{ def.description }}</p>
          </div>
        </template>

        <p v-if="missingRequired.length > 0" class="text-[11px] text-danger">
          Required: {{ missingRequired.map((def) => def.label).join(', ') }}
        </p>
      </div>

      <div class="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3">
        <N8nButton variant="outline" size="small" label="Cancel" @click="emit('close')" />
        <N8nButton
          variant="brand"
          size="small"
          :disabled="!name.trim() || missingRequired.length > 0 || provisioning"
          :loading="provisioning"
          :label="provisioning ? 'Provisioning...' : 'Provision'"
          @click="provision"
        />
      </div>
    </div>
  </N8nDialog>
</template>