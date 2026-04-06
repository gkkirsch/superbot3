import { useState, useMemo, useCallback, useEffect } from 'react'
import { usePlugins, useSkills, useAgents, usePluginCredentials } from '@/hooks/useSpaces'
import {
  togglePlugin, toggleSkill, fetchPluginFiles, fetchPluginFileContent,
  fetchSkillDetail, fetchSkillFileContent, fetchAgentDetail,
  savePluginCredential, deletePluginCredential,
} from '@/lib/api'
import type { PluginFile } from '@/lib/api'
import { FileExplorer } from '@/components/FileExplorer'
import type { FileItem } from '@/components/FileExplorer'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Puzzle, Blocks, Bot, Search, ExternalLink,
  ChevronDown, ChevronRight, ArrowLeft,
  Server, Tag, Code2, Store, FolderPlus,
  Key, Check, AlertTriangle, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import type { PluginInfo, SkillDetail, AgentDetail, SkillDef, AgentDef, CredentialDeclaration } from '@/lib/types'

type View = 'home' | 'browse' | 'plugin-detail' | 'skill-detail' | 'agent-detail' | 'add-marketplace' | 'add-skill'

const PAGE_SIZE = 20

const CATEGORY_LABELS: Record<string, string> = {
  development: 'Development', productivity: 'Productivity', communication: 'Communication',
  security: 'Security', data: 'Data', database: 'Database', cloud: 'Cloud',
  testing: 'Testing', deployment: 'Deployment', monitoring: 'Monitoring',
  automation: 'Automation', design: 'Design', learning: 'Learning',
  location: 'Location', math: 'Math', migration: 'Migration', other: 'Other',
}

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

function PluginCard({ plugin, slug, onClick, compact }: { plugin: PluginInfo; slug: string; onClick: () => void; compact?: boolean }) {
  const [toggling, setToggling] = useState(false)
  const queryClient = useQueryClient()
  async function handleToggle() {
    setToggling(true)
    try {
      await togglePlugin(slug, `${plugin.name}@${plugin.marketplace}`, !plugin.enabled)
      queryClient.invalidateQueries({ queryKey: ['plugins', slug] })
    } finally { setToggling(false) }
  }
  return (
    <Card className="cursor-pointer hover:border-border-custom/80 transition-colors" onClick={onClick}>
      <CardContent className={compact ? 'p-2.5' : 'p-3'}>
        <div className="flex items-center gap-2.5">
          <Puzzle className={cn('w-3.5 h-3.5 shrink-0', plugin.enabled ? 'text-sand' : 'text-stone/40')} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn('font-medium text-parchment', compact ? 'text-xs' : 'text-sm')}>{plugin.name}</span>
              {plugin.marketplace !== 'claude-plugins-official' && (
                <span className="text-[9px] text-stone/50">{plugin.marketplace}</span>
              )}
            </div>
            {!compact && plugin.description && (
              <p className="text-xs text-stone mt-0.5 line-clamp-1">{plugin.description}</p>
            )}
          </div>
          <Switch checked={plugin.enabled} onCheckedChange={handleToggle} disabled={toggling} onClick={(e) => e.stopPropagation()} />
        </div>
      </CardContent>
    </Card>
  )
}

