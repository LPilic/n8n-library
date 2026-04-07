import { api } from '@/api/client'

interface IconEntry {
  iconData?: { type: string; fileBuffer?: string; icon?: string }
  icon?: string
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

/** Get icon HTML src for a node, looking up by node type */
export function getNodeIconSrc(nodeType: string): string | null {
  if (!iconCache) return null
  const entry = iconCache[nodeType]
  if (!entry) return null
  const id = entry.iconData
  if (id?.type === 'file' && id.fileBuffer && id.fileBuffer.startsWith('data:image')) {
    return id.fileBuffer
  }
  return null
}
