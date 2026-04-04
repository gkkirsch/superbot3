import { useState } from 'react'
import { useKnowledge } from '@/hooks/useSpaces'
import { fetchKnowledgeFile, saveKnowledgeFile } from '@/lib/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Save, X } from 'lucide-react'

export function KnowledgeTab({ slug }: { slug: string }) {
  const { data: files, isLoading } = useKnowledge(slug)
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const queryClient = useQueryClient()

  const loadFile = async (name: string) => {
    setSelected(name)
    setEditing(false)
    const data = await fetchKnowledgeFile(slug, name)
    setContent(data.content)
  }

  const saveMutation = useMutation({
    mutationFn: () => saveKnowledgeFile(slug, selected!, content),
    onSuccess: () => {
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['knowledge', slug] })
    },
  })

  if (isLoading) return <div className="text-stone text-sm py-4">Loading...</div>

  return (
    <div>
      <div className="space-y-1 mb-3">
        {files?.length === 0 && <div className="text-stone text-sm py-2">No knowledge files.</div>}
        {files?.map(f => (
          <button
            key={f.name}
            onClick={() => loadFile(f.name)}
            className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
              selected === f.name ? 'bg-sand/15 text-sand' : 'text-stone hover:text-parchment hover:bg-muted'
            }`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{f.name}</span>
            <span className="text-[10px] text-stone ml-auto">{(f.size / 1024).toFixed(1)}K</span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-muted text-xs">
            <span className="text-foreground font-medium">{selected}</span>
            <div className="flex gap-1">
              {editing ? (
                <>
                  <button
                    onClick={() => saveMutation.mutate()}
                    className="p-1 text-moss hover:text-moss/80"
                    disabled={saveMutation.isPending}
                  >
                    <Save className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setEditing(false)} className="p-1 text-stone hover:text-parchment">
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
