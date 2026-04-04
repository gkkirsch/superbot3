import { useSchedules } from '@/hooks/useSpaces'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock } from 'lucide-react'

export function SchedulesTab({ slug }: { slug: string }) {
  const { data, isLoading } = useSchedules(slug)

  if (isLoading) return <div className="text-stone text-sm py-4">Loading...</div>

  const tasks = data?.tasks || []

  if (tasks.length === 0) {
    return <div className="text-stone text-sm py-4">No scheduled tasks.</div>
  }

  return (
    <div className="space-y-2">
      {tasks.map(task => (
        <Card key={task.id}>
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <Clock className="w-3.5 h-3.5 text-stone mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-xs text-sand bg-sand/10 px-1.5 py-0.5 rounded">{task.cron}</code>
                  {task.permanent && <Badge variant="secondary">permanent</Badge>}
                  {task.recurring && <Badge variant="outline">recurring</Badge>}
                </div>
                <p className="text-xs text-foreground line-clamp-2">{task.prompt}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
