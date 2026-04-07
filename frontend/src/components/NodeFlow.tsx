import { useEffect, useState } from 'react'
import { loadNodeIcons, getNodeIconSrc } from '@/lib/node-icons'
import { cn } from '@/lib/utils'

interface NodeData {
  type?: string
  name?: string
  displayName?: string
  group?: string
  position?: number[]
  iconData?: { type?: string; fileBuffer?: string; icon?: string }
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
  // Template nodes: type is in `name` field (e.g. "n8n-nodes-base.httpRequest")
  // Monitoring nodes: type is in `type` field
  return node.type || node.name || ''
}

function NodeIcon({ node }: { node: NodeData }) {
  // Try inline iconData first (template nodes have it)
  if (node.iconData?.type === 'file' && node.iconData.fileBuffer?.startsWith('data:image')) {
    return <img src={node.iconData.fileBuffer} alt="" className="w-4 h-4 object-contain" />
  }

  // Try lookup from icon cache
  const src = getNodeIconSrc(getNodeType(node))
  if (src) {
    return <img src={src} alt="" className="w-4 h-4 object-contain" />
  }

  return null
}

export function NodeFlow({ nodes, maxShow = 8 }: { nodes: NodeData[]; maxShow?: number }) {
  const [, setIconsLoaded] = useState(false)

  // Load icons on mount
  useEffect(() => {
    loadNodeIcons().then(() => setIconsLoaded(true))
  }, [])

  if (nodes.length === 0) {
    return <span className="text-text-xmuted text-xs">No nodes</span>
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
    <div className="flex items-center gap-1 flex-nowrap">
      {show.map((node, i) => (
        <div key={i} className="flex items-center gap-1">
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded whitespace-nowrap',
              isTrigger(node) ? 'bg-success-light text-success' : 'bg-border-light text-text-muted',
            )}
          >
            <NodeIcon node={node} />
            {getNodeLabel(node)}
          </span>
          {i < show.length - 1 && <span className="text-text-xmuted text-[10px]">&rarr;</span>}
        </div>
      ))}
      {remaining > 0 && (
        <span className="text-text-xmuted text-[10px] ml-1">+{remaining} more</span>
      )}
    </div>
  )
}
