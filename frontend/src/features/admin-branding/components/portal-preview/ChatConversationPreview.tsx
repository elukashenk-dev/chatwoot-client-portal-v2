import {
  MicrophoneIcon,
  PaperclipIcon,
  SendIcon,
} from '../../../../shared/ui/icons'
import { ChatTranscript } from '../../../chat/components/ChatTranscript'
import { previewMessages, previewThread } from './previewData'
import { ChatHeaderPreview } from './ChatHeaderPreview'

const noop = () => {}

export function ChatConversationPreview() {
  return (
    <div className="chat-runtime-surface flex h-full min-h-0 flex-col text-slate-900">
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

      <footer className="border-t border-slate-200/70 bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-end gap-2">
          <button
            aria-label="Прикрепить файл"
            className="inline-flex h-10 w-10 items-center justify-center rounded-chat-control text-chat-outgoing disabled:cursor-not-allowed disabled:text-slate-300"
            disabled
            type="button"
          >
            <PaperclipIcon className="h-5 w-5" />
          </button>

          <textarea
            aria-label="Сообщение"
            className="max-h-32 min-h-10 min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent px-2 py-2 text-[15px] leading-6 text-slate-400 shadow-none outline-none placeholder:text-slate-400"
            disabled
            placeholder="Сообщение..."
            rows={1}
          />

          <button
            aria-label="Голосовое сообщение"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-chat-outgoing disabled:cursor-not-allowed disabled:text-slate-300"
            disabled
            type="button"
          >
            <MicrophoneIcon className="h-5 w-5" />
          </button>

          <button
            aria-label="Отправить"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-chat-control bg-slate-200 text-white disabled:cursor-not-allowed"
            disabled
            type="button"
          >
            <SendIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
      </footer>
    </div>
  )
}
