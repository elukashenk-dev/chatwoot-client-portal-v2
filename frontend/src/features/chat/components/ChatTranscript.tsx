import type { ChatAttachment, ChatMessage } from '../types'
import {
  CalendarIcon,
  ChevronUpIcon,
  FileTextIcon,
} from '../../../shared/ui/icons'

type ChatTranscriptProps = {
  hasMoreOlder: boolean
  isLoadingOlder: boolean
  messages: ChatMessage[]
  onLoadOlder: () => void
}

function formatMessageDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(new Date(value))
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatAttachmentSize(value: number | null) {
  if (!value) {
    return 'Размер неизвестен'
  }

  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} МБ`
  }

  return `${Math.max(1, Math.round(value / 1024))} КБ`
}

function AttachmentCard({ attachment }: { attachment: ChatAttachment }) {
  return (
    <a
      className="mt-2 flex items-start gap-3 rounded-[0.9rem] border border-slate-200 bg-slate-50/90 px-3 py-3 text-left transition hover:border-brand-200 hover:bg-white"
      href={attachment.url || undefined}
      rel="noreferrer"
      target="_blank"
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.75rem] bg-white text-brand-800 shadow-sm">
        <FileTextIcon />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-slate-800">
          {attachment.name}
        </span>
        <span className="mt-0.5 block text-[12px] text-slate-500">
          {attachment.fileType.toUpperCase()} ·{' '}
          {formatAttachmentSize(attachment.fileSize)}
        </span>
      </span>
    </a>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isOutgoing = message.direction === 'outgoing'

  return (
    <div className={isOutgoing ? 'flex justify-end' : 'flex justify-start'}>
      <div className="max-w-[86%] sm:max-w-[78%]">
        <div
          className={
            isOutgoing
              ? 'mb-1 flex items-center justify-end gap-2 px-1'
              : 'mb-1 flex items-center gap-2 px-1'
          }
        >
          {isOutgoing ? (
            <>
              <span className="text-[12px] text-slate-400">
                {formatMessageTime(message.createdAt)}
              </span>
              <span className="text-[12px] font-medium text-slate-700">Вы</span>
            </>
          ) : (
            <>
              <span className="text-[12px] font-medium text-slate-700">
                {message.authorName}
              </span>
              <span className="text-[12px] text-slate-400">
                {formatMessageTime(message.createdAt)}
              </span>
            </>
          )}
        </div>

        <div
          className={
            isOutgoing
              ? 'rounded-[1.1rem] rounded-tr-[0.4rem] bg-brand-800 px-4 py-3 text-[15px] leading-7 text-white shadow-sm'
              : 'rounded-[1.1rem] rounded-tl-[0.4rem] border border-slate-200 bg-white px-4 py-3 text-[15px] leading-7 text-slate-700 shadow-sm'
          }
        >
          {message.content ? <p>{message.content}</p> : null}
          {message.attachments.map((attachment) => (
            <AttachmentCard attachment={attachment} key={attachment.id} />
          ))}
        </div>
      </div>
    </div>
  )
}

function shouldRenderDateDivider(messages: ChatMessage[], index: number) {
  const message = messages[index]
  const previousMessage = index > 0 ? messages[index - 1] : null

  if (!message) {
    return false
  }

  if (!previousMessage) {
    return true
  }

  return (
    formatMessageDate(message.createdAt) !==
    formatMessageDate(previousMessage.createdAt)
  )
}

export function ChatTranscript({
  hasMoreOlder,
  isLoadingOlder,
  messages,
  onLoadOlder,
}: ChatTranscriptProps) {
  return (
    <>
      <div className="border-b border-slate-200/70 px-5 py-3 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[0.7rem] border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-400"
            disabled
            title="Календарь сообщений будет подключен отдельным slice"
            type="button"
          >
            <CalendarIcon />
            Календарь сообщений
          </button>

          <span className="rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-[12px] font-medium text-brand-700">
            Показаны последние {Math.min(messages.length, 20)} сообщений
          </span>
        </div>
      </div>

      <section className="chat-scroll flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto flex w-full max-w-[620px] flex-col gap-4">
          {hasMoreOlder ? (
            <div className="self-center">
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-[13px] font-medium text-slate-600 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 disabled:cursor-wait disabled:text-slate-300"
                disabled={isLoadingOlder}
                onClick={onLoadOlder}
                type="button"
              >
                <ChevronUpIcon className="h-[15px] w-[15px]" />
                {isLoadingOlder
                  ? 'Загружаем...'
                  : 'Загрузить более ранние сообщения'}
              </button>
            </div>
          ) : null}

          {messages.length === 0 ? (
            <div className="rounded-[1rem] border border-dashed border-slate-200 bg-slate-50/80 px-5 py-8 text-center text-[14px] leading-6 text-slate-500">
              В этой переписке пока нет сообщений, доступных клиентскому
              порталу.
            </div>
          ) : null}

          {messages.map((message, index) => (
            <div className="contents" key={message.id}>
              {shouldRenderDateDivider(messages, index) ? (
                <div className="self-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-medium text-slate-500">
                  {formatMessageDate(message.createdAt)}
                </div>
              ) : null}
              <MessageBubble message={message} />
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
