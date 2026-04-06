import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  FileText, Plus, Pencil, Trash2, Save, X,
  Folder, ArrowLeft, BookOpen,
} from 'lucide-react'

export interface FileItem {
  name: string        // relative path like "wiki/concepts/plugin-system.md"
  type: 'file' | 'dir'
  size?: number
  modified?: string
}

export interface FileExplorerProps {
  items: FileItem[]
  onFileRead: (path: string) => Promise<{ content: string }>
  onFileSave?: (path: string, content: string) => Promise<void>
  onFileDelete?: (path: string) => Promise<void>
  onFileCreate?: (path: string, content: string) => Promise<void>
  title?: string
  editable?: boolean
}

type View = 'browser' | 'detail' | 'create'

function basename(name: string) {
  return name.split('/').pop() || name
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  return `${(bytes / 1024).toFixed(1)}K`
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function FileExplorer({
  items,
  onFileRead,
  onFileSave,
  onFileDelete,
  onFileCreate,
  title,
  editable,
}: FileExplorerProps) {
  const [currentPath, setCurrentPath] = useState('')
  const [view, setView] = useState<View>('browser')
  const [selectedFile, setSelectedFile] = useState('')
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [loadingFile, setLoadingFile] = useState(false)
  const [saving, setSaving] = useState(false)

  // Create state
  const [newFilename, setNewFilename] = useState('')
  const [newContent, setNewContent] = useState('')

  // Filter items for current directory level
  const currentItems = useMemo(() => {
    if (!items) return []
    const prefix = currentPath ? currentPath + '/' : ''
    return items.filter((item) => {
      if (!item.name.startsWith(prefix)) return false
      const rest = item.name.slice(prefix.length)
      if (!rest || rest === '') return false
      return !rest.includes('/')
    })
  }, [items, currentPath])

  const currentDirName = currentPath ? basename(currentPath) : (title || 'Files')

  function navigateToDir(dirPath: string) {
    setCurrentPath(dirPath)
    setView('browser')
    setSelectedFile('')
    setEditing(false)
  }

  function goUp() {
    const parentPath = currentPath.includes('/')
      ? currentPath.substring(0, currentPath.lastIndexOf('/'))
      : ''
    navigateToDir(parentPath)
  }

  async function openFile(name: string) {
    setSelectedFile(name)
    setView('detail')
    setEditing(false)
    setLoadingFile(true)
    try {
      const data = await onFileRead(name)
      setContent(data.content)
    } catch {
      setContent('Error loading file.')
    } finally {
      setLoadingFile(false)
    }
  }

  async function handleSave() {
    if (!onFileSave) return
    setSaving(true)
    try {
      await onFileSave(selectedFile, content)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!onFileDelete) return
    if (!confirm(`Delete ${basename(selectedFile)}?`)) return
    await onFileDelete(selectedFile)
    navigateToDir(currentPath)
  }

  async function handleCreate() {
    if (!onFileCreate) return
    const trimmed = newFilename.trim()
    if (!trimmed) return
    const filename = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`
    const fullPath = currentPath ? `${currentPath}/${filename}` : filename
    setSaving(true)
    try {
      await onFileCreate(fullPath, newContent)
      setNewFilename('')
      setNewContent('')
      setSelectedFile(fullPath)
      setContent(newContent)
      setView('detail')
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const isMarkdown = selectedFile.endsWith('.md')

  // ── File Detail View ──
  if (view === 'detail' && selectedFile) {
    const meta = items.find((i) => i.name === selectedFile && i.type === 'file')
    return (
      <div className="space-y-3 py-2">
        {/* Header */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateToDir(currentPath)}
            className="flex items-center gap-1 text-xs text-sand hover:text-parchment transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <span className="text-xs text-stone">/</span>
          <span className="text-sm font-medium text-parchment truncate">{basename(selectedFile)}</span>
        </div>

        {/* File meta */}
        {meta && (
          <div className="text-[10px] text-stone flex gap-3">
            {meta.size != null && <span>{formatSize(meta.size)}</span>}
            {meta.modified && <span>{formatDate(meta.modified)}</span>}
          </div>
        )}

        {/* Actions */}
        {editable && (
          <div className="flex gap-2">
            {editing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md bg-moss/20 text-moss hover:bg-moss/30 disabled:opacity-50 transition-colors"
                >
                  <Save className="w-3 h-3" />
                  {saving ? 'Saving...' : 'Save'}
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
                {onFileSave && (
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md bg-sand/10 text-sand hover:bg-sand/20 transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                )}
                {onFileDelete && (
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md text-stone hover:text-ember hover:bg-ember/10 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Content */}
        {loadingFile ? (
          <div className="text-stone text-sm py-4">Loading file...</div>
        ) : editing ? (
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            className="w-full h-80 rounded-md border border-border-custom bg-ink p-3 text-sm font-mono text-parchment resize-none outline-none focus:ring-1 focus:ring-sand/40"
          />
        ) : isMarkdown ? (
          <div className="rounded-md border border-border-custom bg-ink p-4 overflow-auto max-h-[500px] prose prose-invert prose-sm max-w-none prose-headings:text-parchment prose-p:text-parchment/90 prose-a:text-sand prose-strong:text-parchment prose-code:text-sand prose-pre:bg-surface prose-pre:border prose-pre:border-border-custom">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : (
          <pre className="rounded-md border border-border-custom bg-ink p-4 overflow-auto max-h-[500px] text-sm font-mono text-parchment/80 whitespace-pre-wrap">
            {content}
          </pre>
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
          {currentPath && <span className="text-[10px] text-stone">in {currentPath}/</span>}
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
      {/* Back button + current dir name */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {currentPath && (
            <button
              onClick={goUp}
              className="flex items-center gap-1 text-xs text-sand hover:text-parchment transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          )}
          <h3 className="text-sm font-medium text-parchment">{currentDirName}</h3>
        </div>
        {onFileCreate && (
          <button
            onClick={() => { setView('create'); setNewFilename(''); setNewContent('') }}
            className="flex items-center gap-1 text-xs text-sand hover:text-parchment transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add File
          </button>
        )}
      </div>

      {/* Empty state */}
      {currentItems.length === 0 && (
        <div className="text-center py-8">
          <BookOpen className="w-8 h-8 text-stone/50 mx-auto mb-2" />
          <p className="text-sm text-stone">{currentPath ? 'Empty folder.' : 'No files.'}</p>
          {onFileCreate && (
            <>
              <p className="text-xs text-stone/70 mt-1">Add a file to get started.</p>
              <button
                onClick={() => { setView('create'); setNewFilename(''); setNewContent('') }}
                className="mt-3 flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md bg-sand text-ink hover:bg-sand/90 transition-colors mx-auto"
              >
                <Plus className="w-3 h-3" />
                Add File
              </button>
            </>
          )}
        </div>
      )}

      {/* Items list */}
      {currentItems.length > 0 && (
        <div className="space-y-1">
          {currentItems
            .sort((a, b) => {
              if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
              return a.name.localeCompare(b.name)
            })
            .map((item) => (
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
                  </button>
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </div>
  )
}
