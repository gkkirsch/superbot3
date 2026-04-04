import { useState, useMemo } from 'react'
import { usePlugins, useSkills, useAgents } from '@/hooks/useSpaces'
import { togglePlugin } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Puzzle, Blocks, Bot, Search, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import type { PluginInfo } from '@/lib/types'

const CATEGORY_LABELS: Record<string, string> = {
  development: 'Development',
  productivity: 'Productivity',
  communication: 'Communication',
  security: 'Security',
  data: 'Data',
  cloud: 'Cloud',
  testing: 'Testing',
  other: 'Other',
}

function ToggleSwitch({ enabled, onToggle, disabled }: { enabled: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors duration-200',
        enabled ? 'bg-sand' : 'bg-stone/30',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-3 w-3 rounded-full bg-parchment shadow-sm transition-transform duration-200 mt-0.5',
          enabled ? 'translate-x-3.5 ml-[-0.125rem]' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}

function PluginCard({ plugin, slug }: { plugin: PluginInfo; slug: string }) {
  const [toggling, setToggling] = useState(false)
  const queryClient = useQueryClient()

  async function handleToggle() {
    setToggling(true)
    try {
      const key = `${plugin.name}@${plugin.marketplace}`
      await togglePlugin(slug, key, !plugin.enabled)
      queryClient.invalidateQueries({ queryKey: ['plugins', slug] })
    } finally {
      setToggling(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-start gap-2.5">
          <Puzzle className={cn('w-3.5 h-3.5 mt-0.5 shrink-0', plugin.enabled ? 'text-sand' : 'text-stone/40')} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-parchment">{plugin.name}</span>
              {plugin.category && plugin.category !== 'other' && (
                <Badge variant="secondary" className="text-[10px] py-0">{CATEGORY_LABELS[plugin.category] || plugin.category}</Badge>
              )}
            </div>
            {plugin.description && (
              <p className="text-xs text-stone mt-0.5 line-clamp-2">{plugin.description}</p>
            )}
            {plugin.homepage && (
              <a
                href={plugin.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-stone/60 hover:text-sand mt-1 transition-colors"
              >
                <ExternalLink className="w-2.5 h-2.5" />
                docs
              </a>
            )}
          </div>
          <ToggleSwitch enabled={plugin.enabled} onToggle={handleToggle} disabled={toggling} />
        </div>
      </CardContent>
    </Card>
  )
}

function SkillCard({ name }: { name: string }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-2.5">
        <Blocks className="w-3.5 h-3.5 text-sand/70 shrink-0" />
        <span className="text-sm text-parchment">{name}</span>
      </CardContent>
    </Card>
  )
}

function AgentCard({ name }: { name: string }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-2.5">
        <Bot className="w-3.5 h-3.5 text-sand/70 shrink-0" />
        <span className="text-sm text-parchment">{name}</span>
      </CardContent>
    </Card>
  )
}

function CollapsibleSection({ title, count, defaultOpen, children }: {
  title: string
  count: number
  defaultOpen: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-left mb-2 group"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-stone" />
        ) : (
          <ChevronRight className="w-3 h-3 text-stone" />
        )}
        <span className="text-xs font-medium text-stone uppercase tracking-wider">{title}</span>
        <span className="text-[10px] text-stone/50">({count})</span>
      </button>
      {open && children}
    </div>
  )
}

export function PluginsTab({ slug }: { slug: string }) {
  const { data: plugins, isLoading: loadingPlugins } = usePlugins(slug)
  const { data: skills, isLoading: loadingSkills } = useSkills(slug)
  const { data: agents, isLoading: loadingAgents } = useAgents(slug)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const isLoading = loadingPlugins || loadingSkills || loadingAgents

  // Derive categories from plugin data
  const categories = useMemo(() => {
    if (!plugins?.length) return []
    const cats = new Set(plugins.map((p: PluginInfo) => p.category || 'other'))
    return Array.from(cats).sort()
  }, [plugins])

  // Filter plugins
  const filteredPlugins = useMemo(() => {
    if (!plugins) return []
    let filtered = plugins as PluginInfo[]
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      )
    }
    if (activeCategory) {
      filtered = filtered.filter(p => (p.category || 'other') === activeCategory)
    }
    return filtered
  }, [plugins, search, activeCategory])

  // Split into enabled vs available
  const enabledPlugins = filteredPlugins.filter(p => p.enabled)
  const availablePlugins = filteredPlugins.filter(p => !p.enabled)

  // Filter skills/agents by search
  const filteredSkills = useMemo(() => {
    if (!skills) return []
    if (!search) return skills
    const q = search.toLowerCase()
    return skills.filter(s => s.dirname.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
  }, [skills, search])

  const filteredAgents = useMemo(() => {
    if (!agents) return []
    if (!search) return agents
    const q = search.toLowerCase()
    return agents.filter(a => (a.name || a.filename).toLowerCase().includes(q))
  }, [agents, search])

  if (isLoading) return <div className="text-stone text-sm py-4">Loading...</div>

  const hasAnything = (plugins?.length || 0) + (skills?.length || 0) + (agents?.length || 0) > 0

  if (!hasAnything) {
    return (
      <div className="text-stone text-sm py-4">
        No plugins, skills, or agents configured for this space.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone/50" />
        <input
          type="text"
          placeholder="Search plugins, skills, agents..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-ink/50 border border-border-custom rounded-md text-parchment placeholder:text-stone/40 focus:outline-none focus:border-sand/40"
        />
      </div>

      {/* Category filters (only when not searching skills/agents specifically) */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setActiveCategory(null)}
            className={cn(
              'px-2 py-0.5 text-[10px] rounded-full border transition-colors',
              !activeCategory
                ? 'border-sand/40 text-sand bg-sand/10'
                : 'border-border-custom text-stone hover:text-parchment'
            )}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={cn(
                'px-2 py-0.5 text-[10px] rounded-full border transition-colors',
                activeCategory === cat
                  ? 'border-sand/40 text-sand bg-sand/10'
                  : 'border-border-custom text-stone hover:text-parchment'
              )}
            >
              {CATEGORY_LABELS[cat] || cat}
            </button>
          ))}
        </div>
      )}

      {/* Enabled plugins */}
      {enabledPlugins.length > 0 && (
        <CollapsibleSection title="Enabled" count={enabledPlugins.length} defaultOpen={true}>
          <div className="space-y-1">
            {enabledPlugins.map(p => (
              <PluginCard key={p.name} plugin={p} slug={slug} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Skills */}
      {filteredSkills.length > 0 && !activeCategory && (
        <CollapsibleSection title="Skills" count={filteredSkills.length} defaultOpen={true}>
          <div className="space-y-1">
            {filteredSkills.map(s => (
              <SkillCard key={s.dirname} name={s.dirname} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Agents */}
      {filteredAgents.length > 0 && !activeCategory && (
        <CollapsibleSection title="Agents" count={filteredAgents.length} defaultOpen={true}>
          <div className="space-y-1">
            {filteredAgents.map(a => (
              <AgentCard key={a.filename} name={a.name || a.filename} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Available marketplace plugins */}
      {availablePlugins.length > 0 && (
        <CollapsibleSection title="Marketplace" count={availablePlugins.length} defaultOpen={enabledPlugins.length === 0}>
          <div className="space-y-1">
            {availablePlugins.map(p => (
              <PluginCard key={p.name} plugin={p} slug={slug} />
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  )
}
