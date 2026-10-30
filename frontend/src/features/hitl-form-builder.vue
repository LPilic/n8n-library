<script setup lang="ts">
/* -------------------------------------------------------------------------- */
/*  HitlFormBuilder — port of src/features/hitl-builder.tsx                    */
/*  Drag & drop: React @dnd-kit (DndContext/useDraggable/useDroppable/         */
/*  SortableContext/DragOverlay) → vue-draggable-plus `<VueDraggable>` with    */
/*  clone-mode groups: palette/data-field items clone into the canvas / column  */
/*  slots, canvas items reorder in place, column children reorder in their slot. */
/* -------------------------------------------------------------------------- */

import {
  defineComponent,
  h,
  computed,
  ref,
  watch,
  onBeforeUnmount,
  type PropType,
  type VNode,
} from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { VueDraggable, type DraggableEvent } from 'vue-draggable-plus'
import { N8nButton, N8nHeading, N8nIcon, N8nInput, N8nOption, N8nSelect, N8nSwitch } from '@n8n/design-system'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/stores/toast'
import { cn } from '@/lib/utils'
import CustomSelect from '@/components/CustomSelect.vue'

/* -------------------------------------------------------------------------- */
/*  Component definitions                                                     */
/* -------------------------------------------------------------------------- */

type ComponentDef = {
  label: string
  icon: string
  category: string
  defaults: Record<string, unknown>
}

const HITL_COMPONENTS: Record<string, ComponentDef> = {
  heading:        { label: 'Heading',        icon: 'H',  category: 'display', defaults: { text: 'Heading', level: 3 } },
  text:           { label: 'Text Block',     icon: 'T',  category: 'display', defaults: { text: 'Text content', format: 'plain' } },
  'data-display': { label: 'Data Display',   icon: 'D',  category: 'display', defaults: { field: '', label: 'Label', format: 'text' } },
  'json-viewer':  { label: 'JSON Viewer',    icon: '{}', category: 'display', defaults: { field: '' } },
  image:          { label: 'Image',          icon: 'I',  category: 'display', defaults: { field: '', src: '', alt: 'Image' } },
  badge:          { label: 'Badge',          icon: 'B',  category: 'display', defaults: { field: '', label: '', thresholds: '{"0.7":"danger","0.4":"warning","0":"success"}' } },
  divider:        { label: 'Divider',        icon: '--', category: 'display', defaults: {} },
  spacer:         { label: 'Spacer',         icon: '|',  category: 'layout',  defaults: { height: 20 } },
  'text-input':   { label: 'Text Input',     icon: 'Aa', category: 'input',   defaults: { name: 'field', label: 'Label', placeholder: '', required: false } },
  textarea:       { label: 'Text Area',      icon: 'P',  category: 'input',   defaults: { name: 'notes', label: 'Notes', placeholder: '', required: false } },
  select:         { label: 'Select',         icon: 'V',  category: 'input',   defaults: { name: 'choice', label: 'Choose', options: 'Option A, Option B, Option C', required: false } },
  checkbox:       { label: 'Checkbox',       icon: 'X',  category: 'input',   defaults: { name: 'confirm', label: 'Confirm' } },
  radio:          { label: 'Radio',          icon: 'O',  category: 'input',   defaults: { name: 'option', label: 'Pick one', options: 'Option A, Option B' } },
  number:         { label: 'Number',         icon: '#',  category: 'input',   defaults: { name: 'amount', label: 'Amount', min: '', max: '', required: false } },
  columns:        { label: 'Columns',        icon: '||', category: 'layout',  defaults: { count: 2, _initChildren: true } },
  section:        { label: 'Section',        icon: '[]', category: 'layout',  defaults: { title: 'Section', collapsible: false } },
  'button-group': { label: 'Action Buttons', icon: '>>', category: 'action',  defaults: { buttons: 'approve:Approve:success,reject:Reject:danger' } },
}

const CATEGORIES = [
  { key: 'display', label: 'DISPLAY' },
  { key: 'input',   label: 'INPUT' },
  { key: 'layout',  label: 'LAYOUT' },
  { key: 'action',  label: 'ACTIONS' },
]

interface PaletteEntry {
  __origin: 'palette'
  type: string
  def: ComponentDef
}

