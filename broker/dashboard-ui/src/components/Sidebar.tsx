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
        collapsed ? 'w-12' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center shrink-0', collapsed ? 'justify-center px-0 pt-4 pb-4' : 'justify-center px-3 pt-5 pb-6')}>
        <NavLink to="/" className="block hover:opacity-80 transition-opacity">
          {collapsed ? (
            <img src="/logo.png" alt="SB" className="h-6 w-6" />
          ) : (
            <img src="/superbot-logo.png" alt="Superbot" className="h-6" />
          )}
        </NavLink>
      </div>

      {/* Main nav */}
      <nav className={cn('flex-1 overflow-y-auto scrollbar-auto', collapsed ? 'px-1.5 py-1' : 'px-2 py-2')}>
        <NavLink
          to="/"
          end
          className={() => cn(
            'flex items-center rounded-md transition-colors mb-0.5',
            collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-1.5 text-sm',
            isActive('/', true) ? 'bg-sand/15 text-sand font-medium' : 'text-stone hover:text-parchment hover:bg-surface'
          )}
          title={collapsed ? 'Dashboard' : undefined}
        >
          <Gauge className="w-4 h-4 shrink-0" />
          {!collapsed && 'Dashboard'}
        </NavLink>

        {/* Spaces section */}
        {!collapsed && (
          <div className="mt-5 mb-1.5 px-3 text-[10px] uppercase tracking-widest text-stone/70 font-medium">
            Spaces
          </div>
        )}
        {collapsed && <div className="mt-3 mb-2 border-t border-border-custom mx-1" />}

        {sortedSpaces.map(space => (
          <NavLink
            key={space.slug}
            to={`/spaces/${space.slug}`}
            className={() => cn(
              'group/item flex items-center rounded-md text-xs transition-colors mb-0.5',
              collapsed ? 'justify-center p-2' : 'gap-2 px-3 py-1.5',
              isActive(`/spaces/${space.slug}`) ? 'bg-sand/15 text-sand font-medium' : 'text-stone hover:text-parchment hover:bg-surface'
            )}
            title={collapsed ? space.slug : undefined}
          >
            {collapsed ? (
              <span className="text-[11px] font-medium">{space.slug[0].toUpperCase()}</span>
            ) : (
              <>
                <span className="truncate flex-1">{space.slug}</span>
                <button
                  onClick={(e) => toggleStar(space.slug, e)}
                  className={cn(
                    'transition-opacity',
                    starred.has(space.slug) ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'
                  )}
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
          className={cn(
            'flex items-center rounded-md text-stone hover:text-parchment hover:bg-surface w-full mt-1 transition-colors',
            collapsed ? 'justify-center p-2' : 'gap-2.5 px-3 py-1.5 text-sm'
          )}
          title={collapsed ? 'Create Space' : undefined}
        >
          <Plus className="w-4 h-4 shrink-0" />
          {!collapsed && <span className="text-xs">Create Space</span>}
        </button>
      </nav>

      {/* Bottom */}
      <div className={cn('border-t border-border-custom flex items-center', collapsed ? 'flex-col gap-1 px-1.5 py-2' : 'gap-1 px-2 py-2')}>
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-md text-stone hover:text-parchment hover:bg-surface transition-colors"
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        {!collapsed && <div className="flex-1" />}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="p-1.5 rounded-md text-stone hover:text-parchment hover:bg-surface transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  )
}
