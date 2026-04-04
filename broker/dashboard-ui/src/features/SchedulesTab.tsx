import { useState } from 'react'
import { useSchedules } from '@/hooks/useSpaces'
import { createSchedule, deleteSchedule, saveSchedules } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Clock, Plus, Pencil, Trash2, Check, X, CalendarClock } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { ScheduledTask } from '@/lib/types'

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

const CRON_EXAMPLES = [
  { cron: '*/15 * * * *', label: 'Every 15 minutes' },
  { cron: '0 * * * *', label: 'Every hour' },
  { cron: '0 */2 * * *', label: 'Every 2 hours' },
  { cron: '0 9 * * *', label: 'Daily at 9 AM' },
  { cron: '0 9 * * 1-5', label: 'Weekdays at 9 AM' },
  { cron: '0 9 * * 1', label: 'Every Monday at 9 AM' },
]

interface EditingState {
  id: string
  cron: string
  prompt: string
  recurring: boolean
}

export function SchedulesTab({ slug }: { slug: string }) {
  const { data, isLoading } = useSchedules(slug)
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [newCron, setNewCron] = useState('0 9 * * *')
  const [newPrompt, setNewPrompt] = useState('')
  const [newRecurring, setNewRecurring] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const tasks = data?.tasks || []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['schedules', slug] })

  async function handleCreate() {
    if (!newCron.trim() || !newPrompt.trim()) return
    setSaving(true)
    try {
      await createSchedule(slug, { cron: newCron.trim(), prompt: newPrompt.trim(), recurring: newRecurring })
      invalidate()
      setNewCron('0 9 * * *')
      setNewPrompt('')
      setNewRecurring(true)
      setShowAdd(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    await deleteSchedule(slug, id)
    invalidate()
  }

  async function handleSaveEdit() {
    if (!editing) return
    setSaving(true)
    try {
      const updated = tasks.map(t =>
        t.id === editing.id
          ? { ...t, cron: editing.cron, prompt: editing.prompt, recurring: editing.recurring }
          : t
      )
      await saveSchedules(slug, updated)
      invalidate()
      setEditing(null)
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <div className="text-stone text-sm py-4">Loading...</div>

  return (
    <div className="space-y-3 py-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-parchment">Scheduled Tasks</h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 text-xs text-sand hover:text-parchment transition-colors"
        >
          {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showAdd ? 'Cancel' : 'Add'}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card>
          <CardContent className="p-3 space-y-3">
            <div>
              <label className="text-xs text-stone block mb-1">Cron Expression</label>
              <input
                type="text"
                value={newCron}
                onChange={e => setNewCron(e.target.value)}
                placeholder="0 9 * * *"
                className="w-full rounded-md border border-border-custom bg-ink px-2.5 py-1.5 text-sm text-parchment placeholder:text-stone/50 focus:outline-none focus:ring-1 focus:ring-sand/40 font-mono"
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {CRON_EXAMPLES.map(ex => (
                  <button
                    key={ex.cron}
                    onClick={() => setNewCron(ex.cron)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-sand/10 text-sand hover:bg-sand/20 transition-colors"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-stone block mb-1">Prompt</label>
              <textarea
                value={newPrompt}
                onChange={e => setNewPrompt(e.target.value)}
                placeholder="What should the space do when this fires?"
                rows={3}
                className="w-full rounded-md border border-border-custom bg-ink px-2.5 py-1.5 text-sm text-parchment placeholder:text-stone/50 focus:outline-none focus:ring-1 focus:ring-sand/40 resize-none"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={newRecurring}
                  onCheckedChange={setNewRecurring}
                />
                <span className="text-xs text-stone">Recurring</span>
              </div>
              <button
                onClick={handleCreate}
                disabled={saving || !newCron.trim() || !newPrompt.trim()}
                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md bg-sand text-ink hover:bg-sand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-3 h-3" />
                {saving ? 'Creating...' : 'Create Schedule'}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {tasks.length === 0 && !showAdd && (
        <div className="text-center py-8">
          <CalendarClock className="w-8 h-8 text-stone/50 mx-auto mb-2" />
          <p className="text-sm text-stone">No scheduled tasks.</p>
          <p className="text-xs text-stone/70 mt-1">Add one to automate recurring work.</p>
        </div>
      )}

      {/* Task list */}
      {tasks.map(task => (
        <Card key={task.id}>
          <CardContent className="p-3">
            {editing?.id === task.id ? (
              /* Edit mode */
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-stone block mb-1">Cron Expression</label>
                  <input
                    type="text"
                    value={editing.cron}
                    onChange={e => setEditing({ ...editing, cron: e.target.value })}
                    className="w-full rounded-md border border-border-custom bg-ink px-2.5 py-1.5 text-sm text-parchment font-mono focus:outline-none focus:ring-1 focus:ring-sand/40"
                  />
                </div>
                <div>
                  <label className="text-xs text-stone block mb-1">Prompt</label>
                  <textarea
                    value={editing.prompt}
                    onChange={e => setEditing({ ...editing, prompt: e.target.value })}
                    rows={3}
                    className="w-full rounded-md border border-border-custom bg-ink px-2.5 py-1.5 text-sm text-parchment focus:outline-none focus:ring-1 focus:ring-sand/40 resize-none"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={editing.recurring}
                      onCheckedChange={r => setEditing({ ...editing, recurring: r })}
                    />
                    <span className="text-xs text-stone">Recurring</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditing(null)}
                      className="p-1.5 rounded-md text-stone hover:text-parchment hover:bg-ink transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving}
                      className="p-1.5 rounded-md text-moss hover:text-moss hover:bg-moss/10 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Display mode */
              <div className="flex items-start gap-2">
                <Clock className="w-3.5 h-3.5 text-sand mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-parchment font-medium">
                      {task.humanCron || task.cron}
                    </span>
                    {task.recurring && <Badge variant="default">recurring</Badge>}
                    {!task.recurring && <Badge variant="outline">one-shot</Badge>}
                  </div>
                  <code className="text-[11px] text-stone font-mono">{task.cron}</code>
                  <p
                    className={`text-xs text-parchment/80 mt-1 ${expandedId === task.id ? '' : 'line-clamp-2'} cursor-pointer`}
                    onClick={() => setExpandedId(expandedId === task.id ? null : task.id)}
                  >
                    {task.prompt}
                  </p>
                  {task.lastFiredAt && (
                    <p className="text-[11px] text-stone mt-1">
                      Last fired: {timeAgo(task.lastFiredAt)}
                    </p>
                  )}
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <button
                    onClick={() => setEditing({
                      id: task.id,
                      cron: task.cron,
                      prompt: task.prompt,
                      recurring: task.recurring,
                    })}
                    className="p-1.5 rounded-md text-stone hover:text-parchment hover:bg-ink transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(task.id)}
                    className="p-1.5 rounded-md text-stone hover:text-ember hover:bg-ember/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
