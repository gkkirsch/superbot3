import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { MessageSquare, Star, Plus, Sun, Moon, ChevronLeft, ChevronRight, Check, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSpaces } from '@/hooks/useSpaces'
import { useTheme } from '@/hooks/useTheme'
import { createSpace } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('superbot3-sidebar-collapsed') === 'true'
  )
  const [starred, setStarred] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('superbot3-starred') || '[]'))
    } catch { return new Set() }
  })
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: spaces } = useSpaces()
  const { theme, toggle: toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

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
        collapsed ? 'w-12' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center shrink-0', collapsed ? 'justify-center px-0 pt-4 pb-4' : 'justify-center px-3 pt-5 pb-6')}>
        <NavLink to="/" className="block hover:opacity-80 transition-opacity">
          {collapsed ? (
            <img src="/logo.png" alt="SB" className="h-8 w-8" />
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
            collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-1.5 text-[0.8125rem]',
            isActive('/', true) ? 'bg-sand/15 text-sand font-medium' : 'text-stone hover:text-parchment hover:bg-surface'
          )}
          title={collapsed ? 'Chat' : undefined}
        >
          <MessageSquare className="w-4 h-4 shrink-0" />
          {!collapsed && 'Chat'}
        </NavLink>

        {/* Spaces section */}
        {!collapsed && (
          <div className="mt-5 mb-1.5 px-3 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-stone/70 font-medium">Spaces</span>
            <button
              onClick={() => { setAdding(true); setNewName(''); setTimeout(() => inputRef.current?.focus(), 50) }}
              className="p-1 rounded-md bg-sand/10 border border-sand/20 text-sand hover:bg-sand/20 transition-colors"
              title="Create space"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        )}
        {collapsed && <div className="mt-3 mb-2 border-t border-border-custom mx-1" />}

        {sortedSpaces.map(space => (
          <NavLink
            key={space.slug}
            to={`/spaces/${space.slug}`}
            className={() => cn(
              'group/item flex items-center rounded-md text-[0.8125rem] transition-colors mb-0.5',
              collapsed ? 'justify-center p-2' : 'gap-2 px-3 py-1.5',
              isActive(`/spaces/${space.slug}`) ? 'bg-sand/15 text-sand font-medium' : 'text-stone hover:text-parchment hover:bg-surface'
            )}
            title={collapsed ? (space.name || space.slug) : undefined}
          >
            {collapsed ? (
              <span className="text-[11px] font-medium">{(space.name || space.slug)[0].toUpperCase()}</span>
            ) : (
              <>
                <span className="truncate flex-1">{space.name || space.slug}</span>
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

        {/* Inline create space */}
        {adding && !collapsed && (
          <div className="flex items-center gap-1.5 px-2 py-1 mb-0.5">
            <input
              ref={inputRef}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={async e => {
                if (e.key === 'Enter' && newName.trim()) {
                  setCreating(true)
                  try {
                    const result = await createSpace({ name: newName.trim() })
                    queryClient.invalidateQueries({ queryKey: ['spaces'] })
                    setAdding(false)
                    setNewName('')
                    if (result?.slug) navigate(`/spaces/${result.slug}`)
                  } catch {} finally { setCreating(false) }
                }
                if (e.key === 'Escape') { setAdding(false); setNewName('') }
              }}
              placeholder="Space name..."
              disabled={creating}
              className="flex-1 min-w-0 px-2 py-1 text-xs bg-ink border border-border-custom rounded text-parchment placeholder:text-stone/40 focus:outline-none focus:border-sand/40"
            />
            {creating ? (
              <Loader2 className="w-3.5 h-3.5 text-stone animate-spin shrink-0" />
            ) : (
              <>
                <button
                  onClick={async () => {
                    if (!newName.trim()) return
                    setCreating(true)
                    try {
                      const result = await createSpace({ name: newName.trim() })
                      queryClient.invalidateQueries({ queryKey: ['spaces'] })
                      setAdding(false)
                      setNewName('')
                      if (result?.slug) navigate(`/spaces/${result.slug}`)
                    } catch {} finally { setCreating(false) }
                  }}
                  className="p-0.5 rounded text-moss hover:bg-moss/10 transition-colors shrink-0"
                ><Check className="w-3.5 h-3.5" /></button>
                <button
                  onClick={() => { setAdding(false); setNewName('') }}
                  className="p-0.5 rounded text-stone hover:text-parchment hover:bg-surface transition-colors shrink-0"
                ><X className="w-3.5 h-3.5" /></button>
              </>
            )}
          </div>
        )}
        {collapsed && (
          <button
            onClick={() => { setAdding(true); setCollapsed(false); setTimeout(() => inputRef.current?.focus(), 200) }}
            className="flex items-center justify-center p-2 rounded-md text-stone hover:text-parchment hover:bg-surface w-full mt-1 transition-colors"
            title="Create Space"
          >
            <Plus className="w-4 h-4 shrink-0" />
          </button>
        )}
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
