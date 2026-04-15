import { useMasterMessages, useMasterRichConversation } from '@/hooks/useSpaces'
import { sendMasterMessage } from '@/lib/api'
import { ChatSection } from '@/features/ChatSection'

export function Dashboard() {
  const { data: messages } = useMasterMessages()
  const { data: richData } = useMasterRichConversation()

  return (
    <ChatSection
      messages={messages ?? []}
      richConversation={richData?.messages ?? []}
      thinkingState={richData?.thinking}
      sendFn={sendMasterMessage}
      queryKey={['master-messages']}
    />
  )
}
