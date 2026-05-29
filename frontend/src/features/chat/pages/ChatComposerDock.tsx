import { MessageComposer } from '../components/MessageComposer'
import type {
  MessageComposerReplyTarget,
  SendAttachmentInput,
  SendMessageInput,
} from '../components/message-composer/types'

const OFFLINE_COMPOSER_QUEUE_MESSAGE =
  'Нет соединения. Сообщения будут отправлены, когда соединение восстановится.'

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
      offlineAlertMessage={
        isBrowserOnline ? null : OFFLINE_COMPOSER_QUEUE_MESSAGE
      }
      onCancelReply={onCancelReply}
      onSend={handleSendMessage}
      onSendAttachment={handleSendAttachment}
      replyTarget={replyTarget}
      voiceDisabled={!isBrowserOnline}
    />
  )
}
