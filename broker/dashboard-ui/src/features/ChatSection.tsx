import { useState, useRef, useEffect, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InboxMessage } from '@/lib/types'
import type { ConversationMessage } from '@/lib/api'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ChatSectionProps {
  messages: InboxMessage[]
  conversation: ConversationMessage[]
  sendFn: (text: string) => Promise<unknown>
  queryKey: string[]
  title?: string
}

export function ChatSection({ messages, conversation, sendFn, queryKey, title }: ChatSectionProps) {
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const prevLenRef = useRef(0)

  const mutation = useMutation({
    mutationFn: (msg: string) => sendFn(msg),
    onSuccess: () => {
      setText('')
      setTimeout(() => queryClient.invalidateQueries({ queryKey }), 1000)
    },
  })

  // Merge inbox messages + conversation log, deduplicate by timestamp proximity
  const merged = useMemo(() => {
    const all: Array<{
      from: string
      text: string
      timestamp: string
      role: 'user' | 'assistant' | 'system'
    }> = []

    // Add conversation messages (Claude's actual conversation)
    for (const msg of conversation) {
      all.push({
        from: msg.from,
        text: msg.text,
        timestamp: msg.timestamp,
        role: msg.role,
      })
    }

    // Add inbox messages that aren't already in the conversation
    // (inbox messages from "dashboard" that haven't been picked up yet)
    for (const msg of messages) {
      const isDashboard = msg.from === 'dashboard' || msg.from === 'superbot3-cli'
      if (!isDashboard) continue
      // Check if this message is already represented in the conversation
      const alreadyInConvo = conversation.some(c =>
        c.role === 'user' && Math.abs(new Date(c.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 5000
        && c.text.includes(msg.text.slice(0, 40))
      )
      if (!alreadyInConvo) {
        all.push({
          from: msg.from,
          text: msg.text,
          timestamp: msg.timestamp,
          role: 'user',
        })
      }
    }

    all.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    return all
  }, [messages, conversation])

  // Auto-scroll only when new messages arrive
  useEffect(() => {
    if (merged.length > prevLenRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
    prevLenRef.current = merged.length
  }, [merged.length])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || mutation.isPending) return
    mutation.mutate(text.trim())
  }

  return (
    <div className="flex flex-col h-full">
      {title && (
        <div className="px-4 py-2.5 border-b text-sm font-medium text-parchment">{title}</div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-auto">
        {merged.length === 0 && (
          <div className="text-center text-stone text-sm py-12">
            No messages yet. Send one below.
          </div>
        )}
        {merged.map((msg, i) => {
          const isUser = msg.role === 'user'
          const isAssistant = msg.role === 'assistant'
          return (
            <div
              key={`${msg.timestamp}-${i}`}
              className={cn(
                'animate-fade-up',
                isUser ? 'flex justify-end' : ''
              )}
            >
              <div
                className={cn(
                  'rounded-lg text-sm max-w-[85%]',
                  isUser
                    ? 'bg-sand/15 text-parchment px-3 py-2'
                    : 'text-parchment'
                )}
              >
                {isAssistant ? (
                  <div className="markdown-compact prose-sm">
                    <Markdown remarkPlugins={[remarkGfm]}>{msg.text}</Markdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                )}
              </div>
              <div className={cn(
                'text-[10px] text-stone mt-1 px-1',
                isUser ? 'text-right' : ''
              )}>
                {isAssistant ? 'Claude' : msg.from}
                {msg.timestamp && ` \u00b7 ${new Date(msg.timestamp).toLocaleTimeString()}`}
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
          className="flex-1 bg-surface rounded-md px-3 py-2 text-sm text-parchment placeholder:text-stone border border-border-custom outline-none focus:ring-1 focus:ring-sand/40 transition-colors"
          disabled={mutation.isPending}
        />
        <button
          type="submit"
          disabled={!text.trim() || mutation.isPending}
          className="px-3 py-2 rounded-md bg-sand text-ink text-sm font-medium hover:bg-sand/90 disabled:opacity-30 transition-colors"
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
