import { useState } from 'react'
import { useKnowledge } from '@/hooks/useSpaces'
import { fetchKnowledgeFile, saveKnowledgeFile, deleteKnowledgeFile } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Plus, Pencil, Trash2, Save, X, BookOpen } from 'lucide-react'

export function KnowledgeTab({ slug }: { slug: string }) {
  const { data: files, isLoading } = useKnowledge(slug)
  const queryClient = useQueryClient()

  // View/edit state
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)

  // Create state
  const [showAdd, setShowAdd] = useState(false)
  const [newFilename, setNewFilename] = useState('')
  const [newContent, setNewContent] = useState('')
  const [saving, setSaving] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['knowledge', slug] })

  const loadFile = async (name: string) => {
    setSelected(name)
    setEditing(false)
    setShowAdd(false)
    const data = await fetchKnowledgeFile(slug, name)
    setContent(data.content)
  }

  const saveMutation = useMutation({
    mutationFn: () => saveKnowledgeFile(slug, selected!, content),
    onSuccess: () => {
      setEditing(false)
      invalidate()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (file: string) => deleteKnowledgeFile(slug, file),
    onSuccess: () => {
      if (selected) {
        setSelected(null)
        setContent('')
        setEditing(false)
      }
      invalidate()
    },
  })

  async function handleCreate() {
    const trimmed = newFilename.trim()
    if (!trimmed) return
    const filename = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`
    setSaving(true)
    try {
      await saveKnowledgeFile(slug, filename, newContent)
      invalidate()
      setNewFilename('')
      setNewContent('')
      setShowAdd(false)
      // Auto-select the new file
      setSelected(filename)
      setContent(newContent)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function handleDelete(file: string) {
    if (selected === file) {
      setSelected(null)
      setContent('')
      setEditing(false)
    }
    deleteMutation.mutate(file)
  }

  if (isLoading) return <div className="text-stone text-sm py-4">Loading...</div>

  return (
    <div className="space-y-3 py-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-parchment">Knowledge Files</h3>
        <button
          onClick={() => { setShowAdd(!showAdd); if (!showAdd) { setSelected(null); setEditing(false) } }}
          className="flex items-center gap-1 text-xs text-sand hover:text-parchment transition-colors"
        >
          {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showAdd ? 'Cancel' : 'Add File'}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card>
          <CardContent className="p-3 space-y-3">
            <div>
              <label className="text-xs text-stone block mb-1">Filename</label>
              <input
                type="text"
                value={newFilename}
                onChange={e => setNewFilename(e.target.value)}
                placeholder="e.g. api-notes (.md added automatically)"
                className="w-full rounded-md border border-border-custom bg-ink px-2.5 py-1.5 text-sm text-parchment placeholder:text-stone/50 focus:outline-none focus:ring-1 focus:ring-sand/40"
              />
            </div>
            <div>
              <label className="text-xs text-stone block mb-1">Content</label>
              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                placeholder="Markdown content..."
                rows={6}
                className="w-full rounded-md border border-border-custom bg-ink px-2.5 py-1.5 text-sm text-parchment placeholder:text-stone/50 focus:outline-none focus:ring-1 focus:ring-sand/40 resize-none font-mono"
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleCreate}
                disabled={saving || !newFilename.trim()}
                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md bg-sand text-ink hover:bg-sand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-3 h-3" />
                {saving ? 'Creating...' : 'Create File'}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {(!files || files.length === 0) && !showAdd && (
        <div className="text-center py-8">
          <BookOpen className="w-8 h-8 text-stone/50 mx-auto mb-2" />
          <p className="text-sm text-stone">No knowledge files.</p>
          <p className="text-xs text-stone/70 mt-1">Add one to get started.</p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-3 flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md bg-sand text-ink hover:bg-sand/90 transition-colors mx-auto"
          >
            <Plus className="w-3 h-3" />
            Add File
          </button>
        </div>
      )}

      {/* File list */}
      {files && files.length > 0 && (
        <div className="space-y-1">
          {files.map(f => (
            <Card key={f.name} className={selected === f.name ? 'ring-1 ring-sand/30' : ''}>
              <CardContent className="p-0">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    onClick={() => loadFile(f.name)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    <FileText className="w-3.5 h-3.5 text-sand shrink-0" />
                    <span className="text-sm text-parchment truncate">{f.name}</span>
                    <span className="text-[10px] text-stone ml-auto shrink-0">{(f.size / 1024).toFixed(1)}K</span>
                  </button>
                  <div className="flex gap-0.5 shrink-0">
                    <button
                      onClick={() => { loadFile(f.name).then(() => setEditing(true)) }}
                      className="p-1.5 rounded-md text-stone hover:text-parchment hover:bg-ink transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(f.name)}
                      className="p-1.5 rounded-md text-stone hover:text-ember hover:bg-ember/10 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
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