function SkillCard({ skill, slug, onClick }: { skill: SkillDef; slug: string; onClick: () => void }) {
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

function AgentCard({ agent, onClick }: { agent: AgentDef; onClick: () => void }) {
  return (
    <Card className="cursor-pointer hover:border-border-custom/80 transition-colors" onClick={onClick}>
      <CardContent className="p-2.5 flex items-center gap-2.5">
        <Bot className="w-3.5 h-3.5 text-sand/70 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-parchment">{agent.name || agent.filename}</span>
          </div>
          {agent.description && <p className="text-[10px] text-stone mt-0.5 line-clamp-1">{agent.description}</p>}
        </div>
        <ChevronRight className="w-3 h-3 text-stone/30 shrink-0" />
      </CardContent>
    </Card>
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

// ── Credential Form ─────────────────────────────────────────────────────────

function CredentialForm({ pluginName, slug }: { pluginName: string; slug: string }) {
  const { data: credStatus, refetch } = usePluginCredentials(slug, pluginName)
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [feedback, setFeedback] = useState<Record<string, { type: 'saved' | 'validated' | 'invalid' | 'error'; message?: string } | null>>({})
  const queryClient = useQueryClient()

  if (!credStatus || credStatus.credentials.length === 0) return null

  async function handleSave(cred: CredentialDeclaration) {
    const val = values[cred.key]
    if (!val?.trim()) return
    setSaving(s => ({ ...s, [cred.key]: true }))
    setFeedback(f => ({ ...f, [cred.key]: null }))
    try {
      const result = await savePluginCredential(slug, pluginName, cred.key, val.trim())
      if (result.validation) {
        if (result.validation.valid) {
          setFeedback(f => ({ ...f, [cred.key]: { type: 'validated' } }))
        } else {
          setFeedback(f => ({ ...f, [cred.key]: { type: 'invalid', message: result.validation!.error } }))
        }
      } else {
        setFeedback(f => ({ ...f, [cred.key]: { type: 'saved' } }))
      }
      setValues(v => ({ ...v, [cred.key]: '' }))
      refetch()
      queryClient.invalidateQueries({ queryKey: ['plugins', slug] })
      queryClient.invalidateQueries({ queryKey: ['skills', slug] })
      setTimeout(() => setFeedback(f => ({ ...f, [cred.key]: null })), 5000)
    } catch {
      setFeedback(f => ({ ...f, [cred.key]: { type: 'error' } }))
    } finally {
      setSaving(s => ({ ...s, [cred.key]: false }))
    }
  }

  async function handleDelete(cred: CredentialDeclaration) {
    setSaving(s => ({ ...s, [cred.key]: true }))
    try {
      await deletePluginCredential(slug, pluginName, cred.key)
      refetch()
      queryClient.invalidateQueries({ queryKey: ['plugins', slug] })
      queryClient.invalidateQueries({ queryKey: ['skills', slug] })
    } catch {
      setFeedback(f => ({ ...f, [cred.key]: { type: 'error' } }))
    } finally {
      setSaving(s => ({ ...s, [cred.key]: false }))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Key className="h-3.5 w-3.5 text-sand" />
        <span className="text-xs font-medium text-parchment">Credentials</span>
      </div>
      {credStatus.credentials.map(cred => {
        const isConfigured = credStatus.configured[cred.key]
        return (
          <div key={cred.key} className="rounded-lg bg-ink border border-border-custom p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-parchment">{cred.label || cred.key}</span>
                {cred.required && <span className="text-[10px] text-ember/70">required</span>}
              </div>
              {isConfigured ? (
                <span className="flex items-center gap-1 text-[10px] text-green-400">
                  <Check className="h-3 w-3" /> Configured
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-amber-400">
                  <AlertTriangle className="h-3 w-3" /> Not configured
                </span>
              )}
            </div>
            {cred.description && <p className="text-[11px] text-stone mb-2">{cred.description}</p>}
            <div className="flex gap-2">
              <input
                type="password"
                value={values[cred.key] || ''}
                onChange={e => setValues(v => ({ ...v, [cred.key]: e.target.value }))}
                placeholder={isConfigured ? '••••••••' : 'Enter value...'}
                className="flex-1 px-2.5 py-1.5 text-xs bg-surface border border-border-custom rounded-md text-parchment placeholder:text-stone/40 focus:outline-none focus:border-sand/40"
              />
              <button
                onClick={() => handleSave(cred)}
                disabled={saving[cred.key] || !values[cred.key]?.trim()}
                className="px-3 py-1.5 text-xs rounded-md bg-sand/15 text-sand hover:bg-sand/25 transition-colors disabled:opacity-40"
              >
                {saving[cred.key] ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
              </button>
              {isConfigured && (
                <button
                  onClick={() => handleDelete(cred)}
                  disabled={saving[cred.key]}
                  className="px-2 py-1.5 text-xs rounded-md text-ember/70 hover:bg-ember/10 transition-colors disabled:opacity-40"
                >
                  Clear
                </button>
              )}
            </div>
            {feedback[cred.key]?.type === 'validated' && <p className="text-[10px] text-green-400 mt-1">Saved to Keychain — key verified</p>}
            {feedback[cred.key]?.type === 'saved' && <p className="text-[10px] text-green-400 mt-1">Saved to Keychain</p>}
            {feedback[cred.key]?.type === 'invalid' && <p className="text-[10px] text-amber-400 mt-1">Saved to Keychain — key appears invalid{feedback[cred.key]!.message ? `: ${feedback[cred.key]!.message}` : ''}</p>}
            {feedback[cred.key]?.type === 'error' && <p className="text-[10px] text-ember mt-1">Failed to save</p>}
          </div>
        )
      })}
    </div>
  )
}

// ── Plugin Detail ────────────────────────────────────────────────────────────

function PluginDetailView({ plugin, slug, onBack }: { plugin: PluginInfo; slug: string; onBack: () => void }) {
  const [toggling, setToggling] = useState(false)
  const [files, setFiles] = useState<PluginFile[] | null>(null)
  const [filesLoading, setFilesLoading] = useState(true)
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false
    setFilesLoading(true)
    fetchPluginFiles(slug, plugin.marketplace, plugin.name)
      .then(data => { if (!cancelled) setFiles(data.files) })
      .catch(() => { if (!cancelled) setFiles([]) })
      .finally(() => { if (!cancelled) setFilesLoading(false) })
    return () => { cancelled = true }
  }, [slug, plugin.marketplace, plugin.name])

  async function handleToggle() {
    setToggling(true)
    try {
      await togglePlugin(slug, `${plugin.name}@${plugin.marketplace}`, !plugin.enabled)
      queryClient.invalidateQueries({ queryKey: ['plugins', slug] })
    } finally { setToggling(false) }
  }

  return (
    <div className="space-y-4">
      <BackButton onClick={onBack} label="Back" />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', plugin.enabled ? 'bg-sand/15' : 'bg-stone/10')}>
            <Puzzle className={cn('w-4 h-4', plugin.enabled ? 'text-sand' : 'text-stone/50')} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-parchment">{plugin.name}</h3>
            {plugin.author && <p className="text-[10px] text-stone/60">by {plugin.author}</p>}
          </div>
        </div>
        <Switch checked={plugin.enabled} onCheckedChange={handleToggle} disabled={toggling} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {plugin.category && plugin.category !== 'other' && <Badge variant="secondary" className="text-[10px]">{CATEGORY_LABELS[plugin.category] || plugin.category}</Badge>}
        <Badge variant="outline" className="text-[10px]">{plugin.marketplace}</Badge>
        {plugin.version && <Badge variant="outline" className="text-[10px]">v{plugin.version}</Badge>}
        {plugin.strict !== null && <Badge variant={plugin.strict ? 'success' : 'default'} className="text-[10px]">{plugin.strict ? 'strict' : 'permissive'}</Badge>}
        {plugin.installed && <Badge variant="success" className="text-[10px]">installed</Badge>}
      </div>
      {plugin.description && <p className="text-xs text-stone leading-relaxed">{plugin.description}</p>}
      {plugin.skills && plugin.skills.length > 0 && (
        <div>
          <h4 className="text-[10px] font-medium text-stone uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><Blocks className="w-3 h-3" /> Skills</h4>
          <div className="space-y-1">
            {plugin.skills.map(s => <div key={s} className="flex items-center gap-2 px-2.5 py-1.5 bg-ink/30 rounded-md"><Blocks className="w-3 h-3 text-sand/60 shrink-0" /><span className="text-xs text-parchment/80 font-mono">{s}</span></div>)}
          </div>
        </div>
      )}
      {plugin.lspServers && plugin.lspServers.length > 0 && (
        <div>
          <h4 className="text-[10px] font-medium text-stone uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><Server className="w-3 h-3" /> Language Servers</h4>
          <div className="space-y-1">
            {plugin.lspServers.map(l => <div key={l} className="flex items-center gap-2 px-2.5 py-1.5 bg-ink/30 rounded-md"><Code2 className="w-3 h-3 text-sand/60 shrink-0" /><span className="text-xs text-parchment/80 font-mono">{l}</span></div>)}
          </div>
        </div>
      )}
      {plugin.tags && plugin.tags.length > 0 && (
        <div>
          <h4 className="text-[10px] font-medium text-stone uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><Tag className="w-3 h-3" /> Tags</h4>
          <div className="flex flex-wrap gap-1">{plugin.tags.map(t => <span key={t} className="text-[10px] text-stone/70 bg-ink/40 px-2 py-0.5 rounded-full">{t}</span>)}</div>
        </div>
      )}
      {plugin.keywords && plugin.keywords.length > 0 && (
        <div>
          <h4 className="text-[10px] font-medium text-stone uppercase tracking-wider mb-1.5">Keywords</h4>
          <div className="flex flex-wrap gap-1">{plugin.keywords.map(k => <span key={k} className="text-[10px] text-stone/70 bg-ink/40 px-2 py-0.5 rounded-full">{k}</span>)}</div>
        </div>
      )}
      {plugin.homepage && (
        <a href={plugin.homepage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-stone hover:text-sand transition-colors">
          <ExternalLink className="w-3 h-3" /> Homepage
        </a>
      )}
      {plugin.installed && <CredentialForm pluginName={plugin.name} slug={slug} />}
      {plugin.hasFiles ? (
        filesLoading ? (
          <p className="text-xs text-stone">Loading files...</p>
        ) : files && files.length > 0 ? (
          <FileExplorer
            items={files.map((f): FileItem => ({ name: f.path, type: f.type, size: f.size }))}
            onFileRead={async (path) => {
              const data = await fetchPluginFileContent(slug, plugin.marketplace, plugin.name, path)
              return { content: data.content || '' }
            }}
            title={`${plugin.name} files`}
          />
        ) : (
          <p className="text-xs text-stone/50">No files found on disk.</p>
        )
      ) : (
        <div className="border border-border-custom rounded-md p-3">
          <p className="text-xs text-stone/60">Plugin files not available locally. Run <code className="text-[10px] bg-ink/40 px-1 py-0.5 rounded font-mono">claude plugins install {plugin.name}</code> to download.</p>
          {plugin.source && plugin.source.startsWith('http') && (
            <a href={plugin.source} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-stone/50 hover:text-sand mt-1.5 transition-colors">
              <ExternalLink className="w-3 h-3" /> View source repository
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ── Skill Detail ─────────────────────────────────────────────────────────────

function SkillDetailView({ skillName, slug, source, skillEnabled, onBack }: { skillName: string; slug: string; source?: string; skillEnabled?: boolean; onBack: () => void }) {
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const queryClient = useQueryClient()
  const isSpace = source === 'space'

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchSkillDetail(slug, skillName, source)
      .then(d => { if (!cancelled) setDetail(d) })
      .catch(() => { if (!cancelled) setDetail(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [slug, skillName, source])

  async function handleToggle() {
    setToggling(true)
    try {
      await toggleSkill(slug, skillName, !skillEnabled)
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
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', skillEnabled !== false ? 'bg-sand/15' : 'bg-stone/10')}>
            <Blocks className={cn('w-4 h-4', skillEnabled !== false ? 'text-sand' : 'text-stone/50')} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-parchment">{fm.name || skillName}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <SourceBadge source={source} />
              {fm['user-invocable'] && <Badge variant="outline" className="text-[10px]">user-invocable</Badge>}
              {skillEnabled === false && <Badge variant="outline" className="text-[9px] text-stone/50 border-stone/20">Disabled</Badge>}
            </div>
          </div>
        </div>
        {isSpace && (
          <Switch checked={skillEnabled !== false} onCheckedChange={handleToggle} disabled={toggling} />
        )}
      </div>
      {!isSpace && source?.startsWith('plugin:') && (
        <p className="text-[10px] text-stone/60">This skill comes from a plugin. To disable it, toggle the plugin off.</p>
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
      {/* SKILL.md content (strip frontmatter) */}
      {detail.content && (
        <div>
          <h4 className="text-[10px] font-medium text-stone uppercase tracking-wider mb-1.5">Documentation</h4>
          <pre className="text-[11px] leading-relaxed text-parchment/70 bg-ink/20 p-3 rounded-md font-mono whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto">
            {detail.content.replace(/^---\n[\s\S]*?\n---\n*/, '')}
          </pre>
        </div>
      )}
      {detail.files && detail.files.length > 0 && (
        <FileExplorer
          items={detail.files.map((f): FileItem => ({ name: f.path, type: f.type, size: f.size }))}
          onFileRead={async (path) => {
            const data = await fetchSkillFileContent(slug, skillName, path, source)
            return { content: data.content || '' }
          }}
          title={`${skillName} files`}
        />
      )}
    </div>
  )
}

// ── Agent Detail ─────────────────────────────────────────────────────────────

function AgentDetailView({ agentFilename, slug, source, onBack }: { agentFilename: string; slug: string; source?: string; onBack: () => void }) {
  const [detail, setDetail] = useState<AgentDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchAgentDetail(slug, agentFilename, source)
      .then(d => { if (!cancelled) setDetail(d) })
      .catch(() => { if (!cancelled) setDetail(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [slug, agentFilename, source])

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
          <h3 className="text-sm font-semibold text-parchment">{fm.name || agentFilename.replace('.md', '')}</h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <SourceBadge source={source} />
          </div>
        </div>
      </div>
      {source?.startsWith('plugin:') && (
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

// ── Add Marketplace View ─────────────────────────────────────────────────────

function AddMarketplaceView({ slug, onBack }: { slug: string; onBack: () => void }) {
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch(`/api/spaces/${slug}/plugins/add-marketplace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      setResult(data.ok ? 'Marketplace added successfully.' : (data.error || 'Failed to add marketplace.'))
    } catch { setResult('Failed to add marketplace.') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-4">
      <BackButton onClick={onBack} label="Back" />
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-sand/15">
          <Store className="w-4 h-4 text-sand" />
        </div>
        <h3 className="text-sm font-semibold text-parchment">Add Marketplace</h3>
      </div>
      <p className="text-xs text-stone">Add a plugin marketplace by providing its URL or GitHub repo.</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://github.com/org/marketplace or marketplace URL..."
          className="w-full px-3 py-2 text-xs bg-ink/50 border border-border-custom rounded-md text-parchment placeholder:text-stone/40 focus:outline-none focus:border-sand/40"
          autoFocus
        />
        <button type="submit" disabled={submitting || !url.trim()}
          className="w-full py-2 text-xs font-medium rounded-md bg-sand/20 text-sand hover:bg-sand/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {submitting ? 'Adding...' : 'Add Marketplace'}
        </button>
      </form>
      {result && <p className={cn('text-xs', result.includes('success') ? 'text-moss' : 'text-ember')}>{result}</p>}
    </div>
  )
}

// ── Add Skill View ───────────────────────────────────────────────────────────

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

// ── Browse View ──────────────────────────────────────────────────────────────

function BrowseView({ slug, plugins, onBack, onSelect, onNavigate }: {
  slug: string; plugins: PluginInfo[]; onBack: () => void; onSelect: (p: PluginInfo) => void; onNavigate: (v: View) => void
}) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const categories = useMemo(() => {
    const cats = new Set(plugins.map(p => p.category || 'other'))
    return Array.from(cats).sort()
  }, [plugins])

  const filtered = useMemo(() => {
    let list = plugins
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || (p.keywords || []).some(k => k.toLowerCase().includes(q)))
    }
    if (activeCategory) list = list.filter(p => (p.category || 'other') === activeCategory)
    return list
  }, [plugins, search, activeCategory])

  const visible = filtered.slice(0, page * PAGE_SIZE)
  const hasMore = filtered.length > visible.length

  return (
    <div className="space-y-3">
      <BackButton onClick={onBack} label="Installed" />
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone/50" />
        <input type="text" placeholder="Search marketplace..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }} autoFocus
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-ink/50 border border-border-custom rounded-md text-parchment placeholder:text-stone/40 focus:outline-none focus:border-sand/40" />
      </div>
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1">
          <button onClick={() => { setActiveCategory(null); setPage(1) }}
            className={cn('px-2 py-0.5 text-[10px] rounded-full border transition-colors', !activeCategory ? 'border-sand/40 text-sand bg-sand/10' : 'border-border-custom text-stone hover:text-parchment')}>All</button>
          {categories.map(cat => (
            <button key={cat} onClick={() => { setActiveCategory(activeCategory === cat ? null : cat); setPage(1) }}
              className={cn('px-2 py-0.5 text-[10px] rounded-full border transition-colors', activeCategory === cat ? 'border-sand/40 text-sand bg-sand/10' : 'border-border-custom text-stone hover:text-parchment')}>
              {CATEGORY_LABELS[cat] || cat}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => onNavigate('add-marketplace')} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] text-stone hover:text-parchment border border-dashed border-border-custom rounded-md hover:bg-ink/30 transition-colors">
          <Store className="w-3 h-3" />Add marketplace
        </button>
        <button onClick={() => onNavigate('add-skill')} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] text-stone hover:text-parchment border border-dashed border-border-custom rounded-md hover:bg-ink/30 transition-colors">
          <FolderPlus className="w-3 h-3" />Add skill
        </button>
      </div>
      <p className="text-[10px] text-stone/50">
        {filtered.length} plugin{filtered.length !== 1 ? 's' : ''}{search && ' matching'}{activeCategory && ` in ${CATEGORY_LABELS[activeCategory] || activeCategory}`}
      </p>
      <div className="space-y-1">{visible.map(p => <PluginCard key={`${p.name}@${p.marketplace}`} plugin={p} slug={slug} onClick={() => onSelect(p)} />)}</div>
      {hasMore && (
        <button onClick={() => setPage(prev => prev + 1)} className="w-full py-1.5 text-xs text-stone hover:text-parchment border border-border-custom rounded-md hover:bg-ink/30 transition-colors">
          Show more ({filtered.length - visible.length} remaining)
        </button>
      )}
      {filtered.length === 0 && <p className="text-xs text-stone py-4 text-center">No plugins found.</p>}
    </div>
  )
}

// ── Home View ────────────────────────────────────────────────────────────────

function HomeView({ slug, plugins, skills, agents, onBrowse, onSelectPlugin, onSelectSkill, onSelectAgent, onAddSkill }: {
  slug: string; plugins: PluginInfo[]; skills: SkillDef[]; agents: AgentDef[]
  onBrowse: () => void; onSelectPlugin: (p: PluginInfo) => void; onSelectSkill: (s: SkillDef) => void; onSelectAgent: (a: AgentDef) => void; onAddSkill: () => void
}) {
  const enabledPlugins = plugins.filter(p => p.enabled)
  const totalAvailable = plugins.filter(p => !p.enabled).length

  return (
    <div className="space-y-4">
      <button onClick={onBrowse} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-stone/50 bg-ink/50 border border-border-custom rounded-md hover:border-sand/30 hover:text-stone transition-colors text-left">
        <Search className="w-3.5 h-3.5 shrink-0" /><span>Search plugins & marketplace...</span><ChevronRight className="w-3 h-3 ml-auto" />
      </button>
      {enabledPlugins.length > 0 && (
        <CollapsibleSection title="Enabled" count={enabledPlugins.length} defaultOpen={true}>
          <div className="space-y-1">{enabledPlugins.map(p => <PluginCard key={`${p.name}@${p.marketplace}`} plugin={p} slug={slug} onClick={() => onSelectPlugin(p)} compact />)}</div>
        </CollapsibleSection>
      )}
      <CollapsibleSection title="Skills" count={skills.length} defaultOpen={true}>
        {skills.length > 0 ? (
          <div className="space-y-1">{skills.map(s => <SkillCard key={`${s.source}:${s.dirname}`} skill={s} slug={slug} onClick={() => onSelectSkill(s)} />)}</div>
        ) : (
          <p className="text-xs text-stone mb-2">No skills found.</p>
        )}
        <button onClick={onAddSkill}
          className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 text-[11px] text-stone hover:text-parchment border border-dashed border-border-custom rounded-md hover:bg-ink/30 transition-colors">
          <FolderPlus className="w-3 h-3" />Add skill
        </button>
      </CollapsibleSection>
      <CollapsibleSection title="Agents" count={agents.length} defaultOpen={true}>
        {agents.length > 0 ? (
          <div className="space-y-1">{agents.map(a => <AgentCard key={`${a.source}:${a.filename}`} agent={a} onClick={() => onSelectAgent(a)} />)}</div>
        ) : (
          <p className="text-xs text-stone">No agents found.</p>
        )}
      </CollapsibleSection>
      <button onClick={onBrowse} className="w-full flex items-center justify-between px-3 py-2.5 border border-border-custom rounded-md hover:bg-ink/30 transition-colors group">
        <div className="flex items-center gap-2.5">
          <Store className="w-3.5 h-3.5 text-stone group-hover:text-sand transition-colors" />
          <span className="text-xs text-stone group-hover:text-parchment transition-colors">Browse marketplace</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-stone/40">{totalAvailable} available</span>
          <ChevronRight className="w-3 h-3 text-stone/40 group-hover:text-stone transition-colors" />
        </div>
      </button>
      {enabledPlugins.length === 0 && skills.length === 0 && agents.length === 0 && (
        <div className="text-center py-6">
          <Puzzle className="w-8 h-8 text-stone/20 mx-auto mb-2" />
          <p className="text-xs text-stone">No plugins enabled yet.</p>
          <button onClick={onBrowse} className="text-xs text-sand hover:text-sand/80 mt-1 transition-colors">Browse marketplace</button>
        </div>
      )}
    </div>
  )
}

// ── Main PluginsTab ──────────────────────────────────────────────────────────

export function PluginsTab({ slug }: { slug: string }) {
  const { data: plugins, isLoading: loadingPlugins } = usePlugins(slug)
  const { data: skills, isLoading: loadingSkills } = useSkills(slug)
  const { data: agents, isLoading: loadingAgents } = useAgents(slug)
  const [view, setView] = useState<View>('home')
  const [selectedPlugin, setSelectedPlugin] = useState<PluginInfo | null>(null)
  const [selectedSkill, setSelectedSkill] = useState<{ name: string; source?: string; enabled?: boolean } | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<{ filename: string; source?: string } | null>(null)
  const [prevView, setPrevView] = useState<View>('home')

  const isLoading = loadingPlugins || loadingSkills || loadingAgents

  const currentPlugin = useMemo(() => {
    if (!selectedPlugin || !plugins) return selectedPlugin
    return (plugins as PluginInfo[]).find(p => p.name === selectedPlugin.name && p.marketplace === selectedPlugin.marketplace) || selectedPlugin
  }, [selectedPlugin, plugins])

  const navigateTo = useCallback((next: View) => { setPrevView(view); setView(next) }, [view])

  const goBack = useCallback(() => {
    if (view === 'plugin-detail' || view === 'skill-detail' || view === 'agent-detail') {
      setSelectedPlugin(null); setSelectedSkill(null); setSelectedAgent(null)
      setView(prevView === view ? 'home' : prevView)
    } else if (view === 'add-marketplace' || view === 'add-skill') {
      setView('browse')
    } else {
      setView('home')
    }
  }, [view, prevView])

  if (isLoading) return <div className="text-stone text-sm py-4">Loading...</div>

  const allPlugins = (plugins || []) as PluginInfo[]
  const allSkills = (skills || []) as SkillDef[]
  const allAgents = (agents || []) as AgentDef[]

  if (view === 'plugin-detail' && currentPlugin) return <PluginDetailView plugin={currentPlugin} slug={slug} onBack={goBack} />
  if (view === 'skill-detail' && selectedSkill) return <SkillDetailView skillName={selectedSkill.name} slug={slug} source={selectedSkill.source} skillEnabled={selectedSkill.enabled} onBack={goBack} />
  if (view === 'agent-detail' && selectedAgent) return <AgentDetailView agentFilename={selectedAgent.filename} slug={slug} source={selectedAgent.source} onBack={goBack} />
  if (view === 'add-marketplace') return <AddMarketplaceView slug={slug} onBack={goBack} />
  if (view === 'add-skill') return <AddSkillView slug={slug} onBack={goBack} />

  if (view === 'browse') return <BrowseView slug={slug} plugins={allPlugins} onBack={goBack}
    onSelect={(p) => { setSelectedPlugin(p); navigateTo('plugin-detail') }} onNavigate={navigateTo} />

  return <HomeView slug={slug} plugins={allPlugins} skills={allSkills} agents={allAgents}
    onBrowse={() => navigateTo('browse')}
    onSelectPlugin={(p) => { setSelectedPlugin(p); navigateTo('plugin-detail') }}
    onSelectSkill={(s) => { setSelectedSkill({ name: s.dirname, source: s.source, enabled: s.enabled }); navigateTo('skill-detail') }}
    onSelectAgent={(a) => { setSelectedAgent({ filename: a.filename, source: a.source }); navigateTo('agent-detail') }}
    onAddSkill={() => navigateTo('add-skill')}
  />
}
