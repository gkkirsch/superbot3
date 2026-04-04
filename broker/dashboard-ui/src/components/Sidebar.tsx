import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Gauge, Star, Plus, Sun, Moon, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSpaces } from '@/hooks/useSpaces'
import { useTheme } from '@/hooks/useTheme'

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('superbot3-sidebar-collapsed') === 'true'
  )
  const [starred, setStarred] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('superbot3-starred') || '[]'))
    } catch { return new Set() }
  })
  const { data: spaces } = useSpaces()
  const { theme, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    localStorage.setItem('superbot3-sidebar-collapsed', String(collapsed))
  }, [collapsed])

  useEffect(() => {
    localStorage.setItem('superbot3-starred', JSON.stringify([...starred]))
  }, [starred])

  const toggleStar = (slug: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setStarred(prev => {
      const next = new Set(prev)
      next.has(slug) ? next.delete(slug) : next.add(slug)
      return next
    })
  }

  const sortedSpaces = [...(spaces || [])].sort((a, b) => {
    const aStarred = starred.has(a.slug) ? 0 : 1
    const bStarred = starred.has(b.slug) ? 0 : 1
    if (aStarred !== bStarred) return aStarred - bStarred
    return a.slug.localeCompare(b.slug)
  })

  const isActive = (to: string, end?: boolean) => {
    if (end) return location.pathname === to
    return location.pathname.startsWith(to)
  }

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-border-custom bg-surface/50 transition-all duration-200 h-screen sticky top-0',
        collapsed ? 'w-14' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-center px-3 pt-2 pb-6 shrink-0">
        {collapsed ? (
          <NavLink to="/" className="block hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt="SB" className="h-8 w-8" />
          </NavLink>
        ) : (
          <NavLink to="/" className="block hover:opacity-80 transition-opacity">
            <img src="/superbot-logo.png" alt="Superbot" className="h-6" />
          </NavLink>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 scrollbar-auto">
        <NavLink
          to="/"
          end
          className={() => cn(
            'flex items-center gap-3 rounded-md px-2.5 py-1.5 text-sm transition-colors mb-0.5',
            isActive('/', true) ? 'bg-sand/15 text-sand font-medium' : 'text-stone hover:text-parchment hover:bg-ink'
          )}
        >
          <Gauge className="w-4 h-4 shrink-0" />
          {!collapsed && 'Dashboard'}
        </NavLink>

        {/* Spaces section */}
        {!collapsed && (
          <div className="mt-5 mb-1.5 px-2.5 text-[10px] uppercase tracking-widest text-stone/70 font-medium">
            Spaces
          </div>
        )}
        {collapsed && <div className="mt-3 mb-1 border-t border-border-custom mx-1" />}

        {sortedSpaces.map(space => (
          <NavLink
            key={space.slug}
            to={`/spaces/${space.slug}`}
            className={() => cn(
              'group/item flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors mb-0.5',
              isActive(`/spaces/${space.slug}`) ? 'bg-sand/15 text-sand font-medium' : 'text-stone hover:text-parchment hover:bg-ink'
            )}
          >
            <span className="relative shrink-0">
              <span className={cn(
                'block w-2 h-2 rounded-full',
                space.running ? 'bg-moss animate-pulse-dot' : 'bg-stone/30'
              )} />
            </span>
            {!collapsed && (
              <>
                <span className="truncate flex-1 font-mono text-xs">{space.slug}</span>
                <button
                  onClick={(e) => toggleStar(space.slug, e)}
                  className="opacity-0 group-hover/item:opacity-100 transition-opacity"
                >
                  <Star className={cn(
                    'w-3 h-3',
                    starred.has(space.slug) ? 'fill-sand text-sand' : 'text-stone'
                  )} />
                </button>
              </>
            )}
          </NavLink>
        ))}

        {/* Create Space */}
        <button
          onClick={() => navigate('/create-space')}
          className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-stone hover:text-parchment hover:bg-ink w-full mt-1 transition-colors"
        >
          <Plus className="w-4 h-4 shrink-0" />
          {!collapsed && <span className="text-xs">Create Space</span>}
        </button>
      </nav>

      {/* Bottom */}
      <div className="border-t border-border-custom px-2 py-2 flex items-center gap-1">
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-md text-stone hover:text-parchment hover:bg-ink transition-colors"
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        {!collapsed && <div className="flex-1" />}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="p-1.5 rounded-md text-stone hover:text-parchment hover:bg-ink transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  )
}