/* Palette items grouped by category (one draggable list per category) */
const PALETTE_BY_CATEGORY: Record<string, PaletteEntry[]> = {}
for (const cat of CATEGORIES) {
  PALETTE_BY_CATEGORY[cat.key] = Object.entries(HITL_COMPONENTS)
    .filter(([, def]) => def.category === cat.key)
    .map(([type, def]) => ({ __origin: 'palette' as const, type, def }))
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface SchemaComponent {
  id: string
  type: string
  props: Record<string, unknown>
  children?: SchemaComponent[][] // For columns: one array per column slot
}

/**
 * React contract was `HitlFormBuilderProps = { templateId?: number; onSave(); onCancel() }`;
 * the Vue port keeps the same contract as `templateId` prop + `save`/`cancel` emits.
 */

/** Object cloned from a palette / data-field drag into the canvas or a column slot */
type DropInfo =
  | { __origin: 'palette'; type: string; def: ComponentDef; key?: string; icon?: string; preview?: string }
  | { __origin: 'data-field'; fieldKey: string; componentType: string; key: string; preview: string; icon: string }

function isDropInfo(value: unknown): value is DropInfo {
  return typeof value === 'object' && value !== null && (value as DropInfo).__origin !== undefined
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function inferFieldType(val: unknown): string {
  if (val === null || val === undefined) return 'text'
  if (typeof val === 'boolean') return 'boolean'
  if (typeof val === 'number') return val >= 0 && val <= 1 ? 'score' : 'number'
  if (typeof val === 'string') {
    if (/^https?:\/\/.*\.(png|jpg|jpeg|gif|svg|webp)/i.test(val)) return 'image'
    if (val.length > 100) return 'longtext'
    return 'text'
  }
  if (Array.isArray(val)) return 'array'
  if (typeof val === 'object') return 'object'
  return 'text'
}

const FIELD_TYPE_ICON: Record<string, string> = {
  number: '#', score: '%', boolean: '?', text: 'T', longtext: 'P',
  image: 'I', array: '[]', object: '{}',
}

const COMPONENT_TYPE_BY_FIELD_TYPE: Record<string, string> = {
  score: 'badge',
  image: 'image',
  array: 'json-viewer',
  object: 'json-viewer',
}

function componentTypeForFieldType(type: string): string {
  return COMPONENT_TYPE_BY_FIELD_TYPE[type] ?? 'data-display'
}

/** Build a cURL payload from schema fields + sample data */
function buildCurlPayload(components: SchemaComponent[], sampleDataJson: string, isProd: boolean): Record<string, unknown> {
  // Collect all field references from display components
  const fields: Record<string, unknown> = {}
  for (const c of components) {
    const p = c.props || {}
    const field = (p.field as string) || ''
    if (field && ['data-display', 'json-viewer', 'image', 'badge'].includes(c.type)) {
      if (c.type === 'badge') fields[field] = 0.5
      else if (c.type === 'image') fields[field] = 'https://example.com/image.png'
      else if (c.type === 'json-viewer') fields[field] = []
      else fields[field] = `value_for_${field}`
    }
  }

  // Override with sample data values if available
  try {
    const sample = JSON.parse(sampleDataJson)
    if (typeof sample === 'object' && sample !== null) {
      for (const [k, v] of Object.entries(sample)) {
        fields[k] = v
      }
    }
  } catch { /* ignore */ }

  if (isProd) {
    return {
      ...fields,
      callback_url: 'https://your-n8n.example.com/webhook/callback',
      priority: 'medium',
      timeout_minutes: 60,
    }
  }
  return fields
}

function fieldPreview(val: unknown): string {
  if (val === null || val === undefined) return 'null'
  if (Array.isArray(val)) return `${val.length} items`
  if (typeof val === 'object') return `${Object.keys(val as Record<string, unknown>).length} keys`
  return String(val).substring(0, 50)
}

/* -------------------------------------------------------------------------- */
/*  DnD group configuration (vue-draggable-plus / Sortable)                    */
/* -------------------------------------------------------------------------- */

/** Palette sources: cloned into canvas/column slots, never modified themselves */
const PALETTE_GROUP = { name: 'palette', pull: 'clone', put: false } as const
/** Data-field sources: same clone behaviour, carrying a bound component type */
const DATAFIELD_GROUP = { name: 'data-field', pull: 'clone', put: false } as const
/** Main canvas: accepts palette + data-field clones, sorts its own items */
const CANVAS_GROUP = { name: 'canvas', put: ['palette', 'data-field'] as const } as const
/** Column slot: accepts palette/data-field clones (and children moving between slots) */
const SLOT_GROUP = { name: 'canvas-slot', put: ['palette', 'data-field', 'canvas-slot'] as const } as const

/* -------------------------------------------------------------------------- */
/*  Inline component preview (render helper)                                  */
/* -------------------------------------------------------------------------- */

/** Parity with the React `ComponentPreview` sub-component */
const ComponentPreview = defineComponent({
  name: 'HitlComponentPreview',
  props: {
    comp: { type: Object as PropType<SchemaComponent>, required: true },
  },
  setup(p) {
    return () => {
      const pr = p.comp.props
      switch (p.comp.type) {
        case 'heading':
          return h('div', { class: 'font-semibold' }, String(pr.text || 'Heading'))
        case 'text':
          return h('div', { class: 'text-[13px]' }, String(pr.text || 'Text content'))
        case 'data-display':
          return h('div', { class: 'text-[13px]' }, [
            h('strong', null, `${String(pr.label || 'Label')}:`),
            ` {${String(pr.field || '...')}}`,
          ])
        case 'json-viewer':
          return h('div', { class: 'font-mono text-[12px]' }, `{ ${String(pr.field || '...')} }`)
        case 'image':
          return pr.src
            ? h('img', { src: String(pr.src), alt: String(pr.alt || ''), class: 'max-w-full max-h-[120px] rounded' })
            : h('div', { class: 'text-[13px] italic' }, `Image: {${String(pr.field || 'url')}}`)
        case 'badge':
          return h('div', { class: 'text-[13px]' }, [
            h('span', { class: 'inline-block px-1.5 rounded bg-bg-alt text-[11px]' }, String(pr.label || 'Badge')),
          ])
        case 'divider':
          return h('hr', { class: 'border-border' })
        case 'spacer':
          return h('div', {
            style: { height: `${Number(pr.height || 20)}px` },
            class: 'bg-bg-alt rounded text-center text-[10px] text-text-xmuted',
          }, `spacer ${String(pr.height || 20)}px`)
        case 'text-input':
        case 'number':
          return h('div', { class: 'text-[13px]' }, [
            h('span', { class: 'font-medium' }, String(pr.label || 'Label')),
            h('div', { class: 'mt-0.5 border border-border rounded px-2 py-0.5 bg-bg text-text-xmuted text-[12px]' }, String(pr.placeholder || pr.name || '')),
          ])
        case 'textarea':
          return h('div', { class: 'text-[13px]' }, [
            h('span', { class: 'font-medium' }, String(pr.label || 'Notes')),
            h('div', { class: 'mt-0.5 border border-border rounded px-2 py-1 bg-bg h-10 text-text-xmuted text-[12px]' }, String(pr.placeholder || '')),
          ])
        case 'select':
          return h('div', { class: 'text-[13px]' }, [
            h('span', { class: 'font-medium' }, String(pr.label || 'Choose')),
            h('div', { class: 'mt-0.5 border border-border rounded px-2 py-0.5 bg-bg text-text-xmuted text-[12px]' }, 'Select...'),
          ])
        case 'checkbox':
          return h('label', { class: 'flex items-center gap-1.5 text-[13px]' }, [
            h('input', { type: 'checkbox', disabled: true }),
            String(pr.label || 'Confirm'),
          ])
        case 'radio':
          return h('div', { class: 'text-[13px] font-medium' }, `${String(pr.label || 'Pick one')}: ${String(pr.options || '')}`)
        case 'columns':
          return h('div', { class: 'text-[13px]' }, `${String(pr.count || 2)} columns`)
        case 'section':
          return h('div', { class: 'text-[13px] font-medium border-l-2 border-primary pl-2' }, `${String(pr.title || 'Section')}${pr.collapsible ? ' (collapsible)' : ''}`)
        case 'button-group': {
          const btns = String(pr.buttons || '').split(',').map((b) => b.split(':'))
          return h('div', { class: 'flex gap-1.5' }, btns.map(([key, label, color], i) =>
            h('span', { key: i, class: cn('px-2 py-0.5 rounded text-[11px] font-medium text-white', color === 'danger' ? 'bg-danger' : color === 'success' ? 'bg-success' : 'bg-primary') }, label || key)))
        }
        default:
          return h('div', { class: 'text-[12px] italic' }, 'Unknown component')
      }
    }
  },
})

/* -------------------------------------------------------------------------- */
/*  Live preview (preview mode)                                               */
/* -------------------------------------------------------------------------- */

/** Parity with the React `LivePreview` sub-component (recursive) */
const LivePreview = defineComponent({
  name: 'HitlLivePreview',
  props: {
    components: { type: Object as PropType<SchemaComponent[]>, required: true },
    sampleData: { type: String, required: true },
  },
  setup(p) {
    return () => {
      let data: Record<string, unknown> = {}
      try { data = JSON.parse(p.sampleData) } catch { /* ignore */ }

      const resolve = (field: unknown): string => {
        const key = String(field || '')
        return key in data ? String(data[key]) : `{${key}}`
      }

      const renderComp = (comp: SchemaComponent): VNode | null => {
        const pr = comp.props
        switch (comp.type) {
          case 'heading': {
            const Tag = `h${Number(pr.level) || 3}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
            return h(Tag, { key: comp.id, class: 'font-bold text-lg' }, String(pr.text))
          }
          case 'text':
            return h('p', { key: comp.id, class: 'text-sm' }, String(pr.text))
          case 'data-display':
            return h('div', { key: comp.id, class: 'text-sm' }, [
              h('strong', null, `${String(pr.label || '')}:`),
              ` ${resolve(pr.field)}`,
            ])
          case 'json-viewer':
            return h('pre', { key: comp.id, class: 'bg-bg-alt rounded p-2 text-xs font-mono overflow-auto' }, JSON.stringify(pr.field ? data[String(pr.field)] : data, null, 2))
          case 'image':
            return h('img', { key: comp.id, src: String(pr.src || '') || resolve(pr.field), alt: String(pr.alt || ''), class: 'max-w-full rounded' })
          case 'badge':
            return h('span', { key: comp.id, class: 'inline-block px-2 py-0.5 rounded bg-bg-alt text-sm' }, String(pr.label || resolve(pr.field)))
          case 'divider':
            return h('hr', { key: comp.id, class: 'border-border' })
          case 'spacer':
            return h('div', { key: comp.id, style: { height: `${Number(pr.height || 20)}px` } })
          case 'text-input':
            return h('div', { key: comp.id, class: 'mb-2' }, [
              h('label', { class: 'mb-0.5 block text-sm font-medium' }, `${String(pr.label || '')}${pr.required ? ' *' : ''}`),
              h('input', { type: 'text', placeholder: String(pr.placeholder || ''), class: 'w-full border border-border rounded px-2 py-1 text-sm bg-bg' }),
            ])
          case 'textarea':
            return h('div', { key: comp.id, class: 'mb-2' }, [
              h('label', { class: 'mb-0.5 block text-sm font-medium' }, `${String(pr.label || '')}${pr.required ? ' *' : ''}`),
              h('textarea', { placeholder: String(pr.placeholder || ''), class: 'w-full border border-border rounded px-2 py-1 text-sm bg-bg min-h-[60px]' }),
            ])
          case 'select': {
            const opts = String(pr.options || '').split(',').map((s) => s.trim()).filter(Boolean)
            return h('div', { key: comp.id, class: 'mb-2' }, [
              h('label', { class: 'mb-0.5 block text-sm font-medium' }, `${String(pr.label || '')}${pr.required ? ' *' : ''}`),
              h(CustomSelect, {
                value: '',
                placeholder: 'Select...',
                class: 'w-full',
                options: [{ value: '', label: 'Select...' }, ...opts.map((o) => ({ value: o, label: o }))],
                onChange: () => {},
              }),
            ])
          }
          case 'checkbox':
            return h('label', { key: comp.id, class: 'flex items-center gap-2 text-sm' }, [
              h('input', { type: 'checkbox' }),
              String(pr.label || ''),
            ])
          case 'radio': {
            const opts = String(pr.options || '').split(',').map((s) => s.trim()).filter(Boolean)
            return h('fieldset', { key: comp.id, class: 'mb-2' }, [
              h('legend', { class: 'mb-1 text-sm font-medium' }, String(pr.label || '')),
              ...opts.map((o) =>
                h('label', { key: o, class: 'flex items-center gap-1.5 text-sm' }, [
                  h('input', { type: 'radio', name: String(pr.name) }),
                  o,
                ])),
            ])
          }
          case 'number':
            return h('div', { key: comp.id, class: 'mb-2' }, [
              h('label', { class: 'mb-0.5 block text-sm font-medium' }, `${String(pr.label || '')}${pr.required ? ' *' : ''}`),
              h('input', { type: 'number', min: String(pr.min || ''), max: String(pr.max || ''), class: 'w-full border border-border rounded px-2 py-1 text-sm bg-bg' }),
            ])
          case 'section':
            return h('div', { key: comp.id, class: 'border-l-2 border-primary pl-3 py-1' }, [
              h('div', { class: 'text-sm font-medium' }, String(pr.title || '')),
            ])
          case 'columns': {
            const colCount = Number(pr.count) || 2
            return h('div', {
              key: comp.id,
              class: 'grid mb-2 gap-3',
              style: { gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` },
            }, [
              ...(comp.children || []).map((col) =>
                h('div', { key: (comp.children || []).indexOf(col) }, col.map((child) => renderComp(child)))),
            ])
          }
          case 'button-group': {
            const btns = String(pr.buttons || '').split(',').map((b) => b.split(':'))
            return h('div', { key: comp.id, class: 'mt-2 flex gap-2' }, btns.map(([key, label, color], i) =>
              h('button', { key: i, class: cn('rounded px-4 py-1.5 text-sm font-medium text-white', color === 'danger' ? 'bg-danger' : color === 'success' ? 'bg-success' : 'bg-primary') }, label || key)))
          }
          default:
            return null
        }
      }

      return h('div', { class: 'space-y-3' }, [
        ...p.components.map((comp) => renderComp(comp)),
        p.components.length === 0 ? h('p', { class: 'text-sm italic text-text-muted' }, 'No components to preview') : null,
      ])
    }
  },
})

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

