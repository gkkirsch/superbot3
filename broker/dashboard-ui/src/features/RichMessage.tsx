import { useState } from 'react'
import { ChevronRight, Terminal, FileText, Pencil, Search, FolderSearch, Globe, Brain, CheckCircle2, XCircle, Users, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RichMessage, RichAssistantMessage, RichUserMessage, RichSystemMessage, RichToolUseBlock, RichThinkingBlock } from '@/lib/api'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Tool name → icon + human-readable label
const TOOL_META: Record<string, { icon: typeof Terminal; label: string }> = {
  Bash: { icon: Terminal, label: 'Terminal' },
  Read: { icon: FileText, label: 'Read' },
  Write: { icon: FileText, label: 'Write' },
  Edit: { icon: Pencil, label: 'Edit' },
  Grep: { icon: Search, label: 'Search' },
  Glob: { icon: FolderSearch, label: 'Find files' },
  WebSearch: { icon: Globe, label: 'Web search' },
  WebFetch: { icon: Globe, label: 'Web fetch' },
  Agent: { icon: Users, label: 'Agent' },
  SendMessage: { icon: Users, label: 'Message' },
}

function getToolSummary(block: RichToolUseBlock): string {
  const input = block.input
  switch (block.name) {
    case 'Bash': return typeof input.command === 'string' ? input.command.slice(0, 120) : 'command'
    case 'Read': return typeof input.file_path === 'string' ? input.file_path.split('/').slice(-2).join('/') : 'file'
    case 'Write': return typeof input.file_path === 'string' ? input.file_path.split('/').slice(-2).join('/') : 'file'
    case 'Edit': return typeof input.file_path === 'string' ? input.file_path.split('/').slice(-2).join('/') : 'file'
    case 'Grep': return typeof input.pattern === 'string' ? `"${input.pattern}"` : 'search'
    case 'Glob': return typeof input.pattern === 'string' ? input.pattern : 'pattern'
    case 'WebSearch': return typeof input.query === 'string' ? input.query.slice(0, 80) : 'query'
    case 'WebFetch': return typeof input.url === 'string' ? input.url.slice(0, 80) : 'url'
    case 'Agent': return typeof input.description === 'string' ? input.description : typeof input.prompt === 'string' ? input.prompt.slice(0, 80) : 'subagent'
    case 'SendMessage': return typeof input.message === 'string' ? input.message.slice(0, 80) : 'message'
    default: return block.name
  }
}

// ── Individual Tool Detail (shown inside expanded group) ──

