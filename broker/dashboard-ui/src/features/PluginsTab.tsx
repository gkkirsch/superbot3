import { usePlugins } from '@/hooks/useSpaces'
import { Card, CardContent } from '@/components/ui/card'
import { Puzzle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PluginInfo {
  name: string
  description: string
  category: string
  marketplace: string
  installed: boolean
  enabled: boolean
  version: string | null
}

export function PluginsTab({ slug }: { slug: string }) {
  const { data: plugins, isLoading } = usePlugins(slug)

  if (isLoading) return <div className="text-stone text-sm py-4">Loading...</div>

  if (!plugins?.length) {
    return <div className="text-stone text-sm py-4">No plugins available.</div>
  }

  return (
    <div className="space-y-1">
      {(plugins as PluginInfo[]).map(plugin => (
        <Card key={plugin.name}>
          <CardContent className="p-3 flex items-center gap-2">
            <Puzzle className={cn('w-3.5 h-3.5 shrink-0', plugin.enabled ? 'text-sand' : 'text-stone/50')} />
            <div className="flex-1 min-w-0">
              <span className="text-sm text-parchment">{plugin.name}</span>
              {plugin.description && (
                <p className="text-xs text-stone truncate">{plugin.description}</p>
              )}
            </div>
            {plugin.installed && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded', plugin.enabled ? 'bg-moss/20 text-moss' : 'bg-stone/10 text-stone')}>
                {plugin.enabled ? 'enabled' : 'installed'}
              </span>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