const props = defineProps<{ templateId?: number }>()
const emit = defineEmits<{
  (e: 'save'): void
  (e: 'cancel'): void
}>()

const toast = useToast()

// Fetch app_url for webhook URLs (so n8n in Docker can reach the library manager)
const { data: smtpSettings } = useQuery({
  queryKey: ['settings-smtp'],
  queryFn: async () => {
    try {
      return await api.get<{ app_url?: string }>('/api/settings/smtp')
    } catch {
      return {} as { app_url?: string }
    }
  },
  staleTime: 300_000,
})

const appBaseUrl = computed(() =>
  ((smtpSettings.value?.app_url || window.location.origin) as string).replace(/\/+$/, ''),
)

/* State */
const name = ref('')
const slug = ref('')
const description = ref('')
const components = ref<SchemaComponent[]>([])
const selectedId = ref<string | null>(null)
const selectedChildId = ref<string | null>(null)
const previewMode = ref(false)
const sampleData = ref('{\n  "amount": 1250,\n  "vendor": "Acme Corp"\n}')
const saving = ref(false)
const captureToken = ref<string | null>(null)
const capturing = ref(false)

/* Load existing template */
interface LoadedTemplate {
  name: string
  slug: string
  description: string
  schema?: { components: SchemaComponent[] }
}

