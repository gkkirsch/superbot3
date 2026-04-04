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

const PAGE_SIZE = 20

export function ChatSection({ messages, conversation, sendFn, queryKey, title }: ChatSectionProps) {
  const [text, setText] = useState('')
  const [waitingForReply, setWaitingForReply] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const scrollRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const prevLenRef = useRef(0)

  const mutation = useMutation({
    mutationFn: (msg: string) => sendFn(msg),
    onSuccess: () => {
      setText('')
      setWaitingForReply(true)
      setTimeout(() => queryClient.invalidateQueries({ queryKey }), 1000)
    },
  })

  // Merge inbox messages + conversation log, deduplicate by text + timestamp proximity
  const merged = useMemo(() => {
    type Msg = { from: string; text: string; timestamp: string; role: 'user' | 'assistant' | 'system' }
    const all: Msg[] = []

    // Add conversation messages, deduplicating within the conversation itself
    // (tmux fallback + inbox poller can create duplicate user messages)
    for (const msg of conversation) {
      const isDupe = all.some(existing =>
        existing.role === msg.role
        && existing.text === msg.text
        && Math.abs(new Date(existing.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 10000
      )
      if (!isDupe) {
        all.push({ from: msg.from, text: msg.text, timestamp: msg.timestamp, role: msg.role })
      }
    }

    // Add inbox messages not yet in the conversation (pending pickup)
    for (const msg of messages) {
      const isFromUser = msg.from === 'user' || msg.from === 'dashboard' || msg.from === 'superbot3-cli'
      if (!isFromUser) continue
      const alreadyInConvo = all.some(c =>
        c.role === 'user'
        && Math.abs(new Date(c.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 10000
        && c.text.includes(msg.text.slice(0, 40))
      )
      if (!alreadyInConvo) {
        all.push({ from: msg.from, text: msg.text, timestamp: msg.timestamp, role: 'user' })
      }
    }

    all.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    return all
  }, [messages, conversation])

  // Clear typing indicator when a new assistant message arrives
  useEffect(() => {
    if (waitingForReply && merged.length > 0 && merged[merged.length - 1].role === 'assistant') {
      setWaitingForReply(false)
    }
  }, [merged, waitingForReply])

  // Auto-scroll: instant on first load, smooth for new messages
  const initialLoadRef = useRef(true)
  useEffect(() => {
    if (merged.length > prevLenRef.current || waitingForReply) {
      if (initialLoadRef.current) {
        // Jump to bottom instantly on mount — no visible scroll
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
        initialLoadRef.current = false
      } else {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      }
    }
    prevLenRef.current = merged.length
  }, [merged.length, waitingForReply])

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
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-16 py-4 space-y-3 scrollbar-auto">
        {merged.length === 0 && (
          <div className="text-center text-stone text-sm py-12">
            No messages yet. Send one below.
          </div>
        )}
        {merged.length > visibleCount && (
          <div className="text-center pb-2">
            <button
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              className="text-xs text-stone hover:text-parchment transition-colors"
            >
              Load earlier messages ({merged.length - visibleCount} more)
            </button>
          </div>
        )}
        {merged.slice(-visibleCount).map((msg, i) => {
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
                  'rounded-2xl text-[0.9375rem] leading-relaxed max-w-[85%]',
                  isUser
                    ? 'bg-sand/15 text-parchment px-5 py-3'
                    : 'text-parchment px-5 py-3'
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
            </div>
          )
        })}
        {waitingForReply && (
          <div className="animate-fade-up">
            <div className="flex items-center gap-1.5 px-5 py-3">
              <span className="typing-dot" />
              <span className="typing-dot [animation-delay:0.15s]" />
              <span className="typing-dot [animation-delay:0.3s]" />
            </div>
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} className="px-16 py-3 flex items-center gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Message this space..."
          className="flex-1 bg-ink border border-border-custom rounded-lg px-3 py-2 text-sm text-parchment placeholder:text-stone/40 focus:outline-none focus:border-sand/50 transition-colors"
          disabled={mutation.isPending}
        />
        <button
          type="submit"
          disabled={!text.trim() || mutation.isPending}
          className="shrink-0 p-2 rounded-lg text-stone hover:text-sand hover:bg-sand/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
