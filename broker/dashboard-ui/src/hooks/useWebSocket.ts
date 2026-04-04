import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export function useWebSocket() {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws`

    function connect() {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'inbox_update') {
            if (data.source === 'master') {
              queryClient.invalidateQueries({ queryKey: ['master-messages'] })
            } else if (data.source === 'space' && data.space) {
              queryClient.invalidateQueries({ queryKey: ['space-messages', data.space] })
            }
          }
        } catch {}
      }

      ws.onclose = () => {
        // Reconnect after 3 seconds
        setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      wsRef.current?.close()
    }
  }, [queryClient])
}
