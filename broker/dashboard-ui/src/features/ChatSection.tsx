import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InboxMessage } from '@/lib/types'

interface ChatSectionProps {
  messages: InboxMessage[]
  sendFn: (text: string) => Promise<unknown>
  queryKey: string[]
  title?: string
}

export function ChatSection({ messages, sendFn, queryKey, title }: ChatSectionProps) {
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (msg: string) => sendFn(msg),
    onSuccess: () => {
      setText('')
      setTimeout(() => queryClient.invalidateQueries({ queryKey }), 1000)
    },
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || mutation.isPending) return
    mutation.mutate(text.trim())
  }

  const sorted = [...messages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  return (
    <div className="flex flex-col h-full">
      {title && (
        <div className="px-4 py-2 border-b text-sm font-medium text-foreground">{title}</div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
        {sorted.length === 0 && (
          <div className="text-center text-stone text-sm py-8">No messages yet. Send one below.</div>
        )}
        {sorted.map((msg, i) => {
          const isUser = msg.from === 'superbot3-cli' || msg.from === 'dashboard'
          return (
            <div
              key={`${msg.timestamp}-${i}`}
              className={cn('max-w-[85%] animate-fade-up', isUser ? 'ml-auto' : 'mr-auto')}
            >
              <div
                className={cn(
                  'rounded-lg px-3 py-2 text-sm',
                  isUser ? 'bg-sand/20 text-foreground' : 'bg-muted text-foreground'
                )}
              >
                <div className="whitespace-pre-wrap break-words">{msg.text}</div>
              </div>
              <div className={cn('text-[10px] text-stone mt-0.5 px-1', isUser ? 'text-right' : '')}>
                {msg.from} &middot; {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
            </div>
          )
        })}
      </div>
      <form onSubmit={handleSubmit} className="border-t p-3 flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Send a message..."
          className="flex-1 bg-muted rounded-md px-3 py-2 text-sm text-foreground placeholder:text-stone outline-none focus:ring-1 focus:ring-sand/50"
          disabled={mutation.isPending}
        />
        <button
          type="submit"
          disabled={!text.trim() || mutation.isPending}
          className="p-2 rounded-md bg-sand/20 text-sand hover:bg-sand/30 disabled:opacity-30 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
      {mutation.isError && (
        <div className="px-3 pb-2 text-xs text-ember">Failed to send message</div>
      )}
    </div>
  )
}
