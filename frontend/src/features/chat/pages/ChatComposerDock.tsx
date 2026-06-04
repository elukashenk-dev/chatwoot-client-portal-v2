import { MessageComposer } from '../components/MessageComposer'
import type {
  MessageComposerReplyTarget,
  SendAttachmentInput,
  SendMessageInput,
} from '../components/message-composer/types'
import { setChatThreadTyping } from '../api/chatClient'
import { useChatTypingSync } from './useChatTypingSync'

type ChatComposerDockProps = {
  canSend: boolean
  handleSendAttachment: (input: SendAttachmentInput) => Promise<boolean>
  handleSendMessage: (input: SendMessageInput) => Promise<boolean>
  isBrowserOnline: boolean
  isSending: boolean
  onCancelReply: () => void
  replyTarget: MessageComposerReplyTarget | null
  sendErrorMessage: string | null
  selectedThreadId: string | null
}

export function ChatComposerDock({
  canSend,
  handleSendAttachment,
  handleSendMessage,
  isBrowserOnline,
  isSending,
  onCancelReply,
  replyTarget,
  sendErrorMessage,
  selectedThreadId,
}: ChatComposerDockProps) {
  const {
    handleDraftChanged: handleComposerDraftTypingChanged,
    sendTypingOff,
  } = useChatTypingSync({
    canUseBackend: isBrowserOnline,
    selectedThreadId,
    setTyping: setChatThreadTyping,
  })

  return (
    <MessageComposer
      attachmentDisabled={!isBrowserOnline}
      disabled={!canSend}
      errorMessage={sendErrorMessage}
      isSending={isSending}
      onCancelReply={() => {
        sendTypingOff()
        onCancelReply()
      }}
      onDraftTypingChange={handleComposerDraftTypingChanged}
      onSend={handleSendMessage}
      onSendAttachment={handleSendAttachment}
      replyTarget={replyTarget}
      voiceDisabled={!isBrowserOnline}
    />
  )
}
