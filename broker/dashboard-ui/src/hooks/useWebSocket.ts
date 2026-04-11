import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

// Request notification permission on first load
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission()
}

export function useWebSocket() {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws`

    function notify(title: string, body?: string) {
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        new Notification(title, { body, icon: '/favicon.svg' })
      }
    }

    function connect() {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'inbox_update') {
            if (data.source === 'master') {
              queryClient.invalidateQueries({ queryKey: ['master-messages'] })
              notify('superbot3', 'New message from master')
            } else if (data.source === 'space' && data.space) {
              queryClient.invalidateQueries({ queryKey: ['space-messages', data.space] })
              notify(data.space, data.preview || 'New message')
            }
          }

          if (data.type === 'conversation_update') {
            if (data.source === 'master') {
              queryClient.invalidateQueries({ queryKey: ['master-conversation'] })
              notify('superbot3', 'New activity from master')
            } else if (data.source === 'space' && data.space) {
              queryClient.invalidateQueries({ queryKey: ['space-conversation', data.space] })
              notify(data.space, data.preview || 'New activity')
            }
          }
        } catch {}
      }

      ws.onclose = () => {
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
