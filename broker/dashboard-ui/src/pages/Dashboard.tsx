import { useMasterRichConversation } from '@/hooks/useSpaces'
import { sendMasterMessage } from '@/lib/api'
import { ChatSection } from '@/features/ChatSection'

export function Dashboard() {
  const { data: richConversation } = useMasterRichConversation()

  return (
    <ChatSection
      richConversation={richConversation ?? []}
      onSend={sendMasterMessage}
      placeholder="Message the orchestrator..."
    />
  )
}
