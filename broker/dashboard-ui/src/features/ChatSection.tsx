import { useState, useRef, useEffect, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowUp, Search, Globe, FileText, Mail, Code, BarChart3, Lightbulb, ChevronLeft, ChevronRight } from 'lucide-react'
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
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const queryClient = useQueryClient()
  const prevLenRef = useRef(0)

  const mutation = useMutation({
    mutationFn: (msg: string) => sendFn(msg),
    onSuccess: () => {
      setText('')
      setWaitingForReply(true)
      if (inputRef.current) {
        inputRef.current.style.height = 'auto'
      }
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
      const isFromScheduler = msg.from === 'scheduler'
      if (!isFromUser && !isFromScheduler) continue
      const role = isFromScheduler ? 'system' as const : 'user' as const
      const alreadyInConvo = all.some(c =>
        Math.abs(new Date(c.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 10000
        && c.text.includes(msg.text.slice(0, 40))
      )
      if (!alreadyInConvo) {
        all.push({ from: msg.from, text: msg.text, timestamp: msg.timestamp, role })
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

  const greetings = [
    'What are we building today?',
    'What should this space work on?',
    'Give me something to do.',
    'Ready when you are.',
    'What\'s the plan?',
    'Where do we start?',
  ]
  const [greeting] = useState(() => greetings[Math.floor(Math.random() * greetings.length)])

  const allSuggestions = [
    { icon: Search, text: 'Find 10 leads for AI consulting outreach and draft personalized emails' },
    { icon: Globe, text: 'Open a browser, go to producthunt.com, and find trending AI tools' },
    { icon: Code, text: 'Set up a new Express API with TypeScript, Postgres, and Zod validation' },
    { icon: Mail, text: 'Draft a cold email sequence for SaaS founders about our product' },
    { icon: BarChart3, text: 'Research competitor pricing and summarize in a comparison table' },
    { icon: FileText, text: 'Write a technical blog post about building with Claude Code' },
    { icon: Lightbulb, text: 'Brainstorm 10 revenue ideas based on our existing tools and skills' },
    { icon: Globe, text: 'Scrape job postings from 5 sites and compile into a spreadsheet' },
  ]
  const [suggestionPage, setSuggestionPage] = useState(() => Math.floor(Math.random() * (allSuggestions.length / 2)))
  const visibleSuggestions = allSuggestions.slice((suggestionPage * 2) % allSuggestions.length, (suggestionPage * 2) % allSuggestions.length + 2)

  const isEmpty = merged.length === 0

  return (
    <div className="flex flex-col h-full">
      {title && (
        <div className="px-4 py-2.5 border-b text-sm font-medium text-parchment">{title}</div>
      )}
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 -mt-12">
          <div className="max-w-[640px] w-full">
            <h2 className="text-center text-parchment/80 text-3xl font-light mb-10 tracking-tight">{greeting}</h2>

            {/* Input */}
            <form onSubmit={handleSubmit} className="mb-6">
              <div className="relative bg-surface border border-border-custom rounded-xl focus-within:border-stone/30 transition-colors">
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  rows={2}
                  placeholder="Message this space..."
                  className="w-full bg-transparent px-4 pt-3 pb-10 text-sm text-parchment placeholder:text-stone/40 focus:outline-none resize-none overflow-y-auto max-h-32 no-scrollbar"
                  disabled={mutation.isPending}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      e.currentTarget.form?.requestSubmit()
                    }
                  }}
                  onInput={(e) => {
                    const target = e.currentTarget
                    target.style.height = 'auto'
                    target.style.height = `${Math.min(target.scrollHeight, 128)}px`
                  }}
                />
                <div className="absolute bottom-2 right-3">
                  <button
                    type="submit"
                    disabled={!text.trim() || mutation.isPending}
                    className={`p-1.5 rounded-lg transition-all hover:bg-sand/80 ${
                      text.trim()
                        ? 'bg-sand text-ink opacity-100 animate-[spring-in_0.4s_ease-out]'
                        : 'bg-transparent text-transparent scale-75 opacity-0 pointer-events-none'
                    }`}
                  >
                    <ArrowUp className="h-4 w-4 stroke-[2.5]" />
                  </button>
                </div>
              </div>
            </form>

            {/* Suggestion pills */}
            <div className="flex items-center justify-center gap-2">
              <div className="grid grid-cols-2 gap-2 w-[480px]" key={suggestionPage}>
                {visibleSuggestions.map(({ icon: Icon, text }) => (
                  <button
                    key={text}
                    onClick={() => setText(text)}
                    className="flex items-center gap-2 px-3.5 py-2 text-[13px] text-stone border border-border-custom rounded-full hover:text-parchment hover:border-stone/30 hover:bg-surface/50 transition-colors animate-fade-up truncate"
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0 text-stone/50" />
                    <span className="truncate">{text}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setSuggestionPage(p => p + 1)}
                className="p-2 rounded-full text-stone/30 hover:text-stone hover:bg-surface/50 border border-border-custom transition-colors shrink-0"
                title="More suggestions"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 scrollbar-auto">
      <div className="max-w-[790px] mx-auto px-4 space-y-3">
        {false && (null)}
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
          const isScheduled = msg.role === 'system' || msg.from === 'scheduler'
          return (
            <div
              key={`${msg.timestamp}-${i}`}
              className={cn(
                'animate-fade-up',
                isUser && !isScheduled ? 'flex justify-end' : ''
              )}
            >
              {isScheduled ? (
                <div className="flex items-start gap-2 px-5 py-2 my-1 rounded-lg bg-surface/60 border border-border-custom/50">
                  <span className="text-stone/60 text-xs mt-0.5">⏱</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-medium text-stone/50 uppercase tracking-wider">Scheduled</span>
                    <p className="text-xs text-stone leading-relaxed mt-0.5">{msg.text}</p>
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    'rounded-2xl text-[0.9375rem] leading-relaxed',
                    isUser
                      ? 'bg-sand/15 text-parchment px-5 py-3 max-w-md'
                      : 'text-parchment px-5 py-3'
                  )}
                >
                  {isAssistant ? (
                    <div className="markdown-compact">
                      <Markdown remarkPlugins={[remarkGfm]}>{msg.text}</Markdown>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                  )}
                </div>
              )}
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
      </div>
      )}
      {!isEmpty && <div className="max-w-[790px] mx-auto px-4 w-full pt-2 pb-6">
      <form onSubmit={handleSubmit}>
        <div className="relative bg-surface border border-border-custom rounded-xl focus-within:border-stone/30 transition-colors">
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            rows={2}
            placeholder="Message this space..."
            className="w-full bg-transparent px-4 pt-2.5 pb-10 text-sm text-parchment placeholder:text-stone/45 focus:outline-none resize-none overflow-y-auto max-h-32 no-scrollbar"
            disabled={mutation.isPending}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
            onInput={(e) => {
              const target = e.currentTarget
              target.style.height = 'auto'
              target.style.height = `${Math.min(target.scrollHeight, 128)}px`
            }}
          />
          <div className="absolute bottom-2 left-2 right-2 flex items-center">
            <div className="flex-1" />
            <button
              type="submit"
              disabled={!text.trim() || mutation.isPending}
              className={`p-1.5 rounded-lg transition-all hover:bg-sand/80 ${
                text.trim()
                  ? 'bg-sand text-ink opacity-100 animate-[spring-in_0.4s_ease-out]'
                  : 'bg-transparent text-transparent scale-75 opacity-0 pointer-events-none'
              }`}
            >
              <ArrowUp className="h-4 w-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </form>
      {mutation.isError && (
        <span className="text-[10px] text-ember/70 mt-1 ml-1">Failed</span>
      )}
      </div>}
    </div>
  )
}
