import { useState, useEffect, useRef } from 'react'

// ~50 verbs from the Claude Code thinking verb list
const THINKING_VERBS = [
  'Thinking', 'Pondering', 'Contemplating', 'Cogitating', 'Cerebrating',
  'Cultivating', 'Orchestrating', 'Philosophising', 'Ruminating', 'Deliberating',
  'Musing', 'Meditating', 'Reflecting', 'Synthesizing', 'Analyzing',
  'Weaving', 'Assembling', 'Composing', 'Formulating', 'Distilling',
  'Untangling', 'Deciphering', 'Navigating', 'Architecting', 'Conjuring',
  'Percolating', 'Simmering', 'Brewing', 'Crystallizing', 'Unraveling',
  'Mapping', 'Sketching', 'Forging', 'Sculpting', 'Spinning',
  'Kindling', 'Incubating', 'Hatching', 'Germinating', 'Digesting',
  'Channeling', 'Calibrating', 'Harmonizing', 'Brainstorming', 'Envisioning',
  'Imagining', 'Decoding', 'Processing', 'Computing', 'Extrapolating',
]

// Tool-specific verbs
const TOOL_VERBS: Record<string, string> = {
  Bash: 'Running',
  Read: 'Reading',
  Write: 'Writing',
  Edit: 'Editing',
  Grep: 'Searching',
  Glob: 'Searching',
  WebSearch: 'Searching',
  WebFetch: 'Fetching',
  Agent: 'Dispatching',
  SendMessage: 'Messaging',
}

// Tool-specific labels for display
const TOOL_LABELS: Record<string, string> = {
  Bash: 'Bash',
  Read: 'file',
  Write: 'file',
  Edit: 'file',
  Grep: 'codebase',
  Glob: 'files',
  WebSearch: 'the web',
  WebFetch: 'page',
  Agent: 'subagent',
  SendMessage: 'teammate',
}

interface ThinkingIndicatorProps {
  activeTool?: string | null
  turnStart?: string | null
}

export function ThinkingIndicator({ activeTool, turnStart }: ThinkingIndicatorProps) {
  // Pick a stable random verb on mount (stays constant for this thinking session)
  const [verb] = useState(() =>
    THINKING_VERBS[Math.floor(Math.random() * THINKING_VERBS.length)]
  )

  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(turnStart ? new Date(turnStart).getTime() : Date.now())

  // Update start time if turnStart changes
  useEffect(() => {
    if (turnStart) {
      startRef.current = new Date(turnStart).getTime()
    }
  }, [turnStart])

  // Tick elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Determine display text
  let displayVerb = verb
  let displaySuffix = ''

  if (activeTool) {
    displayVerb = TOOL_VERBS[activeTool] || 'Running'
    displaySuffix = TOOL_LABELS[activeTool] ? ` ${TOOL_LABELS[activeTool]}` : ` ${activeTool}`
  }

  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-2 px-5 py-3">
        <span className="thinking-shimmer text-sm text-stone/70">
          {displayVerb}{displaySuffix}...
        </span>
        {elapsed >= 3 && (
          <span className="text-xs text-stone/30">
            {elapsed}s
          </span>
        )}
      </div>
    </div>
  )
}
