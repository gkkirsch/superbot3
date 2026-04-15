import { useState, useRef, useEffect, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowUp, Search, Globe, FileText, Mail, Code, BarChart3, Lightbulb, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/lib/types'
import type { RichMessage, ThinkingState } from '@/lib/api'
import { RichMessageBubble, consolidateMessages } from './RichMessage'
import { ThinkingIndicator } from './ThinkingIndicator'

interface ChatSectionProps {
  messages: ChatMessage[]
  richConversation: RichMessage[]
  thinkingState?: ThinkingState
  sendFn: (text: string) => Promise<unknown>
  queryKey: string[]
  title?: string
}

const PAGE_SIZE = 30

export function ChatSection({ messages, richConversation, thinkingState, sendFn, queryKey, title }: ChatSectionProps) {
  const [text, setText] = useState('')
  const [waitingForReply, setWaitingForReply] = useState(false)
  const [optimisticMessages, setOptimisticMessages] = useState<RichMessage[]>([])
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const queryClient = useQueryClient()
  const prevLenRef = useRef(0)

  const mutation = useMutation({
    mutationFn: (msg: string) => {
      // Optimistically add user message immediately
      const optimistic: RichMessage = {
        type: 'user',
        blocks: [{ type: 'text', text: msg }],
        timestamp: new Date().toISOString(),
        origin: null,
        teammateId: null,
        teammateColor: null,
        teammateSummary: null,
      }
      setOptimisticMessages(prev => [...prev, optimistic])
      setText('')
      setWaitingForReply(true)
      if (inputRef.current) inputRef.current.style.height = 'auto'
      return sendFn(msg)
    },
    onSuccess: () => {
      setTimeout(() => queryClient.invalidateQueries({ queryKey }), 1000)
    },
    onError: () => {
      // Remove last optimistic message on failure
      setOptimisticMessages(prev => prev.slice(0, -1))
      setWaitingForReply(false)
    },
  })

  // Clear optimistic messages once they appear in the real conversation
  useEffect(() => {
    if (optimisticMessages.length === 0) return
    const remaining = optimisticMessages.filter(opt => {
      const optText = opt.type === 'user' && opt.blocks?.[0]?.type === 'text' ? opt.blocks[0].text : ''
      return !richConversation.some(real =>
        real.type === 'user' &&
        real.blocks?.[0]?.type === 'text' &&
        real.blocks[0].text === optText
      )
    })
    if (remaining.length !== optimisticMessages.length) {
      setOptimisticMessages(remaining)
    }
  }, [richConversation, optimisticMessages])

  // Consolidate assistant messages and add pending inbox messages
  const consolidated = useMemo(() => {
    const rich = consolidateMessages(richConversation)

    // Add pending inbox messages not yet in the conversation
    const pendingMessages: RichMessage[] = []
    for (const msg of messages) {
      const isFromUser = msg.from === 'user' || msg.from === 'dashboard' || msg.from === 'superbot3-cli'
      const isFromScheduler = msg.from === 'scheduler'
      if (!isFromUser && !isFromScheduler) continue

      // Check if already in rich conversation
      const alreadyInConvo = rich.some(c =>
        Math.abs(new Date(c.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 10000
      )
      if (alreadyInConvo) continue

      if (isFromScheduler) {
        pendingMessages.push({
          type: 'system',
          subtype: 'scheduled',
          text: msg.text,
          timestamp: msg.timestamp,
        })
      } else {
        pendingMessages.push({
          type: 'user',
          blocks: [{ type: 'text', text: msg.text }],
          timestamp: msg.timestamp,
          origin: null,
          teammateId: null,
          teammateColor: null,
          teammateSummary: null,
        })
      }
    }

    const all = [...rich, ...pendingMessages, ...optimisticMessages]
    all.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    return all
  }, [richConversation, messages, optimisticMessages])

  // Clear typing indicator when a new assistant message arrives or backend reports not thinking
  useEffect(() => {
    if (waitingForReply) {
      const lastIsAssistant = consolidated.length > 0 && consolidated[consolidated.length - 1].type === 'assistant'
      const backendNotThinking = thinkingState && !thinkingState.isThinking && consolidated.length > 0
      if (lastIsAssistant || backendNotThinking) {
        setWaitingForReply(false)
      }
    }
  }, [consolidated, waitingForReply, thinkingState])

  // Auto-scroll: instant on first load, smooth for new messages
  const isThinking = thinkingState?.isThinking || waitingForReply
  const initialLoadRef = useRef(true)
  useEffect(() => {
    if (consolidated.length > prevLenRef.current || isThinking) {
      if (initialLoadRef.current) {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
        initialLoadRef.current = false
      } else {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      }
    }
    prevLenRef.current = consolidated.length
  }, [consolidated.length, isThinking])

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

  const isEmpty = consolidated.length === 0

  return (
    <div className="flex flex-col h-full">
      {title && (
        <div className="px-4 py-2.5 border-b text-sm font-medium text-parchment">{title}</div>
      )}
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 -mt-12 pointer-events-none">
          <div className="max-w-[640px] w-full pointer-events-auto">
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
        {consolidated.length > visibleCount && (
          <div className="text-center pb-2">
            <button
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              className="text-xs text-stone hover:text-parchment transition-colors"
            >
              Load earlier messages ({consolidated.length - visibleCount} more)
            </button>
          </div>
        )}
        {consolidated.slice(-visibleCount).map((msg, i) => (
          <RichMessageBubble key={`${msg.timestamp}-${i}`} message={msg} />
        ))}
        {(thinkingState?.isThinking || waitingForReply) && (
          <ThinkingIndicator
            activeTool={thinkingState?.activeTool}
            turnStart={thinkingState?.turnStart}
          />
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
