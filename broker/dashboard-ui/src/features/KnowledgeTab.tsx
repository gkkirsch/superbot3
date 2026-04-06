import { useKnowledge } from '@/hooks/useSpaces'
import { fetchKnowledgeFile, saveKnowledgeFile, deleteKnowledgeFile } from '@/lib/api'
import { FileExplorer } from '@/components/FileExplorer'
import { useQueryClient } from '@tanstack/react-query'

export function KnowledgeTab({ slug }: { slug: string }) {
  const { data: items, isLoading } = useKnowledge(slug)
  const queryClient = useQueryClient()

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['knowledge', slug] })

  if (isLoading) return <div className="text-stone text-sm py-4">Loading...</div>

  return (
    <FileExplorer
      items={items || []}
      onFileRead={async (path) => {
        const data = await fetchKnowledgeFile(slug, path)
        return { content: data.content }
      }}
      onFileSave={async (path, content) => {
        await saveKnowledgeFile(slug, path, content)
        invalidate()
      }}
      onFileDelete={async (path) => {
        await deleteKnowledgeFile(slug, path)
        invalidate()
      }}
      onFileCreate={async (path, content) => {
        await saveKnowledgeFile(slug, path, content)
        invalidate()
      }}
      title="Knowledge Files"
      editable
    />
  )
}