const { data: loadedTemplate } = useQuery({
  queryKey: ['hitl-template', () => props.templateId],
  queryFn: () => api.get<LoadedTemplate>(`/api/hitl/templates/${props.templateId}`),
  enabled: computed(() => !!props.templateId),
  staleTime: Infinity,
  refetchOnWindowFocus: false,
})

const hydrated = ref(false)
watch(loadedTemplate, (template) => {
  if (!template || hydrated.value) return
  name.value = template.name
  slug.value = template.slug
  description.value = template.description || ''
  const hydrateComp = (c: Partial<SchemaComponent>): SchemaComponent => ({
    id: c.id || uid(),
    type: c.type || 'text',
    props: c.props || {},
    ...(c.children ? { children: c.children.map((col) => col.map(hydrateComp)) } : {}),
  })
  components.value = (template.schema?.components ?? []).map(hydrateComp)
  hydrated.value = true
}, { immediate: true })

const selectedComp = computed<SchemaComponent | null>(() => {
  // Check for selected child inside columns first
  if (selectedChildId.value) {
    for (const c of components.value) {
      if (c.children) {
        for (const col of c.children) {
          const found = col.find((ch) => ch.id === selectedChildId.value)
          if (found) return found
        }
      }
    }
  }
  return components.value.find((c) => c.id === selectedId.value) ?? null
})

function compLabel(comp: SchemaComponent): string {
  return HITL_COMPONENTS[comp.type]?.label ?? comp.type
}

/* -------------------------------------------------------------------------- */
/*  DnD handlers                                                              */
/* -------------------------------------------------------------------------- */

/** Drag-over highlight state (dnd-kit's `isOver` equivalent via native counters) */
const zoneDepths = ref<Record<string, number>>({})
const enterZone = (key: string) => { zoneDepths.value[key] = (zoneDepths.value[key] ?? 0) + 1 }
const leaveZone = (key: string) => { zoneDepths.value[key] = Math.max((zoneDepths.value[key] ?? 0) - 1, 0) }
const isZoneOver = (key: string) => (zoneDepths.value[key] ?? 0) > 0
/** Canvas is only "over" when the pointer is not inside a nested column slot */
const isCanvasOver = computed(() =>
  (zoneDepths.value['canvas'] ?? 0) > 0 &&
  !Object.keys(zoneDepths.value).some((k) => k.startsWith('slot-') && zoneDepths.value[k] > 0),
)
const clearZones = () => { zoneDepths.value = {} }

function makeNewComp(type: string, extraProps?: Record<string, unknown>): SchemaComponent {
  const def = HITL_COMPONENTS[type]
  const comp: SchemaComponent = { id: uid(), type, props: { ...def?.defaults, ...extraProps } }
  if (type === 'columns') {
    const count = Number(comp.props.count) || 2
    comp.children = Array.from({ length: count }, () => [])
    delete comp.props._initChildren
  }
  return comp
}

/** Turn a dropped wrapper (from the palette or a data field) into a real component */
function buildDropComponent(info: DropInfo): SchemaComponent | null {
  if (info.__origin === 'palette') {
    const def = HITL_COMPONENTS[info.type]
    if (!def) return null
    return makeNewComp(info.type)
  }
  const fieldKey = info.fieldKey
  const type = info.componentType
  const def = HITL_COMPONENTS[type]
  if (!def || !fieldKey) return null
  const label = fieldKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return makeNewComp(type, { field: fieldKey, label })
}

/* Palette / data-field → main canvas: add a new component */
function onCanvasAdd(e: DraggableEvent) {
  const info = e.clonedData as DropInfo | undefined
  // vue-draggable-plus already inserted the cloned source item into the list;
  // replace the placeholder wrapper with the real component.
  if (!isDropInfo(info)) return
  const list = components.value
  const idx = list.findIndex((c) => isDropInfo(c))
  if (idx < 0) return
  const newComp = buildDropComponent(info)
  if (newComp) {
    list[idx] = newComp
    selectedId.value = newComp.id
    selectedChildId.value = null
  } else {
    list.splice(idx, 1)
  }
  clearZones()
}

function setChildren(parentId: string, colIndex: number, arr: SchemaComponent[]) {
  const parent = components.value.find((c) => c.id === parentId)
  if (!parent || !parent.children) return
  parent.children[colIndex] = arr
}

/* Palette / data-field → column slot: add via the slot's own draggable */
function onSlotAdd(parentId: string, colIndex: number, e: DraggableEvent) {
  const info = e.clonedData as DropInfo | undefined
  if (!isDropInfo(info)) return // plain children moving between slots are synced by v-model
  const parent = components.value.find((c) => c.id === parentId)
  const col = parent?.children?.[colIndex]
  if (!col) return
  const idx = col.findIndex((c) => isDropInfo(c))
  if (idx < 0) return
  const newComp = buildDropComponent(info)
  if (newComp) {
    col[idx] = newComp
    selectedChildId.value = newComp.id
    selectedId.value = parentId
  } else {
    col.splice(idx, 1)
  }
  clearZones()
}

