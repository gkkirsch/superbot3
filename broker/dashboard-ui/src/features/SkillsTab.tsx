import { useState, useEffect } from 'react'
import { useSkills, useAgents } from '@/hooks/useSpaces'
import {
  toggleSkill, fetchSkillDetail, fetchSkillFileContent, fetchAgentDetail,
} from '@/lib/api'
import type { PluginFile } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Blocks, Bot, ChevronDown, ChevronRight, ArrowLeft,
  Code2, File, Folder, X, FolderPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import type { SkillDef, AgentDef, SkillDetail, AgentDetail } from '@/lib/types'

type View = 'home' | 'skill-detail' | 'agent-detail' | 'add-skill'

// ── Source Badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source?: string }) {
  if (!source) return null
  if (source === 'space') return <Badge variant="outline" className="text-[9px] text-sand border-sand/30">Space</Badge>
  if (source === 'user') return <Badge variant="outline" className="text-[9px] text-stone border-stone/30">User</Badge>
  if (source.startsWith('plugin:')) {
    const pluginName = source.slice('plugin:'.length)
    return <Badge variant="outline" className="text-[9px] text-moss border-moss/30">Plugin: {pluginName}</Badge>
  }
  return null
}

// ── Shared ───────────────────────────────────────────────────────────────────

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-xs text-stone hover:text-parchment transition-colors -ml-0.5 mb-3">
      <ArrowLeft className="w-3.5 h-3.5" />{label}
    </button>
  )
}

function CollapsibleSection({ title, count, defaultOpen, children }: {
  title: string; count: number; defaultOpen: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 w-full text-left mb-2">
        {open ? <ChevronDown className="w-3 h-3 text-stone" /> : <ChevronRight className="w-3 h-3 text-stone" />}
        <span className="text-xs font-medium text-stone uppercase tracking-wider">{title}</span>
        <span className="text-[10px] text-stone/50">({count})</span>
      </button>
      {open && children}
    </div>
  )
}

// ── File Tree + Code Viewer ─────────────────────────────────────────────────

function FileTree({ files, onSelect, selectedPath }: { files: PluginFile[]; onSelect: (p: string) => void; selectedPath: string | null }) {
  const topLevel = files.filter(f => !f.path.includes('/'))
  const childrenOf = (dirPath: string) => files.filter(f => {
    const parent = f.path.substring(0, f.path.lastIndexOf('/'))
    return parent === dirPath
  })

  function renderEntry(entry: PluginFile, depth: number) {
    const indent = depth * 12
    if (entry.type === 'dir') {
      return (
        <div key={entry.path}>
          <div className="flex items-center gap-1.5 py-0.5 text-stone/70" style={{ paddingLeft: indent }}>
            <Folder className="w-3 h-3 text-sand/40 shrink-0" />
            <span className="text-[11px]">{entry.path.split('/').pop()}</span>
          </div>
          {childrenOf(entry.path).map(c => renderEntry(c, depth + 1))}
        </div>
      )
    }
    return (
      <button key={entry.path} onClick={() => onSelect(entry.path)}
        className={cn('flex items-center gap-1.5 py-0.5 w-full text-left rounded-sm transition-colors',
          selectedPath === entry.path ? 'bg-sand/10 text-sand' : 'text-stone hover:text-parchment hover:bg-ink/30'
        )} style={{ paddingLeft: indent }}>
        <File className="w-3 h-3 shrink-0" />
        <span className="text-[11px] truncate">{entry.path.split('/').pop()}</span>
        {entry.size !== undefined && entry.size > 1024 && (
          <span className="text-[9px] text-stone/30 ml-auto pr-1">{(entry.size / 1024).toFixed(0)}k</span>
        )}
      </button>
    )
  }

  return <div>{topLevel.map(e => renderEntry(e, 0))}</div>
}

