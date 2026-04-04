import { useParams } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ChatSection } from '@/features/ChatSection'
import { KnowledgeTab } from '@/features/KnowledgeTab'
import { SchedulesTab } from '@/features/SchedulesTab'
import { PluginsTab } from '@/features/PluginsTab'
import { SkillsTab } from '@/features/SkillsTab'
import { WorkersTab } from '@/features/WorkersTab'
import { SettingsTab } from '@/features/SettingsTab'
import { useSpace, useSpaceMessages, useSpaceConversation } from '@/hooks/useSpaces'
import { sendSpaceMessage } from '@/lib/api'
import { usePanel } from '@/hooks/usePanel'
import { PanelRight, X } from 'lucide-react'

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
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-custom shrink-0">
          <h1 className="text-base font-semibold text-parchment">{space.slug}</h1>
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

      {/* Panel — pushes content, no overlay */}
      {panelOpen && (
        <div className="w-96 xl:w-[28rem] shrink-0 border-l border-border-custom bg-surface flex flex-col h-screen">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-custom shrink-0">
            <span className="text-xs uppercase tracking-widest text-stone/70 font-medium">Details</span>
            <button
              onClick={closePanel}
              className="p-1 rounded-md text-stone hover:text-parchment hover:bg-ink transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-auto">
            <Tabs defaultValue="knowledge">
              <TabsList className="mx-4 mt-3">
                <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
                <TabsTrigger value="schedules">Schedules</TabsTrigger>
                <TabsTrigger value="skills">Skills</TabsTrigger>
                <TabsTrigger value="plugins">Plugins</TabsTrigger>
                <TabsTrigger value="workers">Workers</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>

              <TabsContent value="knowledge" className="px-4">
                <KnowledgeTab slug={slug!} />
              </TabsContent>
              <TabsContent value="schedules" className="px-4">
                <SchedulesTab slug={slug!} />
              </TabsContent>
              <TabsContent value="skills" className="px-4">
                <SkillsTab slug={slug!} />
              </TabsContent>
              <TabsContent value="plugins" className="px-4">
                <PluginsTab slug={slug!} />
              </TabsContent>
              <TabsContent value="workers" className="px-4">
                <WorkersTab slug={slug!} />
              </TabsContent>
              <TabsContent value="settings" className="px-4">
                <SettingsTab space={space} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  )
}
