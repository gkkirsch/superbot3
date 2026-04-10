import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Space } from '@/lib/types'
import { fetchSystemPrompt, saveSystemPrompt, restartSpace, setSpaceModel } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, Save, RotateCcw, Loader2, Check, AlertTriangle, RefreshCw, Cpu } from 'lucide-react'

export function SettingsTab({ space }: { space: Space }) {
  const queryClient = useQueryClient()
  const { data: promptData, isLoading } = useQuery({
    queryKey: ['system-prompt', space.slug],
    queryFn: () => fetchSystemPrompt(space.slug),
  })

  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<'saved' | 'error' | null>(null)
  const [restarting, setRestarting] = useState(false)
  const [restartFeedback, setRestartFeedback] = useState<'restarted' | 'error' | null>(null)
  const [selectedModel, setSelectedModel] = useState(space.model || 'claude-opus-4-6')
  const [modelSaving, setModelSaving] = useState(false)
  const [modelFeedback, setModelFeedback] = useState<'saved' | 'error' | null>(null)

  useEffect(() => {
    if (promptData?.content) setContent(promptData.content)
  }, [promptData?.content])

  async function handleSave() {
    setSaving(true)
    setFeedback(null)
    try {
      await saveSystemPrompt(space.slug, content)
      queryClient.invalidateQueries({ queryKey: ['system-prompt', space.slug] })
      setFeedback('saved')
      setEditing(false)
      setTimeout(() => setFeedback(null), 3000)
    } catch {
      setFeedback('error')
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    if (promptData?.content) setContent(promptData.content)
    setEditing(false)
    setFeedback(null)
  }

  async function handleRestart() {
    setRestarting(true)
    setRestartFeedback(null)
    try {
      await restartSpace(space.slug)
      setRestartFeedback('restarted')
      setFeedback(null)
      queryClient.invalidateQueries({ queryKey: ['space', space.slug] })
      setTimeout(() => setRestartFeedback(null), 3000)
    } catch {
      setRestartFeedback('error')
    } finally {
      setRestarting(false)
    }
  }

  async function handleModelChange(model: string) {
    setSelectedModel(model)
    setModelSaving(true)
    setModelFeedback(null)
    try {
      await setSpaceModel(space.slug, model)
      queryClient.invalidateQueries({ queryKey: ['space', space.slug] })
      setModelFeedback('saved')
      setTimeout(() => setModelFeedback(null), 3000)
    } catch {
      setModelFeedback('error')
    } finally {
      setModelSaving(false)
    }
  }

  const models = [
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-sonnet-4-5-20250514', label: 'Claude Sonnet 4.5' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ]

  const items = [
    { label: 'Name', value: space.name },
    { label: 'Slug', value: space.slug },
    { label: 'Space Dir', value: space.spaceDir },
    { label: 'Code Dir', value: space.codeDir || 'None' },
    { label: 'Config Dir', value: space.claudeConfigDir },
    { label: 'Active', value: space.active ? 'Yes' : 'No' },
    { label: 'Created', value: new Date(space.created).toLocaleDateString() },
    { label: 'Session ID', value: space.sessionId || 'None' },
  ]

  return (
    <div className="space-y-4">
      {/* Space Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Space Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2">
            {items.map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <dt className="text-stone">{label}</dt>
                <dd className="text-foreground font-mono text-xs truncate max-w-[60%] text-right">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* Model Selector */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-sand" />
            <CardTitle className="text-sm">Model</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <select
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={modelSaving}
              className="flex-1 bg-ink border border-border-custom rounded px-2 py-1.5 text-xs text-parchment font-mono focus:outline-none focus:border-sand/40 disabled:opacity-50"
            >
              {models.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            {modelSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-stone" />}
            {modelFeedback === 'saved' && (
              <span className="flex items-center gap-1 text-[10px] text-green-400">
                <Check className="h-3 w-3" /> Saved —{' '}
                <button
                  onClick={handleRestart}
                  disabled={restarting}
                  className="underline hover:text-green-300 transition-colors"
                >
                  {restarting ? 'restarting...' : 'restart to apply'}
                </button>
              </span>
            )}
            {modelFeedback === 'error' && (
              <span className="flex items-center gap-1 text-[10px] text-ember">
                <AlertTriangle className="h-3 w-3" /> Failed
              </span>
            )}
          </div>
          <p className="text-[10px] text-stone/50 mt-2">
            The Claude model used by this space. Restart the space to apply changes.
          </p>
        </CardContent>
      </Card>

      {/* System Prompt Editor */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-sand" />
              <CardTitle className="text-sm">System Prompt</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {feedback === 'saved' && (
                <span className="flex items-center gap-1 text-[10px] text-green-400">
                  <Check className="h-3 w-3" /> Saved —{' '}
                  <button
                    onClick={handleRestart}
                    disabled={restarting}
                    className="underline hover:text-green-300 transition-colors"
                  >
                    {restarting ? 'restarting...' : 'restart now'}
                  </button>
                </span>
              )}
              {feedback === 'error' && (
                <span className="flex items-center gap-1 text-[10px] text-ember">
                  <AlertTriangle className="h-3 w-3" /> Save failed
                </span>
              )}
              {editing && (
                <>
                  <button
                    onClick={handleReset}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-ink border border-border-custom text-stone hover:text-parchment transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" /> Discard
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-sand/15 border border-sand/25 text-sand hover:bg-sand/25 transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                  </button>
                </>
              )}
              {!editing && !isLoading && (
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-sand/15 border border-sand/25 text-sand hover:bg-sand/25 transition-colors"
                >
                  <FileText className="h-3 w-3" /> Edit
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-40 flex items-center justify-center text-stone text-sm">Loading...</div>
          ) : editing ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-[500px] bg-ink border border-border-custom rounded-lg p-3 text-xs text-parchment font-mono resize-y focus:outline-none focus:border-sand/40 scrollbar-auto"
              spellCheck={false}
            />
          ) : (
            <pre className="w-full h-[400px] overflow-auto bg-ink border border-border-custom rounded-lg p-3 text-xs text-parchment/80 font-mono whitespace-pre-wrap scrollbar-auto">
              {promptData?.content || 'No system prompt configured'}
            </pre>
          )}
          <p className="text-[10px] text-stone/50 mt-2">
            The system prompt defines this space's core identity and behavior. Changes take effect after restarting the space.
          </p>
        </CardContent>
      </Card>

      {/* Restart Space */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-parchment">Restart Space</p>
              <p className="text-[10px] text-stone/50">Stop and re-launch the space orchestrator</p>
            </div>
            <button
              onClick={handleRestart}
              disabled={restarting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-sand/15 border border-sand/25 text-sand hover:bg-sand/25 transition-colors disabled:opacity-50"
            >
              {restarting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {restarting ? 'Restarting...' : 'Restart'}
            </button>
          </div>
          {restartFeedback === 'restarted' && (
            <p className="flex items-center gap-1 text-[10px] text-green-400">
              <Check className="h-3 w-3" /> Space restarted
            </p>
          )}
          {restartFeedback === 'error' && (
            <p className="flex items-center gap-1 text-[10px] text-ember">
              <AlertTriangle className="h-3 w-3" /> Restart failed
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
