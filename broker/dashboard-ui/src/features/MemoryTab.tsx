import { useMemory, useMemoryStats } from '@/hooks/useSpaces'
import { fetchMemoryFile, saveMemoryFile } from '@/lib/api'
import { FileExplorer } from '@/components/FileExplorer'
import { useQueryClient } from '@tanstack/react-query'
import { Brain } from 'lucide-react'
import type { FileItem } from '@/components/FileExplorer'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  return `${(bytes / 1024).toFixed(1)}KB`
}

export function MemoryTab({ slug }: { slug: string }) {
  const { data: files, isLoading } = useMemory(slug)
  const { data: stats } = useMemoryStats(slug)
  const queryClient = useQueryClient()

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['memory', slug] })
    queryClient.invalidateQueries({ queryKey: ['memory-stats', slug] })
  }

  if (isLoading) return <div className="text-stone text-sm py-4">Loading...</div>

  // Convert memory files to FileItem format, building dir entries from paths
  const fileItems: FileItem[] = []
  const dirs = new Set<string>()

  for (const f of (files || [])) {
    fileItems.push({ name: f.name, type: 'file', size: f.size, modified: f.modified })
    // Add parent directories
    const parts = f.name.split('/')
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join('/'))
    }
  }

  for (const dir of dirs) {
    fileItems.push({ name: dir, type: 'dir' })
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

      {(!files || files.length === 0) ? (
        <div className="text-center py-8">
          <Brain className="w-8 h-8 text-stone/50 mx-auto mb-2" />
          <p className="text-sm text-stone">No memory files yet.</p>
          <p className="text-xs text-stone/70 mt-1">Memory will be populated as the space learns.</p>
        </div>
      ) : (
        <FileExplorer
          items={fileItems}
          onFileRead={async (path) => {
            const data = await fetchMemoryFile(slug, path)
            return { content: data.content }
          }}
          onFileSave={async (path, content) => {
            await saveMemoryFile(slug, path, content)
            invalidate()
          }}
          title="Memory Files"
          editable
        />
      )}
    </div>
  )
}