function selectComponent(id: string) {
  selectedId.value = id
  selectedChildId.value = null
}

function selectChild(parentId: string, childId: string) {
  selectedChildId.value = childId
  selectedId.value = parentId
}

/* Delete a child inside a column */
function deleteChild(parentId: string, colIdx: number, childId: string) {
  const parent = components.value.find((c) => c.id === parentId)
  if (!parent || !parent.children) return
  parent.children[colIdx] = parent.children[colIdx].filter((ch) => ch.id !== childId)
  if (selectedChildId.value === childId) selectedChildId.value = null
}

/* Update component props (supports both top-level and children) */
function updateProps(id: string, newProps: Record<string, unknown>) {
  // Check if it's a child inside columns
  components.value = components.value.map((c) => {
    if (c.id === id) return { ...c, props: newProps }
    if (c.children) {
      const updated = c.children.map((col) => col.map((ch) => (ch.id === id ? { ...ch, props: newProps } : ch)))
      if (updated.some((col, i) => col !== c.children![i])) return { ...c, children: updated }
    }
    return c
  })
}

/* Delete component (top-level) */
function deleteComponent(id: string) {
  components.value = components.value.filter((c) => c.id !== id)
  if (selectedId.value === id) {
    selectedId.value = null
    selectedChildId.value = null
  }
}

/* -------------------------------------------------------------------------- */
/*  Property editor                                                           */
/* -------------------------------------------------------------------------- */

type PropertyFieldDef =
  | { id: string; kind: 'text' | 'textarea'; label: string; propKey: string }
  | { id: string; kind: 'select'; label: string; propKey: string; options: string[] }
  | { id: string; kind: 'check'; label: string; propKey: string }

const propertyFields = computed<PropertyFieldDef[] | null>(() => {
  const comp = selectedComp.value
  if (!comp) return null
  const fieldId = (key: string) => `prop-${comp.id}-${key}`
  const text = (label: string, propKey: string, kind: 'text' | 'textarea' = 'text'): PropertyFieldDef =>
    ({ id: fieldId(propKey), kind, label, propKey })
  const select = (label: string, propKey: string, options: string[]): PropertyFieldDef =>
    ({ id: fieldId(propKey), kind: 'select', label, propKey, options })
  const check = (label: string, propKey: string): PropertyFieldDef =>
    ({ id: fieldId(propKey), kind: 'check', label, propKey })

  switch (comp.type) {
    case 'heading':
      return [text('Text', 'text'), select('Level', 'level', ['1', '2', '3', '4', '5', '6'])]
    case 'text':
      return [text('Text', 'text', 'textarea'), select('Format', 'format', ['plain', 'markdown'])]
    case 'data-display':
      return [text('Field', 'field'), text('Label', 'label'), select('Format', 'format', ['text', 'currency', 'markdown', 'date'])]
    case 'json-viewer':
      return [text('Field', 'field')]
    case 'image':
      return [text('Direct URL', 'src'), text('Data Field', 'field'), text('Alt', 'alt')]
    case 'badge':
      return [text('Field', 'field'), text('Label', 'label'), text('Thresholds (JSON)', 'thresholds', 'textarea')]
    case 'text-input':
    case 'textarea':
      return [text('Name', 'name'), text('Label', 'label'), text('Placeholder', 'placeholder'), check('Required', 'required')]
    case 'select':
      return [text('Name', 'name'), text('Label', 'label'), text('Options (comma-separated)', 'options', 'textarea'), check('Required', 'required')]
    case 'checkbox':
      return [text('Name', 'name'), text('Label', 'label')]
    case 'radio':
      return [text('Name', 'name'), text('Label', 'label'), text('Options (comma-separated)', 'options', 'textarea')]
    case 'number':
      return [text('Name', 'name'), text('Label', 'label'), text('Min', 'min'), text('Max', 'max'), check('Required', 'required')]
    case 'columns':
      return [select('Columns', 'count', ['2', '3', '4'])]
    case 'section':
      return [text('Title', 'title'), check('Collapsible', 'collapsible')]
    case 'button-group':
      return [text('Buttons (key:Label:color, ...)', 'buttons', 'textarea')]
    default:
      return null
  }
})

const propValue = (key: string) => String(selectedComp.value?.props[key] ?? '')
const propBool = (key: string) => Boolean(selectedComp.value?.props[key])

function setProp(key: string, val: unknown) {
  if (!selectedComp.value) return
  updateProps(selectedComp.value.id, { ...selectedComp.value.props, [key]: val })
}

function onPropTextareaInput(fieldDef: PropertyFieldDef, e: Event) {
  const target = e.target as HTMLTextAreaElement | null
  if (target) setProp(fieldDef.propKey, target.value)
}

/* -------------------------------------------------------------------------- */
/*  Webhook capture                                                          */
/* -------------------------------------------------------------------------- */

let capturePoll: ReturnType<typeof setInterval> | null = null
let captureStopTimer: ReturnType<typeof setTimeout> | null = null

function clearCaptureTimers() {
  if (capturePoll) { clearInterval(capturePoll); capturePoll = null }
  if (captureStopTimer) { clearTimeout(captureStopTimer); captureStopTimer = null }
}

onBeforeUnmount(clearCaptureTimers)

async function startCapture() {
  try {
    const res = await api.post<{ token: string }>('/api/hitl/capture')
    captureToken.value = res.token
    capturing.value = true
    // Poll every 2s
    capturePoll = setInterval(async () => {
      if (!captureToken.value) return
      try {
        const check = await api.get<{ captured?: boolean; payload?: Record<string, unknown> }>(`/api/hitl/capture/${captureToken.value}`)
        if (check.captured && check.payload) {
          clearCaptureTimers()
          // Unwrap: n8n sends arrays like [{...}] — extract first element
          const raw = check.payload
          const obj = Array.isArray(raw) ? (raw[0] ?? {}) : raw
          sampleData.value = JSON.stringify(obj, null, 2)
          captureToken.value = null
          capturing.value = false
          toast.success(`Webhook captured! ${Object.keys(obj).length} fields found.`)
        }
      } catch {
        clearCaptureTimers()
        captureToken.value = null
        capturing.value = false
      }
    }, 2000)
    // Auto-stop after 60s
    captureStopTimer = setTimeout(() => {
      if (capturePoll !== null) clearInterval(capturePoll)
      capturePoll = null
      captureStopTimer = null
      captureToken.value = null
      capturing.value = false
    }, 60000)
  } catch {
    toast.error('Failed to start capture')
  }
}

