import { useState } from 'react'
import { useMemory, useMemoryStats } from '@/hooks/useSpaces'
import { fetchMemoryFile, saveMemoryFile } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Brain, FileText, Pencil, Save, X, FolderOpen, ChevronRight, ChevronDown } from 'lucide-react'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  return `${(bytes / 1024).toFixed(1)}KB`
}

function groupByDir(files: { name: string; size: number; modified: string }[]) {
  const tree: Record<string, { name: string; size: number; modified: string }[]> = {}
  for (const f of files) {
    const parts = f.name.split('/')
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.'
    if (!tree[dir]) tree[dir] = []
    tree[dir].push(f)
  }
  return tree
}

export function MemoryTab({ slug }: { slug: string }) {
  const { data: files, isLoading } = useMemory(slug)
  const { data: stats } = useMemoryStats(slug)
  const queryClient = useQueryClient()

  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['memory', slug] })
    queryClient.invalidateQueries({ queryKey: ['memory-stats', slug] })
  }

  const loadFile = async (name: string) => {
    setSelected(name)
    setEditing(false)
    const data = await fetchMemoryFile(slug, name)
    setContent(data.content)
  }

  const saveMutation = useMutation({
    mutationFn: () => saveMemoryFile(slug, selected!, content),
    onSuccess: () => {
      setEditing(false)
      invalidate()
    },
  })

  const toggleDir = (dir: string) => {
    setCollapsed(prev => ({ ...prev, [dir]: !prev[dir] }))
  }

  if (isLoading) return <div className="text-stone text-sm py-4">Loading...</div>

  const tree = groupByDir(files || [])
  const dirOrder = ['.', 'topics', 'sessions']
  const sortedDirs = Object.keys(tree).sort((a, b) => {
    const ai = dirOrder.indexOf(a)
    const bi = dirOrder.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })

  const dirLabels: Record<string, string> = {
    '.': 'Root',
    'topics': 'Topics',
    'sessions': 'Sessions',
  }

  return (
    <div className="space-y-3 py-2">
      {/* Stats bar */}
      {stats && (
        <div className="flex flex-wrap gap-3 text-[11px] text-stone">
          <span>{stats.topicCount} topics</span>
          <span>{stats.sessionCount} sessions</span>
          <span>MEMORY.md: {formatBytes(stats.memoryMdSize)}/{formatBytes(stats.memoryMdCap.bytes)} ({stats.memoryMdLines}/{stats.memoryMdCap.lines} lines)</span>
        </div>
      )}

      {/* Empty state */}
      {(!files || files.length === 0) && (
        <div className="text-center py-8">
          <Brain className="w-8 h-8 text-stone/50 mx-auto mb-2" />
          <p className="text-sm text-stone">No memory files yet.</p>
          <p className="text-xs text-stone/70 mt-1">Memory will be populated as the space learns.</p>
        </div>
      )}

      {/* File tree */}
      {files && files.length > 0 && (
        <div className="space-y-2">
          {sortedDirs.map(dir => (
            <div key={dir}>
              {dir !== '.' && (
                <button
                  onClick={() => toggleDir(dir)}
                  className="flex items-center gap-1.5 text-xs text-stone hover:text-parchment mb-1 transition-colors"
                >
                  {collapsed[dir] ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  <FolderOpen className="w-3.5 h-3.5 text-sand" />
                  <span className="font-medium">{dirLabels[dir] || dir}</span>
                  <span className="text-stone/60">({tree[dir].length})</span>
                </button>
              )}
              {!collapsed[dir] && (
                <div className="space-y-1">
                  {tree[dir]
                    .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
                    .map(f => {
                      const basename = f.name.split('/').pop()!
                      return (
                        <Card key={f.name} className={selected === f.name ? 'ring-1 ring-sand/30' : ''}>
                          <CardContent className="p-0">
                            <div className="flex items-center gap-2 px-3 py-2">
                              <button
                                onClick={() => loadFile(f.name)}
                                className="flex items-center gap-2 flex-1 min-w-0 text-left"
                              >
                                <FileText className="w-3.5 h-3.5 text-sand shrink-0" />
                                <span className="text-sm text-parchment truncate">{basename}</span>
                                <span className="text-[10px] text-stone ml-auto shrink-0">{formatBytes(f.size)}</span>
                              </button>
                              <button
                                onClick={() => { loadFile(f.name).then(() => setEditing(true)) }}
                                className="p-1.5 rounded-md text-stone hover:text-parchment hover:bg-ink transition-colors shrink-0"
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Selected file viewer/editor */}
      {selected && (
        <div className="border border-border-custom rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-muted text-xs">
            <span className="text-foreground font-medium">{selected}</span>
            <div className="flex gap-1">
              {editing ? (
                <>
                  <button
                    onClick={() => saveMutation.mutate()}
                    className="p-1 text-moss hover:text-moss/80"
                    disabled={saveMutation.isPending}
                    title="Save"
                  >
                    <Save className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setEditing(false)} className="p-1 text-stone hover:text-parchment" title="Cancel">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="text-stone hover:text-parchment text-[10px]"
                >
                  Edit
                </button>
              )}
            </div>
          </div>
          {editing ? (
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              className="w-full h-64 bg-codebg p-3 text-xs font-mono text-foreground resize-none outline-none"
            />
          ) : (
            <pre className="p-3 text-xs font-mono text-foreground whitespace-pre-wrap overflow-auto max-h-96 bg-codebg">
              {content}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
