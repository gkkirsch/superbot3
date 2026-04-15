import { ChatSection } from '@/features/ChatSection'
import { useMasterMessages, useMasterRichConversation } from '@/hooks/useSpaces'
import { sendMasterMessage } from '@/lib/api'

export function Dashboard() {
  const { data: messages } = useMasterMessages()
  const { data: richConversation } = useMasterRichConversation()

  return (
    <div className="flex flex-col h-screen">
      <ChatSection
        messages={messages || []}
        richConversation={richConversation || []}
        sendFn={sendMasterMessage}
        queryKey={['master-messages']}
      />
    </div>
  )
}
