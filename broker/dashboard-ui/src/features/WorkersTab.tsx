import { useWorkers } from '@/hooks/useSpaces'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users } from 'lucide-react'

export function WorkersTab({ slug }: { slug: string }) {
  const { data, isLoading } = useWorkers(slug)

  if (isLoading) return <div className="text-stone text-sm py-4">Loading...</div>

  const members = data?.members || []

  if (members.length === 0) {
    return <div className="text-stone text-sm py-4">No active workers.</div>
  }

  return (
    <div className="space-y-1">
      {members.map((member: any, i: number) => (
        <Card key={i}>
          <CardContent className="p-3 flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-sand shrink-0" />
            <span className="text-sm text-foreground">{member.name || member.agentId || `Worker ${i + 1}`}</span>
            {member.status && (
              <Badge variant={member.status === 'active' ? 'success' : 'secondary'} className="ml-auto">
                {member.status}
              </Badge>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
