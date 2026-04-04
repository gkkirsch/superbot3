import type { Space } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function SettingsTab({ space }: { space: Space }) {
  const items = [
    { label: 'Name', value: space.name },
    { label: 'Slug', value: space.slug },
    { label: 'Space Dir', value: space.spaceDir },
    { label: 'Code Dir', value: space.codeDir || 'None' },
    { label: 'Config Dir', value: space.claudeConfigDir },
    { label: 'Active', value: space.active ? 'Yes' : 'No' },
    { label: 'Created', value: new Date(space.created).toLocaleDateString() },
    { label: 'Session ID', value: space.sessionId || 'None' },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Space Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2">
          {items.map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm">
              <dt className="text-stone">{label}</dt>
              <dd className="text-foreground font-mono text-xs truncate max-w-[60%] text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
