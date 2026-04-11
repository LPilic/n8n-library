import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import {
  DndContext, DragOverlay, useSensor, useSensors, PointerSensor, useDroppable, useDraggable,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { X, GripVertical, Eye, Save, Trash2 } from 'lucide-react'

/* -------------------------------------------------------------------------- */
/*  Component definitions                                                     */
/* -------------------------------------------------------------------------- */

const HITL_COMPONENTS: Record<string, { label: string; icon: string; category: string; defaults: Record<string, unknown> }> = {
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

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface SchemaComponent {
  id: string
  type: string
  props: Record<string, unknown>
  children?: SchemaComponent[][] // For columns: one array per column slot
}

export interface HitlFormBuilderProps {
  templateId?: number
  onSave: () => void
  onCancel: () => void
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
/*  Palette item (draggable source)                                           */
/* -------------------------------------------------------------------------- */

function PaletteItem({ type, def }: { type: string; def: typeof HITL_COMPONENTS[string] }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${type}`,
    data: { origin: 'palette', type },
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'border border-border-light rounded-md px-2.5 py-1.5 cursor-grab text-[13px] flex items-center gap-2 hover:border-primary mb-1 select-none',
        isDragging && 'opacity-40',
      )}
    >
      <span className="w-5 text-center font-mono text-text-muted text-[11px]">{def.icon}</span>
      <span>{def.label}</span>
    </div>
  )
}

function DataFieldItem({ field }: { field: { key: string; type: string; preview: string } }) {
  const componentType = field.type === 'score' ? 'badge' : field.type === 'image' ? 'image' : field.type === 'array' || field.type === 'object' ? 'json-viewer' : 'data-display'
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `datafield-${field.key}`,
    data: { origin: 'data-field', fieldKey: field.key, componentType },
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'border border-border-light rounded px-2 py-1 text-[12px] cursor-grab hover:border-primary flex items-center gap-1.5 select-none',
        isDragging && 'opacity-40',
      )}
    >
      <span className="w-4 text-center font-mono text-text-xmuted text-[10px]">{FIELD_TYPE_ICON[field.type] || '·'}</span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{field.key}</div>
        <div className="text-[10px] text-text-muted truncate">{field.preview}</div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Sortable canvas item                                                      */
/* -------------------------------------------------------------------------- */

function CanvasItem({
  comp, selected, onSelect, onDelete, selectedChildId, onSelectChild, onDeleteChild,
}: {
  comp: SchemaComponent; selected: boolean; onSelect: () => void; onDelete: () => void
  selectedChildId?: string | null; onSelectChild: (id: string) => void; onDeleteChild: (parentId: string, colIdx: number, childId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: comp.id,
    data: { origin: 'canvas' },
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const def = HITL_COMPONENTS[comp.type]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-card border border-border rounded-md mb-2 overflow-hidden group',
        selected && 'ring-2 ring-primary',
      )}
      onClick={onSelect}
    >
      {/* header */}
      <div className="flex items-center justify-between px-2 py-1 bg-muted/30">
        <div className="flex items-center gap-1.5">
          <span {...attributes} {...listeners} className="cursor-grab text-text-muted">
            <GripVertical size={14} />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-danger">
            {def?.label ?? comp.type}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-opacity"
        >
          <X size={14} />
        </button>
      </div>

      {/* preview / column slots */}
      {comp.type === 'columns' && comp.children ? (
        <div className="px-3 py-2">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${comp.children.length}, minmax(0, 1fr))` }}>
            {comp.children.map((colItems, colIdx) => (
              <ColumnSlotDropZone key={colIdx} parentId={comp.id} colIndex={colIdx}>
                {colItems.length === 0 ? (
                  <div className="text-[11px] text-text-xmuted italic text-center py-3">Drop here</div>
                ) : (
                  colItems.map(child => (
                    <div
                      key={child.id}
                      className={cn(
                        'bg-card border border-border rounded mb-1 px-2 py-1 text-sm text-text-muted cursor-pointer group/child',
                        child.id === selectedChildId && 'ring-2 ring-primary',
                      )}
                      onClick={(e) => { e.stopPropagation(); onSelectChild(child.id) }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-danger">
                          {HITL_COMPONENTS[child.type]?.label ?? child.type}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteChild(comp.id, colIdx, child.id) }}
                          className="opacity-0 group-hover/child:opacity-100 text-text-muted hover:text-danger"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <ComponentPreview comp={child} />
                    </div>
                  ))
                )}
              </ColumnSlotDropZone>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-3 py-2 text-sm text-text-muted">
          <ComponentPreview comp={comp} />
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Inline component preview                                                  */
/* -------------------------------------------------------------------------- */

function ComponentPreview({ comp }: { comp: SchemaComponent }) {
  const p = comp.props
  switch (comp.type) {
    case 'heading':
      return <div className="font-semibold">{String(p.text || 'Heading')}</div>
    case 'text':
      return <div className="text-[13px]">{String(p.text || 'Text content')}</div>
    case 'data-display':
      return <div className="text-[13px]"><strong>{String(p.label || 'Label')}:</strong> {`{${String(p.field || '...')}}`}</div>
    case 'json-viewer':
      return <div className="font-mono text-[12px]">{`{ ${String(p.field || '...')} }`}</div>
    case 'image':
      return p.src ? <img src={String(p.src)} alt={String(p.alt || '')} className="max-w-full max-h-[120px] rounded" /> : <div className="text-[13px] italic">Image: {`{${String(p.field || 'url')}}`}</div>
    case 'badge':
      return <div className="text-[13px]"><span className="inline-block px-1.5 rounded bg-muted text-[11px]">{String(p.label || 'Badge')}</span></div>
    case 'divider':
      return <hr className="border-border" />
    case 'spacer':
      return <div style={{ height: Number(p.height || 20) }} className="bg-muted/20 rounded text-center text-[10px] text-text-xmuted leading-[20px]">spacer {String(p.height || 20)}px</div>
    case 'text-input':
    case 'number':
      return <div className="text-[13px]"><span className="font-medium">{String(p.label || 'Label')}</span><div className="mt-0.5 border border-border rounded px-2 py-0.5 bg-bg text-text-xmuted text-[12px]">{String(p.placeholder || p.name || '')}</div></div>
    case 'textarea':
      return <div className="text-[13px]"><span className="font-medium">{String(p.label || 'Notes')}</span><div className="mt-0.5 border border-border rounded px-2 py-1 bg-bg h-10 text-text-xmuted text-[12px]">{String(p.placeholder || '')}</div></div>
    case 'select':
      return <div className="text-[13px]"><span className="font-medium">{String(p.label || 'Choose')}</span><div className="mt-0.5 border border-border rounded px-2 py-0.5 bg-bg text-text-xmuted text-[12px]">Select...</div></div>
    case 'checkbox':
      return <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" disabled />{String(p.label || 'Confirm')}</label>
    case 'radio':
      return <div className="text-[13px] font-medium">{String(p.label || 'Pick one')}: {String(p.options || '')}</div>
    case 'columns':
      return <div className="text-[13px]">{String(p.count || 2)} columns</div>
    case 'section':
      return <div className="text-[13px] font-medium border-l-2 border-primary pl-2">{String(p.title || 'Section')}{p.collapsible ? ' (collapsible)' : ''}</div>
    case 'button-group': {
      const btns = String(p.buttons || '').split(',').map(b => b.split(':'))
      return (
        <div className="flex gap-1.5">
          {btns.map(([key, label, color], i) => (
            <span key={i} className={cn('px-2 py-0.5 rounded text-[11px] font-medium text-white', color === 'danger' ? 'bg-danger' : color === 'success' ? 'bg-success' : 'bg-primary')}>{label || key}</span>
          ))}
        </div>
      )
    }
    default:
      return <div className="text-[12px] italic">Unknown component</div>
  }
}

/* -------------------------------------------------------------------------- */
/*  Property editor                                                           */
/* -------------------------------------------------------------------------- */

function PropertyEditor({
  comp, onChange,
}: {
  comp: SchemaComponent; onChange: (props: Record<string, unknown>) => void
}) {
  const p = comp.props
  const set = (key: string, val: unknown) => onChange({ ...p, [key]: val })

  const field = (label: string, key: string, type: 'input' | 'textarea' | 'checkbox' | 'select' = 'input', options?: string[]) => {
    const id = `prop-${comp.id}-${key}`
    if (type === 'checkbox') {
      return (
        <label key={key} className="flex items-center gap-2 mb-2 text-sm">
          <input type="checkbox" checked={!!p[key]} onChange={e => set(key, e.target.checked)} />
          {label}
        </label>
      )
    }
    if (type === 'select') {
      return (
        <div key={key} className="mb-2">
          <label htmlFor={id} className="block text-[12px] font-medium text-text-muted mb-0.5">{label}</label>
          <select id={id} value={String(p[key] ?? '')} onChange={e => set(key, e.target.value)}
            className="w-full border border-border rounded px-2 py-1 text-sm bg-bg">
            {options?.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )
    }
    if (type === 'textarea') {
      return (
        <div key={key} className="mb-2">
          <label htmlFor={id} className="block text-[12px] font-medium text-text-muted mb-0.5">{label}</label>
          <textarea id={id} value={String(p[key] ?? '')} onChange={e => set(key, e.target.value)}
            className="w-full border border-border rounded px-2 py-1 text-sm bg-bg min-h-[60px] resize-y" />
        </div>
      )
    }
    return (
      <div key={key} className="mb-2">
        <label htmlFor={id} className="block text-[12px] font-medium text-text-muted mb-0.5">{label}</label>
        <input id={id} type="text" value={String(p[key] ?? '')} onChange={e => set(key, e.target.value)}
          className="w-full border border-border rounded px-2 py-1 text-sm bg-bg" />
      </div>
    )
  }

  const fields: React.ReactNode[] = []

  switch (comp.type) {
    case 'heading':
      fields.push(field('Text', 'text'), field('Level', 'level', 'select', ['1','2','3','4','5','6']))
      break
    case 'text':
      fields.push(field('Text', 'text', 'textarea'), field('Format', 'format', 'select', ['plain', 'markdown']))
      break
    case 'data-display':
      fields.push(field('Field', 'field'), field('Label', 'label'), field('Format', 'format', 'select', ['text', 'currency', 'markdown', 'date']))
      break
    case 'json-viewer':
      fields.push(field('Field', 'field'))
      break
    case 'image':
      fields.push(field('Direct URL', 'src'), field('Data Field', 'field'), field('Alt', 'alt'))
      break
    case 'badge':
      fields.push(field('Field', 'field'), field('Label', 'label'), field('Thresholds (JSON)', 'thresholds', 'textarea'))
      break
    case 'text-input':
      fields.push(field('Name', 'name'), field('Label', 'label'), field('Placeholder', 'placeholder'), field('Required', 'required', 'checkbox'))
      break
    case 'textarea':
      fields.push(field('Name', 'name'), field('Label', 'label'), field('Placeholder', 'placeholder'), field('Required', 'required', 'checkbox'))
      break
    case 'select':
      fields.push(field('Name', 'name'), field('Label', 'label'), field('Options (comma-separated)', 'options', 'textarea'), field('Required', 'required', 'checkbox'))
      break
    case 'checkbox':
      fields.push(field('Name', 'name'), field('Label', 'label'))
      break
    case 'radio':
      fields.push(field('Name', 'name'), field('Label', 'label'), field('Options (comma-separated)', 'options', 'textarea'))
      break
    case 'number':
      fields.push(field('Name', 'name'), field('Label', 'label'), field('Min', 'min'), field('Max', 'max'), field('Required', 'required', 'checkbox'))
      break
    case 'columns':
      fields.push(field('Columns', 'count', 'select', ['2', '3', '4']))
      break
    case 'section':
      fields.push(field('Title', 'title'), field('Collapsible', 'collapsible', 'checkbox'))
      break
    case 'button-group':
      fields.push(field('Buttons (key:Label:color, ...)', 'buttons', 'textarea'))
      break
    default:
      fields.push(<p key="none" className="text-sm text-text-muted italic">No editable properties</p>)
  }

  return <div className="p-3">{fields}</div>
}

/* -------------------------------------------------------------------------- */
/*  Live preview (preview mode)                                               */
/* -------------------------------------------------------------------------- */

function LivePreview({ components, sampleData }: { components: SchemaComponent[]; sampleData: string }) {
  let data: Record<string, unknown> = {}
  try { data = JSON.parse(sampleData) } catch { /* ignore */ }

  const resolve = (field: unknown): string => {
    const key = String(field || '')
    return key in data ? String(data[key]) : `{${key}}`
  }

  const renderComp = (comp: SchemaComponent) => {
    const p = comp.props
    switch (comp.type) {
      case 'heading': {
        const Tag = `h${p.level || 3}` as keyof JSX.IntrinsicElements
        return <Tag key={comp.id} className="font-bold text-lg">{String(p.text)}</Tag>
      }
      case 'text':
        return <p key={comp.id} className="text-sm">{String(p.text)}</p>
      case 'data-display':
        return <div key={comp.id} className="text-sm"><strong>{String(p.label)}:</strong> {resolve(p.field)}</div>
      case 'json-viewer':
        return <pre key={comp.id} className="bg-muted/30 rounded p-2 text-xs font-mono overflow-auto">{JSON.stringify(p.field ? data[String(p.field)] : data, null, 2)}</pre>
      case 'image':
        return <img key={comp.id} src={String(p.src || '') || resolve(p.field)} alt={String(p.alt)} className="max-w-full rounded" />
      case 'badge':
        return <span key={comp.id} className="inline-block px-2 py-0.5 rounded bg-muted text-sm">{String(p.label || resolve(p.field))}</span>
      case 'divider':
        return <hr key={comp.id} className="border-border" />
      case 'spacer':
        return <div key={comp.id} style={{ height: Number(p.height || 20) }} />
      case 'text-input':
        return <div key={comp.id} className="mb-2"><label className="block text-sm font-medium mb-0.5">{String(p.label)}{p.required ? ' *' : ''}</label><input type="text" placeholder={String(p.placeholder || '')} className="w-full border border-border rounded px-2 py-1 text-sm bg-bg" /></div>
      case 'textarea':
        return <div key={comp.id} className="mb-2"><label className="block text-sm font-medium mb-0.5">{String(p.label)}{p.required ? ' *' : ''}</label><textarea placeholder={String(p.placeholder || '')} className="w-full border border-border rounded px-2 py-1 text-sm bg-bg min-h-[60px]" /></div>
      case 'select': {
        const opts = String(p.options || '').split(',').map(s => s.trim()).filter(Boolean)
        return <div key={comp.id} className="mb-2"><label className="block text-sm font-medium mb-0.5">{String(p.label)}{p.required ? ' *' : ''}</label><select className="w-full border border-border rounded px-2 py-1 text-sm bg-bg"><option value="">Select...</option>{opts.map(o => <option key={o}>{o}</option>)}</select></div>
      }
      case 'checkbox':
        return <label key={comp.id} className="flex items-center gap-2 text-sm"><input type="checkbox" />{String(p.label)}</label>
      case 'radio': {
        const opts = String(p.options || '').split(',').map(s => s.trim()).filter(Boolean)
        return <fieldset key={comp.id} className="mb-2"><legend className="text-sm font-medium mb-1">{String(p.label)}</legend>{opts.map(o => <label key={o} className="flex items-center gap-1.5 text-sm"><input type="radio" name={String(p.name)} />{o}</label>)}</fieldset>
      }
      case 'number':
        return <div key={comp.id} className="mb-2"><label className="block text-sm font-medium mb-0.5">{String(p.label)}{p.required ? ' *' : ''}</label><input type="number" min={String(p.min)} max={String(p.max)} className="w-full border border-border rounded px-2 py-1 text-sm bg-bg" /></div>
      case 'section':
        return <div key={comp.id} className="border-l-2 border-primary pl-3 py-1"><div className="font-medium text-sm">{String(p.title)}</div></div>
      case 'columns': {
        const colCount = Number(p.count) || 2
        return (
          <div key={comp.id} className="grid gap-3 mb-2" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
            {(comp.children || []).map((col, colIdx) => (
              <div key={colIdx}>
                {col.map(child => renderComp(child))}
              </div>
            ))}
          </div>
        )
      }
      case 'button-group': {
        const btns = String(p.buttons || '').split(',').map(b => b.split(':'))
        return <div key={comp.id} className="flex gap-2 mt-2">{btns.map(([key, label, color], i) => <button key={i} className={cn('px-4 py-1.5 rounded text-sm font-medium text-white', color === 'danger' ? 'bg-danger' : color === 'success' ? 'bg-success' : 'bg-primary')}>{label || key}</button>)}</div>
      }
      default:
        return null
    }
  }

  return (
    <div className="space-y-3">
      {components.map(comp => renderComp(comp))}
      {components.length === 0 && <p className="text-text-muted text-sm italic">No components to preview</p>}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Canvas droppable wrapper                                                  */
/* -------------------------------------------------------------------------- */

function CanvasDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas-drop-zone' })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-1 bg-bg overflow-y-auto p-4 min-h-[400px] transition-colors',
        isOver && 'bg-primary/5',
      )}
    >
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Column drop zone                                                          */
/* -------------------------------------------------------------------------- */

function ColumnSlotDropZone({ parentId, colIndex, children }: { parentId: string; colIndex: number; children: React.ReactNode }) {
  const droppableId = `col-${parentId}-${colIndex}`
  const { setNodeRef, isOver } = useDroppable({ id: droppableId, data: { origin: 'column-slot', parentId, colIndex } })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-1 min-h-[60px] border border-dashed border-border rounded p-2 transition-colors',
        isOver && 'bg-primary/10 border-primary',
      )}
    >
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export function HitlFormBuilder({ templateId, onSave, onCancel }: HitlFormBuilderProps) {
  const toast = useToast()

  // Fetch app_url for webhook URLs (so n8n in Docker can reach the library manager)
  const { data: smtpSettings } = useQuery({
    queryKey: ['settings-smtp'],
    queryFn: () => api.get<{ app_url?: string }>('/api/settings/smtp').catch(() => ({} as { app_url?: string })),
    staleTime: 300_000,
  })
  const appBaseUrl = (smtpSettings?.app_url || window.location.origin).replace(/\/+$/, '')

  /* State */
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [components, setComponents] = useState<SchemaComponent[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState(false)
  const [sampleData, setSampleData] = useState('{\n  "amount": 1250,\n  "vendor": "Acme Corp"\n}')
  const [saving, setSaving] = useState(false)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [captureToken, setCaptureToken] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)

  /* Load existing template */
  const { data: loadedTemplate } = useQuery({
    queryKey: ['hitl-template', templateId],
    queryFn: () => api.get<{ name: string; slug: string; description: string; schema: { components: SchemaComponent[] } }>(`/api/hitl/templates/${templateId}`),
    enabled: !!templateId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (!loadedTemplate || hydrated) return
    setName(loadedTemplate.name)
    setSlug(loadedTemplate.slug)
    setDescription(loadedTemplate.description || '')
    const hydrateComp = (c: SchemaComponent): SchemaComponent => ({
      id: c.id || uid(),
      type: c.type || 'text',
      props: c.props || {},
      ...(c.children ? { children: c.children.map(col => col.map(hydrateComp)) } : {}),
    })
    setComponents((loadedTemplate.schema?.components ?? []).map(hydrateComp))
    setHydrated(true)
  }, [loadedTemplate, hydrated])

  /* DnD sensors */
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const selectedComp = useMemo(() => {
    // Check for selected child inside columns first
    if (selectedChildId) {
      for (const c of components) {
        if (c.children) {
          for (const col of c.children) {
            const found = col.find(ch => ch.id === selectedChildId)
            if (found) return found
          }
        }
      }
    }
    return components.find(c => c.id === selectedId) ?? null
  }, [components, selectedId, selectedChildId])
  const canvasIds = useMemo(() => components.map(c => c.id), [components])

  /* DnD handlers */
  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id))
  }

  const makeNewComp = (type: string, extraProps?: Record<string, unknown>): SchemaComponent => {
    const def = HITL_COMPONENTS[type]
    const comp: SchemaComponent = { id: uid(), type, props: { ...def?.defaults, ...extraProps } }
    if (type === 'columns') {
      const count = Number(comp.props.count) || 2
      comp.children = Array.from({ length: count }, () => [])
      delete comp.props._initChildren
    }
    return comp
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = e
    if (!over) return

    const activeData = active.data.current as { origin: string; type?: string; fieldKey?: string; componentType?: string } | undefined
    const overData = over.data.current as { origin?: string; parentId?: string; colIndex?: number } | undefined

    /* Helper: insert into column slot */
    const insertIntoColumn = (newComp: SchemaComponent) => {
      if (overData?.origin === 'column-slot' && overData.parentId != null && overData.colIndex != null) {
        setComponents(prev => prev.map(c => {
          if (c.id !== overData.parentId || !c.children) return c
          const cols = c.children.map((col, i) => i === overData.colIndex ? [...col, newComp] : col)
          return { ...c, children: cols }
        }))
        setSelectedChildId(newComp.id)
        setSelectedId(overData.parentId)
        return true
      }
      return false
    }

    /* Palette -> Canvas or Column: add new component */
    if (activeData?.origin === 'palette' && activeData.type) {
      const def = HITL_COMPONENTS[activeData.type]
      if (!def) return
      const newComp = makeNewComp(activeData.type)
      if (insertIntoColumn(newComp)) return
      const overIndex = components.findIndex(c => c.id === over.id)
      if (overIndex >= 0) {
        setComponents(prev => { const next = [...prev]; next.splice(overIndex, 0, newComp); return next })
      } else {
        setComponents(prev => [...prev, newComp])
      }
      setSelectedId(newComp.id)
      setSelectedChildId(null)
      return
    }

    /* Data field -> Canvas or Column: add data-bound component */
    if (activeData?.origin === 'data-field' && activeData.fieldKey && activeData.componentType) {
      const type = activeData.componentType
      const def = HITL_COMPONENTS[type]
      if (!def) return
      const label = activeData.fieldKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      const newComp = makeNewComp(type, { field: activeData.fieldKey, label })
      if (insertIntoColumn(newComp)) return
      const overIndex = components.findIndex(c => c.id === over.id)
      if (overIndex >= 0) {
        setComponents(prev => { const next = [...prev]; next.splice(overIndex, 0, newComp); return next })
      } else {
        setComponents(prev => [...prev, newComp])
      }
      setSelectedId(newComp.id)
      setSelectedChildId(null)
      return
    }

    /* Canvas -> Canvas: reorder */
    if (activeData?.origin === 'canvas' && active.id !== over.id) {
      setComponents(prev => {
        const oldIdx = prev.findIndex(c => c.id === active.id)
        const newIdx = prev.findIndex(c => c.id === over.id)
        if (oldIdx < 0 || newIdx < 0) return prev
        return arrayMove(prev, oldIdx, newIdx)
      })
    }
  }

  /* Delete a child inside a column */
  const deleteChild = (parentId: string, colIdx: number, childId: string) => {
    setComponents(prev => prev.map(c => {
      if (c.id !== parentId || !c.children) return c
      const cols = c.children.map((col, i) => i === colIdx ? col.filter(ch => ch.id !== childId) : col)
      return { ...c, children: cols }
    }))
    if (selectedChildId === childId) setSelectedChildId(null)
  }

  /* Update component props (supports both top-level and children) */
  const updateProps = (id: string, props: Record<string, unknown>) => {
    // Check if it's a child inside columns
    setComponents(prev => prev.map(c => {
      if (c.id === id) return { ...c, props }
      if (c.children) {
        const updated = c.children.map(col => col.map(ch => ch.id === id ? { ...ch, props } : ch))
        if (updated.some((col, i) => col !== c.children![i])) return { ...c, children: updated }
      }
      return c
    }))
  }

  /* Delete component */
  const deleteComponent = (id: string) => {
    setComponents(prev => prev.filter(c => c.id !== id))
    if (selectedId === id) { setSelectedId(null); setSelectedChildId(null) }
  }

  /* Auto-slug from name */
  const handleNameChange = (val: string) => {
    setName(val)
    setSlug(slugify(val))
  }

  /* Save */
  const handleSave = async () => {
    if (!name.trim()) { toast.error('Template name is required'); return }
    setSaving(true)
    try {
      const body = { name, description, slug, schema: { components } }
      if (templateId) {
        await api.put(`/api/hitl/templates/${templateId}`, body)
      } else {
        await api.post('/api/hitl/templates', body)
      }
      toast.success('Template saved')
      onSave()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to save template'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  /* Webhook capture */
  const startCapture = async () => {
    try {
      const res = await api.post<{ token: string }>('/api/hitl/capture')
      setCaptureToken(res.token)
      setCapturing(true)
      // Poll every 2s
      const poll = setInterval(async () => {
        try {
          const check = await api.get<{ captured?: boolean; payload?: Record<string, unknown> }>(`/api/hitl/capture/${res.token}`)
          if (check.captured && check.payload) {
            clearInterval(poll)
            // Unwrap: n8n sends arrays like [{...}] — extract first element
            const raw = check.payload
            const obj = Array.isArray(raw) ? (raw[0] ?? {}) : raw
            setSampleData(JSON.stringify(obj, null, 2))
            setCaptureToken(null)
            setCapturing(false)
            toast.success(`Webhook captured! ${Object.keys(obj).length} fields found.`)
          }
        } catch {
          clearInterval(poll)
          setCaptureToken(null)
          setCapturing(false)
        }
      }, 2000)
      // Auto-stop after 60s
      setTimeout(() => { clearInterval(poll); setCaptureToken(null); setCapturing(false) }, 60000)
    } catch {
      toast.error('Failed to start capture')
    }
  }

  const stopCapture = () => {
    if (captureToken) {
      api.delete(`/api/hitl/capture/${captureToken}`).catch(() => {})
      setCaptureToken(null)
      setCapturing(false)
    }
  }

  const captureUrl = captureToken ? `${appBaseUrl}/api/hitl/capture/${captureToken}` : ''
  const prodWebhookUrl = slug ? `${appBaseUrl}/api/hitl/webhook/${slug}` : ''
  const testWebhookUrl = slug ? `${appBaseUrl}/api/hitl/webhook/test/${slug}` : ''

  /* Parse sample data for data fields palette */
  const dataFields = useMemo(() => {
    try {
      let parsed = JSON.parse(sampleData)
      if (typeof parsed !== 'object' || parsed === null) return []
      // Unwrap arrays (n8n sends [{...}])
      if (Array.isArray(parsed)) parsed = parsed[0] ?? {}
      return Object.entries(parsed).map(([key, val]) => ({
        key,
        type: inferFieldType(val),
        preview: fieldPreview(val),
      }))
    } catch { return [] }
  }, [sampleData])

  /* Drag overlay content */
  const dragOverlayContent = useMemo(() => {
    if (!activeDragId) return null
    if (activeDragId.startsWith('palette-')) {
      const type = activeDragId.replace('palette-', '')
      const def = HITL_COMPONENTS[type]
      if (!def) return null
      return (
        <div className="border border-primary rounded-md px-2.5 py-1.5 text-[13px] flex items-center gap-2 bg-card shadow-lg">
          <span className="w-5 text-center font-mono text-[11px]">{def.icon}</span>
          <span>{def.label}</span>
        </div>
      )
    }
    if (activeDragId.startsWith('datafield-')) {
      const key = activeDragId.replace('datafield-', '')
      const f = dataFields.find(d => d.key === key)
      if (!f) return null
      return (
        <div className="border border-primary rounded px-2 py-1 text-[12px] flex items-center gap-1.5 bg-card shadow-lg">
          <span className="w-4 text-center font-mono text-text-xmuted text-[10px]">{FIELD_TYPE_ICON[f.type] || '·'}</span>
          <span className="font-semibold">{f.key}</span>
        </div>
      )
    }
    const comp = components.find(c => c.id === activeDragId)
    if (!comp) return null
    const def = HITL_COMPONENTS[comp.type]
    return (
      <div className="bg-card border border-primary rounded-md overflow-hidden shadow-lg w-[300px] opacity-80">
        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-danger">{def?.label ?? comp.type}</div>
      </div>
    )
  }, [activeDragId, components, dataFields])

  /* ======================================================================== */
  /*  Render                                                                  */
  /* ======================================================================== */

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card flex-shrink-0 flex-wrap">
        <input
          type="text" value={name} onChange={e => handleNameChange(e.target.value)}
          placeholder="e.g. Invoice Approval"
          className="border border-border rounded px-2.5 py-1.5 text-sm bg-bg w-[200px]"
        />
        <input
          type="text" value={slug} onChange={e => setSlug(e.target.value)}
          placeholder="e.g. invoice-approval"
          className="border border-border rounded px-2.5 py-1.5 text-sm bg-bg w-[180px] text-text-muted"
        />
        <input
          type="text" value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Optional description"
          className="border border-border rounded px-2.5 py-1.5 text-sm bg-bg flex-1 min-w-[160px]"
        />
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => setPreviewMode(v => !v)}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border', previewMode ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted/50')}>
            <Eye size={14} /> {previewMode ? 'Builder' : 'Preview'}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium bg-danger text-white hover:bg-danger/90 disabled:opacity-50">
            <Save size={14} /> {saving ? 'Saving...' : 'Save Template'}
          </button>
          <button onClick={onCancel} className="px-3 py-1.5 rounded text-sm border border-border hover:bg-muted/50">
            Cancel
          </button>
        </div>
      </div>

      {/* Webhook URLs */}
      {slug && (
        <div className="px-4 py-2 border-b border-border bg-card text-xs flex-shrink-0">
          <div className="text-text-muted mb-1 flex items-center gap-1">
            <span className="font-semibold">Webhook URLs</span>
            <span className="text-text-xmuted">(requires API key: Authorization: Bearer n8nlib_xxx)</span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-success/10 text-success">PROD</span>
            <input type="text" readOnly value={prodWebhookUrl} onClick={e => (e.target as HTMLInputElement).select()}
              className="flex-1 px-2 py-1 border border-border rounded text-[11px] font-mono bg-bg text-text-dark" />
            <button onClick={() => { navigator.clipboard.writeText(prodWebhookUrl); toast.success('Copied!') }}
              className="text-[11px] px-2 py-1 border border-border rounded hover:bg-bg">Copy</button>
            <button onClick={() => {
              const payload = buildCurlPayload(components, sampleData, true)
              const curl = `curl -X POST "${prodWebhookUrl}" \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(payload, null, 2)}'`
              navigator.clipboard.writeText(curl); toast.success('cURL copied!')
            }} className="text-[11px] px-2 py-1 border border-border rounded hover:bg-bg">&gt;_ cURL</button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-warning/10 text-warning">TEST</span>
            <input type="text" readOnly value={testWebhookUrl} onClick={e => (e.target as HTMLInputElement).select()}
              className="flex-1 px-2 py-1 border border-border rounded text-[11px] font-mono bg-bg text-text-dark" />
            <button onClick={() => { navigator.clipboard.writeText(testWebhookUrl); toast.success('Copied!') }}
              className="text-[11px] px-2 py-1 border border-border rounded hover:bg-bg">Copy</button>
            <button onClick={() => {
              const payload = buildCurlPayload(components, sampleData, false)
              const curl = `curl -X POST "${testWebhookUrl}" \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(payload, null, 2)}'`
              navigator.clipboard.writeText(curl); toast.success('cURL copied!')
            }} className="text-[11px] px-2 py-1 border border-border rounded hover:bg-bg">&gt;_ cURL</button>
          </div>
        </div>
      )}

      {/* Body */}
      {previewMode ? (
        /* ---- Preview mode ---- */
        <div className="flex flex-1 overflow-hidden">
          <div className="w-[400px] border-r border-border bg-card p-4 flex flex-col gap-3 overflow-y-auto">
            <h3 className="text-sm font-semibold">Sample Data (JSON)</h3>
            <textarea
              value={sampleData} onChange={e => setSampleData(e.target.value)}
              className="flex-1 border border-border rounded px-3 py-2 text-sm font-mono bg-bg resize-none min-h-[200px]"
            />
            <button onClick={() => setSampleData(s => s)} className="self-start px-3 py-1.5 rounded text-sm border border-border hover:bg-muted/50">
              Refresh
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-[600px] mx-auto bg-card border border-border rounded-lg p-6">
              <LivePreview components={components} sampleData={sampleData} />
            </div>
          </div>
        </div>
      ) : (
        /* ---- Builder mode ---- */
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex flex-1 overflow-hidden">
            {/* Left: Palette */}
            <div className="w-[280px] bg-card border-r border-border overflow-y-auto flex-shrink-0">
                {CATEGORIES.map(cat => {
                  const items = Object.entries(HITL_COMPONENTS).filter(([, v]) => v.category === cat.key)
                  if (!items.length) return null
                  return (
                    <div key={cat.key}>
                      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-xmuted px-2 pt-3 pb-1">
                        {cat.label}
                      </div>
                      <div className="px-2">
                        {items.map(([type, def]) => (
                          <PaletteItem key={type} type={type} def={def} />
                        ))}
                      </div>
                    </div>
                  )
                })}
              {/* Data Fields section */}
              <div className="border-t border-border mt-2 pt-2 px-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-xmuted">Data Fields</span>
                </div>

                {/* Webhook capture card */}
                {capturing && captureUrl ? (
                  <div className="mb-2 p-3 bg-success-light border border-success/30 rounded-lg">
                    <div className="flex items-center gap-1.5 text-success font-bold text-[12px] mb-2">
                      <span className="w-2 h-2 rounded-full bg-success health-pulse" />
                      Listening for webhook...
                    </div>
                    <div className="flex items-center gap-1 mb-2">
                      <input
                        type="text" readOnly value={captureUrl}
                        onClick={e => (e.target as HTMLInputElement).select()}
                        className="flex-1 px-2 py-1 border border-border rounded text-[11px] font-mono bg-bg-light truncate"
                      />
                      <button
                        onClick={() => { navigator.clipboard.writeText(captureUrl); toast.success('URL copied!') }}
                        className="p-1 border border-border rounded hover:bg-bg transition-colors shrink-0"
                        title="Copy URL"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      </button>
                    </div>
                    <div className="text-[10px] text-text-muted mb-2">
                      Send a POST request with JSON body to this URL from your n8n workflow
                    </div>
                    <button
                      onClick={stopCapture}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-semibold text-danger border border-danger/30 rounded-md hover:bg-danger-light transition-colors"
                    >
                      <span className="w-2 h-2 bg-danger rounded-sm" /> Stop listening
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={startCapture}
                    className="w-full mb-2 py-2 text-[11px] font-semibold text-primary border border-primary/30 rounded-lg hover:bg-primary-light transition-colors"
                  >
                    Listen for webhook...
                  </button>
                )}

                {dataFields.length > 0 ? (
                  <div className="space-y-1">
                    {dataFields.map((f) => (
                      <DataFieldItem key={f.key} field={f} />
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-text-xmuted py-1">
                    No data fields. Use webhook capture or enter sample data in Preview mode.
                  </div>
                )}
              </div>
            </div>

            {/* Center: Canvas */}
            <CanvasDropZone>
              <SortableContext items={canvasIds} strategy={verticalListSortingStrategy}>
                {components.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-text-muted text-sm italic py-20">
                    Drag components here to build your form
                  </div>
                ) : (
                  components.map(comp => (
                    <CanvasItem
                      key={comp.id} comp={comp}
                      selected={comp.id === selectedId}
                      onSelect={() => { setSelectedId(comp.id); setSelectedChildId(null) }}
                      onDelete={() => deleteComponent(comp.id)}
                      selectedChildId={selectedChildId}
                      onSelectChild={(id) => { setSelectedChildId(id); setSelectedId(comp.id) }}
                      onDeleteChild={deleteChild}
                    />
                  ))
                )}
              </SortableContext>
            </CanvasDropZone>

            {/* Right: Properties */}
            <div className="w-[280px] bg-card border-l border-border overflow-y-auto flex-shrink-0">
              {selectedComp ? (
                <>
                  <div className="px-3 pt-3 pb-1 flex items-center justify-between">
                    <span className="text-sm font-semibold">{HITL_COMPONENTS[selectedComp.type]?.label ?? selectedComp.type}</span>
                    <button onClick={() => deleteComponent(selectedComp.id)} className="text-text-muted hover:text-danger">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <PropertyEditor comp={selectedComp} onChange={props => updateProps(selectedComp.id, props)} />
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-text-muted text-sm italic px-4 text-center">
                  Select a component to edit its properties
                </div>
              )}
            </div>
          </div>

          <DragOverlay>{dragOverlayContent}</DragOverlay>
        </DndContext>
      )}
    </div>
  )
}