function FilesPanel({ files, loading, fetchContent }: {
  files: PluginFile[] | null
  loading: boolean
  fetchContent: (path: string) => Promise<{ content: string | null; error?: string }>
}) {
  const [expanded, setExpanded] = useState(true)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  async function selectFile(filePath: string) {
    if (selectedFile === filePath) { setSelectedFile(null); setFileContent(null); return }
    setSelectedFile(filePath)
    setFileContent(null)
    setFileError(null)
    setFileLoading(true)
    try {
      const data = await fetchContent(filePath)
      if (data.error) { setFileError(data.error); setFileContent(null) }
      else { setFileContent(data.content) }
    } catch { setFileError('Failed to load file') }
    finally { setFileLoading(false) }
  }

  const fileCount = files ? files.filter(f => f.type === 'file').length : 0

  return (
    <div>
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1.5 w-full text-left mb-2">
        {expanded ? <ChevronDown className="w-3 h-3 text-stone" /> : <ChevronRight className="w-3 h-3 text-stone" />}
        <Code2 className="w-3 h-3 text-stone" />
        <span className="text-[10px] font-medium text-stone uppercase tracking-wider">Files</span>
        {files && <span className="text-[10px] text-stone/50">({fileCount})</span>}
        {loading && <span className="text-[10px] text-stone/40 ml-1">loading...</span>}
      </button>
      {expanded && files && (
        <div className="border border-border-custom rounded-md overflow-hidden">
          {files.length === 0 ? (
            <p className="text-xs text-stone/50 p-3">No files found.</p>
          ) : (
            <>
              <div className="p-2 max-h-48 overflow-y-auto bg-ink/20">
                <FileTree files={files} onSelect={selectFile} selectedPath={selectedFile} />
              </div>
              {selectedFile && (
                <div className="border-t border-border-custom">
                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-ink/30">
                    <span className="text-[10px] text-stone font-mono truncate">{selectedFile}</span>
                    <button onClick={() => { setSelectedFile(null); setFileContent(null) }} className="p-0.5 text-stone/50 hover:text-parchment transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="max-h-80 overflow-auto">
                    {fileLoading && <p className="text-xs text-stone/50 p-3">Loading...</p>}
                    {fileError && <p className="text-xs text-stone/50 p-3">{fileError}</p>}
                    {fileContent !== null && (
                      <pre className="text-[11px] leading-relaxed text-parchment/80 p-3 font-mono whitespace-pre overflow-x-auto">{fileContent}</pre>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Skill Card ──────────────────────────────────────────────────────────────

function SkillCardItem({ skill, slug, onClick }: { skill: SkillDef; slug: string; onClick: () => void }) {
  const [toggling, setToggling] = useState(false)
  const queryClient = useQueryClient()
  const isSpace = skill.source === 'space'
  const isDisabled = skill.enabled === false

  async function handleToggle() {
    setToggling(true)
    try {
      await toggleSkill(slug, skill.dirname, !skill.enabled)
      queryClient.invalidateQueries({ queryKey: ['skills', slug] })
    } finally { setToggling(false) }
  }

  return (
    <Card className={cn('cursor-pointer hover:border-border-custom/80 transition-colors', isDisabled && 'opacity-50')} onClick={onClick}>
      <CardContent className="p-2.5 flex items-center gap-2.5">
        <Blocks className={cn('w-3.5 h-3.5 shrink-0', isDisabled ? 'text-stone/40' : 'text-sand/70')} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn('text-xs font-medium', isDisabled ? 'text-stone' : 'text-parchment')}>{skill.name}</span>
            <SourceBadge source={skill.source} />
            {isDisabled && <Badge variant="outline" className="text-[9px] text-stone/50 border-stone/20">Disabled</Badge>}
          </div>
          {skill.description && <p className="text-[10px] text-stone mt-0.5 line-clamp-1">{skill.description}</p>}
        </div>
        {isSpace && (
          <Switch checked={skill.enabled !== false} onCheckedChange={handleToggle} disabled={toggling} onClick={(e) => e.stopPropagation()} />
        )}
        <ChevronRight className="w-3 h-3 text-stone/30 shrink-0" />
      </CardContent>
    </Card>
  )
}

// ── Agent Card ──────────────────────────────────────────────────────────────

function AgentCardItem({ agent, onClick }: { agent: AgentDef; onClick: () => void }) {
  return (
    <Card className="cursor-pointer hover:border-border-custom/80 transition-colors" onClick={onClick}>
      <CardContent className="p-2.5 flex items-center gap-2.5">
        <Bot className="w-3.5 h-3.5 text-sand/70 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-parchment">{agent.name || agent.filename}</span>
            <SourceBadge source={agent.source} />
          </div>
          {agent.description && <p className="text-[10px] text-stone mt-0.5 line-clamp-1">{agent.description}</p>}
        </div>
        <ChevronRight className="w-3 h-3 text-stone/30 shrink-0" />
      </CardContent>
    </Card>
  )
}

// ── Skill Detail View ───────────────────────────────────────────────────────

function SkillDetailView({ skill, slug, onBack }: { skill: SkillDef; slug: string; onBack: () => void }) {
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const queryClient = useQueryClient()
  const isSpace = skill.source === 'space'

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchSkillDetail(slug, skill.dirname, skill.source)
      .then(d => { if (!cancelled) setDetail(d) })
      .catch(() => { if (!cancelled) setDetail(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [slug, skill.dirname, skill.source])

  async function handleToggle() {
    setToggling(true)
    try {
      await toggleSkill(slug, skill.dirname, !skill.enabled)
      queryClient.invalidateQueries({ queryKey: ['skills', slug] })
    } finally { setToggling(false) }
  }

  if (loading) return <><BackButton onClick={onBack} label="Back" /><p className="text-xs text-stone">Loading...</p></>
  if (!detail) return <><BackButton onClick={onBack} label="Back" /><p className="text-xs text-stone">Skill not found.</p></>

  const fm = detail.frontmatter

  return (
    <div className="space-y-4">
      <BackButton onClick={onBack} label="Back" />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', skill.enabled !== false ? 'bg-sand/15' : 'bg-stone/10')}>
            <Blocks className={cn('w-4 h-4', skill.enabled !== false ? 'text-sand' : 'text-stone/50')} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-parchment">{fm.name || skill.name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <SourceBadge source={skill.source} />
              {fm['user-invocable'] && <Badge variant="outline" className="text-[10px]">user-invocable</Badge>}
              {skill.enabled === false && <Badge variant="outline" className="text-[9px] text-stone/50 border-stone/20">Disabled</Badge>}
            </div>
          </div>
        </div>
        {isSpace && (
          <Switch checked={skill.enabled !== false} onCheckedChange={handleToggle} disabled={toggling} />
        )}
      </div>
      {!isSpace && skill.source?.startsWith('plugin:') && (
        <p className="text-[10px] text-stone/60">This skill comes from a plugin. To disable it, toggle the plugin off in the Plugins tab.</p>
      )}
      {fm.description && <p className="text-xs text-stone leading-relaxed">{fm.description}</p>}
      {fm['allowed-tools'] && (
        <div>
          <h4 className="text-[10px] font-medium text-stone uppercase tracking-wider mb-1.5">Allowed Tools</h4>
          <div className="flex flex-wrap gap-1">
            {fm['allowed-tools'].split(',').map(t => (
              <span key={t.trim()} className="text-[10px] text-stone/70 bg-ink/40 px-2 py-0.5 rounded-full font-mono">{t.trim()}</span>
            ))}
          </div>
        </div>
      )}
      {detail.content && (
        <div>
          <h4 className="text-[10px] font-medium text-stone uppercase tracking-wider mb-1.5">Documentation</h4>
          <pre className="text-[11px] leading-relaxed text-parchment/70 bg-ink/20 p-3 rounded-md font-mono whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto">
            {detail.content.replace(/^---\n[\s\S]*?\n---\n*/, '')}
          </pre>
        </div>
      )}
      <FilesPanel files={detail.files} loading={false}
        fetchContent={(p) => fetchSkillFileContent(slug, skill.dirname, p, skill.source)} />
    </div>
  )
}

// ── Agent Detail View ───────────────────────────────────────────────────────

function AgentDetailView({ agent, slug, onBack }: { agent: AgentDef; slug: string; onBack: () => void }) {
  const [detail, setDetail] = useState<AgentDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchAgentDetail(slug, agent.filename, agent.source)
      .then(d => { if (!cancelled) setDetail(d) })
      .catch(() => { if (!cancelled) setDetail(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [slug, agent.filename, agent.source])

  if (loading) return <><BackButton onClick={onBack} label="Back" /><p className="text-xs text-stone">Loading...</p></>
  if (!detail) return <><BackButton onClick={onBack} label="Back" /><p className="text-xs text-stone">Agent not found.</p></>

  const fm = detail.frontmatter

  return (
    <div className="space-y-4">
      <BackButton onClick={onBack} label="Back" />
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-sand/15">
          <Bot className="w-4 h-4 text-sand" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-parchment">{fm.name || agent.name || agent.filename.replace('.md', '')}</h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <SourceBadge source={agent.source} />
          </div>
        </div>
      </div>
      {agent.source?.startsWith('plugin:') && (
        <p className="text-[10px] text-stone/60">This agent comes from a plugin. It is read-only.</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {fm.model && <Badge variant="outline" className="text-[10px]">{fm.model}</Badge>}
        {fm.permissionMode && <Badge variant="secondary" className="text-[10px]">{fm.permissionMode}</Badge>}
        {fm.maxTurns && <Badge variant="outline" className="text-[10px]">{fm.maxTurns} turns</Badge>}
      </div>
      {fm.description && <p className="text-xs text-stone leading-relaxed">{fm.description}</p>}
      {fm.skills && (
        <div>
          <h4 className="text-[10px] font-medium text-stone uppercase tracking-wider mb-1.5">Skills</h4>
          <div className="flex flex-wrap gap-1">
            {fm.skills.replace(/[\[\]]/g, '').split(',').map(s => (
              <span key={s.trim()} className="text-[10px] text-stone/70 bg-ink/40 px-2 py-0.5 rounded-full">{s.trim()}</span>
            ))}
          </div>
        </div>
      )}
      {fm.tools && (
        <div>
          <h4 className="text-[10px] font-medium text-stone uppercase tracking-wider mb-1.5">Tools</h4>
          <div className="flex flex-wrap gap-1">
            {fm.tools.replace(/[\[\]]/g, '').split(',').map(t => (
              <span key={t.trim()} className="text-[10px] text-stone/70 bg-ink/40 px-2 py-0.5 rounded-full font-mono">{t.trim()}</span>
            ))}
          </div>
        </div>
      )}
      {detail.content && (
        <div>
          <h4 className="text-[10px] font-medium text-stone uppercase tracking-wider mb-1.5">Full Definition</h4>
          <pre className="text-[11px] leading-relaxed text-parchment/70 bg-ink/20 p-3 rounded-md font-mono whitespace-pre-wrap overflow-x-auto max-h-80 overflow-y-auto">
            {detail.content}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Add Skill View ──────────────────────────────────────────────────────────

function AddSkillView({ slug, onBack }: { slug: string; onBack: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const queryClient = useQueryClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch(`/api/spaces/${slug}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      })
      const data = await res.json()
      if (data.ok) {
        setResult('Skill created successfully.')
        queryClient.invalidateQueries({ queryKey: ['skills', slug] })
        setName('')
        setDescription('')
      } else {
        setResult(data.error || 'Failed to create skill.')
      }
    } catch { setResult('Failed to create skill.') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-4">
      <BackButton onClick={onBack} label="Back" />
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-sand/15">
          <FolderPlus className="w-4 h-4 text-sand" />
        </div>
        <h3 className="text-sm font-semibold text-parchment">Add Skill</h3>
      </div>
      <p className="text-xs text-stone">Create a new skill directory with a SKILL.md file.</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Skill name (e.g. my-custom-skill)"
          className="w-full px-3 py-2 text-xs bg-ink/50 border border-border-custom rounded-md text-parchment placeholder:text-stone/40 focus:outline-none focus:border-sand/40"
          autoFocus
        />
        <textarea
          value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)"
          rows={3}
          className="w-full px-3 py-2 text-xs bg-ink/50 border border-border-custom rounded-md text-parchment placeholder:text-stone/40 focus:outline-none focus:border-sand/40 resize-none"
        />
        <button type="submit" disabled={submitting || !name.trim()}
          className="w-full py-2 text-xs font-medium rounded-md bg-sand/20 text-sand hover:bg-sand/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {submitting ? 'Creating...' : 'Create Skill'}
        </button>
      </form>
      {result && <p className={cn('text-xs', result.includes('success') ? 'text-moss' : 'text-ember')}>{result}</p>}
    </div>
  )
}

// ── Main SkillsTab ──────────────────────────────────────────────────────────

export function SkillsTab({ slug }: { slug: string }) {
  const { data: skills, isLoading: loadingSkills } = useSkills(slug)
  const { data: agents, isLoading: loadingAgents } = useAgents(slug)
  const [view, setView] = useState<View>('home')
  const [selectedSkill, setSelectedSkill] = useState<SkillDef | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<AgentDef | null>(null)

  if (loadingSkills || loadingAgents) return <div className="text-stone text-sm py-4">Loading...</div>

  const allSkills = (skills || []) as SkillDef[]
  const allAgents = (agents || []) as AgentDef[]

  function goBack() {
    setView('home')
    setSelectedSkill(null)
    setSelectedAgent(null)
  }

  if (view === 'skill-detail' && selectedSkill) {
    return <SkillDetailView skill={selectedSkill} slug={slug} onBack={goBack} />
  }
  if (view === 'agent-detail' && selectedAgent) {
    return <AgentDetailView agent={selectedAgent} slug={slug} onBack={goBack} />
  }
  if (view === 'add-skill') {
    return <AddSkillView slug={slug} onBack={goBack} />
  }

  // Group skills by source
  const spaceSkills = allSkills.filter(s => s.source === 'space')
  const pluginSkills = allSkills.filter(s => s.source?.startsWith('plugin:'))
  const userSkills = allSkills.filter(s => s.source === 'user')

  return (
    <div className="space-y-4">
      {/* Skills section */}
      <CollapsibleSection title="Skills" count={allSkills.length} defaultOpen={true}>
        <div className="space-y-1">
          {allSkills.length === 0 ? (
            <p className="text-xs text-stone">No skills found.</p>
          ) : (
            <>
              {spaceSkills.length > 0 && spaceSkills.map(s => (
                <SkillCardItem key={`space:${s.dirname}`} skill={s} slug={slug}
                  onClick={() => { setSelectedSkill(s); setView('skill-detail') }} />
              ))}
              {pluginSkills.length > 0 && pluginSkills.map(s => (
                <SkillCardItem key={`${s.source}:${s.dirname}`} skill={s} slug={slug}
                  onClick={() => { setSelectedSkill(s); setView('skill-detail') }} />
              ))}
              {userSkills.length > 0 && userSkills.map(s => (
                <SkillCardItem key={`user:${s.dirname}`} skill={s} slug={slug}
                  onClick={() => { setSelectedSkill(s); setView('skill-detail') }} />
              ))}
            </>
          )}
        </div>
        <button onClick={() => setView('add-skill')}
          className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 text-[11px] text-stone hover:text-parchment border border-dashed border-border-custom rounded-md hover:bg-ink/30 transition-colors">
          <FolderPlus className="w-3 h-3" />Add skill
        </button>
      </CollapsibleSection>

      {/* Agents section */}
      <CollapsibleSection title="Agents" count={allAgents.length} defaultOpen={true}>
        <div className="space-y-1">
          {allAgents.length === 0 ? (
            <p className="text-xs text-stone">No agents found.</p>
          ) : (
            allAgents.map(a => (
              <AgentCardItem key={`${a.source}:${a.filename}`} agent={a}
                onClick={() => { setSelectedAgent(a); setView('agent-detail') }} />
            ))
          )}
        </div>
      </CollapsibleSection>
    </div>
  )
}
