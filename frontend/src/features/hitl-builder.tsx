import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/api/client'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import {
  DndContext, DragOverlay, useSensor, useSensors, PointerSensor,
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
  image:          { label: 'Image',          icon: 'I',  category: 'display', defaults: { field: '', alt: 'Image' } },
  badge:          { label: 'Badge',          icon: 'B',  category: 'display', defaults: { field: '', label: '', thresholds: '{"0.7":"danger","0.4":"warning","0":"success"}' } },
  divider:        { label: 'Divider',        icon: '--', category: 'display', defaults: {} },
  spacer:         { label: 'Spacer',         icon: '|',  category: 'layout',  defaults: { height: 20 } },
  'text-input':   { label: 'Text Input',     icon: 'Aa', category: 'input',   defaults: { name: 'field', label: 'Label', placeholder: '', required: false } },
  textarea:       { label: 'Text Area',      icon: 'P',  category: 'input',   defaults: { name: 'notes', label: 'Notes', placeholder: '', required: false } },
  select:         { label: 'Select',         icon: 'V',  category: 'input',   defaults: { name: 'choice', label: 'Choose', options: 'Option A, Option B, Option C', required: false } },
  checkbox:       { label: 'Checkbox',       icon: 'X',  category: 'input',   defaults: { name: 'confirm', label: 'Confirm' } },
  radio:          { label: 'Radio',          icon: 'O',  category: 'input',   defaults: { name: 'option', label: 'Pick one', options: 'Option A, Option B' } },
  number:         { label: 'Number',         icon: '#',  category: 'input',   defaults: { name: 'amount', label: 'Amount', min: '', max: '', required: false } },
  columns:        { label: 'Columns',        icon: '||', category: 'layout',  defaults: { count: 2 } },
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

/* -------------------------------------------------------------------------- */
/*  Palette item (draggable source)                                           */
/* -------------------------------------------------------------------------- */

function PaletteItem({ type, def }: { type: string; def: typeof HITL_COMPONENTS[string] }) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
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

/* -------------------------------------------------------------------------- */
/*  Sortable canvas item                                                      */
/* -------------------------------------------------------------------------- */

function CanvasItem({
  comp, selected, onSelect, onDelete,
}: {
  comp: SchemaComponent; selected: boolean; onSelect: () => void; onDelete: () => void
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

      {/* preview */}
      <div className="px-3 py-2 text-sm text-text-muted">
        <ComponentPreview comp={comp} />
      </div>
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
      return <div className="text-[13px] italic">Image: {`{${String(p.field || 'url')}}`}</div>
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
      fields.push(field('URL Field', 'field'), field('Alt', 'alt'))
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

  return (
    <div className="space-y-3">
      {components.map(comp => {
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
            return <img key={comp.id} src={resolve(p.field)} alt={String(p.alt)} className="max-w-full rounded" />
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
          case 'columns':
            return <div key={comp.id} className="text-sm text-text-muted italic">[{String(p.count)}-column layout]</div>
          case 'button-group': {
            const btns = String(p.buttons || '').split(',').map(b => b.split(':'))
            return <div key={comp.id} className="flex gap-2 mt-2">{btns.map(([key, label, color], i) => <button key={i} className={cn('px-4 py-1.5 rounded text-sm font-medium text-white', color === 'danger' ? 'bg-danger' : color === 'success' ? 'bg-success' : 'bg-primary')}>{label || key}</button>)}</div>
          }
          default:
            return null
        }
      })}
      {components.length === 0 && <p className="text-text-muted text-sm italic">No components to preview</p>}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export function HitlFormBuilder({ templateId, onSave, onCancel }: HitlFormBuilderProps) {
  const toast = useToast()

  /* State */
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [components, setComponents] = useState<SchemaComponent[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState(false)
  const [sampleData, setSampleData] = useState('{\n  "amount": 1250,\n  "vendor": "Acme Corp"\n}')
  const [saving, setSaving] = useState(false)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  /* Load existing template */
  useQuery({
    queryKey: ['hitl-template', templateId],
    queryFn: async () => {
      const t = await api.get<{ name: string; slug: string; description: string; schema: { components: SchemaComponent[] } }>(`/api/hitl/templates/${templateId}`)
      setName(t.name)
      setSlug(t.slug)
      setDescription(t.description || '')
      setComponents(t.schema?.components ?? [])
      return t
    },
    enabled: !!templateId,
  })

  /* DnD sensors */
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const selectedComp = useMemo(() => components.find(c => c.id === selectedId) ?? null, [components, selectedId])
  const canvasIds = useMemo(() => components.map(c => c.id), [components])

  /* DnD handlers */
  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id))
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = e
    if (!over) return

    const activeData = active.data.current as { origin: string; type?: string } | undefined

    /* Palette -> Canvas: add new component */
    if (activeData?.origin === 'palette' && activeData.type) {
      const def = HITL_COMPONENTS[activeData.type]
      if (!def) return
      const newComp: SchemaComponent = { id: uid(), type: activeData.type, props: { ...def.defaults } }
      const overIndex = components.findIndex(c => c.id === over.id)
      if (overIndex >= 0) {
        setComponents(prev => { const next = [...prev]; next.splice(overIndex, 0, newComp); return next })
      } else {
        setComponents(prev => [...prev, newComp])
      }
      setSelectedId(newComp.id)
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

  /* Update component props */
  const updateProps = (id: string, props: Record<string, unknown>) => {
    setComponents(prev => prev.map(c => c.id === id ? { ...c, props } : c))
  }

  /* Delete component */
  const deleteComponent = (id: string) => {
    setComponents(prev => prev.filter(c => c.id !== id))
    if (selectedId === id) setSelectedId(null)
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
    const comp = components.find(c => c.id === activeDragId)
    if (!comp) return null
    const def = HITL_COMPONENTS[comp.type]
    return (
      <div className="bg-card border border-primary rounded-md overflow-hidden shadow-lg w-[300px] opacity-80">
        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-danger">{def?.label ?? comp.type}</div>
      </div>
    )
  }, [activeDragId, components])

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
              <SortableContext items={Object.keys(HITL_COMPONENTS).map(k => `palette-${k}`)} strategy={verticalListSortingStrategy}>
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
              </SortableContext>
            </div>

            {/* Center: Canvas */}
            <div className="flex-1 bg-bg overflow-y-auto p-4 min-h-[400px]">
              <SortableContext items={canvasIds} strategy={verticalListSortingStrategy}>
                {components.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-text-muted text-sm italic">
                    Drag components here to build your form
                  </div>
                ) : (
                  components.map(comp => (
                    <CanvasItem
                      key={comp.id} comp={comp}
                      selected={comp.id === selectedId}
                      onSelect={() => setSelectedId(comp.id)}
                      onDelete={() => deleteComponent(comp.id)}
                    />
                  ))
                )}
              </SortableContext>
            </div>

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
