import { useState, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowUp, Plus, Circle, Check, Loader2, X } from 'lucide-react'
import { useSpaces } from '@/hooks/useSpaces'
import { useMasterMessages, useMasterRichConversation } from '@/hooks/useSpaces'
import { sendMasterMessage, createSpace } from '@/lib/api'
import { cn } from '@/lib/utils'

export function Dashboard() {
  const { data: spaces, isLoading } = useSpaces()
  const { data: messages } = useMasterMessages()
  const { data: richConversation } = useMasterRichConversation()
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const createInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (msg: string) => sendMasterMessage(msg),
    onSuccess: () => {
      setText('')
      if (inputRef.current) inputRef.current.style.height = 'auto'
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['master-messages'] }), 1000)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || mutation.isPending) return
    mutation.mutate(text.trim())
  }

  const handleCreateSpace = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const result = await createSpace({ name: newName.trim() })
      queryClient.invalidateQueries({ queryKey: ['spaces'] })
      setAdding(false)
      setNewName('')
      if (result?.slug) navigate(`/spaces/${result.slug}`)
    } catch {} finally {
      setCreating(false)
    }
  }

  const hasSpaces = spaces && spaces.length > 0
  const runningCount = spaces?.filter(s => s.running).length ?? 0

  return (
    <div className="flex flex-col h-screen">
      {/* Main content — centered */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-8">
        <div className="max-w-[560px] w-full">
          {/* Branding */}
          <div className="text-center mb-10">
            <h1 className="text-3xl font-light text-parchment/90 tracking-tight mb-1">superbot3</h1>
            {hasSpaces && (
              <p className="text-sm text-stone">
                {spaces.length} space{spaces.length !== 1 ? 's' : ''}
                {runningCount > 0 && <span className="text-moss"> &middot; {runningCount} running</span>}
              </p>
            )}
          </div>

          {/* Spaces list or empty state */}
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 text-stone animate-spin" />
            </div>
          ) : hasSpaces ? (
            <div className="mb-8">
              <div className="space-y-1">
                {spaces.map(space => (
                  <NavLink
                    key={space.slug}
                    to={`/spaces/${space.slug}`}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-stone hover:text-parchment hover:bg-surface/80 transition-colors group"
                  >
                    <Circle className={cn(
                      'w-2 h-2 shrink-0',
                      space.running ? 'fill-moss text-moss' : 'fill-stone/30 text-stone/30'
                    )} />
                    <span className="text-sm flex-1 truncate">{space.name || space.slug}</span>
                    {space.codeDir && (
                      <span className="text-[11px] text-stone/50 font-mono truncate max-w-[200px] hidden group-hover:block">{space.codeDir}</span>
                    )}
                  </NavLink>
                ))}
              </div>

              {/* Add space inline */}
              <div className="mt-3 px-1">
                {adding ? (
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <input
                      ref={createInputRef}
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleCreateSpace()
                        if (e.key === 'Escape') { setAdding(false); setNewName('') }
                      }}
                      placeholder="Space name..."
                      disabled={creating}
                      className="flex-1 min-w-0 px-2 py-1 text-xs bg-ink border border-border-custom rounded text-parchment placeholder:text-stone/40 focus:outline-none focus:border-sand/40"
                      autoFocus
                    />
                    {creating ? (
                      <Loader2 className="w-3.5 h-3.5 text-stone animate-spin shrink-0" />
                    ) : (
                      <>
                        <button onClick={handleCreateSpace} className="p-0.5 rounded text-moss hover:bg-moss/10 transition-colors shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { setAdding(false); setNewName('') }} className="p-0.5 rounded text-stone hover:text-parchment hover:bg-surface transition-colors shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setAdding(true)}
                    className="flex items-center gap-2 px-4 py-2 text-xs text-stone hover:text-parchment transition-colors rounded-lg hover:bg-surface/50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New space
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* No spaces — empty state */
            <div className="text-center mb-8">
              <p className="text-sm text-stone mb-4">No spaces yet</p>
              {adding ? (
                <div className="flex items-center gap-2 max-w-[280px] mx-auto">
                  <input
                    ref={createInputRef}
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreateSpace()
                      if (e.key === 'Escape') { setAdding(false); setNewName('') }
                    }}
                    placeholder="Space name..."
                    disabled={creating}
                    className="flex-1 min-w-0 px-3 py-2 text-sm bg-ink border border-border-custom rounded-lg text-parchment placeholder:text-stone/40 focus:outline-none focus:border-sand/40"
                    autoFocus
                  />
                  {creating ? (
                    <Loader2 className="w-4 h-4 text-stone animate-spin" />
                  ) : (
                    <>
                      <button onClick={handleCreateSpace} className="p-1.5 rounded-md text-moss hover:bg-moss/10 transition-colors">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setAdding(false); setNewName('') }} className="p-1.5 rounded-md text-stone hover:text-parchment transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm text-sand border border-sand/30 rounded-lg hover:bg-sand/10 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create your first space
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chat input pinned to bottom */}
      <div className="max-w-[560px] mx-auto px-6 w-full pt-2 pb-6">
        <form onSubmit={handleSubmit}>
          <div className="relative bg-surface border border-border-custom rounded-xl focus-within:border-stone/30 transition-colors">
            <textarea
              ref={inputRef}
              value={text}
              onChange={e => setText(e.target.value)}
              rows={2}
              placeholder="Message the orchestrator..."
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
          <span className="text-[10px] text-ember/70 mt-1 ml-1">Failed to send</span>
        )}
      </div>
    </div>
  )
}