function stopCapture() {
  if (captureToken.value) {
    api.delete(`/api/hitl/capture/${captureToken.value}`).catch(() => {})
    clearCaptureTimers()
    captureToken.value = null
    capturing.value = false
  }
}

const captureUrl = computed(() => (captureToken.value ? `${appBaseUrl.value}/api/hitl/capture/${captureToken.value}` : ''))
const prodWebhookUrl = computed(() => (slug.value ? `${appBaseUrl.value}/api/hitl/webhook/${slug.value}` : ''))
const testWebhookUrl = computed(() => (slug.value ? `${appBaseUrl.value}/api/hitl/webhook/test/${slug.value}` : ''))

/* -------------------------------------------------------------------------- */
/*  Data fields palette                                                      */
/* -------------------------------------------------------------------------- */

interface DataField {
  key: string
  type: string
  preview: string
  componentType: string
}

/* Parse sample data for data fields palette */
const dataFields = computed<DataField[]>(() => {
  try {
    let parsed: unknown = JSON.parse(sampleData.value)
    if (typeof parsed !== 'object' || parsed === null) return []
    // Unwrap arrays (n8n sends [{...}])
    if (Array.isArray(parsed)) parsed = parsed[0] ?? {}
    return Object.entries(parsed as Record<string, unknown>).map(([key, val]) => {
      const type = inferFieldType(val)
      return { key, type, componentType: componentTypeForFieldType(type), preview: fieldPreview(val) }
    })
  } catch { return [] }
})

const dataFieldEntries = computed<DropInfo[]>(() =>
  dataFields.value.map((f) => ({
    __origin: 'data-field',
    fieldKey: f.key,
    componentType: f.componentType,
    key: f.key,
    preview: f.preview,
    icon: FIELD_TYPE_ICON[f.type] || '·',
  })),
)

/* -------------------------------------------------------------------------- */
/*  Form fields                                                               */
/* -------------------------------------------------------------------------- */

/* Auto-slug from name */
function handleNameChange(val: string) {
  name.value = val
  slug.value = slugify(val)
}

/* Save */
async function handleSave() {
  if (!name.value.trim()) { toast.error('Template name is required'); return }
  saving.value = true
  try {
    const body = { name: name.value, description: description.value, slug: slug.value, schema: { components: components.value } }
    if (props.templateId) {
      await api.put(`/api/hitl/templates/${props.templateId}`, body)
    } else {
      await api.post('/api/hitl/templates', body)
    }
    toast.success('Template saved')
    emit('save')
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : 'Failed to save template'
    toast.error(msg)
  } finally {
    saving.value = false
  }
}

/* Webhook URL helpers */
function refreshSampleData() {
  // Parity with the React identity update `setSampleData((s) => s)`
  sampleData.value = sampleData.value
}

function selectAllTarget(e: Event) {
  const target = e.target as HTMLInputElement | null
  target?.select()
}

function copyText(value: string, message = 'Copied!') {
  navigator.clipboard.writeText(value)
  toast.success(message)
}

