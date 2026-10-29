import { ref, watch, onBeforeUnmount, type Ref } from 'vue'

interface UseSseOptions {
  onMessage: (event: string, data: unknown) => void
  enabled?: Ref<boolean> | boolean
}

/**
 * Named-event EventSource with automatic reconnect.
 * Events: message (default), stats, executions, notification, hitl, read-all.
 */
export function useSse(url: Ref<string> | string, { onMessage, enabled }: UseSseOptions) {
  const enabledRef = typeof enabled === 'object' && enabled !== null ? enabled : ref(enabled ?? true)
  const resolvedUrl = typeof url === 'object' ? url : ref(url)
  let source: EventSource | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  const handle = (event: string, raw?: string) => {
    if (raw === undefined) return onMessage(event, null)
    try {
      onMessage(event, raw === '' ? null : JSON.parse(raw))
    } catch {
      onMessage(event, raw)
    }
  }

  function connect() {
    if (!enabledRef.value) return
    const es = new EventSource(resolvedUrl.value)
    source = es

    es.onmessage = (e) => handle('message', e.data)
    for (const name of ['stats', 'executions', 'notification', 'hitl']) {
      es.addEventListener(name, (e) => handle(name, (e as MessageEvent).data))
    }
    es.addEventListener('read-all', () => onMessage('read-all', null))

    es.onerror = () => {
      es.close()
      source = null
      reconnectTimer = setTimeout(connect, 5000)
    }
  }

  watch(
    [resolvedUrl, enabledRef],
    ([u, en], [prevU, prevEn]) => {
      if (u === prevU && en === prevEn) return
      source?.close()
      source = null
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (en) connect()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    source?.close()
    source = null
  })
}