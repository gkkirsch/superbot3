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

// ── Schedule Builder ────────────────────────────────────────────────────────

type Frequency = 'minutes' | 'hourly' | 'daily' | 'weekdays' | 'weekly'
type Weekday = '1' | '2' | '3' | '4' | '5' | '6' | '0'

const WEEKDAY_LABELS: { value: Weekday; short: string }[] = [
  { value: '1', short: 'Mon' },
  { value: '2', short: 'Tue' },
  { value: '3', short: 'Wed' },
  { value: '4', short: 'Thu' },
  { value: '5', short: 'Fri' },
  { value: '6', short: 'Sat' },
  { value: '0', short: 'Sun' },
]

const MINUTE_OPTIONS = [5, 10, 15, 20, 30]
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i)

interface ScheduleConfig {
  frequency: Frequency
  everyMinutes: number
  hour: number
  minute: number
  weekday: Weekday
}

const DEFAULT_CONFIG: ScheduleConfig = {
  frequency: 'daily',
  everyMinutes: 15,
  hour: 9,
  minute: 0,
  weekday: '1',
}

function configToCron(cfg: ScheduleConfig): string {
  switch (cfg.frequency) {
    case 'minutes':
      return `*/${cfg.everyMinutes} * * * *`
    case 'hourly':
      return `${cfg.minute} * * * *`
    case 'daily':
      return `${cfg.minute} ${cfg.hour} * * *`
    case 'weekdays':
      return `${cfg.minute} ${cfg.hour} * * 1-5`
    case 'weekly':
      return `${cfg.minute} ${cfg.hour} * * ${cfg.weekday}`
  }
}

function cronToConfig(cron: string): ScheduleConfig | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [min, hour, dom, mon, dow] = parts

  // */N * * * *
  const everyMinMatch = min.match(/^\*\/(\d+)$/)
  if (everyMinMatch && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return { frequency: 'minutes', everyMinutes: parseInt(everyMinMatch[1], 10), hour: 9, minute: 0, weekday: '1' }
  }

  // M * * * * (hourly)
  if (min.match(/^\d+$/) && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return { frequency: 'hourly', everyMinutes: 15, hour: 9, minute: parseInt(min, 10), weekday: '1' }
  }

  if (!min.match(/^\d+$/) || !hour.match(/^\d+$/)) return null
  const m = parseInt(min, 10)
  const h = parseInt(hour, 10)

  // M H * * 1-5 (weekdays)
  if (dom === '*' && mon === '*' && dow === '1-5') {
    return { frequency: 'weekdays', everyMinutes: 15, hour: h, minute: m, weekday: '1' }
  }

  // M H * * D (weekly)
  if (dom === '*' && mon === '*' && dow.match(/^\d$/)) {
    return { frequency: 'weekly', everyMinutes: 15, hour: h, minute: m, weekday: dow as Weekday }
  }

  // M H * * * (daily)
  if (dom === '*' && mon === '*' && dow === '*') {
    return { frequency: 'daily', everyMinutes: 15, hour: h, minute: m, weekday: '1' }
  }

  return null
}

