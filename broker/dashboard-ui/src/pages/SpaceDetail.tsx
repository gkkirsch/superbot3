import { useParams } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ChatSection } from '@/features/ChatSection'
import { KnowledgeTab } from '@/features/KnowledgeTab'
import { MemoryTab } from '@/features/MemoryTab'
import { SchedulesTab } from '@/features/SchedulesTab'
import { PluginsTab } from '@/features/PluginsTab'
import { SettingsTab } from '@/features/SettingsTab'
// SkillsTab removed — skills shown inside PluginsTab
import { useSpace, useSpaceMessages, useSpaceConversation } from '@/hooks/useSpaces'
import { sendSpaceMessage } from '@/lib/api'
import { usePanel } from '@/hooks/usePanel'
import { PanelRight, X, Puzzle, FolderOpen, Clock, Settings, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'

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
        <div className="shrink-0 px-4 py-3">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
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
          <Tabs defaultValue="plugins" className="flex flex-col h-full">
            <div className="flex items-center gap-0.5 px-2 py-2 border-b border-border-custom shrink-0">
              <TabsList className="flex-1 inline-flex h-auto items-center gap-0.5 rounded-none bg-transparent p-0">
                <TabsTrigger value="plugins" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-stone bg-transparent shadow-none hover:bg-sand/5 hover:text-parchment transition-colors data-[state=active]:bg-sand/10 data-[state=active]:text-sand">
                  <Puzzle className="w-3.5 h-3.5" />Plugins
                </TabsTrigger>
                <TabsTrigger value="files" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-stone bg-transparent shadow-none hover:bg-sand/5 hover:text-parchment transition-colors data-[state=active]:bg-sand/10 data-[state=active]:text-sand">
                  <FolderOpen className="w-3.5 h-3.5" />Files
                </TabsTrigger>
                <TabsTrigger value="memory" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-stone bg-transparent shadow-none hover:bg-sand/5 hover:text-parchment transition-colors data-[state=active]:bg-sand/10 data-[state=active]:text-sand">
                  <Brain className="w-3.5 h-3.5" />Memory
                </TabsTrigger>
                <TabsTrigger value="schedules" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-stone bg-transparent shadow-none hover:bg-sand/5 hover:text-parchment transition-colors data-[state=active]:bg-sand/10 data-[state=active]:text-sand">
                  <Clock className="w-3.5 h-3.5" />Schedules
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-stone bg-transparent shadow-none hover:bg-sand/5 hover:text-parchment transition-colors data-[state=active]:bg-sand/10 data-[state=active]:text-sand">
                  <Settings className="w-3.5 h-3.5" />
                </TabsTrigger>
              </TabsList>
              <button
                onClick={closePanel}
                className="p-1.5 rounded-md text-stone hover:text-parchment hover:bg-ink transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-auto pb-8">
              <TabsContent value="plugins" className="px-4">
                <PluginsTab slug={slug!} />
              </TabsContent>
              <TabsContent value="files" className="px-4">
                <KnowledgeTab slug={slug!} />
              </TabsContent>
              <TabsContent value="memory" className="px-4">
                <MemoryTab slug={slug!} />
              </TabsContent>
              <TabsContent value="schedules" className="px-4">
                <SchedulesTab slug={slug!} />
              </TabsContent>
              <TabsContent value="settings" className="px-4">
                <SettingsTab space={space} />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </div>
    </div>
  )
}
