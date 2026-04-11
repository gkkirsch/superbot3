import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

// Request notification permission on first load
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission()
}

export function useWebSocket() {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const lastUserSendRef = useRef<number>(0)

  // Expose a way for ChatSection to mark when user sends a message
  useEffect(() => {
    (window as any).__superbot3_markUserSend = () => { lastUserSendRef.current = Date.now() }
  }, [])

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws`

    function notify(title: string, body?: string) {
      // Don't notify if user just sent a message in the last 2 seconds
      if (Date.now() - lastUserSendRef.current < 2000) return
      if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification(title, { body, icon: '/favicon.svg', silent: false })
        n.onclick = () => { window.focus(); n.close() }
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
            } else if (data.source === 'space' && data.space) {
              queryClient.invalidateQueries({ queryKey: ['space-messages', data.space] })
            }
          }

          if (data.type === 'conversation_update') {
            if (data.source === 'master') {
              queryClient.invalidateQueries({ queryKey: ['master-conversation'] })
              notify('superbot3', 'New activity from master')
            } else if (data.source === 'space' && data.space) {
              queryClient.invalidateQueries({ queryKey: ['space-conversation', data.space] })
              notify(data.space, 'New response')
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
