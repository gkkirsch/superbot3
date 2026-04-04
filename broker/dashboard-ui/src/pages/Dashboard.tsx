import { ChatSection } from '@/features/ChatSection'
import { useMasterMessages, useMasterConversation } from '@/hooks/useSpaces'
import { sendMasterMessage } from '@/lib/api'

export function Dashboard() {
  const { data: messages } = useMasterMessages()
  const { data: conversation } = useMasterConversation()

  return (
    <div className="flex flex-col h-screen">
      <ChatSection
        messages={messages || []}
        conversation={conversation || []}
        sendFn={sendMasterMessage}
        queryKey={['master-messages']}
      />
    </div>
  )
}