function copyCurl(prod: boolean) {
  const url = prod ? prodWebhookUrl.value : testWebhookUrl.value
  const payload = buildCurlPayload(components.value, sampleData.value, prod)
  const curl = `curl -X POST "${url}" \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(payload, null, 2)}'`
  navigator.clipboard.writeText(curl)
  toast.success('cURL copied!')
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Top bar -->
    <div class="flex flex-wrap items-center gap-3 px-4 py-3 flex-shrink-0 border-b border-border bg-card">
      <N8nInput
        :model-value="name"
        type="text"
        placeholder="e.g. Invoice Approval"
        class="w-[200px]"
        @update:model-value="handleNameChange"
      />
      <N8nInput
        v-model="slug"
        type="text"
        placeholder="e.g. invoice-approval"
        class="w-[180px] text-text-muted"
      />
      <N8nInput
        v-model="description"
        type="text"
        placeholder="Optional description"
        class="min-w-[160px] flex-1"
      />
      <div class="ml-auto flex items-center gap-2">
        <button
          class="flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm font-medium transition-colors"
          :class="previewMode ? 'border-primary bg-primary text-white' : 'border-border hover:bg-card-hover'"
          @click="previewMode = !previewMode"
        >
          <N8nIcon icon="eye" :size="14" /> {{ previewMode ? 'Builder' : 'Preview' }}
        </button>
        <N8nButton
          variant="destructive"
          size="medium"
          icon="save"
          :label="saving ? 'Saving...' : 'Save Template'"
          :loading="saving"
          @click="handleSave"
        />
        <N8nButton variant="outline" size="medium" label="Cancel" @click="emit('cancel')" />
      </div>
    </div>

    <!-- Webhook URLs -->
    <div v-if="slug" class="px-4 py-2 flex-shrink-0 border-b border-border bg-card text-xs">
      <div class="mb-1 flex items-center gap-1 text-text-muted">
        <span class="font-semibold">Webhook URLs</span>
        <span class="text-text-xmuted">(requires API key: Authorization: Bearer n8nlib_xxx)</span>
      </div>
      <div class="mb-1 flex items-center gap-2">
        <span class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-success/10 text-success">PROD</span>
        <input
          type="text"
          readonly
          :value="prodWebhookUrl"
          class="flex-1 rounded border border-border px-2 py-1 bg-bg font-mono text-[11px] text-text-dark"
          @click="selectAllTarget"
        />
        <button class="rounded border border-border px-2 py-1 text-[11px] hover:bg-bg" @click="copyText(prodWebhookUrl)">Copy</button>
        <button class="rounded border border-border px-2 py-1 text-[11px] hover:bg-bg" @click="copyCurl(true)">&gt;_ cURL</button>
      </div>
      <div class="flex items-center gap-2">
        <span class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-warning/10 text-warning">TEST</span>
        <input
          type="text"
          readonly
          :value="testWebhookUrl"
          class="flex-1 rounded border border-border px-2 py-1 bg-bg font-mono text-[11px] text-text-dark"
          @click="selectAllTarget"
        />
        <button class="rounded border border-border px-2 py-1 text-[11px] hover:bg-bg" @click="copyText(testWebhookUrl)">Copy</button>
        <button class="rounded border border-border px-2 py-1 text-[11px] hover:bg-bg" @click="copyCurl(false)">&gt;_ cURL</button>
      </div>
    </div>

    <!-- Body -->
    <template v-if="previewMode">
      <!-- ---- Preview mode ---- -->
      <div class="flex flex-1 overflow-hidden">
        <div class="flex w-[400px] flex-col gap-3 overflow-y-auto border-r border-border bg-card p-5">
          <N8nHeading size="medium" tag="h3">Sample Data (JSON)</N8nHeading>
          <textarea
            v-model="sampleData"
            class="min-h-[200px] flex-1 rounded border border-border px-3 py-2 bg-bg font-mono text-sm resize-none"
          />
          <button
            class="self-start rounded border border-border px-3 py-1.5 text-sm hover:bg-card-hover"
            @click="refreshSampleData"
          >
            Refresh
          </button>
        </div>
        <div class="flex-1 overflow-y-auto p-6">
          <div class="mx-auto max-w-[600px] rounded-xl border border-border bg-card p-6">
            <LivePreview :components="components" :sample-data="sampleData" />
          </div>
        </div>
      </div>
    </template>
    <template v-else>
      <!-- ---- Builder mode ---- -->
      <div class="flex flex-1 overflow-hidden">
        <!-- Left: Palette -->
        <div class="w-[280px] flex-shrink-0 overflow-y-auto border-r border-border bg-card">
          <template v-for="cat in CATEGORIES" :key="cat.key">
            <div v-if="PALETTE_BY_CATEGORY[cat.key]?.length">
              <div class="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.08em] text-text-xmuted">
                {{ cat.label }}
              </div>
              <VueDraggable
                :model-value="PALETTE_BY_CATEGORY[cat.key]"
                :group="PALETTE_GROUP"
                :sort="false"
                draggable=".palette-item"
                ghost-class="opacity-40"
                class="px-2"
                @end="clearZones"
              >
                <div
                  v-for="item in PALETTE_BY_CATEGORY[cat.key]"
                  :key="item.type"
                  class="palette-item mb-1 flex cursor-grab select-none items-center gap-2 rounded-md border border-border-light px-2.5 py-1.5 text-[13px] hover:border-primary"
                >
                  <span class="w-5 text-center font-mono text-[11px] text-text-muted">{{ item.def.icon }}</span>
                  <span>{{ item.def.label }}</span>
                </div>
              </VueDraggable>
            </div>
          </template>

          <!-- Data Fields section -->
          <div class="mt-2 border-t border-border px-2 pt-2">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-[10px] font-bold uppercase tracking-[0.08em] text-text-xmuted">Data Fields</span>
            </div>

            <!-- Webhook capture card -->
            <div v-if="capturing && captureUrl" class="mb-2 rounded-xl border border-success/30 bg-success-light p-4">
              <div class="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-success">
                <span class="health-pulse h-2 w-2 rounded-full bg-success" />
                Listening for webhook...
              </div>
              <div class="mb-2 flex items-center gap-1">
                <input
                  type="text"
                  readonly
                  :value="captureUrl"
                  class="flex-1 truncate rounded border border-border px-2 py-1 bg-bg-light font-mono text-[11px]"
                  @click="selectAllTarget"
                />
                <button
                  class="shrink-0 rounded border border-border p-1 transition-colors hover:bg-bg"
                  title="Copy URL"
                  @click="copyText(captureUrl, 'URL copied!')"
                >
                  <N8nIcon icon="copy" :size="14" />
                </button>
              </div>
              <div class="mb-2 text-[10px] text-text-muted">
                Send a POST request with JSON body to this URL from your n8n workflow
              </div>
              <button
                class="flex w-full items-center justify-center gap-1.5 rounded-md border border-danger/30 py-1.5 text-[11px] font-semibold text-danger transition-colors hover:bg-danger-light"
                @click="stopCapture"
              >
                <span class="h-2 w-2 rounded-sm bg-danger" /> Stop listening
              </button>
            </div>
            <button
              v-else
              class="mb-2 w-full rounded-lg border border-primary/30 py-2 text-[11px] font-semibold text-primary transition-colors hover:bg-primary-light"
              @click="startCapture"
            >
              Listen for webhook...
            </button>

            <VueDraggable
              v-if="dataFieldEntries.length > 0"
              :model-value="dataFieldEntries"
              :group="DATAFIELD_GROUP"
              :sort="false"
              draggable=".datafield-item"
              ghost-class="opacity-40"
              class="space-y-1"
              @end="clearZones"
            >
              <div
                v-for="f in dataFieldEntries"
                :key="f.key"
                class="datafield-item flex cursor-grab select-none items-center gap-1.5 rounded border border-border-light px-2 py-1 text-[12px] hover:border-primary"
              >
                <span class="w-4 text-center font-mono text-[10px] text-text-xmuted">{{ f.icon }}</span>
                <div class="min-w-0 flex-1">
                  <div class="truncate font-semibold">{{ f.key }}</div>
                  <div class="truncate text-[10px] text-text-muted">{{ f.preview }}</div>
                </div>
              </div>
            </VueDraggable>
            <div v-else class="py-1 text-[11px] text-text-xmuted">
              No data fields. Use webhook capture or enter sample data in Preview mode.
            </div>
          </div>
        </div>

        <!-- Center: Canvas -->
        <VueDraggable
          v-model="components"
          :group="CANVAS_GROUP"
          draggable=".canvas-item"
          handle=".drag-handle"
          :animation="150"
          class="min-h-[400px] flex-1 overflow-y-auto bg-bg p-4 transition-colors"
          :class="{ 'bg-primary/5': isCanvasOver }"
          @add="onCanvasAdd"
          @end="clearZones"
          @dragenter="enterZone('canvas')"
          @dragleave="leaveZone('canvas')"
        >
          <div v-if="components.length === 0" class="flex h-full items-center justify-center py-20 text-sm italic text-text-muted">
            Drag components here to build your form
          </div>

          <div
            v-for="comp in components"
            :key="comp.id"
            class="canvas-item group mb-2 cursor-pointer overflow-hidden rounded-xl border border-border bg-card"
            :class="{ 'ring-2 ring-primary': comp.id === selectedId }"
            @click.stop="selectComponent(comp.id)"
          >
            <!-- header -->
            <div class="flex items-center justify-between bg-bg-alt px-2 py-1">
              <div class="flex items-center gap-1.5">
                <span class="drag-handle cursor-grab text-text-muted"><N8nIcon icon="grip-vertical" :size="14" /></span>
                <span class="text-[10px] font-bold uppercase tracking-wider text-danger">
                  {{ compLabel(comp) }}
                </span>
              </div>
              <button
                class="text-text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                @click.stop="deleteComponent(comp.id)"
              >
                <N8nIcon icon="x" :size="14" />
              </button>
            </div>

            <!-- preview / column slots -->
            <div v-if="comp.type === 'columns' && comp.children" class="px-3 py-2">
              <div
                class="grid gap-2"
                :style="{ gridTemplateColumns: `repeat(${comp.children.length}, minmax(0, 1fr))` }"
              >
                <VueDraggable
                  v-for="(colItems, colIdx) in comp.children"
                  :key="`${comp.id}-${colIdx}`"
                  :model-value="colItems"
                  :group="SLOT_GROUP"
                  draggable=".slot-child"
                  :animation="150"
                  class="flex-1 rounded border border-dashed border-border p-2 transition-colors"
                  :class="{ 'border-primary bg-primary/10': isZoneOver(`slot-${comp.id}-${colIdx}`) }"
                  @update:model-value="(arr: SchemaComponent[]) => setChildren(comp.id, colIdx, arr)"
                  @add="onSlotAdd(comp.id, colIdx, $event)"
                  @end="clearZones"
                  @dragenter="enterZone(`slot-${comp.id}-${colIdx}`)"
                  @dragleave="leaveZone(`slot-${comp.id}-${colIdx}`)"
                >
                  <div v-if="colItems.length === 0" class="py-3 text-center text-[11px] italic text-text-xmuted">Drop here</div>
                  <template v-else>
                    <div
                      v-for="child in colItems"
                      :key="child.id"
                      class="slot-child group/child mb-1 cursor-pointer rounded border border-border bg-card px-2 py-1 text-sm text-text-muted"
                      :class="{ 'ring-2 ring-primary': child.id === selectedChildId }"
                      @click.stop="selectChild(comp.id, child.id)"
                    >
                      <div class="flex items-center justify-between">
                        <span class="text-[10px] font-bold uppercase tracking-wider text-danger">
                          {{ compLabel(child) }}
                        </span>
                        <button
                          class="text-text-muted opacity-0 transition-opacity hover:text-danger group-hover/child:opacity-100"
                          @click.stop="deleteChild(comp.id, colIdx, child.id)"
                        >
                          <N8nIcon icon="x" :size="12" />
                        </button>
                      </div>
                      <ComponentPreview :comp="child" />
                    </div>
                  </template>
                </VueDraggable>
              </div>
            </div>
            <div v-else class="px-3 py-2 text-sm text-text-muted">
              <ComponentPreview :comp="comp" />
            </div>
          </div>
        </VueDraggable>

        <!-- Right: Properties -->
        <div class="w-[280px] flex-shrink-0 overflow-y-auto border-l border-border bg-card">
          <template v-if="selectedComp">
            <div class="flex items-center justify-between px-3 pb-1 pt-3">
              <span class="text-sm font-semibold">{{ compLabel(selectedComp) }}</span>
              <button class="text-text-muted hover:text-danger" @click="deleteComponent(selectedComp.id)">
                <N8nIcon icon="trash-2" :size="14" />
              </button>
            </div>
            <div class="p-3">
              <template v-if="propertyFields">
                <template v-for="f in propertyFields" :key="f.id">
                  <!-- checkbox field -->
                  <label v-if="f.kind === 'check'" class="mb-2 flex items-center gap-2 text-sm">
                    <N8nSwitch
                      :model-value="propBool(f.propKey)"
                      size="small"
                      @update:model-value="(v: boolean) => setProp(f.propKey, v)"
                    />
                    {{ f.label }}
                  </label>
                  <!-- select field -->
                  <div v-else-if="f.kind === 'select'" class="mb-2">
                    <label :for="f.id" class="mb-0.5 block text-[12px] font-medium text-text-muted">{{ f.label }}</label>
                    <N8nSelect
                      :id="f.id"
                      :model-value="propValue(f.propKey)"
                      :filterable="false"
                      class="w-full"
                      @update:model-value="(v: unknown) => setProp(f.propKey, String(v))"
                    >
                      <N8nOption v-for="o in f.options" :key="o" :value="o" :label="o">{{ o }}</N8nOption>
                    </N8nSelect>
                  </div>
                  <!-- textarea field -->
                  <div v-else-if="f.kind === 'textarea'" class="mb-2">
                    <label :for="f.id" class="mb-0.5 block text-[12px] font-medium text-text-muted">{{ f.label }}</label>
                    <textarea
                      :id="f.id"
                      :value="propValue(f.propKey)"
                      class="min-h-[60px] w-full rounded border border-border bg-bg px-2 py-1 text-sm resize-y"
                      @input="onPropTextareaInput(f, $event)"
                    />
                  </div>
                  <!-- text field -->
                  <div v-else class="mb-2">
                    <label :for="f.id" class="mb-0.5 block text-[12px] font-medium text-text-muted">{{ f.label }}</label>
                    <N8nInput
                      :id="f.id"
                      type="text"
                      :model-value="propValue(f.propKey)"
                      class="w-full"
                      @update:model-value="(v: string) => setProp(f.propKey, v)"
                    />
                  </div>
                </template>
              </template>
              <p v-else class="text-sm italic text-text-muted">No editable properties</p>
            </div>
          </template>
          <div v-else class="flex h-full items-center justify-center px-4 text-center text-sm italic text-text-muted">
            Select a component to edit its properties
          </div>
        </div>
      </div>
    </template>
  </div>
</template>