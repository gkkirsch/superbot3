import { ChatSection } from '@/features/ChatSection'
import { SpaceStatusGrid } from '@/features/SpaceStatusGrid'
import { useMasterMessages, useMasterConversation } from '@/hooks/useSpaces'
import { sendMasterMessage } from '@/lib/api'

export function Dashboard() {
  const { data: messages } = useMasterMessages()
  const { data: conversation } = useMasterConversation()

  return (
    <div className="flex flex-col lg:flex-row h-screen">
      {/* Master chat */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-border-custom">
        <ChatSection
          messages={messages || []}
          conversation={conversation || []}
          sendFn={sendMasterMessage}
          queryKey={['master-messages']}
          title="Master Orchestrator"
        />
      </div>

      {/* Space status sidebar */}
      <div className="w-full lg:w-80 xl:w-96 overflow-y-auto p-4 scrollbar-auto">
        <h2 className="text-sm font-medium text-parchment mb-3">Spaces</h2>
        <SpaceStatusGrid />
      </div>
    </div>
  )
}
