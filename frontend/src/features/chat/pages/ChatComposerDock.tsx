import { MessageComposer } from '../components/MessageComposer'
import type { AttachmentTransferState } from '../api/chatAttachmentTransport'
import type {
  MessageComposerReplyTarget,
  SendAttachmentBatchInput,
  SendMessageInput,
} from '../components/message-composer/types'
import type { useAttachmentDraft } from '../components/message-composer/useAttachmentDraft'
import { setChatThreadTyping } from '../api/chatClient'
import { useChatTypingSync } from './useChatTypingSync'

type ChatComposerDockProps = {
  attachmentDraft: ReturnType<typeof useAttachmentDraft>
  attachmentTransferState: AttachmentTransferState
  canSend: boolean
  cancelAttachmentUpload: () => void
  handleSendAttachmentBatch: (
    input: SendAttachmentBatchInput,
  ) => Promise<boolean>
  handleSendMessage: (input: SendMessageInput) => Promise<boolean>
  isBrowserOnline: boolean
  isSending: boolean
  onCancelReply: () => void
  replyTarget: MessageComposerReplyTarget | null
  sendErrorMessage: string | null
  selectedThreadId: string | null
}

export function ChatComposerDock({
  attachmentDraft,
  attachmentTransferState,
  canSend,
  cancelAttachmentUpload,
  handleSendAttachmentBatch,
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
      attachmentDraft={attachmentDraft}
      attachmentDisabled={!isBrowserOnline}
      attachmentTransferState={attachmentTransferState}
      disabled={!canSend}
      errorMessage={sendErrorMessage}
      isSending={isSending}
      onCancelAttachmentUpload={cancelAttachmentUpload}
      onCancelReply={() => {
        sendTypingOff()
        onCancelReply()
      }}
      onDraftTypingChange={handleComposerDraftTypingChanged}
      onSend={handleSendMessage}
      onSendAttachmentBatch={handleSendAttachmentBatch}
      replyTarget={replyTarget}
      voiceDisabled={!isBrowserOnline}
    />
  )
}
