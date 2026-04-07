import { useEffect, useState } from 'react'
import { loadNodeIcons, getNodeIconSrc, getNodeFaIcon } from '@/lib/node-icons'
import { cn, esc } from '@/lib/utils'

interface NodeData {
  type?: string
  name?: string
  displayName?: string
  group?: string
  position?: number[]
  iconData?: { type?: string; fileBuffer?: string; icon?: string }
  icon?: string
}

const TRIGGER_KW = ['trigger', 'webhook', 'cron', 'schedule', 'start', 'event', 'formtrigger', 'chattrigger']

function isTrigger(node: NodeData): boolean {
  const g = (node.group || '').toLowerCase()
  if (g.includes('trigger')) return true
  const s = ((node.type || '') + (node.name || '')).toLowerCase()
  return TRIGGER_KW.some((k) => s.includes(k))
}

function getNodeLabel(node: NodeData): string {
  const raw = node.displayName || node.name || node.type?.split('.').pop() || '?'
  return raw.length > 16 ? raw.slice(0, 14) + '\u2026' : raw
}

function getNodeType(node: NodeData): string {
  return node.type || node.name || ''
}

// Map FA icon names to Unicode characters for rendering without Font Awesome
const FA_UNICODE: Record<string, string> = {
  clock: '\u{1F551}', filter: '\u{1F50D}', pen: '\u270F', cog: '\u2699', table: '\u{1F4CA}',
  code: '\u{1F4BB}', envelope: '\u2709', database: '\u{1F4BE}', bolt: '\u26A1',
  globe: '\u{1F310}', file: '\u{1F4C4}', play: '\u25B6', pause: '\u23F8',
  'exchange-alt': '\u21C4', compress: '\u{1F500}', robot: '\u{1F916}',
  comment: '\u{1F4AC}', key: '\u{1F511}', users: '\u{1F465}', calendar: '\u{1F4C5}',
}

function NodeIcon({ node }: { node: NodeData }) {
  const trigger = isTrigger(node)
  const nodeType = getNodeType(node)
  const baseCls = 'w-[22px] h-[22px] rounded-md flex items-center justify-center shrink-0 border overflow-hidden'
  const triggerCls = trigger ? 'bg-primary border-primary' : 'bg-bg border-border-light'

  // 1. Inline iconData with base64 image (template nodes)
  if (node.iconData?.type === 'file' && node.iconData.fileBuffer?.startsWith('data:image')) {
    return (
      <span className={cn(baseCls, triggerCls)}>
        <img src={node.iconData.fileBuffer} alt="" className="w-4 h-4 object-contain" />
      </span>
    )
  }

  // 2. Inline iconData with FA icon name (template nodes)
  if (node.iconData?.type === 'icon' && node.iconData.icon && node.iconData.icon !== 'question') {
    const ch = FA_UNICODE[node.iconData.icon] || '\u2699'
    return (
      <span className={cn(baseCls, triggerCls, 'text-[11px]', trigger && 'text-white')}>
        {ch}
      </span>
    )
  }

  // 3. Lookup from icon cache by node type
  const cachedSrc = getNodeIconSrc(nodeType)
  if (cachedSrc) {
    return (
      <span className={cn(baseCls, triggerCls)}>
        <img src={cachedSrc} alt="" className="w-4 h-4 object-contain" />
      </span>
    )
  }

  // 4. Lookup FA icon from cache
  const faIcon = getNodeFaIcon(nodeType)
  if (faIcon) {
    const ch = FA_UNICODE[faIcon] || '\u2699'
    return (
      <span className={cn(baseCls, triggerCls, 'text-[11px]', trigger && 'text-white')}>
        {ch}
      </span>
    )
  }

  // 5. Check top-level icon field on the node itself (fa:xxx or file:xxx)
  if (node.icon?.startsWith('fa:')) {
    const name = node.icon.replace('fa:', '')
    const ch = FA_UNICODE[name] || '\u2699'
    return (
      <span className={cn(baseCls, triggerCls, 'text-[11px]', trigger && 'text-white')}>
        {ch}
      </span>
    )
  }

  // 6. Fallback: gear icon
  return (
    <span className={cn(baseCls, triggerCls, 'text-[11px]', trigger ? 'text-white' : 'text-text-dark')}>
      &#9881;
    </span>
  )
}

export { type NodeData }

/**
 * NodeFlow — renders node badges in a wrapping container matching the legacy design.
 * - height: 208px (card mode) or auto (compact mode)
 * - flex-wrap: wrap with badges flowing to multiple lines
 * - clickable: shows "Preview" button on hover when onClick provided
 */
export function NodeFlow({
  nodes,
  maxShow = 12,
  onClick,
  compact = false,
}: {
  nodes: NodeData[]
  maxShow?: number
  onClick?: () => void
  compact?: boolean
}) {
  const [, setIconsLoaded] = useState(false)

  useEffect(() => {
    loadNodeIcons().then(() => setIconsLoaded(true))
  }, [])

  if (nodes.length === 0) {
    return (
      <div className={cn(
        'flex items-center justify-center text-text-xmuted text-xs',
        !compact && 'h-[208px] bg-bg rounded-md border border-border-light',
      )}>
        No nodes
      </div>
    )
  }

  const sorted = [...nodes].sort((a, b) => {
    const at = isTrigger(a) ? 0 : 1
    const bt = isTrigger(b) ? 0 : 1
    if (at !== bt) return at - bt
    return (a.position?.[0] ?? 0) - (b.position?.[0] ?? 0)
  })

  const show = sorted.slice(0, maxShow)
  const remaining = nodes.length - maxShow

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-start gap-1.5 flex-wrap content-start relative group',
        !compact && 'h-[208px] bg-bg rounded-md border border-border-light p-2.5 overflow-hidden cursor-pointer transition-colors duration-150 hover:border-primary',
        compact && 'gap-1',
      )}
    >
      {show.map((node, i) => {
        const trigger = isTrigger(node)
        return (
          <div key={i} className="flex items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-[5px] pl-[6px] pr-2.5 py-1 rounded-[14px] text-[11px] font-medium whitespace-nowrap border shrink-0',
                trigger
                  ? 'bg-[#fff3f1] border-[#ffc8c0] text-[#c63a28] [html[data-theme=dark]_&]:bg-[#2e1f1c] [html[data-theme=dark]_&]:border-[#5c3028] [html[data-theme=dark]_&]:text-[#ff8a7a]'
                  : 'bg-bg-light border-border text-text-dark',
              )}
            >
              <NodeIcon node={node} />
              {esc(getNodeLabel(node))}
            </span>
            {i < show.length - 1 && !compact && (
              <span className="text-text-xmuted text-[11px] shrink-0">&rarr;</span>
            )}
          </div>
        )
      })}
      {remaining > 0 && (
        <span className="text-[11px] text-text-muted py-1 px-2 shrink-0">+{remaining} more</span>
      )}
      {/* Preview button on hover */}
      {onClick && !compact && (
        <span className="absolute bottom-2 right-2 px-2.5 py-1 text-[11px] font-semibold text-white bg-primary rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-[2]">
          Preview
        </span>
      )}
    </div>
  )
}
