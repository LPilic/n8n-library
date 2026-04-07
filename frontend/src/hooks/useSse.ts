import { useEffect, useRef, useCallback } from 'react'

interface UseSseOptions {
  onMessage: (event: string, data: unknown) => void
  enabled?: boolean
}

export function useSse(url: string, { onMessage, enabled = true }: UseSseOptions) {
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage
  const sourceRef = useRef<EventSource | null>(null)

  const connect = useCallback(() => {
    if (!enabled) return

    const es = new EventSource(url)
    sourceRef.current = es

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        onMessageRef.current('message', data)
      } catch {
        // ignore parse errors
      }
    }

    es.addEventListener('stats', (e: Event) => {
      try {
        const me = e as MessageEvent
        const data = JSON.parse(me.data)
        onMessageRef.current('stats', data)
      } catch { /* ignore */ }
    })

    es.addEventListener('executions', (e: Event) => {
      try {
        const me = e as MessageEvent
        const data = JSON.parse(me.data)
        onMessageRef.current('executions', data)
      } catch { /* ignore */ }
    })

    es.addEventListener('notification', (e: Event) => {
      try {
        const me = e as MessageEvent
        const data = JSON.parse(me.data)
        onMessageRef.current('notification', data)
      } catch { /* ignore */ }
    })

    es.addEventListener('hitl', (e: Event) => {
      try {
        const me = e as MessageEvent
        const data = JSON.parse(me.data)
        onMessageRef.current('hitl', data)
      } catch { /* ignore */ }
    })

    es.addEventListener('read-all', () => {
      onMessageRef.current('read-all', null)
    })

    es.onerror = () => {
      es.close()
      // Reconnect after 5s
      setTimeout(connect, 5000)
    }
  }, [url, enabled])

  useEffect(() => {
    connect()
    return () => {
      sourceRef.current?.close()
      sourceRef.current = null
    }
  }, [connect])
}