function ToolDetail({ block }: { block: RichToolUseBlock }) {
  const [showResult, setShowResult] = useState(false)
  const meta = TOOL_META[block.name] || { icon: Terminal, label: block.name }
  const Icon = meta.icon
  const summary = getToolSummary(block)
  const hasResult = block.result !== undefined
  const isError = block.is_error

  return (
    <div className="py-1">
      <div className="flex items-center gap-2">
        <Icon className="w-3 h-3 text-stone/50 shrink-0" />
        <span className="text-[11px] text-stone/60 font-mono truncate flex-1">{summary}</span>
        {hasResult && (
          isError
            ? <XCircle className="w-3 h-3 text-ember/60 shrink-0" />
            : <CheckCircle2 className="w-3 h-3 text-moss/60 shrink-0" />
        )}
        {hasResult && (
          <button
            onClick={() => setShowResult(r => !r)}
            className="text-[10px] text-stone/30 hover:text-stone/50 transition-colors"
          >
            {showResult ? 'hide' : 'output'}
          </button>
        )}
      </div>
      {showResult && hasResult && (
        <div className="mt-1 ml-5">
          <pre className={cn(
            'text-[11px] font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto scrollbar-auto',
            isError ? 'text-ember/60' : 'text-stone/50'
          )}>{typeof block.result === 'string' ? block.result.slice(0, 3000) : JSON.stringify(block.result, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

// ── Grouped Tool Calls (collapsed summary, expandable) ──

function ToolGroup({ tools }: { tools: RichToolUseBlock[] }) {
  const [expanded, setExpanded] = useState(false)
  const errorCount = tools.filter(t => t.is_error).length

  return (
    <div className="my-1 px-3">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 text-stone/40 hover:text-stone/60 transition-colors"
      >
        <ChevronRight className={cn('w-3 h-3 transition-transform shrink-0', expanded && 'rotate-90')} />
        <span className="text-[11px]">
          {tools.length} tool call{tools.length !== 1 ? 's' : ''}
        </span>
        {errorCount > 0 && (
          <span className="text-[10px] text-ember/50">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
        )}
      </button>
      {expanded && (
        <div className="ml-5 mt-1 pl-3 border-l border-stone/10 space-y-0.5">
          {tools.map((block, i) => (
            <ToolDetail key={block.id || `tool-${i}`} block={block} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Thinking Block ──

function ThinkingBlock({ block }: { block: RichThinkingBlock }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="my-1 px-3">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 text-stone/40 hover:text-stone/60 transition-colors"
      >
        <ChevronRight className={cn('w-3 h-3 transition-transform', expanded && 'rotate-90')} />
        <Brain className="w-3 h-3" />
        <span className="text-[11px]">Thinking...</span>
      </button>
      {expanded && (
        <div className="mt-1 ml-5 pl-3 border-l border-stone/10">
          <pre className="text-[11px] font-mono text-stone/40 whitespace-pre-wrap break-words max-h-48 overflow-y-auto scrollbar-auto">{block.thinking.slice(0, 2000)}</pre>
        </div>
      )}
    </div>
  )
}

// ── Timestamp ──

function Timestamp({ ts }: { ts: string }) {
  if (!ts) return null
  const d = new Date(ts)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return <span className="text-[10px] text-stone/25">{time}</span>
}

// ── User Message ──

function UserMessage({ msg }: { msg: RichUserMessage }) {
  const textBlocks = msg.blocks.filter(b => b.type === 'text')
  const text = textBlocks.map(b => b.text).join('\n')
  if (!text) return null

  // Teammate message
  if (msg.origin === 'teammate' && msg.teammateId) {
    const colorMap: Record<string, string> = {
      blue: 'border-l-blue-500/40',
      green: 'border-l-moss/40',
      red: 'border-l-ember/40',
      yellow: 'border-l-sand/40',
      purple: 'border-l-purple-500/40',
    }
    const colorClass = msg.teammateColor ? (colorMap[msg.teammateColor] || 'border-l-stone/20') : 'border-l-stone/20'

    return (
      <div className="animate-fade-up">
        <div className={cn('border-l-2 pl-4 py-2', colorClass)}>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-3 h-3 text-stone/40" />
            <span className="text-[11px] font-medium text-stone/50">{msg.teammateId}</span>
            <Timestamp ts={msg.timestamp} />
          </div>
          <div className="markdown-compact text-[0.875rem]">
            <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
          </div>
        </div>
      </div>
    )
  }

  // Regular user message
  const isSlashCommand = text.startsWith('/')

  return (
    <div className="animate-fade-up flex justify-end">
      <div className="max-w-lg">
        <div className={cn(
          'rounded-2xl px-5 py-3 text-[0.9375rem] leading-relaxed',
          isSlashCommand
            ? 'bg-sand/10 text-sand font-mono text-sm'
            : 'bg-sand/15 text-parchment'
        )}>
          <div className="whitespace-pre-wrap break-words">{text}</div>
        </div>
        <div className="flex justify-end mt-0.5 px-1">
          <Timestamp ts={msg.timestamp} />
        </div>
      </div>
    </div>
  )
}

// ── Assistant Message ──

function AssistantMessage({ msg }: { msg: RichAssistantMessage }) {
  const textBlocks = msg.blocks.filter(b => b.type === 'text')
  const toolBlocks = msg.blocks.filter((b): b is RichToolUseBlock => b.type === 'tool_use')
  const thinkingBlocks = msg.blocks.filter((b): b is RichThinkingBlock => b.type === 'thinking')

  const hasText = textBlocks.length > 0
  const hasThinking = thinkingBlocks.length > 0

  // Filter out noise tools
  const visibleTools = toolBlocks.filter(t => t.name !== 'ToolSearch')

  if (!hasText && visibleTools.length === 0 && !hasThinking) return null

  return (
    <div className="animate-fade-up">
      <div className="text-parchment">
        {/* Thinking blocks */}
        {hasThinking && thinkingBlocks.map((block, i) => (
          <ThinkingBlock key={`think-${i}`} block={block} />
        ))}

        {/* Text content */}
        {hasText && (
          <div className="markdown-compact text-[0.9375rem] leading-relaxed px-4 py-2">
            <Markdown remarkPlugins={[remarkGfm]}>
              {textBlocks.map(b => b.text).join('\n\n')}
            </Markdown>
          </div>
        )}

        {/* Tool calls — grouped into a single collapsible summary */}
        {visibleTools.length > 0 && (
          <ToolGroup tools={visibleTools} />
        )}

        {/* Footer: timestamp */}
        <div className="px-4 mt-1">
          <Timestamp ts={msg.timestamp} />
        </div>
      </div>
    </div>
  )
}

// ── System Message ──

function SystemMessage({ msg }: { msg: RichSystemMessage }) {
  if (msg.subtype === 'compact_boundary') {
    return (
      <div className="flex items-center gap-3 my-3 px-4">
        <div className="flex-1 border-t border-border-custom/50" />
        <span className="text-[10px] text-stone/30">context compacted</span>
        <div className="flex-1 border-t border-border-custom/50" />
      </div>
    )
  }

  if (msg.subtype === 'scheduled_task_fire' || msg.subtype === 'scheduled') {
    return (
      <div className="animate-fade-up px-4 my-1">
        <div className="flex items-center gap-2 px-3 py-2 text-xs whitespace-nowrap">
          <Clock className="w-3 h-3 shrink-0 text-stone/40" />
          <span className="text-[10px] font-medium text-stone/30 uppercase tracking-wider">Scheduled</span>
          {msg.text && <span className="text-stone/50 truncate">{msg.text}</span>}
          <Timestamp ts={msg.timestamp} />
        </div>
      </div>
    )
  }

  if (msg.subtype === 'stop_hook_summary') {
    return (
      <div className="flex items-center gap-3 my-2 px-4">
        <div className="flex-1 border-t border-stone/10" />
        <span className="text-[10px] text-stone/25">session ended</span>
        <div className="flex-1 border-t border-stone/10" />
      </div>
    )
  }

  return (
    <div className="animate-fade-up px-4 my-1">
      <div className="flex items-start gap-2 px-3 py-2 text-xs text-stone/40">
        <span>{msg.text || msg.subtype}</span>
      </div>
    </div>
  )
}

// ── Main Export ──

export function RichMessageBubble({ message }: { message: RichMessage }) {
  switch (message.type) {
    case 'user': return <UserMessage msg={message} />
    case 'assistant': return <AssistantMessage msg={message} />
    case 'system': return <SystemMessage msg={message} />
    default: return null
  }
}

// ── Consolidated Assistant Messages ──
// Multiple consecutive assistant JSONL entries often belong to the same logical turn.
// This function groups them for cleaner rendering.

export function consolidateMessages(messages: RichMessage[]): RichMessage[] {
  const result: RichMessage[] = []
  let pendingAssistant: RichAssistantMessage | null = null

  for (const msg of messages) {
    if (msg.type === 'assistant') {
      const aMsg = msg as RichAssistantMessage
      if (pendingAssistant) {
        // Merge blocks into the pending assistant message
        const prev: RichAssistantMessage = pendingAssistant
        pendingAssistant = {
          type: 'assistant' as const,
          blocks: [...prev.blocks, ...aMsg.blocks],
          timestamp: prev.timestamp,
          usage: aMsg.usage || prev.usage,
          model: aMsg.model || prev.model,
          stopReason: aMsg.stopReason,
        }
      } else {
        pendingAssistant = {
          type: 'assistant' as const,
          blocks: [...aMsg.blocks],
          timestamp: aMsg.timestamp,
          usage: aMsg.usage,
          model: aMsg.model,
          stopReason: aMsg.stopReason,
        }
      }
    } else if (msg.type === 'user') {
      // User messages with only tool_results are continuations of the assistant turn
      const hasText = msg.blocks.some(b => b.type === 'text')
      if (!hasText && pendingAssistant) {
        // This is a tool_result-only user message — don't flush the assistant yet
        // The tool results are already linked to tool_use blocks via the server
        continue
      }
      // Flush pending assistant
      if (pendingAssistant) {
        result.push(pendingAssistant)
        pendingAssistant = null
      }
      result.push(msg)
    } else {
      if (pendingAssistant) {
        result.push(pendingAssistant)
        pendingAssistant = null
      }
      result.push(msg)
    }
  }

  if (pendingAssistant) {
    result.push(pendingAssistant)
  }

  return result
}
