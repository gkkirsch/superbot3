import { useState } from 'react'
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
import { PanelRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SpaceDetail() {
  const { slug } = useParams<{ slug: string }>()
  const { data: space, isLoading } = useSpace(slug!)
  const { data: messages } = useSpaceMessages(slug!)
  const { data: conversation } = useSpaceConversation(slug!)
  const [panelOpen, setPanelOpen] = useState(false)

  if (isLoading) {
    return <div className="p-6 text-stone">Loading space...</div>
  }

  if (!space) {
    return <div className="p-6 text-ember">Space not found.</div>
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-custom">
        <h1 className="text-base font-semibold text-parchment">{space.slug}</h1>
        {space.codeDir && (
          <span className="text-xs text-stone font-mono">{space.codeDir}</span>
        )}
        <div className="ml-auto">
          <button
            onClick={() => setPanelOpen(o => !o)}
            className="p-1.5 rounded-md text-stone hover:text-parchment hover:bg-ink transition-colors"
            title="Toggle panel"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Chat -- primary */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChatSection
            messages={messages || []}
            conversation={conversation || []}
            sendFn={(text: string) => sendSpaceMessage(slug!, text)}
            queryKey={['space-messages', slug!]}
          />
        </div>

        {/* Panel — pushes content when open */}
        {panelOpen && (
        <div className="w-96 xl:w-[28rem] shrink-0 bg-surface border-l border-border-custom">
          <div className="flex items-center justify-between px-3 pt-3 pb-1">
            <span className="text-xs uppercase tracking-widest text-stone/70 font-medium">Details</span>
            <button
              onClick={() => setPanelOpen(false)}
              className="p-1 rounded-md text-stone hover:text-parchment hover:bg-ink transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-y-auto h-[calc(100%-2.5rem)] scrollbar-auto">
            <Tabs defaultValue="knowledge">
              <TabsList className="mx-3">
                <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
                <TabsTrigger value="schedules">Schedules</TabsTrigger>
                <TabsTrigger value="skills">Skills</TabsTrigger>
                <TabsTrigger value="plugins">Plugins</TabsTrigger>
                <TabsTrigger value="workers">Workers</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>

              <TabsContent value="knowledge" className="px-3">
                <KnowledgeTab slug={slug!} />
              </TabsContent>
              <TabsContent value="schedules" className="px-3">
                <SchedulesTab slug={slug!} />
              </TabsContent>
              <TabsContent value="skills" className="px-3">
                <SkillsTab slug={slug!} />
              </TabsContent>
              <TabsContent value="plugins" className="px-3">
                <PluginsTab slug={slug!} />
              </TabsContent>
              <TabsContent value="workers" className="px-3">
                <WorkersTab slug={slug!} />
              </TabsContent>
              <TabsContent value="settings" className="px-3">
                <SettingsTab space={space} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}
