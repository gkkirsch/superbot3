import { usePlugins } from '@/hooks/useSpaces'
import { Card, CardContent } from '@/components/ui/card'
import { Puzzle } from 'lucide-react'

export function PluginsTab({ slug }: { slug: string }) {
  const { data: plugins, isLoading } = usePlugins(slug)

  if (isLoading) return <div className="text-stone text-sm py-4">Loading...</div>

  if (!plugins?.length) {
    return <div className="text-stone text-sm py-4">No plugins installed.</div>
  }

  return (
    <div className="space-y-1">
      {plugins.map(name => (
        <Card key={name}>
          <CardContent className="p-3 flex items-center gap-2">
            <Puzzle className="w-3.5 h-3.5 text-sand shrink-0" />
            <span className="text-sm text-foreground">{name}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
