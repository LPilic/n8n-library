import { api } from '@/api/client'

export interface IconEntry {
  iconData?: { type: string; fileBuffer?: string; icon?: string }
  icon?: string
  color?: string
}

let iconCache: Record<string, IconEntry> | null = null
let loadPromise: Promise<void> | null = null

export async function loadNodeIcons(): Promise<Record<string, IconEntry>> {
  if (iconCache) return iconCache
  if (!loadPromise) {
    loadPromise = api
      .get<Record<string, IconEntry>>('/api/node-icons')
      .then((data) => { iconCache = data })
      .catch(() => { iconCache = {} })
  }
  await loadPromise
  return iconCache || {}
}

/** Get full icon entry for a node type from the cache */
export function getNodeIconEntry(nodeType: string): IconEntry | null {
  if (!iconCache) return null
  return iconCache[nodeType] || null
}

/** Get base64 image src for a node, looking up by node type */
export function getNodeIconSrc(nodeType: string): string | null {
  const entry = getNodeIconEntry(nodeType)
  if (!entry) return null
  const id = entry.iconData
  if (id?.type === 'file' && id.fileBuffer && id.fileBuffer.startsWith('data:image')) {
    return id.fileBuffer
  }
  return null
}

/** Get Font Awesome icon name for a node type (e.g. "clock", "filter", "pen") */
export function getNodeFaIcon(nodeType: string): string | null {
  const entry = getNodeIconEntry(nodeType)
  if (!entry) return null

  // Check iconData.icon first
  const id = entry.iconData
  if (id?.type === 'icon' && id.icon && id.icon !== 'question') {
    return id.icon
  }

  // Check top-level icon with fa: prefix
  if (entry.icon?.startsWith('fa:')) {
    return entry.icon.replace('fa:', '')
  }

  return null
}