function formatTime(hour: number, minute: number): string {
  const d = new Date(2000, 0, 1, hour, minute)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

const selectClass = 'rounded-md border border-border-custom bg-ink px-2 py-1.5 text-sm text-parchment focus:outline-none focus:ring-1 focus:ring-sand/40 appearance-none cursor-pointer'

function ScheduleBuilder({ config, onChange }: { config: ScheduleConfig; onChange: (c: ScheduleConfig) => void }) {
  const showTime = config.frequency !== 'minutes'
  const showDay = config.frequency === 'weekly'

  return (
    <div className="space-y-2.5">
      <div>
        <label className="text-xs text-stone block mb-1">Frequency</label>
        <div className="flex flex-wrap gap-1">
          {([
            ['minutes', 'Minutes'],
            ['hourly', 'Hourly'],
            ['daily', 'Daily'],
            ['weekdays', 'Weekdays'],
            ['weekly', 'Weekly'],
          ] as [Frequency, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => onChange({ ...config, frequency: val })}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                config.frequency === val
                  ? 'bg-sand text-ink font-medium'
                  : 'bg-sand/10 text-sand hover:bg-sand/20'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {config.frequency === 'minutes' && (
        <div>
          <label className="text-xs text-stone block mb-1">Every</label>
          <div className="flex items-center gap-2">
            <select
              value={config.everyMinutes}
              onChange={e => onChange({ ...config, everyMinutes: parseInt(e.target.value, 10) })}
              className={selectClass}
            >
              {MINUTE_OPTIONS.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="text-xs text-stone">minutes</span>
          </div>
        </div>
      )}

      {config.frequency === 'hourly' && (
        <div>
          <label className="text-xs text-stone block mb-1">At minute</label>
          <select
            value={config.minute}
            onChange={e => onChange({ ...config, minute: parseInt(e.target.value, 10) })}
            className={selectClass}
          >
            {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
              <option key={m} value={m}>:{m.toString().padStart(2, '0')}</option>
            ))}
          </select>
        </div>
      )}

      {showDay && (
        <div>
          <label className="text-xs text-stone block mb-1">Day</label>
          <div className="flex gap-1">
            {WEEKDAY_LABELS.map(d => (
              <button
                key={d.value}
                onClick={() => onChange({ ...config, weekday: d.value })}
                className={`text-xs px-2 py-1 rounded-md transition-colors ${
                  config.weekday === d.value
                    ? 'bg-sand text-ink font-medium'
                    : 'bg-sand/10 text-sand hover:bg-sand/20'
                }`}
              >
                {d.short}
              </button>
            ))}
          </div>
        </div>
      )}

      {showTime && config.frequency !== 'hourly' && (
        <div>
          <label className="text-xs text-stone block mb-1">Time</label>
          <div className="flex items-center gap-2">
            <select
              value={config.hour}
              onChange={e => onChange({ ...config, hour: parseInt(e.target.value, 10) })}
              className={selectClass}
            >
              {HOUR_OPTIONS.map(h => (
                <option key={h} value={h}>{formatTime(h, 0).replace(/:00/, '')}</option>
              ))}
            </select>
            <span className="text-xs text-stone">:</span>
            <select
              value={config.minute}
              onChange={e => onChange({ ...config, minute: parseInt(e.target.value, 10) })}
              className={selectClass}
            >
              {[0, 15, 30, 45].map(m => (
                <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

interface EditingState {
  id: string
  config: ScheduleConfig
  prompt: string
  recurring: boolean
}

export function SchedulesTab({ slug }: { slug: string }) {
  const { data, isLoading } = useSchedules(slug)
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [newConfig, setNewConfig] = useState<ScheduleConfig>(DEFAULT_CONFIG)
  const [newPrompt, setNewPrompt] = useState('')
  const [newRecurring, setNewRecurring] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const tasks = data?.tasks || []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['schedules', slug] })

  async function handleCreate() {
    if (!newPrompt.trim()) return
    setSaving(true)
    try {
      const cron = configToCron(newConfig)
      await createSchedule(slug, { cron, prompt: newPrompt.trim(), recurring: newRecurring })
      invalidate()
      setNewConfig(DEFAULT_CONFIG)
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
      const cron = configToCron(editing.config)
      const updated = tasks.map(t =>
        t.id === editing.id
          ? { ...t, cron, prompt: editing.prompt, recurring: editing.recurring }
          : t
      )
      await saveSchedules(slug, updated)
      invalidate()
      setEditing(null)
    } finally {
      setSaving(false)
    }
  }

  function startEditing(task: ScheduledTask) {
    const config = cronToConfig(task.cron) || DEFAULT_CONFIG
    setEditing({ id: task.id, config, prompt: task.prompt, recurring: task.recurring })
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
            <ScheduleBuilder config={newConfig} onChange={setNewConfig} />
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
                disabled={saving || !newPrompt.trim()}
                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md bg-sand text-ink hover:bg-sand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-3 h-3" />
                {saving ? 'Creating...' : 'Create'}
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
                <ScheduleBuilder
                  config={editing.config}
                  onChange={config => setEditing({ ...editing, config })}
                />
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
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm text-parchment font-medium">
                      {task.humanCron || task.cron}
                    </span>
                    {task.recurring && <Badge variant="default">recurring</Badge>}
                    {!task.recurring && <Badge variant="outline">one-shot</Badge>}
                  </div>
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
                    onClick={() => startEditing(task)}
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
