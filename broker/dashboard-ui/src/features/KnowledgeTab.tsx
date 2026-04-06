import { useState, useMemo } from 'react'
import { useKnowledge } from '@/hooks/useSpaces'
import { fetchKnowledgeFile, saveKnowledgeFile, deleteKnowledgeFile } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  FileText, Plus, Pencil, Trash2, Save, X, BookOpen,
  Folder, ChevronRight, ArrowLeft,
} from 'lucide-react'
import type { KnowledgeItem } from '@/lib/types'

type View = 'browser' | 'detail' | 'create'

export function KnowledgeTab({ slug }: { slug: string }) {
  const { data: items, isLoading } = useKnowledge(slug)
  const queryClient = useQueryClient()

  const [currentDir, setCurrentDir] = useState('')
  const [view, setView] = useState<View>('browser')
  const [selectedFile, setSelectedFile] = useState('')
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)

  // Create state
  const [newFilename, setNewFilename] = useState('')
  const [newContent, setNewContent] = useState('')
  const [saving, setSaving] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['knowledge', slug] })

  // Filter items for current directory level
  const currentItems = useMemo(() => {
    if (!items) return []
    const prefix = currentDir ? currentDir + '/' : ''
    return items.filter((item: KnowledgeItem) => {
      if (!item.name.startsWith(prefix)) return false
      const rest = item.name.slice(prefix.length)
      // Only show direct children (no further slashes for dirs, no slashes for files)
      if (item.type === 'dir') {
        return !rest.includes('/')
      }
      return !rest.includes('/')
    })
  }, [items, currentDir])

  // Breadcrumb segments
  const breadcrumbs = useMemo(() => {
    const parts = currentDir ? currentDir.split('/') : []
    return [
      { label: 'knowledge', path: '' },
      ...parts.map((part, i) => ({
        label: part,
        path: parts.slice(0, i + 1).join('/'),
      })),
    ]
  }, [currentDir])

  const navigateToDir = (dirPath: string) => {
    setCurrentDir(dirPath)
    setView('browser')
    setSelectedFile('')
    setEditing(false)
  }

  const openFile = async (name: string) => {
    setSelectedFile(name)
    setView('detail')
    setEditing(false)
    setLoadingFile(true)
    try {
      const data = await fetchKnowledgeFile(slug, name)
      setContent(data.content)
    } catch {
      setContent('Error loading file.')
    } finally {
      setLoadingFile(false)
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => saveKnowledgeFile(slug, selectedFile, content),
    onSuccess: () => {
      setEditing(false)
      invalidate()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (file: string) => deleteKnowledgeFile(slug, file),
    onSuccess: () => {
      setView('browser')
      setSelectedFile('')
      invalidate()
    },
  })

  function handleDelete(file: string) {
    if (!confirm(`Delete ${file.split('/').pop()}?`)) return
    deleteMutation.mutate(file)
  }

  async function handleCreate() {
    const trimmed = newFilename.trim()
    if (!trimmed) return
    const filename = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`
    const fullPath = currentDir ? `${currentDir}/${filename}` : filename
    setSaving(true)
    try {
      await saveKnowledgeFile(slug, fullPath, newContent)
      invalidate()
      setNewFilename('')
      setNewContent('')
      // Open the newly created file
      setSelectedFile(fullPath)
      setContent(newContent)
      setView('detail')
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const basename = (name: string) => name.split('/').pop() || name

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes}B`
    return `${(bytes / 1024).toFixed(1)}K`
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  if (isLoading) return <div className="text-stone text-sm py-4">Loading...</div>

  // ── File Detail View ──
  if (view === 'detail' && selectedFile) {
    return (
      <div className="space-y-3 py-2">
        {/* Header */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateToDir(currentDir)}
            className="flex items-center gap-1 text-xs text-sand hover:text-parchment transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <span className="text-xs text-stone">/</span>
          <span className="text-sm font-medium text-parchment truncate">{basename(selectedFile)}</span>
        </div>

        {/* File meta */}
        {items && (() => {
          const meta = items.find((i: KnowledgeItem) => i.name === selectedFile && i.type === 'file')
          if (!meta) return null
          return (
            <div className="text-[10px] text-stone flex gap-3">
              {meta.size != null && <span>{formatSize(meta.size)}</span>}
              {meta.modified && <span>{formatDate(meta.modified)}</span>}
            </div>
          )
        })()}

        {/* Actions */}
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md bg-moss/20 text-moss hover:bg-moss/30 disabled:opacity-50 transition-colors"
              >
                <Save className="w-3 h-3" />
                {saveMutation.isPending ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md text-stone hover:text-parchment hover:bg-ink transition-colors"
              >
                <X className="w-3 h-3" />
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md bg-sand/10 text-sand hover:bg-sand/20 transition-colors"
              >
                <Pencil className="w-3 h-3" />
                Edit
              </button>
              <button
                onClick={() => handleDelete(selectedFile)}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md text-stone hover:text-ember hover:bg-ember/10 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
            </>
          )}
        </div>

        {/* Content */}
        {loadingFile ? (
          <div className="text-stone text-sm py-4">Loading file...</div>
        ) : editing ? (
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            className="w-full h-80 rounded-md border border-border-custom bg-ink p-3 text-sm font-mono text-parchment resize-none outline-none focus:ring-1 focus:ring-sand/40"
          />
        ) : (
          <div className="rounded-md border border-border-custom bg-ink p-4 overflow-auto max-h-[500px] prose prose-invert prose-sm max-w-none prose-headings:text-parchment prose-p:text-parchment/90 prose-a:text-sand prose-strong:text-parchment prose-code:text-sand prose-pre:bg-surface prose-pre:border prose-pre:border-border-custom">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    )
  }

  // ── Create File View ──
  if (view === 'create') {
    return (
      <div className="space-y-3 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('browser')}
            className="flex items-center gap-1 text-xs text-sand hover:text-parchment transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <span className="text-xs text-stone">/</span>
          <span className="text-sm font-medium text-parchment">New File</span>
          {currentDir && <span className="text-[10px] text-stone">in {currentDir}/</span>}
        </div>

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
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-stone block mb-1">Content</label>
              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                placeholder="Markdown content..."
                rows={8}
                className="w-full rounded-md border border-border-custom bg-ink px-2.5 py-1.5 text-sm text-parchment placeholder:text-stone/50 focus:outline-none focus:ring-1 focus:ring-sand/40 resize-none font-mono"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setView('browser'); setNewFilename(''); setNewContent('') }}
                className="text-xs px-3 py-1.5 rounded-md text-stone hover:text-parchment transition-colors"
              >
                Cancel
              </button>
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
      </div>
    )
  }

  // ── File Browser View (default) ──
  return (
    <div className="space-y-3 py-2">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 flex-wrap">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.path} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3 text-stone/50" />}
            <button
              onClick={() => navigateToDir(crumb.path)}
              className={`text-xs transition-colors ${
                i === breadcrumbs.length - 1
                  ? 'text-parchment font-medium'
                  : 'text-sand hover:text-parchment'
              }`}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </div>

      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-parchment">
          {currentDir ? basename(currentDir) : 'Knowledge Files'}
        </h3>
        <button
          onClick={() => { setView('create'); setNewFilename(''); setNewContent('') }}
          className="flex items-center gap-1 text-xs text-sand hover:text-parchment transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add File
        </button>
      </div>

      {/* Empty state */}
      {currentItems.length === 0 && (
        <div className="text-center py-8">
          <BookOpen className="w-8 h-8 text-stone/50 mx-auto mb-2" />
          <p className="text-sm text-stone">{currentDir ? 'Empty folder.' : 'No knowledge files.'}</p>
          <p className="text-xs text-stone/70 mt-1">Add a file to get started.</p>
          <button
            onClick={() => { setView('create'); setNewFilename(''); setNewContent('') }}
            className="mt-3 flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md bg-sand text-ink hover:bg-sand/90 transition-colors mx-auto"
          >
            <Plus className="w-3 h-3" />
            Add File
          </button>
        </div>
      )}

      {/* Items list */}
      {currentItems.length > 0 && (
        <div className="space-y-1">
          {/* Directories first, then files */}
          {currentItems
            .sort((a: KnowledgeItem, b: KnowledgeItem) => {
              if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
              return a.name.localeCompare(b.name)
            })
            .map((item: KnowledgeItem) => (
              <Card key={item.name}>
                <CardContent className="p-0">
                  <button
                    onClick={() => {
                      if (item.type === 'dir') {
                        navigateToDir(item.name)
                      } else {
                        openFile(item.name)
                      }
                    }}
                    className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-surface/50 transition-colors rounded-lg"
                  >
                    {item.type === 'dir' ? (
                      <Folder className="w-4 h-4 text-sand shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-stone shrink-0" />
                    )}
                    <span className="text-sm text-parchment truncate flex-1">
                      {basename(item.name)}
                    </span>
                    {item.type === 'file' && (
                      <span className="text-[10px] text-stone shrink-0 flex gap-2">
                        {item.size != null && <span>{formatSize(item.size)}</span>}
                        {item.modified && <span>{formatDate(item.modified)}</span>}
                      </span>
                    )}
                    {item.type === 'dir' && (
                      <ChevronRight className="w-3.5 h-3.5 text-stone/50 shrink-0" />
                    )}
                  </button>
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </div>
  )
}
