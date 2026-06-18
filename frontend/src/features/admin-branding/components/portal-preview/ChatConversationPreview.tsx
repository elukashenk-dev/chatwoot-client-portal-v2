import { useRef } from 'react'

import { MicrophoneIcon, PaperclipIcon } from '../../../../shared/ui/icons'
import { ChatTranscript } from '../../../chat/components/ChatTranscript'
import { ComposerSendButton } from '../../../chat/components/message-composer/ComposerSendButton'
import { ComposerSideButton } from '../../../chat/components/message-composer/ComposerSideButton'
import { ComposerSideControl } from '../../../chat/components/message-composer/ComposerSideControl'
import { ComposerTextarea } from '../../../chat/components/message-composer/ComposerTextarea'
import { previewMessages, previewThread } from './previewData'
import { ChatHeaderPreview } from './ChatHeaderPreview'

const noop = () => {}

export function ChatConversationPreview() {
  const sendButtonRef = useRef<HTMLButtonElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  return (
    <div className="chat-runtime-surface chat-text flex h-full min-h-0 flex-col">
      <ChatHeaderPreview />

      <ChatTranscript
        activeThreadType={previewThread.type}
        hasMoreOlder={false}
        historyErrorMessage={null}
        isConnectionAvailable
        isLoadingOlder={false}
        isReadOnly
        messages={previewMessages}
        onLoadOlder={noop}
        onReplyToMessage={noop}
        onRetryTextMessage={noop}
      />

      <footer className="relative z-20 bg-transparent px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
        <div className="chat-floating-composer-surface mx-auto w-full rounded-[10px] border px-3 py-[9px]">
          <div className="flex items-end gap-2">
            <ComposerSideControl control="attachment" isCollapsed={false}>
              <ComposerSideButton
                ariaLabel="Прикрепить файл"
                disabled
                shape="control"
              >
                <PaperclipIcon className="h-5 w-5" />
              </ComposerSideButton>
            </ComposerSideControl>

            <ComposerTextarea
              disabled
              draft=""
              onDraftChange={noop}
              onSubmit={noop}
              placeholder="Сообщение..."
              textareaRef={textareaRef}
            />

            <ComposerSideControl control="voice" isCollapsed={false}>
              <ComposerSideButton
                ariaLabel="Голосовое сообщение"
                disabled
                shape="round"
              >
                <MicrophoneIcon className="h-5 w-5" />
              </ComposerSideButton>
            </ComposerSideControl>

            <ComposerSendButton
              canSend={false}
              isAttachmentSelected={false}
              isSending={false}
              onClick={noop}
              onPointerDown={noop}
              sendButtonRef={sendButtonRef}
            />
          </div>
        </div>
      </footer>
    </div>
  )
}
