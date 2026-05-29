import { MessageComposer } from '../components/MessageComposer'
import type {
  MessageComposerReplyTarget,
  SendAttachmentInput,
  SendMessageInput,
} from '../components/message-composer/types'

type ChatComposerDockProps = {
  canSend: boolean
  handleSendAttachment: (input: SendAttachmentInput) => Promise<boolean>
  handleSendMessage: (input: SendMessageInput) => Promise<boolean>
  isBrowserOnline: boolean
  isSending: boolean
  onCancelReply: () => void
  replyTarget: MessageComposerReplyTarget | null
  sendErrorMessage: string | null
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
}: ChatComposerDockProps) {
  return (
    <MessageComposer
      attachmentDisabled={!isBrowserOnline}
      disabled={!canSend}
      errorMessage={sendErrorMessage}
      isSending={isSending}
      onCancelReply={onCancelReply}
      onSend={handleSendMessage}
      onSendAttachment={handleSendAttachment}
      replyTarget={replyTarget}
      voiceDisabled={!isBrowserOnline}
    />
  )
}
