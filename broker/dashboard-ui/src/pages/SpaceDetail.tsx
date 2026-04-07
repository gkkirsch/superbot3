import { useParams } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ChatSection } from '@/features/ChatSection'
import { KnowledgeTab } from '@/features/KnowledgeTab'
import { MemoryTab } from '@/features/MemoryTab'
import { SchedulesTab } from '@/features/SchedulesTab'
import { PluginsTab } from '@/features/PluginsTab'
import { SettingsTab } from '@/features/SettingsTab'
import { useSpace, useSpaceMessages, useSpaceConversation } from '@/hooks/useSpaces'
import { sendSpaceMessage } from '@/lib/api'
import { usePanel } from '@/hooks/usePanel'
import { PanelRight, X, Puzzle, FolderOpen, Clock, Settings, Brain, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useRef, useEffect } from 'react'

function MoreMenuTabs({ defaultValue, closePanel, slug, space }: { defaultValue: string; closePanel: () => void; slug: string; space: any }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(defaultValue)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const overflowTabs = [
    { value: 'memory', label: 'Memory', icon: Brain },
    { value: 'settings', label: 'Settings', icon: Settings },
  ]
  const isOverflowActive = overflowTabs.some(t => t.value === activeTab)

  return (
    <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setMoreOpen(false) }} className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-2 py-2 border-b border-border-custom shrink-0">
        <TabsList className="flex-1 inline-flex h-auto items-center gap-1 rounded-none bg-transparent p-0">
          <TabsTrigger value="plugins" className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs bg-transparent shadow-none data-[state=active]:bg-sand/10 data-[state=active]:text-sand">
            <Puzzle className="w-3.5 h-3.5" />Plugins
          </TabsTrigger>
          <TabsTrigger value="files" className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs bg-transparent shadow-none data-[state=active]:bg-sand/10 data-[state=active]:text-sand">
            <FolderOpen className="w-3.5 h-3.5" />Files
          </TabsTrigger>
          <TabsTrigger value="schedules" className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs bg-transparent shadow-none data-[state=active]:bg-sand/10 data-[state=active]:text-sand">
            <Clock className="w-3.5 h-3.5" />Schedules
          </TabsTrigger>
        </TabsList>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className={cn(
              'p-1.5 rounded-md transition-colors shrink-0',
              isOverflowActive ? 'text-sand bg-sand/10' : 'text-stone hover:text-parchment hover:bg-ink'
            )}
            title="More tabs"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-full mt-1 bg-surface border border-border-custom rounded-lg shadow-lg py-1 z-50 min-w-[140px]">
              {overflowTabs.map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors',
                    activeTab === tab.value ? 'text-sand bg-sand/10' : 'text-stone hover:text-parchment hover:bg-ink'
                  )}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={closePanel}
          className="p-1.5 rounded-md text-stone hover:text-parchment hover:bg-ink transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {/* Hidden TabsTriggers for overflow tabs so Tabs component recognizes them */}
      <div className="hidden">
        <TabsTrigger value="memory">Memory</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-auto pb-8">
        <TabsContent value="plugins" className="px-4">
          <PluginsTab slug={slug} />
        </TabsContent>
        <TabsContent value="files" className="px-4">
          <KnowledgeTab slug={slug} />
        </TabsContent>
        <TabsContent value="memory" className="px-4">
          <MemoryTab slug={slug} />
        </TabsContent>
        <TabsContent value="schedules" className="px-4">
          <SchedulesTab slug={slug} />
        </TabsContent>
        <TabsContent value="settings" className="px-4">
          <SettingsTab space={space} />
        </TabsContent>
      </div>
    </Tabs>
  )
}

export function SpaceDetail() {
  const { slug } = useParams<{ slug: string }>()
  const { data: space, isLoading } = useSpace(slug!)
  const { data: messages } = useSpaceMessages(slug!)
  const { data: conversation } = useSpaceConversation(slug!)
  const { open: panelOpen, toggle: togglePanel, close: closePanel } = usePanel()

  if (isLoading) {
    return <div className="p-6 text-stone">Loading space...</div>
  }

  if (!space) {
    return <div className="p-6 text-ember">Space not found.</div>
  }

  return (
    <div className="flex h-screen">
      {/* Main area: header + chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 shrink-0">
          <h1 className="text-base font-semibold text-parchment">{space.name || space.slug}</h1>
          {space.codeDir && (
            <span className="text-xs text-stone font-mono">{space.codeDir}</span>
          )}
          <div className="ml-auto">
            <button
              onClick={togglePanel}
              className="p-1.5 rounded-md text-stone hover:text-parchment hover:bg-ink transition-colors"
              title="Toggle panel"
            >
              <PanelRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Chat */}
        <div className="flex-1 min-h-0">
          <ChatSection
            messages={messages || []}
            conversation={conversation || []}
            sendFn={(text: string) => sendSpaceMessage(slug!, text)}
            queryKey={['space-messages', slug!]}
          />
        </div>
      </div>

      {/* Panel — slides in, pushes content */}
      <div className={cn(
        'shrink-0 border-l border-border-custom bg-surface flex flex-col h-screen overflow-hidden transition-[width] duration-200 ease-in-out',
        panelOpen ? 'w-96 xl:w-[28rem]' : 'w-0 border-l-0'
      )}>
        {panelOpen && (
          <>
          <MoreMenuTabs defaultValue="plugins" closePanel={closePanel} slug={slug!} space={space} />
          </>
        )}
      </div>
    </div>
  )
}
