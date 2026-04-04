import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useSpaces } from '@/hooks/useSpaces'

export function SpaceStatusGrid() {
  const { data: spaces, isLoading } = useSpaces()

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <Card key={i} className="animate-pulse">
            <CardHeader><div className="h-4 bg-muted rounded w-24" /></CardHeader>
            <CardContent><div className="h-3 bg-muted rounded w-16" /></CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!spaces?.length) {
    return <div className="text-stone text-sm">No spaces created yet.</div>
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {spaces.map(space => (
        <Link key={space.slug} to={`/spaces/${space.slug}`}>
          <Card className="hover:border-sand/30 transition-colors cursor-pointer">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle>{space.slug}</CardTitle>
                <Badge variant={space.running ? 'success' : 'secondary'}>
                  {space.running ? 'Running' : 'Stopped'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-stone">
                {space.active ? 'Active' : 'Inactive'}
                {space.codeDir && ` \u00b7 ${space.codeDir.split('/').pop()}`}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
