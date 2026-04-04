import { useSkills, useAgents } from '@/hooks/useSpaces'
import { Card, CardContent } from '@/components/ui/card'
import { Blocks, Bot } from 'lucide-react'

export function SkillsTab({ slug }: { slug: string }) {
  const { data: skills, isLoading: loadingSkills } = useSkills(slug)
  const { data: agents, isLoading: loadingAgents } = useAgents(slug)

  if (loadingSkills || loadingAgents) return <div className="text-stone text-sm py-4">Loading...</div>

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-medium text-stone uppercase tracking-wider mb-2">Skills</h3>
        {!skills?.length ? (
          <div className="text-stone text-sm">No skills.</div>
        ) : (
          <div className="space-y-1">
            {skills.map(s => (
              <Card key={s.dirname}>
                <CardContent className="p-3 flex items-center gap-2">
                  <Blocks className="w-3.5 h-3.5 text-sand shrink-0" />
                  <span className="text-sm text-foreground">{s.dirname}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-medium text-stone uppercase tracking-wider mb-2">Agents</h3>
        {!agents?.length ? (
          <div className="text-stone text-sm">No agents.</div>
        ) : (
          <div className="space-y-1">
            {agents.map(a => (
              <Card key={a.filename}>
                <CardContent className="p-3 flex items-center gap-2">
                  <Bot className="w-3.5 h-3.5 text-sand shrink-0" />
                  <span className="text-sm text-foreground">{a.name || a.filename}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
