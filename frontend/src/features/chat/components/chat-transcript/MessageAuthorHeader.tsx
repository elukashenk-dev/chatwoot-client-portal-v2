import type { ChatMessage } from '../../types'

export function MessageAuthorHeader({
  message,
  showSupportBadge,
}: {
  message: ChatMessage
  showSupportBadge: boolean
}) {
  return (
    <div
      className="mb-1.5 flex min-w-0 items-center justify-start gap-1.5 px-1 text-[12px] font-normal leading-none text-slate-500"
      data-message-header
    >
      <span className="min-w-0 truncate">{message.authorName}</span>
      {showSupportBadge ? (
        <span className="inline-flex min-h-4 shrink-0 items-center rounded-full bg-sky-50 px-1.5 text-[10px] font-semibold leading-none text-sky-700">
          Поддержка
        </span>
      ) : null}
    </div>
  )
}
