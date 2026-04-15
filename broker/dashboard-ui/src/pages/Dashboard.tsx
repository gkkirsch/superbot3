import { useMasterMessages, useMasterRichConversation } from '@/hooks/useSpaces'
import { sendMasterMessage } from '@/lib/api'
import { ChatSection } from '@/features/ChatSection'

export function Dashboard() {
  const { data: messages } = useMasterMessages()
  const { data: richConversation } = useMasterRichConversation()

  return (
    <ChatSection
      messages={messages ?? []}
      richConversation={richConversation ?? []}
      sendFn={sendMasterMessage}
      queryKey={['master-messages']}
    />
  )
}
